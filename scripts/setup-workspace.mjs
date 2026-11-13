#!/usr/bin/env node
// @ts-check
/**
 * Strutvane workspace setup
 *
 * Recreates the local umbrella layout: this hub repo, with every package repo cloned under
 * `packages/<dir>/`. Safe to run any time, on Windows, macOS and Linux.
 *
 *   node scripts/setup-workspace.mjs              # clone missing repos, check existing ones
 *   node scripts/setup-workspace.mjs --pull       # also fast-forward each clean repo's main
 *   node scripts/setup-workspace.mjs --dry-run    # show what would happen, change nothing
 *   node scripts/setup-workspace.mjs --root <dir> # use another folder instead of ./packages
 *
 * Guarantees:
 *   - Never deletes, resets or overwrites anything. Existing folders are only inspected.
 *   - `--pull` only fast-forwards (`git pull --ff-only`) repos that are on `main` and clean, and
 *     reports every other repo instead of touching it.
 *   - Requires only Node 24+ and git. Exits non-zero if any repo needs attention.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const OWNER = 'vishwajit-vm'

/**
 * Every repo of the ecosystem except the hub itself: local folder → GitHub repo.
 * Keep in sync with the repository map in .claude/ECOSYSTEM.md (strutvane-tooling).
 */
export const REPOS = /** @type {const} */ ([
  ['contracts', 'strutvane-contracts'],
  ['core', 'strutvane-core'],
  ['framework', 'strutvane-framework'],
  ['auth', 'strutvane-auth'],
  ['ui', 'strutvane-ui'],
  ['cli', 'strutvane-cli'],
  ['devkit', 'strutvane-devkit'],
  ['logs', 'strutvane-logs'],
  ['create-strutvane', 'create-strutvane'],
  ['tooling', 'strutvane-tooling'],
  ['docs', 'strutvane-docs'],
])

/** Run git and return trimmed stdout, or null on failure. Never throws. */
function git(/** @type {string[]} */ args, /** @type {string | undefined} */ cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' })
  return r.status === 0 ? r.stdout.trim() : null
}

/** Parse CLI arguments. Exported for tests. */
export function parseArgs(/** @type {string[]} */ argv) {
  /** @type {{ pull: boolean, dryRun: boolean, root: string | undefined }} */
  const opts = { pull: false, dryRun: false, root: undefined }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--pull') opts.pull = true
    else if (a === '--dry-run') opts.dryRun = true
    else if (a === '--root') {
      const v = argv[++i]
      if (!v || v.startsWith('--')) throw new Error('--root needs a folder')
      opts.root = v
    } else throw new Error(`unknown argument: ${a}`)
  }
  return opts
}

/**
 * Decide and perform the action for one repo.
 * @returns {{ status: 'cloned' | 'would-clone' | 'ok' | 'updated' | 'attention', detail: string }}
 */
export function setupRepo(
  /** @type {string} */ dir,
  /** @type {string} */ repo,
  /** @type {{ pull: boolean, dryRun: boolean }} */ opts,
) {
  const url = `https://github.com/${OWNER}/${repo}.git`
  if (!existsSync(dir)) {
    if (opts.dryRun) return { status: 'would-clone', detail: url }
    const r = spawnSync('git', ['clone', '--quiet', url, dir], { encoding: 'utf8' })
    return r.status === 0
      ? { status: 'cloned', detail: url }
      : { status: 'attention', detail: `clone failed: ${r.stderr.trim()}` }
  }
  if (!existsSync(join(dir, '.git')))
    return { status: 'attention', detail: 'folder exists but is not a git repository; left untouched' }

  const remote = git(['remote', 'get-url', 'origin'], dir)
  const expected = new Set([url, url.replace(/\.git$/, '')])
  if (!remote || !expected.has(remote))
    return { status: 'attention', detail: `origin is ${remote ?? 'missing'}, expected ${url}` }

  const branch = git(['branch', '--show-current'], dir)
  const dirty = (git(['status', '--porcelain'], dir) ?? 'x').length > 0
  if (branch !== 'main') return { status: 'attention', detail: `on branch "${branch}", not main` }
  if (dirty) return { status: 'attention', detail: 'has uncommitted changes' }
  if (!opts.pull) return { status: 'ok', detail: 'main, clean' }
  if (opts.dryRun) return { status: 'ok', detail: 'would fast-forward main' }
  const before = git(['rev-parse', 'HEAD'], dir)
  const pulled = spawnSync('git', ['pull', '--ff-only', '--quiet'], { cwd: dir, encoding: 'utf8' })
  if (pulled.status !== 0) return { status: 'attention', detail: `pull failed: ${pulled.stderr.trim()}` }
  return git(['rev-parse', 'HEAD'], dir) === before
    ? { status: 'ok', detail: 'already up to date' }
    : { status: 'updated', detail: 'fast-forwarded main' }
}

function main() {
  const opts = parseArgs(process.argv.slice(2))
  if (git(['--version']) === null) throw new Error('git is required but was not found on PATH')
  const hub = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const root = resolve(hub, opts.root ?? 'packages')

  let attention = 0
  for (const [dir, repo] of REPOS) {
    const { status, detail } = setupRepo(join(root, dir), repo, opts)
    if (status === 'attention') attention++
    process.stdout.write(`${status.padEnd(11)} ${dir.padEnd(17)} ${detail}\n`)
  }
  process.stdout.write(
    attention === 0
      ? `\nWorkspace ready (${REPOS.length} repos under ${root}).\n`
      : `\n${attention} repo(s) need attention (listed above). Nothing was changed in them.\n`,
  )
  process.exitCode = attention === 0 ? 0 : 1
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main()
  } catch (error) {
    process.stderr.write(`setup failed: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 2
  }
}
