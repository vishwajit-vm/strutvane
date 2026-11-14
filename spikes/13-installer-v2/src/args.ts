/**
 * Command-line flags: one flag for every question, so CI (and impatient people) never need a prompt.
 *
 * Parsing uses `node:util` `parseArgs` in strict mode: a typo such as `--databse` is an error with a
 * hint, never silently ignored.
 *
 * @module
 */
import { parseArgs } from 'node:util'
import {
  AUTH_FEATURES,
  AUTH_MODES,
  type Answers,
  type AuthFeature,
  DATABASES,
  DEFAULTS,
  DESIGN_NAMES,
  STACKS,
  TEST_SETUPS,
  UI_STARTERS,
} from './options.ts'

/** What the user asked the installer to do. */
export type Command = 'create' | 'resume' | 'help' | 'version'

/**
 * The parsed command line.
 *
 * @example
 * parseCommandLine(['my-app', '--db', 'sqlite', '--yes'])
 * // { command: 'create', answers: { name: 'my-app', database: 'sqlite' }, yes: true, ... }
 */
export interface ParsedArgs {
  readonly command: Command
  /** Only the answers given as flags. Missing ones are asked, or defaulted with `--yes`. */
  readonly answers: Answers
  /** `--yes`: accept the default for every question not given as a flag. */
  readonly yes: boolean
  /** `--dev` / `--no-dev`: start `npm run dev` at the end without asking. `undefined` = ask. */
  readonly dev: boolean | undefined
  /** Every positional argument, kept so stray ones can be explained (see swallowed-flags.ts). */
  readonly positionals: readonly string[]
  /** `--resume <dir>`: continue the setup of an existing project (used by `node strut setup`). */
  readonly resumeDirectory: string | undefined
}

/** The command line could not be understood. `problems` are full sentences for the user. */
export class ArgsError extends Error {
  readonly problems: readonly string[]

  /** @param problems - one plain-language sentence per problem */
  constructor(problems: readonly string[]) {
    super(problems.join('\n'))
    this.name = 'ArgsError'
    this.problems = problems
  }
}

/**
 * The flag table given to `parseArgs`. Exported so the swallowed-flag check knows our flag names.
 *
 * Why string flags for choices: `parseArgs` has no enum type; each value is checked below with a
 * message that lists the allowed values.
 */
