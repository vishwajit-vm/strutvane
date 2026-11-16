#!/usr/bin/env node
/**
 * state-check: proves that STATE.md matches reality, so nobody (human or AI) works from a
 * hallucinated or stale picture of the project.
 *
 * Why: the coordinator works across long, summarised conversations. Files and git don't drift;
 * memory does. This script turns "I think branch X is pushed at abc123" into a checked fact.
 *
 * What it checks (read-only; it never changes anything):
 *  1. Every repo under packages/ (and the hub): current branch, uncommitted changes, and for each
 *     local branch whether it is pushed (local head == remote head).
 *  2. Every commit SHA written in STATE.md exists in at least one repo. An invented SHA fails.
 *  3. STATE.md is not older than the newest commit in the hub by more than a day (stale warning).
 *
 * Usage:  node scripts/state-check.mjs            (human report; exit 1 on any problem)
 *         node scripts/state-check.mjs --offline  (skip the remote comparison)
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const HUB = join(import.meta.dirname, '..')
const offline = process.argv.includes('--offline')
const problems = []
const warnings = []

/** Run git in `cwd`; returns trimmed stdout, or null when git fails (never throws). */
function git(cwd, ...args) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}

const repos = [{ name: 'strutvane (hub)', dir: HUB }]
const pkgDir = join(HUB, 'packages')
if (existsSync(pkgDir)) {
  for (const name of readdirSync(pkgDir).sort()) {
    const dir = join(pkgDir, name)
    if (existsSync(join(dir, '.git'))) repos.push({ name, dir })
  }
}

console.log('Repos and branches')
console.log('------------------')
for (const repo of repos) {
  const current = git(repo.dir, 'branch', '--show-current') ?? '?'
  const dirty = (git(repo.dir, 'status', '--porcelain') ?? '').split('\n').filter(Boolean).length
  if (dirty > 0) problems.push(`${repo.name}: ${dirty} uncommitted change(s) on ${current}`)
  const branches = (git(repo.dir, 'for-each-ref', '--format=%(refname:short)', 'refs/heads') ?? '').split('\n').filter(Boolean)
  const remote = offline ? null : git(repo.dir, 'ls-remote', '--heads', 'origin')
  const remoteHeads = new Map(
    (remote ?? '').split('\n').filter(Boolean).map((line) => {
      const [sha, ref] = line.split(/\s+/)
      return [ref.replace('refs/heads/', ''), sha]
    }),
  )
  const parts = []
  for (const branch of branches) {
    const local = git(repo.dir, 'rev-parse', branch) ?? ''
    let note = local.slice(0, 7)
    if (!offline && remote !== null) {
      const onRemote = remoteHeads.get(branch)
      if (onRemote === undefined) {
        note += ' NOT ON GITHUB'
        problems.push(`${repo.name}: branch ${branch} (${local.slice(0, 7)}) is not pushed`)
      } else if (onRemote !== local) {
        const ahead = git(repo.dir, 'rev-list', '--count', `${onRemote}..${local}`)
        note += ahead !== null && ahead !== '0' ? ` ${ahead} commit(s) NOT PUSHED` : ' differs from GitHub'
        problems.push(`${repo.name}: branch ${branch} differs from GitHub (local ${local.slice(0, 7)}, remote ${onRemote.slice(0, 7)})`)
      } else note += ' pushed'
    }
    parts.push(`${branch} ${note}`)
  }
  console.log(`- ${repo.name} [on ${current}${dirty ? `, ${dirty} uncommitted` : ''}]: ${parts.join(' | ')}`)
}

// 2. Every SHA mentioned in STATE.md must exist somewhere.
const statePath = join(HUB, 'STATE.md')
const state = readFileSync(statePath, 'utf8')
const shas = [...new Set([...state.matchAll(/(?<![\w/.-])([0-9a-f]{7,40})(?![\w-])/g)].map((m) => m[1]))].filter((s) => /[a-f]/.test(s) && /\d/.test(s))
console.log('\nCommits named in STATE.md')
console.log('-------------------------')
for (const sha of shas) {
  const found = repos.find((repo) => git(repo.dir, 'cat-file', '-e', `${sha}^{commit}`) !== null)
  if (found) console.log(`- ${sha}: found in ${found.name}`)
  else {
    console.log(`- ${sha}: NOT FOUND in any repo`)
    problems.push(`STATE.md names commit ${sha}, which does not exist in any local repo`)
  }
}

// 3. Staleness: STATE.md should be touched when the hub moves on.
const lastHubCommit = Number(git(HUB, 'log', '-1', '--format=%ct') ?? '0') * 1000
const stateMtime = statSync(statePath).mtimeMs
if (lastHubCommit - stateMtime > 24 * 3600 * 1000) warnings.push('STATE.md is more than a day older than the newest hub commit: review it')

console.log('')
for (const warning of warnings) console.log(`WARNING: ${warning}`)
if (problems.length === 0) {
  console.log('OK: STATE.md matches git and GitHub.')
} else {
  console.log(`${problems.length} problem(s):`)
  for (const problem of problems) console.log(`  - ${problem}`)
  process.exitCode = 1
}
