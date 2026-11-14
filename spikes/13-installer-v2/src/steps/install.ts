/**
 * Step "install": `npm ci --ignore-scripts` (shipped lockfile), run as `node <npm-cli.js> ci` with no
 * shell (Windows-safe), then `npm rebuild` for the allowlisted packages only.
 *
 * Failure handling:
 * - network blips (ETIMEDOUT, ECONNRESET, EAI_AGAIN): one automatic retry;
 * - Windows file locks (EPERM, EBUSY: antivirus or an editor): one retry after 2 seconds;
 * - registry or proxy problems (E401, E403, certificates): a hint about `npm config get registry`;
 * - anything else: the last lines of output and the path of the full log.
 * The project is never deleted; `npm run setup` runs this step again.
 *
 * @module
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NpmNotFoundError } from '../npm-cli.ts'
import { lastLines } from '../spawn.ts'
import { execInApp } from './compose.ts'
import { envValue } from './env-io.ts'
import { failed, type Step, type StepContext, type StepOutcome } from './types.ts'

/** What kind of npm failure the output shows. */
export type InstallProblem = 'network' | 'locked' | 'registry' | 'other'

/**
 * Classify an npm failure from its output.
 *
 * @example
 * classifyInstallFailure('npm error code ECONNRESET') // 'network'
 */
export function classifyInstallFailure(output: string): InstallProblem {
  if (/\b(ETIMEDOUT|ECONNRESET|EAI_AGAIN|ENOTFOUND|ECONNREFUSED)\b/.test(output)) return 'network'
  if (/\b(EPERM|EBUSY)\b/.test(output)) return 'locked'
  if (/\b(E401|E403|SELF_SIGNED_CERT_IN_CHAIN|UNABLE_TO_GET_ISSUER_CERT_LOCALLY)\b/.test(output)) return 'registry'
  return 'other'
}

/** What to tell the user for each kind of failure. */
const HINTS: Readonly<Record<InstallProblem, string>> = {
  network: 'npm could not reach the registry. Check your internet connection or proxy.',
  locked: 'A file in node_modules is locked (antivirus or an open editor). Close programs using the folder.',
  registry: 'The registry refused the request. Check `npm config get registry` and your npm login or proxy certificate.',
  other: 'npm install failed.',
}

/**
 * The npm arguments for the install (security review F-12): `npm ci` when the shipped lockfile is
 * there (exact, tested versions), and `--ignore-scripts` always, so no dependency's install
 * script runs. The few packages that need one are rebuilt by name afterwards.
 *
 * @example
 * installArgs(true) // ['ci', '--ignore-scripts', '--no-audit', '--no-fund']
 */
export function installArgs(hasLockfile: boolean): string[] {
  return [hasLockfile ? 'ci' : 'install', '--ignore-scripts', '--no-audit', '--no-fund']
}

/**
 * The packages allowed to run install scripts: `package.json` → `"strutvane": { "rebuild": [...] }`.
 * Anything that is not a plain package name is ignored (it ends up as an npm argument).
 *
 * @example
 * rebuildAllowlist('C:/code/my-app') // ['esbuild']
 */
export function rebuildAllowlist(directory: string): string[] {
  let manifest: unknown
  try {
    manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'))
  } catch {
    return []
  }
  if (typeof manifest !== 'object' || manifest === null) return []
  const settings = Reflect.get(manifest, 'strutvane')
  const list = typeof settings === 'object' && settings !== null ? Reflect.get(settings, 'rebuild') : undefined
  if (!Array.isArray(list)) return []
  return list.filter((name): name is string => typeof name === 'string' && /^(@[a-z0-9._-]+\/)?[a-z0-9._-]+$/.test(name))
}

/** Run the install once: inside the app container in Docker mode, else here. */
async function installOnce(context: StepContext, npmCli: string) {
  const hasLockfile = existsSync(join(context.directory, 'package-lock.json'))
  if (context.options.docker) return execInApp(context, ['npm', ...installArgs(hasLockfile)])
  return context.spawn({
    command: context.execPath, // node itself: never npm.cmd / npm.ps1
    args: [npmCli, ...installArgs(hasLockfile)],
    cwd: context.directory,
    logFile: context.logFile,
  })
}

