/**
 * Every choice a new project can make, its default, and the rules about which choices go together.
 *
 * Why one module: flags, interactive questions, the review screen and the resume command all end
 * in {@link resolveOptions}, and the question registry takes its defaults and "does this apply?"
 * rules from the helpers here, so nothing can disagree about a default or a rule.
 *
 * The question list itself (wording, order, groups, flags) lives in `question-registry.ts`.
 *
 * @module
 */
import { resolve } from 'node:path'
import { type Catalogue, type CatalogueEntry, findOffered, installerCatalogue } from './catalogue.ts'
import { sqlIdentifier } from './names.ts'
import { validateProjectName } from './validate-name.ts'

/** How much the user wants to decide: 8 starred questions, or every question (blueprint §2.1). */
export const SETUP_MODES = ['recommended', 'custom'] as const
/** One of {@link SETUP_MODES}. */
export type SetupMode = (typeof SETUP_MODES)[number]

/** What kind of app to build: API + React UI, or the API alone. */
export const STACKS = ['full', 'api'] as const
/** One of {@link STACKS}. */
export type Stack = (typeof STACKS)[number]

/** The React UI starter: generated admin screens, or a blank React + Vite app. */
export const UI_STARTERS = ['admin', 'blank'] as const
/** One of {@link UI_STARTERS}. */
export type UiStarter = (typeof UI_STARTERS)[number]

/**
 * One design package: the look (colours, fonts, shell, component skins) that sits on top of
 * `@strutvane/ui`, which only brings behaviour.
 */
export interface DesignInfo {
  /** What the user types (`--design crisp`) and what `config/ui.ts` stores. */
  readonly value: string
  /** The npm package that ships this design. */
  readonly packageName: string
  /** The line shown in the question (74 characters or fewer, like every label). */
  readonly label: string
}

/**
 * The first-party designs (project lead decision, 2026-11-15). The FIRST entry is the default.
 *
 * Why one array: flags, the question, the review screen, the help text and the generated files
 * all read this list, so adding a future design is one new entry here and nothing else.
 */
export const DESIGNS = [
  { value: 'crisp', packageName: '@strutvane/design-crisp', label: 'Crisp   Clean, minimal and business-first (recommended)' },
  { value: 'vivid', packageName: '@strutvane/design-vivid', label: 'Vivid   Colourful, modern dashboards' },
] as const satisfies readonly DesignInfo[]
/** One design name from {@link DESIGNS}, such as `'crisp'`. */
export type Design = (typeof DESIGNS)[number]['value']
/** Just the design names, in order (`['crisp', 'vivid']`), for flag checks and help text. */
export const DESIGN_NAMES: readonly Design[] = Object.freeze(DESIGNS.map((design) => design.value))

/**
 * Everything known about one design.
 *
 * @example
 * designInfo('vivid').packageName // '@strutvane/design-vivid'
 */
export function designInfo(design: Design): DesignInfo {
  const found = DESIGNS.find((entry) => entry.value === design)
  // Unreachable while `Design` is derived from DESIGNS; kept so a bad cast fails loudly.
  if (found === undefined) throw new Error(`Unknown design "${design}"`)
  return found
}

/**
 * Another design to suggest in "how to switch" hints (the first other one in the list), or
 * `undefined` when only one design exists.
 *
 * @example
 * otherDesign('crisp') // 'vivid'
 */
export function otherDesign(design: Design): Design | undefined {
  return DESIGN_NAMES.find((name) => name !== design)
}

/** How people sign in: password, a one-time email link (passwordless), or not at all. */
export const AUTH_MODES = ['email', 'magic-link', 'none'] as const
/** One of {@link AUTH_MODES}. */
export type AuthMode = (typeof AUTH_MODES)[number]

/** Extra sign-in security (question 6). Public registration stays off unless picked (F-02). */
export const SIGN_IN_SECURITY = ['2fa', 'verification', 'passkeys', 'registration'] as const
/** One of {@link SIGN_IN_SECURITY}. */
export type SignInSecurity = (typeof SIGN_IN_SECURITY)[number]

/** Social login providers (question 7). */
export const SOCIAL_PROVIDERS = ['google', 'microsoft', 'github', 'apple'] as const
/** One of {@link SOCIAL_PROVIDERS}. */
export type SocialProvider = (typeof SOCIAL_PROVIDERS)[number]

