#!/usr/bin/env node
// backup-private: copy everything that must not be public, but must not be lost, to the
// PRIVATE repo github.com/vishwajit-vm/strutvane-private.
//
// Why (decided by the project lead on 2026-11-21): every Strutvane repo is public. Three kinds of
// work can't go there yet, but losing this computer must not lose them:
//   1. branches with unreleased security fixes (pushing them publicly would show a weakness before
//      the fixed version is on npm);
//   2. the git-excluded private findings file (docs/research/2026-11-15-audit-findings.md);
//   3. each Claude account's private memory folder (it holds personal details, e.g. emails).
// What this script does:
//   - copies (2) and (3) into a local clone of the private repo, then commits and pushes it;
//   - pushes every LOCAL branch that has no copy on its public origin, from every packages/* repo,
//     to the private repo as `<repo>/<branch>`.
// Everything else is already on the public repos.
//
// Usage: node scripts/backup-private.mjs   (run it at every stop: HANDOFF §4)
// It refuses to run unless scripts/identity-check.mjs passes (personal account and email only).

import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

const HUB = join(import.meta.dirname, '..')
const PACKAGES = join(HUB, 'packages')
const PRIVATE_URL = 'https://github.com/vishwajit-vm/strutvane-private.git'
const CLONE = join(dirname(HUB), 'strutvane-private')
const FINDINGS = join(HUB, 'docs', 'research', '2026-11-15-audit-findings.md')
const MEMORY = join(homedir(), '.claude', 'projects', 'C--personal-projects-strutvane', 'memory')

/** Runs a command and returns trimmed stdout; throws with the command line on failure. */
function run(cmd, args, cwd = HUB) {
  return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

/** Like run(), but returns '' instead of throwing (for probes such as ls-remote). */
function probe(cmd, args, cwd = HUB) {
  try {
    return run(cmd, args, cwd)
  } catch {
    return ''
  }
}

/** Writes text to a file, creating its folder. */
function cpSyncText(file, text) {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, text)
}

/** True when the command exits 0 (for yes/no git questions such as merge-base --is-ancestor). */
function succeeds(cmd, args, cwd = HUB) {
  try {
    run(cmd, args, cwd)
    return true
  } catch {
    return false
  }
}

// 1. Identity first: never push with the work account or email.
try {
  run('node', [join(HUB, 'scripts', 'identity-check.mjs')])
} catch {
  process.stderr.write('STOP: identity-check failed. Nothing was backed up. Tell the project lead.\n')
  process.exit(1)
}

// 2. The private repo's working copy (outside the public hub).
if (!existsSync(join(CLONE, '.git'))) {
  mkdirSync(CLONE, { recursive: true })
  run('git', ['init', '-q', '-b', 'main'], CLONE)
  run('git', ['remote', 'add', 'origin', PRIVATE_URL], CLONE)
  if (probe('git', ['ls-remote', '--heads', 'origin', 'main'], CLONE)) {
    run('git', ['pull', '-q', 'origin', 'main'], CLONE)
  }
} else {
  probe('git', ['pull', '-q', '--ff-only', 'origin', 'main'], CLONE)
}

// 3. Copy the private findings and the memory folder (replace, so deletions carry over).
for (const [from, to] of [
  [FINDINGS, join(CLONE, 'findings', '2026-11-15-audit-findings.md')],
  [MEMORY, join(CLONE, 'memory', 'account-a')],
]) {
  if (!existsSync(from)) {
    process.stdout.write(`skip (missing): ${from}\n`)
    continue
  }
  rmSync(to, { recursive: true, force: true })
  mkdirSync(dirname(to), { recursive: true })
  cpSync(from, to, { recursive: true })
}
// Copies of the hub's status, session log, plan and decisions, so the private repo alone is enough
// to pick the work up again (context/CONTEXT.md is written by hand next to them and kept).
mkdirSync(join(CLONE, 'context'), { recursive: true })
for (const [from, name] of [
  ['STATE.md', 'STATE.md'],
  ['HANDOFF.md', 'HANDOFF.md'],
  [join('docs', '21-delivery-plan.pdf'), '21-delivery-plan.pdf'],
  [join('spikes', 'CONSISTENCY-2026-11-15.md'), 'decisions.md'],
]) {
  if (existsSync(join(HUB, from))) cpSync(join(HUB, from), join(CLONE, 'context', name))
}
run('git', ['add', '-A'], CLONE)
if (probe('git', ['status', '--porcelain'], CLONE)) {
  run('git', ['commit', '-s', '-q', '-m', `backup: context, findings and memory (${new Date().toISOString()})`], CLONE)
}
run('git', ['push', '-q', 'origin', 'main'], CLONE)
process.stdout.write('pushed: findings + memory → strutvane-private main\n')

