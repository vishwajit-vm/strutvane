// Retarget a dependent repo from the absorbed packages to @strutvane/framework (one kernel).
// Usage: node retarget-dependent.mjs <repoDir> <peerRange> <devVersion> [--optional-peer]
//  - import specifiers '@strutvane/{core,contracts,devkit}' -> '@strutvane/framework/<part>'
//    (only real specifiers: import/export ... from, import(), vi.mock(); comments untouched)
//  - package.json: drop the absorbed deps, add the framework as peer + dev, engines >=24.3
//  - tsdown neverBundle: the absorbed names become a framework regex
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const [repo, peerRange, devVersion] = process.argv.slice(2)
const optionalPeer = process.argv.includes('--optional-peer')
const ABSORBED = ['core', 'contracts', 'devkit']
const SPEC = /((?:from|import|mock|vi\.mock|importActual)\s*\(?\s*)(['"])@strutvane\/(core|contracts|devkit)\2/g

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else if (/\.(m?ts|tsx)$/.test(name)) out.push(p)
  }
  return out
}
let files = 0, specs = 0
for (const dir of ['src', 'test']) {
  if (!existsSync(join(repo, dir))) continue
  for (const f of walk(join(repo, dir))) {
    const before = readFileSync(f, 'utf8')
    const after = before.replace(SPEC, (_m, pre, q, part) => { specs++; return `${pre}${q}@strutvane/framework/${part}${q}` })
    if (after !== before) { writeFileSync(f, after); files++ }
  }
}

const pkgPath = join(repo, 'package.json')
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
  for (const part of ABSORBED) delete pkg[field]?.[`@strutvane/${part}`]
  if (pkg[field] && Object.keys(pkg[field]).length === 0) delete pkg[field]
}
const sortObj = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)))
pkg.peerDependencies = sortObj({ ...pkg.peerDependencies, '@strutvane/framework': peerRange })
pkg.devDependencies = sortObj({ ...pkg.devDependencies, '@strutvane/framework': devVersion })
if (optionalPeer) pkg.peerDependenciesMeta = sortObj({ ...pkg.peerDependenciesMeta, '@strutvane/framework': { optional: true } })
pkg.engines = { ...pkg.engines, node: '>=24.3' }
// Keep the key order of the original manifest; peerDependencies goes after dependencies.
const order = Object.keys(JSON.parse(readFileSync(pkgPath, 'utf8')))
if (!order.includes('peerDependencies')) order.splice(order.indexOf('devDependencies'), 0, 'peerDependencies')
if (!order.includes('peerDependenciesMeta') && pkg.peerDependenciesMeta) order.splice(order.indexOf('peerDependencies') + 1, 0, 'peerDependenciesMeta')
const ordered = {}
for (const k of order) if (k in pkg) ordered[k] = pkg[k]
for (const k of Object.keys(pkg)) if (!(k in ordered)) ordered[k] = pkg[k]
writeFileSync(pkgPath, `${JSON.stringify(ordered, null, 2)}\n`)

const tsdown = join(repo, 'tsdown.config.ts')
if (existsSync(tsdown)) {
  let t = readFileSync(tsdown, 'utf8')
  const had = /'@strutvane\/(contracts|core)'/.test(t)
  t = t.replace(/\s*'@strutvane\/core',?/g, '').replace(/'@strutvane\/contracts'/g, '/^@strutvane\\/framework(\\/|$)/')
  if (had) writeFileSync(tsdown, t)
}
console.log(JSON.stringify({ repo, files, specs }))