/** API access for other apps (question 9). */
export const API_ACCESS = ['tokens', 'oauth', 'none'] as const
/** One of {@link API_ACCESS}. */
export type ApiAccess = (typeof API_ACCESS)[number]

/** Starting roles (question 10): admin + member, or admin + manager + member + viewer. */
export const ROLE_SETS = ['basic', 'extended'] as const
/** One of {@link ROLE_SETS}. */
export type RoleSet = (typeof ROLE_SETS)[number]

/** How a request picks its team (question 12). */
export const TENANT_RESOLVERS = ['switcher', 'subdomain'] as const
/** One of {@link TENANT_RESOLVERS}. */
export type TenantResolver = (typeof TENANT_RESOLVERS)[number]

/** Databases. MySQL comes first because it is the default (user decision, 2026-11-14). */
export const DATABASES = ['mysql', 'postgres', 'sqlite'] as const
/** One of {@link DATABASES}. */
export type Database = (typeof DATABASES)[number]

/** How the first admin gets a password (question 16). */
export const ADMIN_PASSWORD_MODES = ['generate', 'type'] as const
/** One of {@link ADMIN_PASSWORD_MODES}. */
export type AdminPasswordMode = (typeof ADMIN_PASSWORD_MODES)[number]

/** Cache, queue and sessions (question 18). */
export const CACHE_STORES = ['database', 'redis'] as const
/** One of {@link CACHE_STORES}. */
export type CacheStore = (typeof CACHE_STORES)[number]

/** File storage (question 19). */
export const STORAGE_DISKS = ['local', 's3'] as const
/** One of {@link STORAGE_DISKS}. */
export type StorageDisk = (typeof STORAGE_DISKS)[number]

/** Production mailer (question 20). Development always uses the Mailpit inbox or the log. */
export const MAILERS = ['later', 'smtp', 'resend', 'postmark', 'ses'] as const
/** One of {@link MAILERS}. */
export type Mailer = (typeof MAILERS)[number]

/** Test setups. */
export const TEST_SETUPS = ['vitest', 'vitest-playwright', 'none'] as const
/** One of {@link TEST_SETUPS}. */
export type TestSetup = (typeof TEST_SETUPS)[number]

/** Security profile (question 26). Strict: 2FA for admins, breached-password check, 8-hour sessions, strict CSP, HSTS preload. */
export const SECURITY_PROFILES = ['standard', 'strict'] as const
/** One of {@link SECURITY_PROFILES}. */
export type SecurityProfile = (typeof SECURITY_PROFILES)[number]

/** One AI model provider (question 28) and the `.env` key the developer fills in later. */
export interface AiProviderInfo {
  readonly value: string
  readonly label: string
  /** Written EMPTY into `.env` and `.env.example`; the installer never asks for a key (blueprint §2.1). */
  readonly envKey: string
  /** A non-secret example value, when the setting is not a secret (Ollama's local address). */
  readonly envExample?: string
}

/** AI providers, data-driven like {@link DESIGNS}: a new provider is one entry. First = default. */
export const AI_PROVIDERS = [
  { value: 'anthropic', label: 'Anthropic', envKey: 'ANTHROPIC_API_KEY' },
  { value: 'openai', label: 'OpenAI', envKey: 'OPENAI_API_KEY' },
  { value: 'google', label: 'Google', envKey: 'GOOGLE_API_KEY' },
  { value: 'ollama', label: 'Local models (Ollama)', envKey: 'OLLAMA_HOST', envExample: 'http://127.0.0.1:11434' },
] as const satisfies readonly AiProviderInfo[]
/** One provider name from {@link AI_PROVIDERS}. */
export type AiProvider = (typeof AI_PROVIDERS)[number]['value']

/**
 * Everything known about one AI provider.
 *
 * @example
 * aiProviderInfo('openai').envKey // 'OPENAI_API_KEY'
 */
export function aiProviderInfo(provider: AiProvider): AiProviderInfo {
  const found = AI_PROVIDERS.find((entry) => entry.value === provider)
  if (found === undefined) throw new Error(`Unknown AI provider "${provider}"`)
  return found
}

/**
 * UI languages offered in the question (question 30). Any other language tag works with
 * `--ui-languages`; this list only keeps the picker short.
 */
