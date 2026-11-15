/**
 * The installer from start to finish: parse flags, ask questions, review, write files, run the
 * setup steps, print the summary, and offer `npm run dev`. Also `--resume <dir>`, which
 * `node strut setup` (and so `npm run setup`) uses to continue an unfinished setup.
 *
 * Every outside effect comes in through {@link InstallerEnvironment}, so tests drive the whole
 * installer with fake prompts, fake programs and a temporary folder.
 *
 * @module
 */
import { resolve } from 'node:path'
import { ArgsError, helpText, type ParsedArgs, parseCommandLine } from './args.ts'
import { EXIT, type ExitCode } from './exit-codes.ts'
import { readyLines, unfinishedLines } from './finish.ts'
import { type Answers, DATABASE_LABELS, MIN_ADMIN_PASSWORD, databaseOf, isLocalHost, needsConnection, OptionsError, parseDatabaseUrl, type ProjectOptions, resolveOptions } from './options.ts'
import { envValueProblem } from './env-file.ts'
import { EMPTY_LOCAL_PASSWORD_WARNING, QUESTIONS } from './question-registry.ts'
import type { PortProbe } from './ports.ts'
import { CancelledError, type Prompter } from './prompter.ts'
import { askMissing, review } from './questions.ts'
import type { Reporter } from './reporter.ts'
import {
  initialState,
  loadState,
  projectOptions,
  SetupStateError,
  type SetupState,
  saveState,
  statePath,
  withStep,
} from './setup-state.ts'
import type { Spawner } from './spawn.ts'
import { readEnvFile } from './steps/env-io.ts'
import { promptRecoverer } from './steps/recovery.ts'
import { type ConnectionAnswers, type RunResult, runSteps } from './steps/runner.ts'
import { secretsNeedingValues } from './steps/secrets.ts'
import { swallowedFlagsMessage } from './swallowed-flags.ts'
import type { TypedSecrets } from './templates/env.ts'
import { renderProject } from './templates/project.ts'
import { type FileWriter, targetProblem, writeProjectFiles } from './write-files.ts'

import { VERSION } from './version.ts'

/** The installer's version (a spike: never published). Kept in version.ts so templates can use it. */
export { VERSION }

/** The oldest Node that works: 24.3 fixed npm.ps1's argument passing (npm/cli#7375). */
export const MINIMUM_NODE = Object.freeze({ major: 24, minor: 3 } as const)

/**
 * Everything the installer touches outside its own code.
 *
 * @example
 * await main(realEnvironment()) // see cli.ts
 */
export interface InstallerEnvironment {
  readonly argv: readonly string[]
  readonly cwd: string
  readonly env: NodeJS.ProcessEnv
  /** Both stdin and stdout are terminals (otherwise questions are impossible). */
  readonly interactiveTerminal: boolean
  readonly nodeVersion: string
  /** The node executable (runs npm and strut.js). */
  readonly execPath: string
  /** The command that resumes setup; saved in setup.json for `node strut setup`. */
  readonly resumeWith: readonly string[]
  /** Plain text output (help, errors before the reporter starts). */
  readonly out: (text: string) => void
  readonly prompter: Prompter
  /** Builds the reporter: spinners when interactive, plain lines otherwise. */
  readonly reporter: (interactive: boolean) => Reporter
  readonly spawn: Spawner
  readonly isPortFree: PortProbe
  readonly npmCli: () => string
  readonly sleep: (ms: number) => Promise<void>
  readonly now: () => Date
  readonly generateSecret: () => string
  readonly generatePassword: () => string
  /** The host user on Linux (Docker mode runs the app container as this user). */
  readonly hostUser: { readonly uid: number; readonly gid: number } | undefined
  /** A number in [0, 1) used to spread retries (port moves after a race). Default: Math.random. */
  readonly random?: () => number
  /** TCP probe of your own database server (tests fake it). Default: a real connect. */
  readonly probeServer?: (host: string, port: number) => Promise<'ok' | 'refused' | 'not-found' | 'timeout' | 'other'>
  /** Writes generated files (tests make it fail halfway). Default: the real disk. */
  readonly writeFile?: FileWriter
}