export const FLAGS = {
  name: { type: 'string' },
  stack: { type: 'string' },
  ui: { type: 'string' },
  design: { type: 'string' },
  auth: { type: 'string' },
  features: { type: 'string' },
  teams: { type: 'boolean' },
  db: { type: 'string' },
  docker: { type: 'boolean' },
  'db-host': { type: 'string' },
  'db-port': { type: 'string' },
  'db-name': { type: 'string' },
  'db-user': { type: 'string' },
  testing: { type: 'string' },
  git: { type: 'boolean' },
  dev: { type: 'boolean' },
  yes: { type: 'boolean', short: 'y' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
  resume: { type: 'string' },
} as const

/**
 * Parse the installer's arguments (without `node` and the script path).
 * Throws {@link ArgsError} listing every problem at once.
 *
 * @example
 * parseCommandLine(['my-app', '--no-git']).answers.git // false
 */
export function parseCommandLine(argv: readonly string[]): ParsedArgs {
  const { values, positionals } = parseStrict(argv)
  const problems: string[] = []
  const answers: { -readonly [K in keyof Answers]: Answers[K] } = {}

  const name = pickName(values.name, positionals, problems)
  if (name !== undefined) answers.name = name
  assign(answers, 'stack', oneOf('--stack', values.stack, STACKS, problems))
  assign(answers, 'ui', oneOf('--ui', values.ui, UI_STARTERS, problems))
  assign(answers, 'design', oneOf('--design', values.design, DESIGN_NAMES, problems))
  assign(answers, 'auth', oneOf('--auth', values.auth, AUTH_MODES, problems))
  assign(answers, 'features', featureList(values.features, problems))
  assign(answers, 'teams', values.teams)
  assign(answers, 'database', oneOf('--db', values.db, DATABASES, problems))
  assign(answers, 'docker', values.docker)
  assign(answers, 'dbHost', values['db-host'])
  assign(answers, 'dbPort', portNumber(values['db-port'], problems))
  assign(answers, 'dbName', values['db-name'])
  assign(answers, 'dbUser', values['db-user'])
  assign(answers, 'testing', oneOf('--testing', values.testing, TEST_SETUPS, problems))
  assign(answers, 'git', values.git)

  if (problems.length > 0) throw new ArgsError(problems)
  return {
    command: pickCommand(values),
    answers,
    yes: values.yes ?? false,
    dev: values.dev,
    positionals,
    resumeDirectory: values.resume,
  }
}

/** Run `parseArgs`, turning its terse errors into a friendly {@link ArgsError}. */
function parseStrict(argv: readonly string[]) {
  try {
    return parseArgs({
      args: [...argv],
      options: FLAGS,
      allowPositionals: true,
      // Lets `--no-git`, `--no-docker`, `--no-teams`, `--no-dev` mean "false".
      allowNegative: true,
      strict: true,
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new ArgsError([`${detail}. Run with --help to see every option.`])
  }
}

/** The help/version flags win over everything else, like in every CLI people know. */
function pickCommand(values: { help?: boolean; version?: boolean; resume?: string }): Command {
  if (values.help === true) return 'help'
  if (values.version === true) return 'version'
  if (values.resume !== undefined) return 'resume'
  return 'create'
}

/** The name comes from the first positional or `--name`; both at once must agree. */
function pickName(
  flag: string | undefined,
  positionals: readonly string[],
  problems: string[],
): string | undefined {
  const positional = positionals[0]
  if (flag !== undefined && positional !== undefined && flag !== positional) {
    problems.push(`two different names were given ("${positional}" and --name "${flag}"): keep one`)
  }
  if (positionals.length > 1) {
    const extra = positionals.slice(1).map((p) => `"${p}"`).join(', ')
    problems.push(`unexpected extra argument ${extra}: only one project name is allowed`)
  }
  return flag ?? positional
}

/** Check one value against its allowed list; the message names the flag and every choice. */
function oneOf<T extends string>(
  flag: string,
  value: string | undefined,
  allowed: readonly T[],
  problems: string[],
): T | undefined {
  if (value === undefined) return undefined
  const match = allowed.find((choice) => choice === value)
  if (match === undefined) {
    problems.push(`${flag} "${value}" is not a choice. Use one of: ${allowed.join(', ')}`)
  }
  return match
}

/** `--db-port 3307` → 3307; anything that is not a whole number is a problem. */
function portNumber(value: string | undefined, problems: string[]): number | undefined {
  if (value === undefined) return undefined
  if (!/^\d{1,5}$/.test(value)) {
    problems.push(`--db-port "${value}" is not a port number (1 to 65535)`)
    return undefined
  }
  return Number(value)
}

/** `--features registration,2fa`, or `--features none` for no extra sign-in features. */
function featureList(value: string | undefined, problems: string[]): AuthFeature[] | undefined {
  if (value === undefined) return undefined
  if (value.trim() === 'none') return []
  const chosen: AuthFeature[] = []
  for (const part of value.split(',').map((p) => p.trim())) {
    const match = AUTH_FEATURES.find((feature) => feature === part)
    if (match === undefined) {
      problems.push(`--features "${part}" is not a choice. Use a comma list of: ${AUTH_FEATURES.join(', ')}, or none`)
    } else {
      chosen.push(match)
    }
  }
  return chosen
}

/** Set a key only when a value was given, so "not given" stays distinguishable from a value. */
function assign<K extends keyof Answers>(
  target: { -readonly [P in keyof Answers]: Answers[P] },
  key: K,
  value: Answers[K] | undefined,
): void {
  if (value !== undefined) target[key] = value
}

/**
 * The `--help` text. Shows the `--` rule for `npm create` and the `npx` form that needs no `--`.
 *
 * @example
 * process.stdout.write(helpText('0.0.0-spike'))
 */
export function helpText(version: string): string {
  // Built from DESIGN_NAMES so a new design shows up here without touching this text.
  const designFlag = `--design ${DESIGN_NAMES.join('|')}`.padEnd(27)
  const designLine = `  ${designFlag}${'Look of the React UI (a design package)'.padEnd(45)}[${DEFAULTS.design}]`
  return `create-strutvane ${version}: create a new Strutvane app

Usage
  npm create strutvane@latest my-app
  npm create strutvane@latest my-app -- --db postgres --yes   (npm needs -- before flags)
  npx create-strutvane@latest my-app --db postgres --yes      (npx does not)

Questions you can answer with flags
  --stack full|api           Full-stack (API + React UI) or API only      [full]
  --ui admin|blank           React UI starter: admin screens or blank     [admin]
${designLine}
  --auth email|none          Email + password sign-in, or no sign-in      [email]
  --features <list>|none     registration,verification,2fa                [none]
  --teams / --no-teams       Teams (each customer company sees its data)  [no]
  --db mysql|postgres|sqlite Database                                     [mysql]
  --docker / --no-docker     Everything in Docker (app, database, Mailpit),
                             like Laravel Sail; or on this computer   [yes, no for sqlite]
  --db-host/--db-port/--db-name/--db-user
                             Your own MySQL/PostgreSQL (without Docker). The password
                             is asked, or read from the STRUT_DB_PASSWORD variable.
  --testing vitest|vitest-playwright|none                                 [vitest]
  --git / --no-git           Create a git repository with a first commit  [yes]

Other options
  -y, --yes                  Use the default for every question not given
  --dev / --no-dev           Start npm run dev at the end (default: ask)
  -h, --help                 Show this help
  -v, --version              Show the version

Exit codes: 0 ready, 1 nothing created, 2 created but setup unfinished (run npm run setup),
130 cancelled.
`
}