export const UI_LANGUAGE_CHOICES = [
  { value: 'en', label: 'English' },
  { value: 'de', label: 'German' },
  { value: 'fr', label: 'French' },
  { value: 'es', label: 'Spanish' },
  { value: 'pt-BR', label: 'Portuguese (Brazil)' },
  { value: 'it', label: 'Italian' },
  { value: 'nl', label: 'Dutch' },
  { value: 'pl', label: 'Polish' },
  { value: 'tr', label: 'Turkish' },
  { value: 'ja', label: 'Japanese' },
  { value: 'zh-CN', label: 'Chinese (Simplified)' },
  { value: 'hi', label: 'Hindi' },
  { value: 'ar', label: 'Arabic' },
] as const

/** Default appearance (question 31). */
export const APPEARANCES = ['system', 'light', 'dark'] as const
/** One of {@link APPEARANCES}. */
export type Appearance = (typeof APPEARANCES)[number]

/** Monitoring (question 34): none, or OpenTelemetry export plus a health page. */
export const MONITORING = ['none', 'otel'] as const
/** One of {@link MONITORING}. */
export type Monitoring = (typeof MONITORING)[number]

/**
 * Deploy target (question 35). `node` and `docker` write a deploy recipe and the `/up` health
 * route; `docker` also writes a committed, secure production `Dockerfile` + `.dockerignore`
 * (opt-in only, ADR-0021). The local Sail-style compose file stays git-ignored (ADR-0006).
 */
export const DEPLOY_TARGETS = ['later', 'node', 'docker'] as const
/** One of {@link DEPLOY_TARGETS}. */
export type DeployTarget = (typeof DEPLOY_TARGETS)[number]

/** Follow-up answers of picked catalogue packages, keyed `<package id>.<question id>`. */
export type FeatureOptions = Readonly<Record<string, string>>

/**
 * Choices collected so far, from flags and questions. Anything missing gets its default later.
 *
 * Every field also accepts `undefined` explicitly, so complete {@link ProjectOptions} (where a
 * question that does not apply is `undefined`) can be read with the same helpers as raw answers.
 *
 * @example
 * const answers: Answers = { name: 'my-app', database: 'sqlite' }
 */
export interface Answers {
  readonly name?: string | undefined
  readonly mode?: SetupMode | undefined
  readonly stack?: Stack | undefined
  readonly design?: Design | undefined
  readonly ui?: UiStarter | undefined
  readonly auth?: AuthMode | undefined
  readonly security?: readonly SignInSecurity[] | undefined
  readonly social?: readonly SocialProvider[] | undefined
  readonly sso?: boolean | undefined
  readonly apiAccess?: ApiAccess | undefined
  readonly roles?: RoleSet | undefined
  readonly teams?: boolean | undefined
  readonly tenantResolver?: TenantResolver | undefined
  readonly database?: Database | undefined
  readonly docker?: boolean | undefined
  /** Without Docker, MySQL/PostgreSQL connection details (the user runs the server). */
  readonly dbHost?: string | undefined
  readonly dbPort?: number | undefined
  readonly dbName?: string | undefined
  readonly dbUser?: string | undefined
  /**
   * The database password for a server the user runs. Kept out of {@link ProjectOptions} on
   * purpose: it goes straight into `.env` and never into setup.json, strutvane.json or the review.
   */
  readonly dbPassword?: string | undefined
  readonly adminEmail?: string | undefined
  readonly adminPasswordMode?: AdminPasswordMode | undefined
  /**
   * A first-admin password the user typed (masked). Like `dbPassword` it never reaches
   * {@link ProjectOptions}: it goes to the seeder through the environment only (security F-18).
   */
  readonly adminPassword?: string | undefined
  readonly sampleData?: boolean | undefined
  readonly cache?: CacheStore | undefined
  readonly storage?: StorageDisk | undefined
  readonly mailer?: Mailer | undefined
  readonly locale?: string | undefined
  readonly timezone?: string | undefined
  readonly currency?: string | undefined
  /** Catalogue ids picked in question 22 ("extra features"). */
  readonly features?: readonly string[] | undefined
  readonly featureOptions?: FeatureOptions | undefined
  readonly testing?: TestSetup | undefined
  readonly agents?: boolean | undefined
  readonly git?: boolean | undefined
  readonly ci?: boolean | undefined
  readonly securityProfile?: SecurityProfile | undefined
  readonly activityLog?: boolean | undefined
  readonly ai?: boolean | undefined
  readonly aiProvider?: AiProvider | undefined
  readonly mcpServer?: boolean | undefined
  readonly uiLanguages?: readonly string[] | undefined
  readonly appearance?: Appearance | undefined
  readonly pwa?: boolean | undefined
  readonly liveUpdates?: boolean | undefined
  readonly monitoring?: Monitoring | undefined
  readonly deploy?: DeployTarget | undefined
  readonly editor?: boolean | undefined
  readonly devContainer?: boolean | undefined
}

