/**
 * Every choice a new project can make, its default, and the rules about which choices go together.
 *
 * Why one module: flags, interactive questions and the resume command all end in
 * {@link resolveOptions}, so they can never disagree about a default or a rule.
 *
 * @module
 */
import { resolve } from 'node:path'
import { sqlIdentifier } from './names.ts'
import { validateProjectName } from './validate-name.ts'

/** What kind of app to build: API + React UI, or the API alone. */
export const STACKS = ['full', 'api'] as const
/** One of {@link STACKS}. */
export type Stack = (typeof STACKS)[number]

/** The React UI starter: generated admin screens, or a blank React + Vite app. */
export const UI_STARTERS = ['admin', 'blank'] as const
/** One of {@link UI_STARTERS}. */
export type UiStarter = (typeof UI_STARTERS)[number]

/** How people sign in. */
export const AUTH_MODES = ['email', 'none'] as const
/** One of {@link AUTH_MODES}. */
export type AuthMode = (typeof AUTH_MODES)[number]

/** Optional sign-in features (only with `auth: 'email'`). */
export const AUTH_FEATURES = ['registration', 'verification', '2fa'] as const
/** One of {@link AUTH_FEATURES}. */
export type AuthFeature = (typeof AUTH_FEATURES)[number]

/** Databases. MySQL comes first because it is the default (user decision, 2026-11-14). */
export const DATABASES = ['mysql', 'postgres', 'sqlite'] as const
/** One of {@link DATABASES}. */
export type Database = (typeof DATABASES)[number]

/** Test setups. */
export const TEST_SETUPS = ['vitest', 'vitest-playwright', 'none'] as const
/** One of {@link TEST_SETUPS}. */
export type TestSetup = (typeof TEST_SETUPS)[number]

/**
 * Choices collected so far, from flags and questions. Anything missing gets its default later.
 *
 * @example
 * const answers: Answers = { name: 'my-app', database: 'sqlite' }
 */
export interface Answers {
  readonly name?: string
  readonly stack?: Stack
  readonly ui?: UiStarter
  readonly auth?: AuthMode
  readonly features?: readonly AuthFeature[]
  readonly teams?: boolean
  readonly database?: Database
  readonly docker?: boolean
  /** Without Docker, MySQL/PostgreSQL connection details (the user runs the server). */
  readonly dbHost?: string
  readonly dbPort?: number
  readonly dbName?: string
  readonly dbUser?: string
  /**
   * The database password for a server the user runs. Kept out of {@link ProjectOptions} on
   * purpose: it goes straight into `.env` and never into setup.json or the review screen.
   */
  readonly dbPassword?: string
  readonly testing?: TestSetup
  readonly git?: boolean
}

/**
 * How to reach a MySQL/PostgreSQL server the user runs (no Docker).
 *
 * @example
 * { host: '127.0.0.1', port: 3306, database: 'my_app', username: 'my_app' }
 */
export interface Connection {
  readonly host: string
  readonly port: number
  readonly database: string
  readonly username: string
}

/** The keys of {@link Answers}, used to ask, change and summarise answers one at a time. */
export type AnswerKey = keyof Answers

/**
 * Complete, validated choices. Everything after the questions reads only this.
 *
 * @example
 * options.database === 'mysql' && options.docker // start MySQL in Docker
 */
export interface ProjectOptions {
  readonly name: string
  /** Absolute path of the project folder. */
  readonly directory: string
  readonly stack: Stack
  /** `undefined` for an API-only project. */
  readonly ui: UiStarter | undefined
  readonly auth: AuthMode
  /** Always empty when `auth` is `'none'`. */
  readonly features: readonly AuthFeature[]
  readonly teams: boolean
  readonly database: Database
  /**
   * Docker mode: EVERYTHING runs in containers (app on node:24, the database, Mailpit), like
   * Laravel Sail; `node strut` on the host forwards into the app container. Without Docker the
   * app runs on this computer.
   */
  readonly docker: boolean
  /** Only without Docker and with MySQL/PostgreSQL: the server the user runs. */
  readonly connection: Connection | undefined
  readonly testing: TestSetup
  readonly git: boolean
}