/**
 * Run the installer. Returns the exit code (see exit-codes.ts); never calls `process.exit`.
 *
 * @example
 * process.exitCode = await main(environment)
 */
export async function main(environment: InstallerEnvironment): Promise<ExitCode> {
  const parsed = parse(environment)
  if (typeof parsed === 'number') return parsed
  for (const notice of parsed.notices) environment.out(`${notice}\n`)
  if (parsed.command === 'help') {
    environment.out(helpText(VERSION))
    return EXIT.ok
  }
  if (parsed.command === 'version') {
    environment.out(`${VERSION}\n`)
    return EXIT.ok
  }
  const nodeProblem = checkNodeVersion(environment.nodeVersion)
  if (nodeProblem !== undefined) {
    environment.out(`${nodeProblem}\n`)
    return EXIT.failed
  }
  if (parsed.command === 'resume') return resume(parsed.resumeDirectory ?? '.', parsed, environment)
  return create(parsed, environment)
}

/** Parse the command line; on failure print why (npm's swallowed flags first) and return 1. */
function parse(environment: InstallerEnvironment): ParsedArgs | ExitCode {
  let parsed: ParsedArgs
  try {
    parsed = parseCommandLine(environment.argv)
  } catch (error) {
    if (!(error instanceof ArgsError)) throw error
    const guessedName = environment.argv.filter((arg) => !arg.startsWith('-'))
    const swallowed = swallowedFlagsMessage(environment.env, guessedName)
    environment.out(`${swallowed ?? listProblems('The command line has problems:', error.problems)}\n`)
    return EXIT.failed
  }
  if (parsed.command === 'create') {
    const swallowed = swallowedFlagsMessage(environment.env, parsed.positionals)
    if (swallowed !== undefined) {
      environment.out(`${swallowed}\n`)
      return EXIT.failed
    }
  }
  return parsed
}

/**
 * Is this Node new enough? Returns a friendly message when not.
 *
 * @example
 * checkNodeVersion('22.11.0') // 'Strutvane needs Node.js 24.3 or newer ...'
 */
export function checkNodeVersion(version: string): string | undefined {
  const [major = 0, minor = 0] = version.replace(/^v/, '').split('.').map(Number)
  const ok = major > MINIMUM_NODE.major || (major === MINIMUM_NODE.major && minor >= MINIMUM_NODE.minor)
  if (ok) return undefined
  return `Strutvane needs Node.js ${MINIMUM_NODE.major}.${MINIMUM_NODE.minor} or newer (you have ${version}). Install the current LTS from https://nodejs.org, then run the command again.`
}

/** Questions are possible only in a terminal, without --yes, and outside CI. */
function isInteractive(parsed: ParsedArgs, environment: InstallerEnvironment): boolean {
  const ci = (environment.env['CI'] ?? '') !== '' && environment.env['CI'] !== 'false'
  return environment.interactiveTerminal && !parsed.yes && !ci
}