/** The keys of {@link Answers}, used to ask, change and summarise answers one at a time. */
export type AnswerKey = keyof Answers

/** Answers that are secrets: never stored, never shown, never in a generated committed file. */
export const SECRET_ANSWERS: readonly AnswerKey[] = Object.freeze(['dbPassword', 'adminPassword'])

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

/**
 * Complete, validated choices. Everything after the questions reads only this. A field is
 * `undefined` when its question does not apply (for example `design` in an API-only project).
 *
 * @example
 * options.database === 'mysql' && options.docker // start MySQL in Docker
 */
export interface ProjectOptions {
  readonly name: string
  /** Absolute path of the project folder. */
  readonly directory: string
  readonly mode: SetupMode
  readonly stack: Stack
  readonly design: Design | undefined
  readonly ui: UiStarter | undefined
  readonly auth: AuthMode
  /** Always empty without sign-in. */
  readonly security: readonly SignInSecurity[]
  /** Always empty without sign-in. */
  readonly social: readonly SocialProvider[]
  readonly sso: boolean
  /** Without sign-in this is always `'tokens'`: the API stays deny-by-default (blueprint §2.1). */
  readonly apiAccess: ApiAccess
  readonly roles: RoleSet | undefined
  readonly teams: boolean
  readonly tenantResolver: TenantResolver | undefined
  readonly database: Database
  /**
   * Docker mode: EVERYTHING runs in containers (app on node:24, the database, Mailpit), like
   * Laravel Sail; `node strut` on the host forwards into the app container. Without Docker the
   * app runs on this computer.
   */
  readonly docker: boolean
  /** Only without Docker and with MySQL/PostgreSQL: the server the user runs. */
  readonly connection: Connection | undefined
  /** The first admin's address; `undefined` without sign-in. */
  readonly adminEmail: string | undefined
  /** `undefined` unless sign-in uses passwords. */
  readonly adminPasswordMode: AdminPasswordMode | undefined
  readonly sampleData: boolean
  readonly cache: CacheStore
  readonly storage: StorageDisk
  readonly mailer: Mailer
  readonly locale: string
  readonly timezone: string
  readonly currency: string
  /** Picked catalogue ids, in catalogue order. */
  readonly features: readonly string[]
  /** One answer for every follow-up question of every picked feature (defaults filled in). */
  readonly featureOptions: FeatureOptions
  readonly testing: TestSetup
  readonly agents: boolean
  readonly git: boolean
  readonly ci: boolean
  readonly securityProfile: SecurityProfile
  readonly activityLog: boolean
  readonly ai: boolean
  /** Only with `ai`. Its API key is never asked: `.env` gets an empty line to fill in later. */
  readonly aiProvider: AiProvider | undefined
  readonly mcpServer: boolean
  /** UI-only answers (`undefined` for an API-only project). */
  readonly uiLanguages: readonly string[] | undefined
  readonly appearance: Appearance | undefined
  readonly pwa: boolean | undefined
  readonly liveUpdates: boolean | undefined
  readonly monitoring: Monitoring
  readonly deploy: DeployTarget
  readonly editor: boolean
  /** A committed `.devcontainer/` for Codespaces (opt-in, ADR-0021). */
  readonly devContainer: boolean
}

/**
 * The defaults used for anything not answered (blueprint §2.1, bold choices).
 *
 * Why MySQL + Docker: the user chose MySQL as the default database (2026-11-14), and Docker is
 * pre-selected for server databases. If Docker is missing, setup offers SQLite as the fallback.
 * With teams, PostgreSQL is pre-selected instead (see {@link defaultDatabase}).
 */