/** `npm rebuild <allowlist> --ignore-scripts=false`: run only the allowed install scripts. */
async function rebuildAllowed(context: StepContext, npmCli: string) {
  const names = rebuildAllowlist(context.directory)
  if (names.length === 0) return { code: 0, output: '', notFound: false }
  if (context.options.docker) return execInApp(context, ['npm', 'rebuild', ...names, '--ignore-scripts=false'])
  return context.spawn({
    command: context.execPath,
    args: [npmCli, 'rebuild', ...names, '--ignore-scripts=false'],
    cwd: context.directory,
    logFile: context.logFile,
  })
}

/** "added 12 packages" → "added 12 packages"; npm prints it on success. */
function summary(output: string): string {
  const match = /added \d+ packages?|up to date/.exec(output)
  return match === null ? 'Dependencies installed with npm' : `Dependencies installed with npm (${match[0]})`
}

/**
 * A fresh named volume is owned by root, and the app runs as an ordinary user: give the volume to
 * that user (as root, once; `chown` on an already-owned folder is a no-op).
 */
async function prepareNodeModulesVolume(context: StepContext): Promise<StepOutcome | undefined> {
  const uid = envValue(context.directory, 'STRUT_UID') ?? '1000'
  const gid = envValue(context.directory, 'STRUT_GID') ?? '1000'
  const result = await execInApp(context, ['chown', `${uid}:${gid}`, '/app/node_modules'], { user: 'root' })
  if (result.code === 0) return undefined
  return failed(
    'install-failed',
    'The node_modules volume could not be prepared in the app container.',
    `Is the app container running? Try: node strut services:up  (full log: ${context.logFile})`,
    lastLines(result.output, 5),
  )
}

/**
 * The install step.
 *
 * @example
 * await installStep.run(context) // { status: 'done', message: 'Dependencies installed with npm (added 1 package)' }
 */
export const installStep: Step = {
  id: 'install',
  title: 'Installing dependencies with npm',
  // In Docker mode npm runs inside the app container, so the containers must be up first.
  needs: (options) => (options.docker ? ['files', 'database'] : ['files']),
  applies: () => true,
  run: async (context) => {
    if (context.options.docker) {
      // The node_modules volume starts out owned by root; hand it to the app's user once.
      const owner = await prepareNodeModulesVolume(context)
      if (owner !== undefined) return owner
    }
    let npmCli: string
    try {
      // Docker mode runs `npm` from the image; the host's npm-cli.js is not needed (or used).
      npmCli = context.options.docker ? '' : context.npmCli()
    } catch (error) {
      if (error instanceof NpmNotFoundError) return failed('install-failed', 'npm was not found.', error.message)
      throw error
    }
    let result = await installOnce(context, npmCli)
    if (result.code !== 0) {
      const problem = classifyInstallFailure(result.output)
      if (problem === 'network' || problem === 'locked') {
        context.reporter.warn(`${HINTS[problem]} Retrying once...`)
        if (problem === 'locked') await context.sleep(2000) // give the lock holder a moment
        result = await installOnce(context, npmCli)
      }
    }
    if (result.code === 0) {
      const rebuild = await rebuildAllowed(context, npmCli)
      if (rebuild.code === 0) return { status: 'done', message: summary(result.output) }
      return failed(
        'install-failed',
        `npm rebuild ${rebuildAllowlist(context.directory).join(' ')} failed (exit code ${rebuild.code}).`,
        `A package on the "strutvane.rebuild" list could not run its install script. Full log: ${context.logFile}`,
        lastLines(rebuild.output, 20),
      )
    }
    const problem = classifyInstallFailure(result.output)
    return failed(
      'install-failed',
      `npm install failed (exit code ${result.code}).`,
      `${HINTS[problem]} Full log: ${context.logFile}`,
      lastLines(result.output, 20),
    )
  },
}
