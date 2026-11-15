// Inspect an npm tarball: what ships, exports/types/bin integrity, junk and leaks.
// Usage: node inspect-tarball.mjs <tarball.tgz> [--json]
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, existsSync, statSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, posix } from 'node:path'

const tgz = process.argv[2]
const dir = mkdtempSync(join(tmpdir(), 'svpack-'))
execFileSync('tar', ['-xzf', tgz, '-C', dir, '--force-local'])
const root = join(dir, 'package')
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))

function walk(d, rel = '') {
  const out = []
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) out.push(...walk(join(d, e.name), r))
    else out.push({ path: r, size: statSync(join(d, e.name)).size })
  }
  return out
}
const files = walk(root)
const findings = []
const add = (sev, msg) => findings.push({ sev, msg })

const total = files.reduce((a, f) => a + f.size, 0)
if (!files.some((f) => /^LICEN[CS]E/i.test(f.path))) add('high', 'LICENSE missing')
if (!files.some((f) => /^README/i.test(f.path))) add('medium', 'README missing')
const junk = files.filter((f) =>
  /(^|\/)(test|tests|__tests__|fixtures?|coverage|\.github|\.changeset|\.claude|src)\//.test(f.path) ||
  /\.(test|spec)\.[cm]?[jt]sx?$/.test(f.path) ||
  /(^|\/)\.env(\..*)?$/.test(f.path) && !/\.env\.example$/.test(f.path) ||
  /\.(pem|key|p12|sqlite|db|log|tgz)$/.test(f.path) ||
  /(^|\/)(tsconfig.*|vitest.*|biome.*|tsdown.*)\.(json|ts)$/.test(f.path))
for (const j of junk) add('medium', `junk/unsafe file shipped: ${j.path}`)
for (const f of files.filter((f) => f.size > 500_000)) add('low', `large file ${f.path} ${f.size}B`)
for (const f of files.filter((f) => f.path.endsWith('.map'))) {
  const m = JSON.parse(readFileSync(join(root, f.path), 'utf8'))
  const local = (m.sources || []).filter((s) => /^[A-Za-z]:|^\/(Users|home|c)\//.test(s))
  if (local.length) add('medium', `source map with absolute local paths: ${f.path}`)
  if (m.sourcesContent) add('low', `source map embeds sources: ${f.path}`)
}
for (const f of files.filter((f) => /\.(m?js|d\.m?ts)$/.test(f.path))) {
  const t = readFileSync(join(root, f.path), 'utf8')
  const hit = t.match(/[A-Za-z]:\\\\?(Users|personal_projects)[^'"\s]*|\/home\/[a-z]+\/[^'"\s]*/)
  if (hit) add('medium', `absolute local path in ${f.path}: ${hit[0].slice(0, 80)}`)
  const sm = t.match(/sourceMappingURL=(\S+)/)
  if (sm && !files.some((g) => g.path === posix.join(posix.dirname(f.path), sm[1])))
    add('low', `${f.path} references missing source map ${sm[1]}`)
}

// exports
function targets(v, cond = []) {
  if (typeof v === 'string') return [{ cond: cond.join('.'), t: v }]
  if (v && typeof v === 'object') return Object.entries(v).flatMap(([k, x]) => targets(x, [...cond, k]))
  return []
}
for (const [sub, v] of Object.entries(pkg.exports || {})) {
  for (const { cond, t } of targets(v)) {
    if (!existsSync(join(root, t))) add('high', `exports["${sub}"].${cond} -> ${t} missing in tarball`)
  }
}
if (!pkg.exports) add('medium', 'no exports map')
if (pkg.type !== 'module') add('high', `type is ${pkg.type}`)
const bins = typeof pkg.bin === 'string' ? { [pkg.name]: pkg.bin } : pkg.bin || {}
for (const [b, p] of Object.entries(bins)) {
  const fp = join(root, p)
  if (!existsSync(fp)) { add('high', `bin ${b} -> ${p} missing`); continue }
  const first = readFileSync(fp, 'utf8').split('\n')[0]
  if (first !== '#!/usr/bin/env node') add('high', `bin ${b} shebang is "${first}"`)
}
// declared deps on old/absorbed names, framework copies
const deps = pkg.dependencies || {}
for (const n of Object.keys(deps)) {
  if (/^@strutvane\/(core|contracts|devkit|cli)$/.test(n)) add('critical', `runtime dependency on absorbed package ${n}@${deps[n]} (second kernel next to @strutvane/framework)`)
  if (n === '@strutvane/framework') add('critical', `@strutvane/framework is a regular dependency (${deps[n]}); must be a peer`)
  if (/^@strutvane\/(auth|ui|logs|files)$/.test(n)) add('high', `product package depends on product package ${n}`)
}
const peers = pkg.peerDependencies || {}
for (const n of Object.keys(peers)) {
  if (!pkg.peerDependenciesMeta?.[n]?.optional) add('info', `required peer ${n}@${peers[n]}`)
}
if (!pkg.engines?.node) add('medium', 'no engines.node')
else if (!/>=\s*24\.3/.test(pkg.engines.node)) add('medium', `engines.node is "${pkg.engines.node}"; blueprint §5 requires >=24.3`)
if (/@strutvane\/(auth|ui|logs|files)/.test(pkg.name) && !peers['@strutvane/framework']) add('critical', 'no peerDependency on @strutvane/framework')

const result = { name: pkg.name, version: pkg.version, files: files.length, unpacked: total, sideEffects: pkg.sideEffects, findings }
rmSync(dir, { recursive: true, force: true })
if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 1))
else {
  console.log(`# ${pkg.name}@${pkg.version}: ${files.length} files, ${(total / 1024).toFixed(0)} kB unpacked`)
  for (const f of findings) console.log(`  [${f.sev}] ${f.msg}`)
}