export const DEFAULTS = Object.freeze({
  mode: 'recommended',
  stack: 'full',
  // The first design in DESIGNS (Crisp), so the default and the list can never disagree.
  design: DESIGNS[0].value,
  ui: 'admin',
  auth: 'email',
  // Two-factor and email verification on; public registration OFF (security review F-02): only
  // invited accounts sign in until the developer opts in to public sign-up.
  security: Object.freeze(['2fa', 'verification'] as const),
  social: Object.freeze([] as const),
  sso: false,
  apiAccess: 'tokens',
  roles: 'basic',
  teams: false,
  tenantResolver: 'switcher',
  database: 'mysql',
  adminPasswordMode: 'generate',
  cache: 'database',
  storage: 'local',
  mailer: 'later',
  locale: 'en',
  currency: 'USD',
  // The log viewer is pre-selected (RFC-0004: @strutvane/logs is installed by default).
  features: Object.freeze(['log-viewer'] as const),
  testing: 'vitest',
  agents: true,
  git: true,
  ci: true,
  securityProfile: 'standard',
  ai: false,
  aiProvider: AI_PROVIDERS[0].value,
  mcpServer: false,
  uiLanguages: Object.freeze(['en'] as const),
  appearance: 'system',
  pwa: false,
  liveUpdates: false,
  monitoring: 'none',
  deploy: 'later',
  editor: true,
  devContainer: false,
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

// ── Effective values and "does this apply?" rules, shared by resolveOptions and the registry ──

/** The stack: the answer, or the default. */
export const stackOf = (a: Answers): Stack => a.stack ?? DEFAULTS.stack
/** Sign-in mode: the answer, or the default. */
export const authOf = (a: Answers): AuthMode => a.auth ?? DEFAULTS.auth
/** Is there a React UI (and so a design and a UI starter)? */
export const hasUi = (a: Answers): boolean => stackOf(a) === 'full'
/** Do people sign in at all? */
export const hasSignIn = (a: Answers): boolean => authOf(a) !== 'none'
/** Do people sign in with a password (so the first admin needs one)? */
export const hasPasswords = (a: Answers): boolean => authOf(a) === 'email'
/** Teams are on (they need sign-in). */
export const teamsOf = (a: Answers): boolean => hasSignIn(a) && (a.teams ?? DEFAULTS.teams)
/** The database: the answer, or the default for the teams answer. */
export const databaseOf = (a: Answers): Database => a.database ?? defaultDatabase(teamsOf(a))
/** Docker mode: the answer, or the default for the database. */
export const dockerOf = (a: Answers): boolean => a.docker ?? dockerByDefault(databaseOf(a))
/** Connection questions apply only without Docker and with a server database. */
export const needsConnection = (a: Answers): boolean => !dockerOf(a) && databaseOf(a) !== 'sqlite'
/** AI features inside the app: the answer, or the default. */
export const aiOf = (a: Answers): boolean => a.ai ?? DEFAULTS.ai
/**
 * Activity history is on by default for teams apps: with several customer companies in one
 * database, "who changed what" is the first thing support and auditors ask for.
 */
export const defaultActivityLog = (a: Answers): boolean => teamsOf(a)
/** Git: the answer, or the default. */
export const gitOf = (a: Answers): boolean => a.git ?? DEFAULTS.git

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
 * Sample data is on by default for the admin starter only: there it fills the generated screens;
 * a blank UI or an API has nothing to show it in.
 *
 * @example
 * defaultSampleData({}) // true (full stack, admin starter)
 */
export function defaultSampleData(a: Answers): boolean {
  return hasUi(a) && (a.ui ?? DEFAULTS.ui) === 'admin'
}

/**
 * The first admin's address: `admin@<name>.test` (`.test` is reserved, so no mail can ever leave).
 *
 * @example
 * defaultAdminEmail('acme') // 'admin@acme.test'
 */
export function defaultAdminEmail(name: string | undefined): string {
  return `admin@${name !== undefined && name.trim() !== '' ? name.trim() : 'app'}.test`
}

/**
 * The time zone of this computer (question 21's default), or UTC when it cannot be read.
 *
 * @example
 * defaultTimeZone() // 'Asia/Kolkata'
 */
export function defaultTimeZone(): string {
  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone
  return isTimeZone(detected) ? detected : 'UTC'
}

/** Does this runtime know the time zone? (Intl throws a RangeError for unknown zones.) */
export function isTimeZone(value: string): boolean {
  if (!/^[A-Za-z][A-Za-z0-9_+\-/]{0,63}$/.test(value)) return false
  try {
    new Intl.DateTimeFormat('en', { timeZone: value })
    return true
  } catch {
    return false
  }
}

/** A language tag such as `en`, `de` or `pt-BR`. */
export const isLocale = (value: string): boolean => /^[a-z]{2,3}(-[A-Z]{2})?$/.test(value)
/** An ISO 4217 currency code such as `USD` or `EUR`. */
export const isCurrency = (value: string): boolean => /^[A-Z]{3}$/.test(value)
/** A plain email address (one @, no spaces or quotes; strict on purpose, it lands in .env). */
export const isEmail = (value: string): boolean =>
  value.length <= 254 && /^[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(\.[A-Za-z0-9-]{1,63})+$/.test(value)

/** The shortest password a user may type for the first admin. */
export const MIN_ADMIN_PASSWORD = 12

/**
 * Is this database enforcing tenant isolation itself (row-level security)? Only PostgreSQL.
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
 * @param catalogue - the package index used to check feature picks (the installer's by default)
 *
 * @example
 * resolveOptions({ name: 'my-app' }, 'C:/code').database // 'mysql'
 */
export function resolveOptions(answers: Answers, cwd: string, catalogue: Catalogue = installerCatalogue()): ProjectOptions {
  const problems: string[] = []
  const name = answers.name?.trim() ?? ''
  problems.push(...validateProjectName(name))

  const stack = stackOf(answers)
  const ui = onlyIf(hasUi(answers), answers.ui, DEFAULTS.ui, 'an API-only project has no UI: drop --ui, or use --stack full', problems)
  const design = onlyIf(hasUi(answers), answers.design, DEFAULTS.design, 'an API-only project has no UI to style: drop --design, or use --stack full', problems)
  const auth = authOf(answers)
  const signIn = hasSignIn(answers)
  const security = signInList(signIn, answers.security, DEFAULTS.security, '--security', problems)
  const social = signInList(signIn, answers.social, DEFAULTS.social, '--social', problems)
  if (!signIn && answers.teams === true) {
    problems.push('teams need sign-in (a team is a group of users): drop --teams, or use --auth email')
  }
  const teams = teamsOf(answers)
  const sso = resolveSso(teams, answers.sso, problems)
  const apiAccess = resolveApiAccess(signIn, answers.apiAccess, problems)
  const roles = onlyIf(signIn, answers.roles, DEFAULTS.roles, 'starting roles need sign-in: drop --roles, or use --auth email', problems)
  const tenantResolver = onlyIf(teams, answers.tenantResolver, DEFAULTS.tenantResolver, 'how a request picks its team needs teams: drop --tenant, or add --teams', problems)
  const database = databaseOf(answers)
  const docker = dockerOf(answers)
  const connection = resolveConnection(name, database, docker, answers, problems)
  const adminEmail = resolveAdminEmail(signIn, name, answers.adminEmail, problems)
  const adminPasswordMode = onlyIf(
    hasPasswords(answers),
    answers.adminPasswordMode,
    DEFAULTS.adminPasswordMode,
    'the admin password is only for email + password sign-in: drop --admin-password',
    problems,
  )
  checkTypedAdminPassword(adminPasswordMode, answers.adminPassword, problems)
  const locale = checked(answers.locale ?? DEFAULTS.locale, isLocale, (v) => `--locale "${v}" is not a language tag (for example en, de or pt-BR)`, problems)
  const timezone = checked(answers.timezone ?? defaultTimeZone(), isTimeZone, (v) => `--timezone "${v}" is not a time zone this computer knows (for example Europe/Berlin or UTC)`, problems)
  const currency = checked(answers.currency ?? DEFAULTS.currency, isCurrency, (v) => `--currency "${v}" is not a 3-letter currency code (for example USD or EUR)`, problems)
  const { features, featureOptions } = resolveFeatures(answers.features, answers.featureOptions, catalogue, problems)
  const git = gitOf(answers)
  if (!git && answers.ci === true) problems.push('a CI workflow needs git: drop --ci, or use --git')
  const ai = aiOf(answers)
  const aiProvider = onlyIf(ai, answers.aiProvider, DEFAULTS.aiProvider, 'an AI provider needs AI features: drop --ai-provider, or add --ai', problems)
  const withUi = hasUi(answers)
  const uiProblem = (flag: string) => `an API-only project has no UI: drop ${flag}, or use --stack full`
  const uiLanguages = onlyIf(withUi, answers.uiLanguages, DEFAULTS.uiLanguages, uiProblem('--ui-languages'), problems)
  if (uiLanguages !== undefined) {
    if (uiLanguages.length === 0) problems.push('pick at least one UI language (for example --ui-languages en)')
    for (const tag of uiLanguages) if (!isLocale(tag)) problems.push(`--ui-languages "${tag}" is not a language tag (for example en, de or pt-BR)`)
  }
  const appearance = onlyIf(withUi, answers.appearance, DEFAULTS.appearance, uiProblem('--appearance'), problems)
  const pwa = onlyIf(withUi, answers.pwa, DEFAULTS.pwa, uiProblem('--pwa'), problems)
  const liveUpdates = onlyIf(withUi, answers.liveUpdates, DEFAULTS.liveUpdates, uiProblem('--live-updates'), problems)

  if (problems.length > 0) throw new OptionsError(problems)
  return Object.freeze({
    name,
    // The name has no slashes (validated above), so this is always `<cwd>/<name>`.
    directory: resolve(cwd, name),
    mode: answers.mode ?? DEFAULTS.mode,
    stack,
    design,
    ui,
    auth,
    security,
    social,
    sso,
    apiAccess,
    roles,
    teams,
    tenantResolver,
    database,
    docker,
    connection,
    adminEmail,
    adminPasswordMode,
    sampleData: answers.sampleData ?? defaultSampleData(answers),
    cache: answers.cache ?? DEFAULTS.cache,
    storage: answers.storage ?? DEFAULTS.storage,
    mailer: answers.mailer ?? DEFAULTS.mailer,
    locale,
    timezone,
    currency,
    features,
    featureOptions,
    testing: answers.testing ?? DEFAULTS.testing,
    agents: answers.agents ?? DEFAULTS.agents,
    git,
    ci: git && (answers.ci ?? DEFAULTS.ci),
    securityProfile: answers.securityProfile ?? DEFAULTS.securityProfile,
    activityLog: answers.activityLog ?? defaultActivityLog(answers),
    ai,
    aiProvider,
    mcpServer: answers.mcpServer ?? DEFAULTS.mcpServer,
    uiLanguages: uiLanguages === undefined ? undefined : Object.freeze([...new Set(uiLanguages)]),
    appearance,
    pwa,
    liveUpdates,
    monitoring: answers.monitoring ?? DEFAULTS.monitoring,
    deploy: answers.deploy ?? DEFAULTS.deploy,
    editor: answers.editor ?? DEFAULTS.editor,
    devContainer: answers.devContainer ?? DEFAULTS.devContainer,
  })
}

/**
 * A value that exists only when a condition holds (a UI starter only with a UI, ...). Given
 * explicitly where it cannot apply, it is refused instead of silently ignored.
 */
function onlyIf<T>(applies: boolean, given: T | undefined, fallback: T, problem: string, problems: string[]): T | undefined {
  if (applies) return given ?? fallback
  if (given !== undefined) problems.push(problem)
  return undefined
}

/** A list that needs sign-in. Sorted in list order so the output never depends on typing order. */
function signInList<T extends string>(
  signIn: boolean,
  given: readonly T[] | undefined,
  fallback: readonly T[],
  flag: string,
  problems: string[],
): readonly T[] {
  if (!signIn) {
    if (given !== undefined && given.length > 0) problems.push(`${flag} needs sign-in: drop ${flag}, or use --auth email`)
    return Object.freeze([])
  }
  return Object.freeze([...new Set(given ?? fallback)])
}

/** Enterprise SSO is per customer company, so it needs teams. */
function resolveSso(teams: boolean, sso: boolean | undefined, problems: string[]): boolean {
  if (sso === true && !teams) problems.push('enterprise SSO is set up per customer company, so it needs teams: drop --sso, or add --teams')
  return teams && (sso ?? DEFAULTS.sso)
}

/**
 * Without sign-in the API must still refuse strangers: it always requires API tokens (deny by
 * default, blueprint §2.1), so "no API access" or an OAuth server (which needs users) is refused.
 */
function resolveApiAccess(signIn: boolean, given: ApiAccess | undefined, problems: string[]): ApiAccess {
  if (signIn) return given ?? DEFAULTS.apiAccess
  if (given !== undefined && given !== 'tokens') {
    problems.push('without sign-in the API always requires API tokens (deny by default): drop --api, or use --api tokens')
  }
  return 'tokens'
}

/** The first admin's email: only with sign-in; checked strictly because it lands in `.env`. */
function resolveAdminEmail(signIn: boolean, name: string, given: string | undefined, problems: string[]): string | undefined {
  if (!signIn) {
    if (given !== undefined) problems.push('there is no admin account without sign-in: drop --admin-email, or use --auth email')
    return undefined
  }
  const email = given?.trim() ?? defaultAdminEmail(name)
  if (!isEmail(email)) problems.push(`"${email}" is not a valid email address for the first admin`)
  return email
}

/** A typed admin password must be long enough, and only exists in "type it" mode. */
function checkTypedAdminPassword(mode: AdminPasswordMode | undefined, password: string | undefined, problems: string[]): void {
  if (password === undefined) return
  if (mode !== 'type') {
    problems.push('an admin password was given, but the admin password is generated: use --admin-password type')
  } else if (password.length < MIN_ADMIN_PASSWORD) {
    problems.push(`the first admin's password needs at least ${MIN_ADMIN_PASSWORD} characters`)
  }
}

/** Keep a value when it passes `test`, otherwise record why. */
function checked(value: string, test: (value: string) => boolean, problem: (value: string) => string, problems: string[]): string {
  if (!test(value)) problems.push(problem(value))
  return value
}

/**
 * Extra features: every id must be offered by the catalogue (published and compatible), and
 * every follow-up answer must belong to a picked feature and be one of its choices. Follow-ups
 * left unanswered take the package's declared default.
 */
function resolveFeatures(
  given: readonly string[] | undefined,
  givenOptions: FeatureOptions | undefined,
  catalogue: Catalogue,
  problems: string[],
): { features: readonly string[]; featureOptions: FeatureOptions } {
  const picked = new Set(given ?? DEFAULTS.features)
  const entries: CatalogueEntry[] = []
  for (const id of picked) {
    const entry = findOffered(id, catalogue)
    if (entry === undefined) {
      // A default the catalogue no longer offers is quietly dropped; only a typed pick is an error.
      if (given !== undefined) problems.push(`--features "${id}" is not an available package (unknown, unpublished, or not for this framework version). Search with: node strut add`)
    } else {
      entries.push(entry)
    }
  }
  // Catalogue order, so the result never depends on the order the ids were typed.
  const ordered = catalogue.entries.filter((entry) => entries.includes(entry))
  const featureOptions: Record<string, string> = {}
  for (const entry of ordered) {
    for (const followUp of entry.followUps) {
      const key = `${entry.id}.${followUp.id}`
      const value = givenOptions?.[key] ?? followUp.default
      if (!followUp.choices.some((choice) => choice.value === value)) {
        problems.push(`--feature-option ${key}=${value} is not a choice. Use one of: ${followUp.choices.map((c) => c.value).join(', ')}`)
      }
      featureOptions[key] = value
    }
  }
  for (const key of Object.keys(givenOptions ?? {})) {
    if (!(key in featureOptions)) problems.push(`--feature-option ${key} belongs to no picked feature with that question`)
  }
  return { features: Object.freeze(ordered.map((entry) => entry.id)), featureOptions: Object.freeze(featureOptions) }
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

/**
 * Complete options read back as answers (connection flattened), so the registry can describe them,
 * rebuild the equivalent command, or re-check them on resume.
 *
 * @example
 * answersOf(options).dbHost // '127.0.0.1' (from options.connection)
 */
export function answersOf(options: Omit<ProjectOptions, 'directory'>): Answers {
  const { connection, ...rest } = options
  if (connection === undefined) return rest
  return { ...rest, dbHost: connection.host, dbPort: connection.port, dbName: connection.database, dbUser: connection.username }
}
