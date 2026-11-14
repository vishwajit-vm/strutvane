/**
 * Step "git": `git init -b main`, `git add -A`, and the first commit (after install, so the
 * lockfile is in it). `.env`, `docker/` and `.strutvane/` are git-ignored by the generated
 * `.gitignore`, so no secret or machine state is ever committed.
 *
 * Situations handled:
 * - git not installed → skipped, with the install hint;
 * - the folder is inside another repository (a monorepo) → no nested repository, reported as done;
 * - a repository from an earlier attempt already has a commit → done (idempotent);
 * - no git identity → failed with the two `git config` commands to run, then `npm run setup`;
 * - before committing, `git check-ignore` must confirm the secret paths are ignored and the staged
 *   list must contain none of them; otherwise nothing is committed (security review F-17).
 *
 * @module
 */
import { realpathSync } from 'node:fs'
import { lastLines } from '../spawn.ts'
import { failed, type Step, type StepContext, type StepOutcome } from './types.ts'

/** The first commit's message. */
export const INITIAL_COMMIT_MESSAGE = 'chore: initial commit from create-strutvane'

/** Output that means "git does not know who you are". */
const NO_IDENTITY = /tell me who you are|unable to auto-detect email|user\.useConfigOnly|empty ident name/i

/**
 * Do two paths name the same folder? Resolves Windows 8.3 short names (`VISHWA~1`) and letter
 * case, because git prints long names with forward slashes.
 */
function sameFolder(a: string, b: string): boolean {
  const normalise = (path: string) => {
    const real = realpathSync.native(path)
    return process.platform === 'win32' ? real.toLowerCase() : real
  }
  try {
    return normalise(a) === normalise(b)
  } catch {
    return false
  }
}

/**
 * Paths that must be git-ignored before the first commit (security review F-17). They do not
 * need to exist: `git check-ignore` matches patterns.
 */
export const MUST_BE_IGNORED = [
  '.env',
  '.env.local',
  '.strutvane/setup.json',
  'docker/compose.yaml',
  'database/database.sqlite',
  'database/database.sqlite-wal',
  'database/database.sqlite-journal',
  'storage/logs/app.log',
] as const

/**
 * Staged paths that must never be committed: env files (except the example), installer state,
 * Docker files and volumes, SQLite data files and storage.
 *
 * @example
 * isForbiddenInCommit('.env') // true
 * isForbiddenInCommit('.env.example') // false
 */
export function isForbiddenInCommit(path: string): boolean {
  const name = path.split('/').pop() ?? path
  if (name.startsWith('.env') && name !== '.env.example') return true
  if (/\.sqlite($|-)/.test(name)) return true
  return /^(\.strutvane|docker|storage|node_modules)\//.test(path)
}

/**
 * Stage everything, but only after proving the ignore rules work, and check what was staged.
 * Returns a failed outcome (and unstages everything) when anything secret would be committed.
 */
async function guardFirstCommit(context: StepContext): Promise<StepOutcome | undefined> {
  const check = await git(context, 'check-ignore', ...MUST_BE_IGNORED)
  const ignored = new Set(check.output.split(/\r?\n/).map((line) => line.trim()))
  const notIgnored = MUST_BE_IGNORED.filter((path) => !ignored.has(path))
  if (notIgnored.length > 0) {
    return failed(
      'command-failed',
      `Nothing was committed: .gitignore does not ignore ${notIgnored.join(', ')}.`,
      'Restore the generated .gitignore (these hold secrets or local data), then run npm run setup.',
    )
  }
  await git(context, 'add', '-A')
  const staged = await git(context, 'diff', '--cached', '--name-only')
  const forbidden = staged.output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && isForbiddenInCommit(line))
  if (forbidden.length > 0) {
    await git(context, 'reset', '--quiet') // unstage everything again: never half-commit
    return failed(
      'command-failed',
      `Nothing was committed: these files must never be committed: ${forbidden.join(', ')}.`,
      'Check .gitignore and remove them from the index, then run npm run setup.',
    )
  }
  return undefined
}

/** Run one git command in the project. */
function git(context: StepContext, ...args: string[]) {
  return context.spawn({ command: 'git', args, cwd: context.directory, logFile: context.logFile })
}

/**
 * The git step.
 *
 * @example
 * await gitStep.run(context) // { status: 'done', message: 'Git repository created (main, 1 commit)' }
 */
export const gitStep: Step = {
  id: 'git',
  title: 'Creating the git repository',
  needs: () => ['install'],
  applies: (options) => options.git,
  run: async (context) => {
    const version = await git(context, '--version')
    if (version.notFound || version.code !== 0) {
      return { status: 'skipped', reason: 'git was not found: install it (https://git-scm.com), then run npm run setup' }
    }
    const top = await git(context, 'rev-parse', '--show-toplevel')
    if (top.code === 0) {
      const root = top.output.trim()
      if (!sameFolder(root, context.directory)) {
        return { status: 'done', message: `Inside the existing git repository ${root}; no new repository created` }
      }
      if ((await git(context, 'rev-parse', '--verify', '--quiet', 'HEAD')).code === 0) {
        return { status: 'done', message: 'Git repository already has its first commit' }
      }
    } else {
      const init = await git(context, 'init', '-b', 'main')
      if (init.code !== 0) {
        return failed('command-failed', 'git init failed.', 'Run git init yourself, then npm run setup.', lastLines(init.output, 5))
      }
    }
    const guard = await guardFirstCommit(context)
    if (guard !== undefined) return guard
    const commit = await git(context, 'commit', '-m', INITIAL_COMMIT_MESSAGE)
    if (commit.code === 0) return { status: 'done', message: 'Git repository created (main, 1 commit)' }
    if (NO_IDENTITY.test(commit.output)) {
      return failed(
        'git-identity',
        'The repository was created, but git does not know your name and email yet, so nothing was committed.',
        'Run: git config --global user.name "Your Name"; git config --global user.email "you@example.com"  then choose Retry (or later: npm run setup).',
        lastLines(commit.output, 4),
      )
    }
    return failed('command-failed', 'git commit failed.', 'Commit by hand, or fix the cause and run npm run setup.', lastLines(commit.output, 6))
  },
}