/**
 * The defaults used for anything not answered.
 *
 * Why MySQL + Docker: the user chose MySQL as the default database (2026-11-14), and Docker is
 * pre-selected for server databases. If Docker is missing, setup offers SQLite as the fallback.
 * With teams, PostgreSQL is pre-selected instead (see {@link defaultDatabase}).
 */
export const DEFAULTS = Object.freeze({
  stack: 'full',
  ui: 'admin',
  auth: 'email',
  // Registration is off by default (security review F-02): only invited accounts sign in until the
  // developer opts in to public sign-up.
  features: Object.freeze([] as const),
  teams: false,
  database: 'mysql',
  testing: 'vitest',
  git: true,
} as const)

/** Every problem found in one set of answers. `problems` are full sentences for the user. */
export class OptionsError extends Error {
  readonly problems: readonly string[]

  /** @param problems - one plain-language sentence per problem */
  constructor(problems: readonly string[]) {
    super(`These choices do not work together:\n${problems.map((p) => `  - ${p}`).join('\n')}`)
    this.name = 'OptionsError'
    this.problems = problems
  }
}

/**
 * The database pre-selected for new projects: MySQL, or PostgreSQL when teams are on (PostgreSQL
 * adds row-level security). MySQL stays allowed with teams; the installer then shows a note.
 *
 * @example
 * defaultDatabase(false) // 'mysql'
 * defaultDatabase(true)  // 'postgres'
 */
export function defaultDatabase(teams: boolean): Database {
  return teams ? 'postgres' : DEFAULTS.database
}

/**
 * Is Docker mode the default for this database? Yes for MySQL and PostgreSQL (user decision:
 * pre-selected); no for SQLite, which needs no server (Docker mode is still allowed).
 *
 * @example
 * dockerByDefault('mysql')  // true
 * dockerByDefault('sqlite') // false
 */
export function dockerByDefault(database: Database): boolean {
  return database !== 'sqlite'
}

/**
 * Does this database enforce tenant isolation itself (row-level security)? Only PostgreSQL.
 * With MySQL or SQLite, isolation comes from the ORM tenant scope alone, and we say so.
 *
 * @example
 * hasRowLevelSecurity('postgres') // true
 */
export function hasRowLevelSecurity(database: Database): boolean {
  return database === 'postgres'
}

/**
 * The note shown when teams are chosen on a database without row-level security.
 * Returns `undefined` when no note is needed.
 *
 * @example
 * teamsNote(true, 'mysql') // 'Teams on MySQL: each team\'s data is isolated by ...'
 */
export function teamsNote(teams: boolean, database: Database): string | undefined {
  if (!teams || hasRowLevelSecurity(database)) return undefined
  const label = DATABASE_LABELS[database]
  return `Teams on ${label}: each team's data is isolated by the ORM tenant scope. PostgreSQL adds row-level security as a second lock.`
}

/** Human names for databases, used in questions, notes and the review box. */
export const DATABASE_LABELS: Readonly<Record<Database, string>> = Object.freeze({
  mysql: 'MySQL',
  postgres: 'PostgreSQL',
  sqlite: 'SQLite',
})

/**
 * Fill in defaults, check the rules, and return complete options.
 * Throws {@link OptionsError} listing every problem at once.
 *
 * @param answers - what flags and questions produced
 * @param cwd - the folder the user ran the command in (the project goes in `<cwd>/<name>`)
 *
 * @example
 * resolveOptions({ name: 'my-app' }, 'C:/code').database // 'mysql'
 */