/** `npm create strutvane`: questions, files, setup, summary. */
async function create(parsed: ParsedArgs, environment: InstallerEnvironment): Promise<ExitCode> {
  const interactive = isInteractive(parsed, environment)
  const early = checkGivenAnswers(parsed.answers, environment, interactive)
  if (early !== undefined) {
    environment.out(`${early}\n`)
    return EXIT.failed
  }
  const reporter = environment.reporter(interactive)
  reporter.intro(`Strutvane ${VERSION}: new project`)

  let answers: Answers = parsed.answers
  // Question 14's default: Docker mode only when Docker is installed AND running (Docker is never
  // required). Probed once, only when the answer is not given already.
  if (answers.docker === undefined && answers.database !== 'sqlite') answers = { ...answers, dockerAvailable: await dockerIsRunning(environment) }
  if (interactive) {
    try {
      const context = { cwd: environment.cwd, targetProblem: (name: string) => targetProblem(resolve(environment.cwd, name)) }
      answers = await review(await askMissing(answers, environment.prompter, context), environment.prompter, context)
    } catch (error) {
      if (!(error instanceof CancelledError)) throw error
      reporter.outro(error.message)
      return EXIT.cancelled
    }
  }

  // Secrets that were not typed come from their environment variables (CI): STRUT_DB_PASSWORD,
  // STRUT_ADMIN_PASSWORD. Never flags, never files other than .env, never the screen.
  answers = secretsFromEnvironment(answers, environment.env)
  const connectionProblem = checkConnectionSecrets(answers, environment.env)
  if (typeof connectionProblem === 'string') {
    reporter.error(listProblems('These choices do not work together:', [connectionProblem]))
    return EXIT.failed
  }
  answers = connectionProblem
  let options: ProjectOptions
  try {
    options = resolveOptions(answers, environment.cwd)
  } catch (error) {
    if (!(error instanceof OptionsError)) throw error
    reporter.error(listProblems('These choices do not work together:', error.problems))
    return EXIT.failed
  }
  if (options.adminPasswordMode === 'type' && answers.adminPassword === undefined) {
    reporter.error(
      'You chose to type the first admin password, but there is no terminal to type it in. Set it in the STRUT_ADMIN_PASSWORD environment variable, or use --admin-password generate.',
    )
    return EXIT.failed
  }

  if (options.connection !== undefined && answers.dbUrl === undefined && (answers.dbPassword ?? '') === '' && !interactive) {
    reporter.warn(EMPTY_LOCAL_PASSWORD_WARNING)
  }
  const typed: TypedSecrets = {
    ...(answers.dbPassword === undefined ? {} : { dbPassword: answers.dbPassword }),
    ...(answers.dbUrl === undefined ? {} : { dbUrl: answers.dbUrl }),
  }
  const written = await writeFiles(options, typed, environment, reporter)
  if (written === undefined) return EXIT.failed
  const result = await setUp(written, options, interactive, environment, reporter, answers.adminPassword)
  return finish(result, options, { interactive, parsed, environment, reporter })
}

/** Is Docker installed and its engine running? (`docker info` answers; never throws.) */
async function dockerIsRunning(environment: InstallerEnvironment): Promise<boolean> {
  try {
    const result = await environment.spawn({
      command: environment.env['STRUT_CONTAINER_CLI'] ?? 'docker',
      args: ['info', '--format', '{{.ServerVersion}}'],
      cwd: environment.cwd,
    })
    return result.code === 0
  } catch {
    return false
  }
}

/**
 * Own database server: take a connection URL (typed, or STRUT_DB_URL in CI) apart into its
 * non-secret answers, and refuse an empty password for a server on another computer. Returns the
 * completed answers, or a problem in words that never contains a password or the URL.
 */
function checkConnectionSecrets(answers: Answers, env: NodeJS.ProcessEnv): Answers | string {
  if (!needsConnection(answers)) return answers
  const url = answers.dbUrl ?? (answers.dbHost === undefined || answers.dbHost === 'url' ? env['STRUT_DB_URL'] : undefined)
  if (url !== undefined && url !== '') {
    const parsed = parseDatabaseUrl(url)
    if (typeof parsed === 'string') return `STRUT_DB_URL: ${parsed}`
    if (parsed.database !== databaseOf(answers)) return `the database URL is for ${DATABASE_LABELS[parsed.database]}, but the database is ${DATABASE_LABELS[databaseOf(answers)]}: use --db ${parsed.database}`
    const problem = envValueProblem(url)
    if (problem !== undefined) return `the database URL ${problem}, which .env cannot store`
    return {
      ...answers,
      dbUrl: url,
      dbHost: parsed.host,
      dbPort: parsed.port,
      dbName: parsed.name,
      dbUser: parsed.user,
      ...(parsed.sslMode === undefined ? {} : { dbSslMode: parsed.sslMode }),
    }
  }
  if (answers.dbHost === 'url') return 'you chose a connection URL but gave none: set STRUT_DB_URL, or use --db-host'
  if ((answers.dbPassword ?? '') === '' && !isLocalHost(answers.dbHost ?? '127.0.0.1')) {
    return 'a database server on another computer needs a password: set STRUT_DB_PASSWORD (never a flag), or type it when asked'
  }
  return answers
}

