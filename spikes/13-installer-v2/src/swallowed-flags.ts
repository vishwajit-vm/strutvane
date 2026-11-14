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
import { QUESTIONS } from './question-registry.ts'

/** One of our flags, found in npm's environment instead of our arguments. */
export interface SwallowedFlag {
  /** Our flag name without dashes, e.g. `db`. */
  readonly flag: string
  /** What npm stored: `'true'`, `'false'`, `''` (from `--no-x`) or the value. */
  readonly value: string
}

/** One question flag to look for in npm's environment. */
interface Watched {
  readonly flag: string
  readonly keys: readonly string[]
  /** Would the installer accept this value for the flag? */
  readonly accepts: (value: string) => boolean
}

/**
 * Where npm stores each question flag: `npm_config_<flag>` (dashes become underscores), plus any
 * alias from the registry (`--auth` is expanded by npm to its own `auth-type` config).
 *
 * Why only values the installer would accept: npm sets some of these variables itself (for example
 * `npm_config_git`, a path to git, from `.npmrc`). Counting only valid choices (`--db sqlite`,
 * `true`/`false` for yes/no flags) keeps those from looking like a swallowed flag.
 *
 * Not watched on purpose: `--yes` (npm's own "skip the install prompt" flag, which people pass
 * legitimately), `--dev` (npm turns it into `--include=dev` and leaves no variable), `--help` and
 * `--version` (npm answers them itself). Derived from the registry, so every new question flag is
 * watched automatically.
 */
const WATCHED: readonly Watched[] = QUESTIONS.flatMap((question) => {
  const flag = question.flag
  if (flag === undefined) return []
  return [
    {
      flag: flag.name,
      keys: [`npm_config_${flag.name.replaceAll('-', '_')}`, ...(flag.npmAliases ?? [])],
      accepts: (value: string) => {
        if (flag.type === 'boolean') return ['true', 'false', ''].includes(value)
        const problems: string[] = []
        question.read(flag.multiple === true ? [value] : value, problems)
        return problems.length === 0
      },
    },
  ]
})

/** Boolean flags: npm stores `true`, or `false`/`''` for the `--no-` form. */
const BOOLEAN_FLAGS: ReadonlySet<string> = new Set(QUESTIONS.flatMap((q) => (q.flag?.type === 'boolean' ? [q.flag.name] : [])))

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
  for (const { flag, keys, accepts } of WATCHED) {
    for (const key of keys) {
      const value = env[key]
      if (value === undefined || !accepts(value)) continue
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
