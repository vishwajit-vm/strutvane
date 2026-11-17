#!/usr/bin/env node
/**
 * identity-check: proves that commits and pushes to Strutvane repos will use the project lead's
 * PERSONAL identity, never any other (for example a work account logged in on the same machine).
 *
 * Why: Strutvane is a personal project on a personal GitHub org. The same computer is also used
 * with a work GitHub account and a work email. A commit or push made with the wrong identity leaks
 * the wrong name into public history or fails with 403. This script is the gate every human or AI
 * session runs before committing or pushing (HANDOFF.md §1 and §4).
 *
 * What it checks (read-only; it never changes git config or the GitHub login):
 *  1. The effective `user.email` in the hub and in every repo under packages/ equals EXPECTED_EMAIL.
 *     Anything else fails, so no other address needs to be written down here.
 *  2. The active GitHub CLI account (`gh api user`) is EXPECTED_LOGIN.
 *
 * Usage:  node scripts/identity-check.mjs     (exit 0 = safe to commit and push; exit 1 = stop)
 *
 * On failure: do NOT fix it yourself (no `gh auth switch`, no `git config` changes). Stop, commit
 * nothing more, and tell the project lead which check failed.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

/** The project lead's personal commit email (already public in every commit's author line). */
const EXPECTED_EMAIL = 'vishwajitmall50@gmail.com'
/** The personal GitHub account that administers the vishwajit-vm org. */
const EXPECTED_LOGIN = 'vishwajitvm'

const HUB = join(import.meta.dirname, '..')
const problems = []

/** Run a command; returns trimmed stdout, or null when it fails (never throws). */
function run(cmd, args, cwd = HUB) {
  try {
    return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}

const packagesDir = join(HUB, 'packages')
const repos = [{ name: 'strutvane (hub)', dir: HUB }]
if (existsSync(packagesDir)) {
  for (const entry of readdirSync(packagesDir, { withFileTypes: true })) {
    const dir = join(packagesDir, entry.name)
    if (entry.isDirectory() && existsSync(join(dir, '.git'))) repos.push({ name: entry.name, dir })
  }
}

console.log('Commit email per repo')
console.log('---------------------')
for (const { name, dir } of repos) {
  const email = run('git', ['config', 'user.email'], dir)
  const ok = email !== null && email.toLowerCase() === EXPECTED_EMAIL
  console.log(`- ${name}: ${ok ? 'OK (personal email)' : 'WRONG'}`)
  if (!ok) problems.push(`${name}: commit email is ${email === null ? 'not set' : 'not the personal email'}`)
}

console.log('\nGitHub CLI account')
console.log('------------------')
const login = run('gh', ['api', 'user', '--jq', '.login'])
if (login === EXPECTED_LOGIN) {
  console.log(`- active account: ${login} OK`)
} else {
  console.log('- active account: WRONG')
  problems.push(
    login === null
      ? 'gh is not logged in or not reachable (cannot confirm the push identity)'
      : `active gh account is "${login}", not the personal account ${EXPECTED_LOGIN}`,
  )
}

if (problems.length > 0) {
  console.log(`\nSTOP: ${problems.length} identity problem(s). Do not commit or push; tell the project lead.`)
  for (const p of problems) console.log(`  - ${p}`)
  process.exit(1)
}
console.log('\nOK: personal identity confirmed; safe to commit and push.')