/**
 * Fill unanswered secret questions from their environment variables (the registry names them).
 * Only questions that apply are filled, so an unrelated variable is ignored.
 */
function secretsFromEnvironment(answers: Answers, env: NodeJS.ProcessEnv): Answers {
  let filled = answers
  for (const question of QUESTIONS) {
    const value = question.secretEnv === undefined ? undefined : env[question.secretEnv]
    if (value !== undefined && question.when(filled) && !question.answered(filled)) filled = { ...filled, [question.id]: value }
  }
  return filled
}

/**
 * Catch bad flag combinations and a used folder before any question, so nobody answers ten
 * questions only to hear the folder is taken.
 */
function checkGivenAnswers(answers: Answers, environment: InstallerEnvironment, interactive: boolean): string | undefined {
  if (answers.name === undefined && !interactive) {
    return 'A project name is needed when there are no questions (--yes, CI or no terminal). For example:\n\n  npm create strutvane@latest my-app -- --yes'
  }
  try {
    // A placeholder name checks the other answers before the name is known.
    resolveOptions({ ...answers, name: answers.name ?? 'placeholder' }, environment.cwd)
  } catch (error) {
    if (error instanceof OptionsError) return listProblems('These options do not work together:', error.problems)
    throw error
  }
  return answers.name === undefined ? undefined : targetProblem(resolve(environment.cwd, answers.name))
}

/** Step "files": write the project and its first setup state in one all-or-nothing transaction. */
async function writeFiles(
  options: ProjectOptions,
  typed: TypedSecrets,
  environment: InstallerEnvironment,
  reporter: Reporter,
): Promise<SetupState | undefined> {
  const progress = reporter.step('Writing files')
  const at = environment.now().toISOString()
  const state = withStep(initialState(options, environment.resumeWith), 'files', { status: 'done', at })
  let files: { path: string; content: string }[] = []
  try {
    files = [
      // Inside the try: a template that cannot render (a value .env cannot hold) is reported like
      // any other write failure, never as a crash with a stack trace.
      ...renderProject(options, typed),
      // The state file is part of the same transaction: no project ever exists without it.
      { path: '.strutvane/setup.json', content: `${JSON.stringify(state, null, 2)}\n` },
    ]
    await writeProjectFiles(options.directory, files, environment.writeFile)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    progress.failed(`The files could not be written, so nothing was created: ${message}`)
    return undefined
  }
  progress.done(`Files written (${files.length} files in ${options.directory})`)
  return state
}

/** Run the setup steps with this environment's programs, ports and clock. */
function setUp(
  state: SetupState,
  options: ProjectOptions,
  interactive: boolean,
  environment: InstallerEnvironment,
  reporter: Reporter,
  typedAdminPassword?: string,
): Promise<RunResult> {
  const directory = options.directory
  const stamp = environment.now().toISOString().replace(/[:.]/g, '-')
  const logFile = resolve(directory, '.strutvane', 'logs', `setup-${stamp}.log`)
  return runSteps(state, {
    directory,
    reporter,
    recover: interactive ? promptRecoverer(environment.prompter) : undefined,
    ...(interactive ? { askConnection: (current: ProjectOptions) => askConnectionDetails(current, environment) } : {}),
    save: (next) => saveState(directory, next),
    now: environment.now,
    context: (current) => ({
      directory,
      options: current,
      spawn: environment.spawn,
      execPath: environment.execPath,
      npmCli: environment.npmCli,
      dockerCommand: environment.env['STRUT_CONTAINER_CLI'] ?? 'docker',
      isPortFree: environment.isPortFree,
      logFile,
      sleep: environment.sleep,
      reporter,
      generateSecret: environment.generateSecret,
      generatePassword: environment.generatePassword,
      typedAdminPassword,
      hostUser: environment.hostUser,
      random: environment.random ?? Math.random,
      ...(environment.probeServer === undefined ? {} : { probeServer: environment.probeServer }),
    }),
  })
}

