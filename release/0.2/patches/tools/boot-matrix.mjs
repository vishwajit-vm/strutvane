// Boot an app with `strutvane start` under env variations; report how each one ends.
// Usage (from the app dir): node boot-matrix.mjs [--only KEY,KEY]
// For every key in .env.example: missing, empty and malformed. Each run must either listen
// (the key is optional or has a default) or exit non-zero with a friendly message (no stack).
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const app = process.cwd()
const bin = join(app, 'node_modules', '@strutvane', 'framework', 'dist', 'console', 'bin.mjs')
const envPath = join(app, '.env')
const original = readFileSync(envPath, 'utf8')
copyFileSync(envPath, join(app, '.env.boot-backup'))
const keys = readFileSync(join(app, '.env.example'), 'utf8')
  .split(/\r?\n/)
  .map((l) => /^([A-Z][A-Z0-9_]*)=/.exec(l)?.[1])
  .filter((k) => k !== undefined)
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : undefined
const MALFORMED = '%%not-valid%%'

function boot(timeoutMs = 25_000) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [bin, 'start', '--port', '0'], { cwd: app, env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' } })
    let out = ''
    const done = (outcome) => { clearTimeout(timer); child.kill(); resolve({ outcome, out }) }
    const timer = setTimeout(() => done('timeout'), timeoutMs)
    for (const s of [child.stdout, child.stderr]) s.on('data', (d) => {
      out += d
      if (/Listening on/.test(out)) done('listening')
    })
    child.on('exit', (code) => done(`exit ${code}`))
  })
}

function withEnv(transform) {
  const lines = original.split(/\r?\n/)
  writeFileSync(envPath, transform(lines).join('\n'))
}
const summarize = (out) => {
  const lines = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const stack = lines.some((l) => /^at .+\(.+:\d+:\d+\)$|^at file:/.test(l))
  const msg = lines.find((l) => /✖|error|Error|invalid|missing|required/i.test(l)) ?? lines[0] ?? ''
  return { stack, msg: msg.slice(0, 200) }
}

const results = []
try {
  withEnv((l) => l)
  const base = await boot()
  results.push({ key: '(baseline)', variant: '-', ...base, ...summarize(base.out) })
  for (const key of keys) {
    if (only && !only.includes(key)) continue
    for (const variant of ['missing', 'empty', 'malformed']) {
      withEnv((lines) => {
        const rest = lines.filter((l) => !l.startsWith(`${key}=`))
        if (variant === 'missing') return rest
        return [...rest, `${key}=${variant === 'empty' ? '' : MALFORMED}`]
      })
      const r = await boot()
      results.push({ key, variant, outcome: r.outcome, ...summarize(r.out) })
      process.stderr.write(`${key} ${variant}: ${r.outcome}\n`)
    }
  }
} finally {
  writeFileSync(envPath, original)
}
for (const r of results)
  console.log(`${r.key.padEnd(24)} ${r.variant.padEnd(9)} ${r.outcome.padEnd(10)} ${r.stack ? 'STACK ' : ''}${r.msg ?? ''}`)
if (!existsSync(envPath)) process.exitCode = 1
