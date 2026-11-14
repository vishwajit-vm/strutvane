/**
 * Detect flags that npm kept for itself, and print the command the user meant.
 *
 * The trap (verified 2026-11-14, npm 11.19.0): in `npm create strutvane@latest my-app --db sqlite`
 * every option **before** `--` belongs to npm. npm does not forward it; it stores it as an
 * `npm_config_db=sqlite` environment variable, warns "Unknown cli config", and the bare value
 * `sqlite` arrives as an extra positional argument. npm even expands prefixes: `--auth none`
 * becomes `npm_config_auth_type=none`. We cannot get the flag back reliably, but we can see the
 * traces and stop with the corrected command instead of silently ignoring the user's choice.
 *
 * @module
 */

/** One of our flags, found in npm's environment instead of our arguments. */
export interface SwallowedFlag {
  /** Our flag name without dashes, e.g. `db`. */
  readonly flag: string
  /** What npm stored: `'true'`, `'false'`, `''` (from `--no-x`) or the value. */
  readonly value: string
}

/**
 * Where npm stores each of our flags. Most are `npm_config_<flag>`; `--auth` is expanded by npm
 * to its own `auth-type` config, so we look there too.
 *
 * Not listed on purpose: `--yes` (npm's own "skip the install prompt" flag, which people pass
 * legitimately), `--dev` (npm turns it into `--include=dev` and leaves no variable), `--help` and
 * `--version` (npm answers them itself).
 */
const NPM_KEYS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  name: ['npm_config_name'],
  stack: ['npm_config_stack'],
  ui: ['npm_config_ui'],
  // Not checked against a real npm yet: npm has no config that `design` abbreviates, so it should
  // land in npm_config_design like --ui does.
  design: ['npm_config_design'],
  auth: ['npm_config_auth', 'npm_config_auth_type'],
  features: ['npm_config_features'],
  teams: ['npm_config_teams'],
  db: ['npm_config_db'],
  docker: ['npm_config_docker'],
  testing: ['npm_config_testing'],
  git: ['npm_config_git'],
})

/** Boolean flags: npm stores `true`, or `false`/`''` for the `--no-` form. */
const BOOLEAN_FLAGS: ReadonlySet<string> = new Set(['teams', 'docker', 'git'])

/**
 * Was this process started by npm (`npm create`, `npm exec`, `npm run`)?
 *
 * @example
 * startedByNpm({ npm_config_user_agent: 'npm/11.19.0 node/v24.21.0 win32 x64' }) // true
 */
export function startedByNpm(env: NodeJS.ProcessEnv): boolean {
  return (env['npm_config_user_agent'] ?? '').startsWith('npm/')
}

/**
 * Find our flags in npm's environment variables.
 *
 * Why the value checks: a user may legitimately have `git=/usr/bin/git` in `.npmrc` (npm's own
 * `git` setting). For boolean flags we only count npm's boolean spellings.
 *
 * @example
 * findSwallowedFlags({ npm_config_user_agent: 'npm/11', npm_config_db: 'sqlite' })
 * // [{ flag: 'db', value: 'sqlite' }]
 */
export function findSwallowedFlags(env: NodeJS.ProcessEnv): SwallowedFlag[] {
  if (!startedByNpm(env)) return []
  const found: SwallowedFlag[] = []
  for (const [flag, keys] of Object.entries(NPM_KEYS)) {
    for (const key of keys) {
      const value = env[key]
      if (value === undefined) continue
      if (BOOLEAN_FLAGS.has(flag) && !['true', 'false', ''].includes(value)) continue
      found.push({ flag, value })
      break
    }
  }
  return found
}

/**
 * Rebuild a flag as the user typed it: `--db sqlite`, `--teams`, `--no-git`.
 *
 * @example
 * flagText({ flag: 'git', value: 'false' }) // '--no-git'
 */
export function flagText(swallowed: SwallowedFlag): string {
  if (BOOLEAN_FLAGS.has(swallowed.flag)) {
    return swallowed.value === 'true' ? `--${swallowed.flag}` : `--no-${swallowed.flag}`
  }
  return `--${swallowed.flag} ${swallowed.value}`
}

/**
 * The friendly error, with the corrected command, or `undefined` when nothing was swallowed.
 *
 * Stray positionals are the other trace: npm leaves the *value* of a swallowed flag behind
 * (`my-app sqlite`). Values that match a swallowed flag are explained together with it.
 *
 * @param env - the process environment (npm's traces live here)
 * @param positionals - every positional argument we received
 *
 * @example
 * swallowedFlagsMessage({ npm_config_user_agent: 'npm/11', npm_config_db: 'sqlite' }, ['my-app', 'sqlite'])
 * // 'npm kept these options for itself: --db sqlite ... npm create strutvane@latest my-app -- --db sqlite'
 */
export function swallowedFlagsMessage(
  env: NodeJS.ProcessEnv,
  positionals: readonly string[],
): string | undefined {
  const swallowed = findSwallowedFlags(env)
  if (swallowed.length === 0) return undefined
  const name = positionals[0] ?? 'my-app'
  const flags = swallowed.map(flagText).join(' ')
  return [
    `npm kept these options for itself, so the installer never received them: ${flags}`,
    'With npm create, options go after "--". Run this instead:',
    '',
    `  npm create strutvane@latest ${name} -- ${flags}`,
    '',
    `Or without the "--" rule:  npx create-strutvane@latest ${name} ${flags}`,
  ].join('\n')
}