export function resolveOptions(answers: Answers, cwd: string): ProjectOptions {
  const problems: string[] = []
  const name = answers.name?.trim() ?? ''
  problems.push(...validateProjectName(name))

  const stack = answers.stack ?? DEFAULTS.stack
  const ui = resolveUi(stack, answers.ui, problems)
  const auth = answers.auth ?? DEFAULTS.auth
  const features = resolveFeatures(auth, answers.features, problems)
  const teams = resolveTeams(auth, answers.teams, problems)
  const database = answers.database ?? defaultDatabase(teams)
  const docker = answers.docker ?? dockerByDefault(database)
  const connection = resolveConnection(name, database, docker, answers, problems)

  if (problems.length > 0) throw new OptionsError(problems)
  return Object.freeze({
    name,
    // The name has no slashes (validated above), so this is always `<cwd>/<name>`.
    directory: resolve(cwd, name),
    stack,
    ui,
    auth,
    features,
    teams,
    database,
    docker,
    connection,
    testing: answers.testing ?? DEFAULTS.testing,
    git: answers.git ?? DEFAULTS.git,
  })
}

/** API-only projects have no UI; refuse an explicit `--ui` instead of silently ignoring it. */
function resolveUi(stack: Stack, ui: UiStarter | undefined, problems: string[]): UiStarter | undefined {
  if (stack === 'full') return ui ?? DEFAULTS.ui
  if (ui !== undefined) problems.push('an API-only project has no UI: drop --ui, or use --stack full')
  return undefined
}

/** Sign-in features need sign-in. Sorted so the output never depends on the order typed. */
function resolveFeatures(
  auth: AuthMode,
  features: readonly AuthFeature[] | undefined,
  problems: string[],
): readonly AuthFeature[] {
  if (auth === 'none') {
    if (features !== undefined && features.length > 0) {
      problems.push('sign-in features need sign-in: drop --features, or use --auth email')
    }
    return Object.freeze([])
  }
  const chosen = new Set(features ?? DEFAULTS.features)
  return Object.freeze(AUTH_FEATURES.filter((feature) => chosen.has(feature)))
}

/** Teams belong to signed-in users, so they need sign-in. */
function resolveTeams(auth: AuthMode, teams: boolean | undefined, problems: string[]): boolean {
  if (auth === 'none' && teams === true) {
    problems.push('teams need sign-in (a team is a group of users): drop --teams, or use --auth email')
  }
  return auth === 'email' && (teams ?? DEFAULTS.teams)
}

/** The default port of each server database. */
export const DEFAULT_DATABASE_PORTS = Object.freeze({ mysql: 3306, postgres: 5432 } as const)

/** Host names and IPs: letters, digits, dots, dashes, colons (IPv6) and brackets. */
const HOST = /^[A-Za-z0-9.:[\]-]{1,253}$/
/** Database and user names as servers accept them unquoted. */
const IDENTIFIER = /^[A-Za-z0-9_$-]{1,64}$/

/**
 * Connection details exist only without Docker and for a server database. Defaults: this
 * computer, the standard port, and names derived from the project name.
 */
function resolveConnection(
  name: string,
  database: Database,
  docker: boolean,
  answers: Answers,
  problems: string[],
): Connection | undefined {
  const given = [answers.dbHost, answers.dbPort, answers.dbName, answers.dbUser].some((v) => v !== undefined)
  if (docker || database === 'sqlite') {
    if (given) problems.push('connection details (--db-host, --db-port, --db-name, --db-user) are only for MySQL/PostgreSQL without Docker')
    return undefined
  }
  const id = sqlIdentifier(name.length > 0 ? name : 'app')
  const connection = {
    host: answers.dbHost ?? '127.0.0.1',
    port: answers.dbPort ?? DEFAULT_DATABASE_PORTS[database],
    database: answers.dbName ?? id,
    username: answers.dbUser ?? id,
  }
  if (!HOST.test(connection.host)) problems.push(`"${connection.host}" is not a valid database host (use a name like db.example.com or an IP address)`)
  if (!Number.isInteger(connection.port) || connection.port < 1 || connection.port > 65535) problems.push(`database port ${connection.port} must be a number from 1 to 65535`)
  if (!IDENTIFIER.test(connection.database)) problems.push(`"${connection.database}" is not a valid database name (letters, digits, _, - and $)`)
  if (!IDENTIFIER.test(connection.username)) problems.push(`"${connection.username}" is not a valid database user (letters, digits, _, - and $)`)
  return Object.freeze(connection)
}
