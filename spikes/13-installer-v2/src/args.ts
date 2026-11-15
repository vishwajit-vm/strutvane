/**
 * Command-line flags: one flag for every question, so CI (and impatient people) never need a prompt.
 *
 * The question flags are not listed here: they come from the question registry, so a new question
 * gets its flag, its check and its `--help` line from its own registry entry.
 *
 * Parsing uses `node:util` `parseArgs` in strict mode: a typo such as `--databse` is an error with a
 * hint, never silently ignored.
 *
 * @module
 */
import { type ParseArgsOptionsConfig, parseArgs } from 'node:util'
import type { Answers } from './options.ts'
import { QUESTION_GROUPS, QUESTIONS } from './question-registry.ts'

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
  /** One line per renamed flag that was used under its old name (printed before anything else). */
  readonly notices: readonly string[]
}

/**
 * Flags renamed because npm swallows the old names without a trace when they come before "--"
 * (verified with npm 11.19.0: `--auth` becomes npm's own `--auth-type`, `--ci` its `--cidr`).
 * The old names still work after "--" (and with npx), with a one-line hint (decision #120).
 */
export const RENAMED_FLAGS = [
  { old: 'auth', now: 'sign-in', question: 'auth' },
  { old: 'ci', now: 'ci-workflow', question: 'ci' },
] as const

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

/** Flags that are not questions. */
const OTHER_FLAGS = {
  dev: { type: 'boolean' },
  yes: { type: 'boolean', short: 'y' },
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
  resume: { type: 'string' },
  // Old names of renamed flags (see RENAMED_FLAGS).
  auth: { type: 'string' },
  ci: { type: 'boolean' },
} as const satisfies ParseArgsOptionsConfig

/**
 * The flag table given to `parseArgs`: every registry flag plus the installer's own. Exported so
 * the swallowed-flag check knows our flag names.
 */
export const FLAGS: ParseArgsOptionsConfig = {
  ...Object.fromEntries(
    QUESTIONS.flatMap((question) =>
      question.flag === undefined
        ? []
        : [[question.flag.name, question.flag.multiple === true ? { type: question.flag.type, multiple: true } : { type: question.flag.type }]],
    ),
  ),
  ...OTHER_FLAGS,
}

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
  let answers: Answers = {}

  for (const question of QUESTIONS) {
    if (question.flag === undefined || question.id === 'name') continue
    const raw = values[question.flag.name]
    if (raw !== undefined) answers = { ...answers, ...question.read(raw, problems) }
  }
  const notices: string[] = []
  for (const renamed of RENAMED_FLAGS) {
    const raw = values[renamed.old]
    if (raw === undefined) continue
    const question = QUESTIONS.find((candidate) => candidate.id === renamed.question)
    if (values[renamed.now] !== undefined) {
      problems.push(`--${renamed.old} is the old name of --${renamed.now}: give only --${renamed.now}`)
    } else if (question !== undefined) {
      answers = { ...answers, ...question.read(raw, problems) }
      notices.push(`--${renamed.old} is now --${renamed.now} (the old name works only after "--"; npm swallows it otherwise).`)
    }
  }
  const name = pickName(stringValue(values['name']), positionals, problems)
  if (name !== undefined) answers = { ...answers, name }

  if (problems.length > 0) throw new ArgsError(problems)
  return {
    command: pickCommand(values),
    answers,
    yes: values['yes'] === true,
    dev: typeof values['dev'] === 'boolean' ? values['dev'] : undefined,
    positionals,
    resumeDirectory: stringValue(values['resume']),
    notices,
  }
}

const stringValue = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined)

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
function pickCommand(values: Record<string, unknown>): Command {
  if (values['help'] === true) return 'help'
  if (values['version'] === true) return 'version'
  if (typeof values['resume'] === 'string') return 'resume'
  return 'create'
}

/** The name comes from the first positional or `--name`; both at once must agree. */
function pickName(flag: string | undefined, positionals: readonly string[], problems: string[]): string | undefined {
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

/** One `--help` line: the flag, what it does, and its default (long flags wrap). */
function helpLine(usage: string, help: string, defaultLabel: string): string {
  const fallback = defaultLabel === '' ? '' : `  [${defaultLabel}]`
  return usage.length > 26 ? `  ${usage}\n  ${''.padEnd(27)}${help}${fallback}` : `  ${usage.padEnd(27)}${help}${fallback}`
}

/**
 * The `--help` text. Question flags are listed by group straight from the registry, so the help
 * can never miss a question. Shows the `--` rule for `npm create` and the `npx` form.
 *
 * @example
 * process.stdout.write(helpText('0.0.0-spike'))
 */
export function helpText(version: string): string {
  const groups = QUESTION_GROUPS.map((group) => {
    const lines = QUESTIONS.filter((q) => q.group === group && q.flag !== undefined && q.id !== 'name').flatMap((q) =>
      q.flag === undefined ? [] : [helpLine(q.flag.usage, q.flag.help, q.flag.defaultLabel)],
    )
    return lines.length === 0 ? '' : `${group}\n${lines.join('\n')}\n`
  }).filter((block) => block !== '')
  const secrets = QUESTIONS.filter((q) => q.secretEnv !== undefined).map((q) => `  ${q.secretEnv ?? ''}`.padEnd(29) + q.title)
  return `create-strutvane ${version}: create a new Strutvane app

Usage
  npm create strutvane@latest my-app
  npm create strutvane@latest my-app -- --db postgres --yes   (npm needs -- before flags)
  npx create-strutvane@latest my-app --db postgres --yes      (npx does not)

Questions you can answer with flags (default in [brackets])
${groups.join('\n')}
Secrets are never flags (shell history and CI logs keep flags). Without a terminal they come from:
${secrets.join('\n')}

Other options
  -y, --yes                  Use the default for every question not given
  --dev / --no-dev           Start npm run dev at the end (default: ask)
  -h, --help                 Show this help
  -v, --version              Show the version

Exit codes: 0 ready, 1 nothing created, 2 created but setup unfinished (run npm run setup),
130 cancelled.
`
}