/** The connection questions of your own database server, in registry order. */
const CONNECTION_QUESTIONS: ReadonlySet<string> = new Set(['dbHost', 'dbUrl', 'dbPort', 'dbName', 'dbUser', 'dbPassword'])

/**
 * Ask for your own database server's details during setup (after a Docker problem, or after a
 * refused login). Uses the registry's own questions, so defaults, checks and masking are the same
 * as in the first questions. Returns `undefined` when the user cancels.
 */
async function askConnectionDetails(current: ProjectOptions, environment: InstallerEnvironment): Promise<ConnectionAnswers | undefined> {
  let answers: Answers = { name: current.name, database: current.database, docker: false }
  const context = { cwd: environment.cwd, targetProblem: () => undefined }
  try {
    for (const question of QUESTIONS) {
      if (CONNECTION_QUESTIONS.has(question.id) && question.when(answers)) answers = await question.ask(environment.prompter, answers, context)
    }
  } catch (error) {
    if (error instanceof CancelledError) return undefined
    throw error
  }
  const checked = checkConnectionSecrets(answers, environment.env)
  if (typeof checked === 'string') {
    environment.prompter.info(checked)
    return undefined
  }
  const details: { -readonly [K in keyof ConnectionAnswers]: ConnectionAnswers[K] } = {}
  for (const key of ['dbHost', 'dbPort', 'dbName', 'dbUser', 'dbPassword', 'dbUrl', 'dbSslMode'] as const) {
    if (checked[key] !== undefined) Object.assign(details, { [key]: checked[key] })
  }
  return details
}

/** `--resume <dir>`: continue an unfinished setup (what `npm run setup` runs). */
async function resume(directoryArg: string, parsed: ParsedArgs, environment: InstallerEnvironment): Promise<ExitCode> {
  const directory = resolve(environment.cwd, directoryArg)
  let state: SetupState
  try {
    state = loadState(directory)
  } catch (error) {
    if (!(error instanceof SetupStateError)) throw error
    environment.out(`${error.message}\n`)
    return EXIT.failed
  }
  const interactive = isInteractive(parsed, environment)
  const reporter = environment.reporter(interactive)
  const options = projectOptions(state, directory)
  reporter.intro(`Strutvane ${VERSION}: setting up ${options.name}`)
  reporter.info(`Progress from ${statePath(directory)}; finished steps are not run again.`)
  state = recheckSecrets(state, directory, options, reporter)
  const typed = await typedAdminPasswordForResume(state, options, interactive, environment, reporter)
  if (typed === 'cancelled') {
    reporter.outro('Cancelled. Nothing changed; run npm run setup again when ready.')
    return EXIT.cancelled
  }
  const result = await setUp(state, options, interactive, environment, reporter, typed)
  // "The one you typed" is true only if the admin was created with a typed password: earlier, or now.
  const typedUsed = options.adminPasswordMode === 'type' && (state.steps.migrate.status === 'done' || typed !== undefined)
  return finish(result, options, { interactive, parsed, environment, reporter, typedUsed })
}

/**
 * A typed first-admin password lives in memory only, so a resumed setup that still has to create
 * the admin needs it again: from STRUT_ADMIN_PASSWORD (CI), or asked masked (a terminal). Without
 * either, the seeder generates a one-time password, and we say so instead of pretending the typed
 * one was used.
 */
