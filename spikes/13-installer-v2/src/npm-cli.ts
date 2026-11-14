/**
 * Find npm's JavaScript entry (`npm-cli.js`) so npm can be run as `node npm-cli.js ...`.
 *
 * Why not just spawn `npm`: on Windows `npm` is `npm.cmd` (needs a shell, refused by Node since the
 * CVE-2024-27980 fix) or `npm.ps1` (blocked by the default execution policy). Running the same
 * `node.exe` that runs us, with npm's own script, works everywhere with no shell.
 *
 * @module
 */
import { existsSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'

/** npm could not be found next to Node. The message says how to fix it. */
export class NpmNotFoundError extends Error {
  constructor(looked: readonly string[]) {
    super(
      `npm was not found. Looked in:\n${looked.map((p) => `  - ${p}`).join('\n')}\n` +
        'Reinstall Node.js from https://nodejs.org (npm comes with it), then run: npm run setup',
    )
    this.name = 'NpmNotFoundError'
  }
}

/**
 * Where to look for `npm-cli.js`, best first:
 * 1. `npm_execpath`, which npm sets when it runs us (`npm create`, `npm run`). When we were started
 *    by npx it may point at `npx-cli.js`; its sibling is `npm-cli.js`. Other package managers'
 *    paths (pnpm, yarn) are ignored: Strutvane projects use npm only.
 * 2. Next to node: `<node dir>/node_modules/npm/bin/npm-cli.js` (Windows installer layout).
 * 3. `<node dir>/../lib/node_modules/npm/bin/npm-cli.js` (macOS/Linux layout).
 *
 * @example
 * npmCliCandidates({ npm_execpath: 'C:/nodejs/node_modules/npm/bin/npx-cli.js' }, 'C:/nodejs/node.exe')
 * // ['C:/nodejs/node_modules/npm/bin/npm-cli.js', ...]
 */
export function npmCliCandidates(env: NodeJS.ProcessEnv, execPath: string): string[] {
  const candidates: string[] = []
  const fromNpm = env['npm_execpath']
  if (fromNpm !== undefined) {
    const file = basename(fromNpm)
    if (file === 'npm-cli.js') candidates.push(fromNpm)
    if (file === 'npx-cli.js') candidates.push(join(dirname(fromNpm), 'npm-cli.js'))
  }
  const nodeDir = dirname(execPath)
  candidates.push(join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'))
  candidates.push(join(nodeDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'))
  return candidates
}

/**
 * The first `npm-cli.js` that exists. Throws {@link NpmNotFoundError} with every place looked.
 *
 * @param exists - file check (tests inject one)
 *
 * @example
 * const npmCli = resolveNpmCli(process.env, process.execPath)
 * spawn(process.execPath, [npmCli, 'install'])
 */
export function resolveNpmCli(
  env: NodeJS.ProcessEnv,
  execPath: string,
  exists: (path: string) => boolean = existsSync,
): string {
  const candidates = npmCliCandidates(env, execPath)
  const found = candidates.find((path) => exists(path))
  if (found === undefined) throw new NpmNotFoundError(candidates)
  return found
}