// 4. Every local branch with work that exists nowhere public → private repo as <repo>/<branch>.
// A branch whose head commit is already on ANY public branch (e.g. an empty branch made from main,
// or a fix that has been released and merged) is skipped, and its old private copy is deleted.
// The project lead asked for this repo to be maintained automatically (2026-11-21).
const wanted = new Set()
let pushed = 0
for (const dir of readdirSync(PACKAGES).sort()) {
  const repo = join(PACKAGES, dir)
  if (!existsSync(join(repo, '.git'))) continue
  const branches = probe('git', ['for-each-ref', '--format=%(refname:short)', 'refs/heads'], repo)
    .split('\n')
    .filter(Boolean)
  for (const branch of branches) {
    const onOrigin = probe('git', ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}`], repo)
    const head = run('git', ['rev-parse', branch], repo)
    if (onOrigin === head) continue // already public and identical: nothing to keep privately
    if (onOrigin !== '' && succeeds('git', ['merge-base', '--is-ancestor', branch, onOrigin], repo)) continue
    // Already contained in some public branch (e.g. created from main with no commits yet)?
    if (probe('git', ['branch', '-r', '--contains', head], repo).split('\n').some((r) => r.trim().startsWith('origin/'))) continue
    const target = `${dir}/${branch.replaceAll('/', '-')}`
    wanted.add(target)
    run('git', ['push', '-q', '--force', PRIVATE_URL, `${branch}:refs/heads/${target}`], repo)
    process.stdout.write(`pushed: ${dir} ${branch} (${head.slice(0, 7)}) → strutvane-private ${target}\n`)
    pushed++
  }
}
// 4b. Prune private branches that are no longer needed (released, merged, deleted or empty).
// Only `<repo>/<branch>` backup branches are touched; `main` and `demo/*` are kept.
for (const line of probe('git', ['ls-remote', '--heads', PRIVATE_URL], CLONE).split('\n').filter(Boolean)) {
  const ref = line.split(/\s+/)[1] ?? ''
  const name = ref.replace('refs/heads/', '')
  if (name === 'main' || name.startsWith('demo/') || wanted.has(name)) continue
  run('git', ['push', '-q', PRIVATE_URL, `:${ref}`], CLONE)
  process.stdout.write(`pruned: strutvane-private ${name} (no longer needed)\n`)
}

// 5. Per-package memory (the project lead, 2026-11-21: "every repo and every package … memory,
// state, results, failures … what you did last … where you stopped"). For each packages/* repo:
// packages/<name>/STATUS.md (generated facts: branches, heads, last commits, published version)
// plus copies of every branch's NEXT.md and of RELEASE-READINESS.md / CLAUDE.md. The hand-written
// layer is each branch's NEXT.md (kept in the repo) and context/CONTEXT.md.
const PKG_OUT = join(CLONE, 'packages')
rmSync(PKG_OUT, { recursive: true, force: true })
for (const dir of readdirSync(PACKAGES).sort()) {
  const repo = join(PACKAGES, dir)
  if (!existsSync(join(repo, '.git'))) continue
  const out = join(PKG_OUT, dir)
  mkdirSync(join(out, 'next'), { recursive: true })
  const lines = [`# ${dir}: status (generated ${new Date().toISOString()})`, '']
  let name = dir
  try {
    name = JSON.parse(run('git', ['show', 'HEAD:package.json'], repo)).name ?? dir
  } catch {
    // no package.json at HEAD: keep the folder name
  }
  // The registry directly (spawning npm.cmd on Windows needs a shell, which this script avoids).
  let latest = ''
  try {
    const res = await fetch(`https://registry.npmjs.org/${name.replace('/', '%2f')}`, {
      headers: { accept: 'application/vnd.npm.install-v1+json' },
    })
    if (res.ok) latest = ((await res.json())['dist-tags'] ?? {}).latest ?? ''
  } catch {
    latest = '(registry not reachable)'
  }
  lines.push(`- npm package: \`${name}\` — latest on npm: ${latest || '(none / not published)'}`)
  lines.push(`- checked-out branch: \`${probe('git', ['branch', '--show-current'], repo)}\``)
  const dirty = probe('git', ['status', '--porcelain'], repo)
  lines.push(`- uncommitted changes: ${dirty ? dirty.split('\n').length : 0}`, '', '## Branches', '')
  lines.push('| branch | head | last commit | on public origin? |', '|---|---|---|---|')
  const branches = probe('git', ['for-each-ref', '--format=%(refname:short)', 'refs/heads'], repo)
    .split('\n')
    .filter(Boolean)
  for (const branch of branches) {
    const head = probe('git', ['log', '-1', '--format=%h|%cs %s', branch], repo)
    const [sha = '', subject = ''] = head.split('|')
    const remote = probe('git', ['rev-parse', '--verify', '--quiet', `refs/remotes/origin/${branch}`], repo)
    const full = probe('git', ['rev-parse', branch], repo)
    const where = remote === full ? 'yes' : remote ? 'behind/ahead' : 'no (private backup)'
    lines.push(`| \`${branch}\` | ${sha} | ${subject.replaceAll('|', '/')} | ${where} |`)
    const next = probe('git', ['show', `${branch}:NEXT.md`], repo)
    if (next) cpSyncText(join(out, 'next', `${branch.replaceAll('/', '-')}.md`), next)
  }
  lines.push('', '## Recent commits (all branches)', '', '```')
  lines.push(probe('git', ['log', '--all', '-12', '--format=%h %cs %d %s'], repo), '```', '')
  cpSyncText(join(out, 'STATUS.md'), `${lines.join('\n')}\n`)
  for (const file of ['RELEASE-READINESS.md', 'CLAUDE.md']) {
    const text = probe('git', ['show', `HEAD:${file}`], repo)
    if (text) cpSyncText(join(out, file), text)
  }
}
run('git', ['add', '-A'], CLONE)
if (probe('git', ['status', '--porcelain'], CLONE)) {
  run('git', ['commit', '-s', '-q', '-m', 'backup: per-package memory'], CLONE)
  run('git', ['push', '-q', 'origin', 'main'], CLONE)
}
process.stdout.write('pushed: per-package memory → strutvane-private packages/\n')

// 6. The demo app (local-only git repo, no public remote) and its acceptance suite.
// Never copied: `.admin-password.local`, logs, node_modules, build output.
const DEMO = join(dirname(HUB), 'strutvane-demo')
if (existsSync(DEMO)) {
  const demoApp = join(DEMO, 'northwind-ops')
  if (existsSync(join(demoApp, '.git'))) {
    const branch = run('git', ['branch', '--show-current'], demoApp)
    run('git', ['push', '-q', '--force', PRIVATE_URL, `${branch}:refs/heads/demo/northwind-ops`], demoApp)
    process.stdout.write('pushed: demo app northwind-ops → strutvane-private demo/northwind-ops\n')
  }
  const target = join(CLONE, 'demo')
  rmSync(target, { recursive: true, force: true })
  mkdirSync(target, { recursive: true })
  for (const name of ['ACCEPTANCE.md', 'NOTES.local.md']) {
    if (existsSync(join(DEMO, name))) cpSync(join(DEMO, name), join(target, name))
  }
  const skip = new Set(['node_modules', 'test-results', 'playwright-report', 'dist'])
  if (existsSync(join(DEMO, 'acceptance'))) {
    cpSync(join(DEMO, 'acceptance'), join(target, 'acceptance'), {
      recursive: true,
      filter: (src) => !src.split(/[\\/]/).some((part) => skip.has(part)),
    })
  }
  run('git', ['add', '-A'], CLONE)
  if (probe('git', ['status', '--porcelain'], CLONE)) {
    run('git', ['commit', '-s', '-q', '-m', 'backup: demo acceptance suite and report'], CLONE)
    run('git', ['push', '-q', 'origin', 'main'], CLONE)
    process.stdout.write('pushed: demo acceptance suite → strutvane-private main\n')
  }
}

process.stdout.write(`done: ${pushed} local-only branch(es) backed up privately.\n`)