async function typedAdminPasswordForResume(
  state: SetupState,
  options: ProjectOptions,
  interactive: boolean,
  environment: InstallerEnvironment,
  reporter: Reporter,
): Promise<string | undefined | 'cancelled'> {
  if (options.adminPasswordMode !== 'type' || state.steps.migrate.status === 'done') return undefined
  const fromEnv = environment.env['STRUT_ADMIN_PASSWORD']
  if (fromEnv !== undefined && fromEnv.length >= MIN_ADMIN_PASSWORD) return fromEnv
  const question = QUESTIONS.find((candidate) => candidate.id === 'adminPassword')
  if (interactive && question !== undefined) {
    try {
      const answers = await question.ask(environment.prompter, { adminPasswordMode: 'type' }, { cwd: environment.cwd, targetProblem: () => undefined })
      return answers.adminPassword
    } catch (error) {
      if (error instanceof CancelledError) return 'cancelled'
      throw error
    }
  }
  reporter.warn(
    `You chose to type the first admin's password, but this run has no terminal and no STRUT_ADMIN_PASSWORD (at least ${MIN_ADMIN_PASSWORD} characters). If the admin is created now it gets a one-time password; set yours with: node strut user:password ${options.adminEmail ?? '<email>'}`,
  )
  return undefined
}

/**
 * Never trust a `done` secrets step from setup.json: if `.env` is missing or has an empty or
 * placeholder secret (a fresh clone, a hand edit, a forged state file), run the step again.
 */
function recheckSecrets(state: SetupState, directory: string, options: ProjectOptions, reporter: Reporter): SetupState {
  if (state.steps.secrets.status !== 'done') return state
  let missing: string[]
  try {
    missing = secretsNeedingValues(readEnvFile(directory), options)
  } catch {
    missing = ['.env']
  }
  if (missing.length === 0) return state
  reporter.warn(`These secrets are missing or too short in .env, so they will be generated: ${missing.join(', ')}`)
  return withStep(state, 'secrets', { status: 'pending', note: `missing or weak: ${missing.join(', ')}` })
}

/** What {@link finish} needs besides the result. */
interface FinishSettings {
  readonly interactive: boolean
  readonly parsed: ParsedArgs
  readonly environment: InstallerEnvironment
  readonly reporter: Reporter
  /** The admin was (or will be) created with the password the user typed. */
  readonly typedUsed?: boolean
}

/** Print the summary, offer `npm run dev`, and pick the exit code. */
async function finish(result: RunResult, before: ProjectOptions, settings: FinishSettings): Promise<ExitCode> {
  const { reporter } = settings
  // The options may have changed during setup ("Use SQLite instead").
  const options = projectOptions(result.state, before.directory)
  if (!result.complete) {
    reporter.box('Setup is not finished', unfinishedLines(options, result.unfinished))
    reporter.outro('Project created; setup incomplete (exit code 2).')
    return EXIT.incomplete
  }
  reporter.box('Ready', readyLines(options, settings.interactive ? result.showOnce : [], settings.typedUsed ?? true))
  if (await wantsDevServer(settings)) {
    reporter.outro(`Starting ${options.name} (Ctrl+C to stop)`)
    await settings.environment.spawn({
      command: settings.environment.execPath,
      args: [settings.environment.npmCli(), 'run', 'dev'],
      cwd: options.directory,
      inherit: true,
    })
    return EXIT.ok
  }
  reporter.outro(`Done. Next: cd ${options.name}; npm run dev`)
  return EXIT.ok
}

/** `--dev` / `--no-dev` decide; otherwise ask, but only in an interactive terminal. */
async function wantsDevServer(settings: FinishSettings): Promise<boolean> {
  if (settings.parsed.dev !== undefined) return settings.parsed.dev
  if (!settings.interactive) return false
  const answer = await settings.environment.prompter.confirm({
    id: 'dev',
    message: 'Start the development server now?',
    initialValue: true,
  })
  return answer === true
}

/** A heading plus one bullet per problem. */
function listProblems(heading: string, problems: readonly string[]): string {
  return `${heading}\n${problems.map((p) => `  - ${p}`).join('\n')}\n\nRun with --help to see every option.`
}
