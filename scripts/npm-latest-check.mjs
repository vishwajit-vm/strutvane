#!/usr/bin/env node
// npm-latest-check: is the newest release of every Strutvane package the one `npm install` gets?
//
// Why: decision #131 says every approved pre-1.0 release goes to the `latest` dist-tag, so
// `npm install <pkg>` and `npm create strutvane` always get the newest version. The project lead
// should never have to check each npm page by hand. This script checks every package repo under
// `packages/` in one go:
//   1. the version on the repo's `main` (what the release workflow stages),
//   2. the registry's `latest` and `next` dist-tags (what `npm install` really gets),
//   3. whether the repo's release script is the one that stages to `latest` (tooling 14c0922+).
//
// Note: the npmjs.com WEBSITE can show an older version for a while after an approval because the
// site caches package pages. The registry (checked here) is what `npm install` uses.
//
// Usage: node scripts/npm-latest-check.mjs   (exit 1 when a package needs attention)

import { execFileSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'

const PACKAGES = join(import.meta.dirname, '..', 'packages')
/** Repos that are archived or never published; they are listed but never flagged. */
const IGNORED = new Set(['cli', 'contracts', 'core', 'devkit', 'docs', 'skeleton', 'tooling'])

/** Runs git in a repo and returns trimmed stdout, or '' when the command fails. */
function git(repo, args) {
  try {
    return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return ''
  }
}

/** Reads the package's dist-tags from the public registry (what `npm install` resolves). */
async function distTags(name) {
  const res = await fetch(`https://registry.npmjs.org/${name.replace('/', '%2f')}`, {
    headers: { accept: 'application/vnd.npm.install-v1+json' },
  })
  if (res.status === 404) return {}
  if (!res.ok) throw new Error(`registry answered ${res.status} for ${name}`)
  const body = await res.json()
  return body['dist-tags'] ?? {}
}

const rows = []
let problems = 0
for (const dir of readdirSync(PACKAGES).sort()) {
  const repo = join(PACKAGES, dir)
  const pkgText = git(repo, ['show', 'origin/main:package.json'])
  if (!pkgText) continue
  const pkg = JSON.parse(pkgText)
  if (pkg.private || !pkg.name) continue
  const ignored = IGNORED.has(dir)
  const script = git(repo, ['show', 'origin/main:.github/scripts/publish-if-new.mjs'])
  const scriptOk = script.includes('comparePrecedence')
  const tags = await distTags(pkg.name)
  const latest = tags.latest ?? '—'
  let state
  if (ignored) state = 'archived / not published'
  else if (latest === pkg.version) state = 'OK: latest = main'
  else if (latest.startsWith('0.0.0-reserved')) state = 'not released yet (name reserved)'
  else state = `main is ${pkg.version}: release pending or not approved`
  if (!ignored && !scriptOk) state += '; OLD release script (would stage to next)'
  if (!ignored && (!scriptOk || (latest !== pkg.version && !latest.startsWith('0.0.0-reserved')))) problems++
  rows.push([pkg.name, dir, pkg.version, latest, tags.next ?? '—', state])
}

const head = ['package', 'repo dir', 'main', 'npm latest', 'npm next', 'state']
const widths = head.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)))
const line = (r) => r.map((c, i) => String(c).padEnd(widths[i])).join('  ')
process.stdout.write(`${line(head)}\n${widths.map((w) => '-'.repeat(w)).join('  ')}\n`)
for (const r of rows) process.stdout.write(`${line(r)}\n`)
process.stdout.write(problems ? `\n${problems} package(s) need attention.\n` : '\nOK: every released package installs its newest version by default.\n')
process.exitCode = problems ? 1 : 0
