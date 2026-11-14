/**
 * The question registry (blueprint §2.1): every question's default, flag and `when` rule, plus
 * the properties that make it one data-driven list (help, review, equivalent command, resume).
 */
import { describe, expect, it } from 'vitest'
import { helpText, parseCommandLine } from '../src/args.ts'
import { equivalentCommand } from '../src/finish.ts'
import { type Answers, defaultTimeZone, OptionsError, type ProjectOptions, resolveOptions } from '../src/options.ts'
import { projectPackages, QUESTIONS } from '../src/question-registry.ts'
import { answersOf } from '../src/options.ts'

const resolve = (answers: Answers = {}): ProjectOptions => resolveOptions({ name: 'acme', ...answers }, '/code')

/**
 * One row per question: the flag as typed, the answer it gives, the resolved default, and answers
 * under which the question does not apply (with the resolved value it then has).
 */
interface Row {
  readonly id: keyof Answers
  readonly argv: readonly string[]
  readonly answer: Answers
  /** Extra answers the flag needs to be valid (an AI provider needs AI on). */
  readonly needs?: Answers
  readonly read: (options: ProjectOptions) => unknown
  readonly fallback: unknown
  readonly off?: { readonly when: Answers; readonly value: unknown }
}

const ROWS: readonly Row[] = [
  { id: 'mode', argv: ['--mode', 'custom'], answer: { mode: 'custom' }, read: (o) => o.mode, fallback: 'recommended' },
  { id: 'stack', argv: ['--stack', 'api'], answer: { stack: 'api' }, read: (o) => o.stack, fallback: 'full' },
  { id: 'design', argv: ['--design', 'vivid'], answer: { design: 'vivid' }, read: (o) => o.design, fallback: 'crisp', off: { when: { stack: 'api' }, value: undefined } },
  { id: 'ui', argv: ['--ui', 'blank'], answer: { ui: 'blank' }, read: (o) => o.ui, fallback: 'admin', off: { when: { stack: 'api' }, value: undefined } },
  { id: 'auth', argv: ['--auth', 'magic-link'], answer: { auth: 'magic-link' }, read: (o) => o.auth, fallback: 'email' },
  { id: 'security', argv: ['--security', 'passkeys,registration'], answer: { security: ['passkeys', 'registration'] }, read: (o) => o.security, fallback: ['2fa', 'verification'], off: { when: { auth: 'none' }, value: [] } },
  { id: 'social', argv: ['--social', 'google,github'], answer: { social: ['google', 'github'] }, read: (o) => o.social, fallback: [], off: { when: { auth: 'none' }, value: [] } },
  { id: 'sso', argv: ['--sso'], answer: { sso: true }, needs: { teams: true }, read: (o) => o.sso, fallback: false, off: { when: { teams: false }, value: false } },
  { id: 'apiAccess', argv: ['--api', 'oauth'], answer: { apiAccess: 'oauth' }, read: (o) => o.apiAccess, fallback: 'tokens', off: { when: { auth: 'none' }, value: 'tokens' } },
  { id: 'roles', argv: ['--roles', 'extended'], answer: { roles: 'extended' }, read: (o) => o.roles, fallback: 'basic', off: { when: { auth: 'none' }, value: undefined } },
  { id: 'teams', argv: ['--teams'], answer: { teams: true }, read: (o) => o.teams, fallback: false, off: { when: { auth: 'none' }, value: false } },
  { id: 'tenantResolver', argv: ['--tenant', 'subdomain'], answer: { tenantResolver: 'subdomain' }, needs: { teams: true }, read: (o) => o.tenantResolver, fallback: 'switcher', off: { when: { teams: false }, value: undefined } },
  { id: 'database', argv: ['--db', 'postgres'], answer: { database: 'postgres' }, read: (o) => o.database, fallback: 'mysql' },
  { id: 'docker', argv: ['--no-docker'], answer: { docker: false }, read: (o) => o.docker, fallback: true },
  { id: 'dbHost', argv: ['--db-host', 'db.local'], answer: { dbHost: 'db.local' }, needs: { docker: false }, read: (o) => o.connection?.host, fallback: '127.0.0.1', off: { when: { database: 'sqlite' }, value: undefined } },
  { id: 'dbPort', argv: ['--db-port', '3307'], answer: { dbPort: 3307 }, needs: { docker: false }, read: (o) => o.connection?.port, fallback: 3306, off: { when: { docker: true }, value: undefined } },
  { id: 'dbName', argv: ['--db-name', 'shop'], answer: { dbName: 'shop' }, needs: { docker: false }, read: (o) => o.connection?.database, fallback: 'acme' },
  { id: 'dbUser', argv: ['--db-user', 'shop'], answer: { dbUser: 'shop' }, needs: { docker: false }, read: (o) => o.connection?.username, fallback: 'acme' },
  { id: 'adminEmail', argv: ['--admin-email', 'boss@acme.test'], answer: { adminEmail: 'boss@acme.test' }, read: (o) => o.adminEmail, fallback: 'admin@acme.test', off: { when: { auth: 'none' }, value: undefined } },
  { id: 'adminPasswordMode', argv: ['--admin-password', 'type'], answer: { adminPasswordMode: 'type' }, read: (o) => o.adminPasswordMode, fallback: 'generate', off: { when: { auth: 'magic-link' }, value: undefined } },
  { id: 'sampleData', argv: ['--no-sample-data'], answer: { sampleData: false }, read: (o) => o.sampleData, fallback: true },
  { id: 'cache', argv: ['--cache-store', 'redis'], answer: { cache: 'redis' }, read: (o) => o.cache, fallback: 'database' },
  { id: 'storage', argv: ['--storage', 's3'], answer: { storage: 's3' }, read: (o) => o.storage, fallback: 'local' },
  { id: 'mailer', argv: ['--mailer', 'resend'], answer: { mailer: 'resend' }, read: (o) => o.mailer, fallback: 'later' },
  { id: 'locale', argv: ['--locale', 'pt-BR'], answer: { locale: 'pt-BR' }, read: (o) => o.locale, fallback: 'en' },
  { id: 'timezone', argv: ['--timezone', 'Europe/Berlin'], answer: { timezone: 'Europe/Berlin' }, read: (o) => o.timezone, fallback: defaultTimeZone() },
  { id: 'currency', argv: ['--currency', 'EUR'], answer: { currency: 'EUR' }, read: (o) => o.currency, fallback: 'USD' },
  { id: 'features', argv: ['--features', 'search,billing'], answer: { features: ['search', 'billing'] }, read: (o) => o.features, fallback: ['log-viewer'] },
  { id: 'featureOptions', argv: ['--feature-option', 'billing.provider=paddle'], answer: { featureOptions: { 'billing.provider': 'paddle' } }, needs: { features: ['billing'] }, read: (o) => o.featureOptions, fallback: { 'billing.provider': 'stripe' } },
  { id: 'testing', argv: ['--testing', 'none'], answer: { testing: 'none' }, read: (o) => o.testing, fallback: 'vitest' },
  { id: 'agents', argv: ['--no-agents'], answer: { agents: false }, read: (o) => o.agents, fallback: true },
  { id: 'git', argv: ['--no-git'], answer: { git: false }, read: (o) => o.git, fallback: true },
  { id: 'ci', argv: ['--no-ci'], answer: { ci: false }, read: (o) => o.ci, fallback: true, off: { when: { git: false }, value: false } },
  { id: 'securityProfile', argv: ['--security-profile', 'strict'], answer: { securityProfile: 'strict' }, read: (o) => o.securityProfile, fallback: 'standard' },
  { id: 'activityLog', argv: ['--activity-log'], answer: { activityLog: true }, read: (o) => o.activityLog, fallback: false },
  { id: 'ai', argv: ['--ai'], answer: { ai: true }, read: (o) => o.ai, fallback: false },
  { id: 'aiProvider', argv: ['--ai-provider', 'ollama'], answer: { aiProvider: 'ollama' }, needs: { ai: true }, read: (o) => o.aiProvider, fallback: 'anthropic', off: { when: { ai: false }, value: undefined } },
  { id: 'mcpServer', argv: ['--mcp-server'], answer: { mcpServer: true }, read: (o) => o.mcpServer, fallback: false },
  { id: 'uiLanguages', argv: ['--ui-languages', 'en,de,pt-BR'], answer: { uiLanguages: ['en', 'de', 'pt-BR'] }, read: (o) => o.uiLanguages, fallback: ['en'], off: { when: { stack: 'api' }, value: undefined } },
  { id: 'appearance', argv: ['--appearance', 'dark'], answer: { appearance: 'dark' }, read: (o) => o.appearance, fallback: 'system', off: { when: { stack: 'api' }, value: undefined } },
  { id: 'pwa', argv: ['--pwa'], answer: { pwa: true }, read: (o) => o.pwa, fallback: false, off: { when: { stack: 'api' }, value: undefined } },
  { id: 'liveUpdates', argv: ['--live-updates'], answer: { liveUpdates: true }, read: (o) => o.liveUpdates, fallback: false, off: { when: { stack: 'api' }, value: undefined } },
  { id: 'monitoring', argv: ['--monitoring', 'otel'], answer: { monitoring: 'otel' }, read: (o) => o.monitoring, fallback: 'none' },
  { id: 'deploy', argv: ['--deploy', 'docker'], answer: { deploy: 'docker' }, read: (o) => o.deploy, fallback: 'later' },
  { id: 'editor', argv: ['--no-editor'], answer: { editor: false }, read: (o) => o.editor, fallback: true },
  { id: 'devContainer', argv: ['--dev-container'], answer: { devContainer: true }, read: (o) => o.devContainer, fallback: false },
]

describe('every question: flag, default and when-rule', () => {
  it('the table covers every question that has a flag (a new question needs a row here)', () => {
    const withFlags = QUESTIONS.filter((q) => q.flag !== undefined && q.id !== 'name').map((q) => q.id)
    expect(ROWS.map((row) => row.id).sort()).toEqual([...withFlags].sort())
  })

  it.each(ROWS)('$id: the flag sets the answer and the option', (row) => {
    expect(parseCommandLine(['acme', ...row.argv]).answers).toEqual({ name: 'acme', ...row.answer })
    const options = resolve({ ...row.needs, ...row.answer })
    const [value] = Object.values(row.answer)
    expect(row.read(options)).toEqual(value)
  })

  it.each(ROWS)('$id: default', (row) => {
    // Rows whose question only applies after another answer are checked with that answer.
    expect(row.read(resolve(row.needs))).toEqual(row.fallback)
  })

  it.each(ROWS.filter((row) => row.off !== undefined))('$id: does not apply when $off.when (value, and a given flag is refused or ignored)', (row) => {
    const off = row.off
    if (off === undefined) return
    const question = QUESTIONS.find((q) => q.id === row.id)
    expect(question?.when({ ...row.needs, ...off.when })).toBe(false)
    expect(row.read(resolve(off.when))).toEqual(off.value)
  })

  it('connection details default to this computer, the standard port and names from the project', () => {
    expect(resolve({ docker: false }).connection).toEqual({ host: '127.0.0.1', port: 3306, database: 'acme', username: 'acme' })
    expect(resolve({ docker: false, database: 'postgres' }).connection?.port).toBe(5432)
  })

  it('defaults that depend on other answers: database with teams, Docker with SQLite, activity history with teams', () => {
    expect(resolve({ teams: true })).toMatchObject({ database: 'postgres', activityLog: true, tenantResolver: 'switcher', sso: false })
    expect(resolve({ database: 'sqlite' }).docker).toBe(false)
    expect(resolve({ stack: 'api' }).sampleData).toBe(false)
    expect(resolve({ ui: 'blank' }).sampleData).toBe(false)
  })

  it('refuses answers that cannot apply, in plain words', () => {
    const problems = (answers: Answers): string => {
      try {
        resolve(answers)
        return ''
      } catch (error) {
        return error instanceof OptionsError ? error.problems.join('\n') : String(error)
      }
    }
    expect(problems({ sso: true })).toMatch(/needs teams: drop --sso/)
    expect(problems({ auth: 'none', apiAccess: 'none' })).toMatch(/always requires API tokens/)
    expect(problems({ tenantResolver: 'subdomain' })).toMatch(/needs teams: drop --tenant/)
    expect(problems({ aiProvider: 'openai' })).toMatch(/needs AI features: drop --ai-provider/)
    expect(problems({ stack: 'api', pwa: true })).toMatch(/no UI: drop --pwa/)
    expect(problems({ git: false, ci: true })).toMatch(/CI workflow needs git/)
    expect(problems({ auth: 'magic-link', adminPasswordMode: 'type' })).toMatch(/only for email \+ password sign-in/)
    expect(problems({ adminEmail: 'not an email' })).toMatch(/not a valid email/)
    expect(problems({ locale: 'english' })).toMatch(/not a language tag/)
    expect(problems({ timezone: 'Mars/Olympus' })).toMatch(/not a time zone/)
    expect(problems({ currency: 'dollars' })).toMatch(/3-letter currency/)
    expect(problems({ uiLanguages: [] })).toMatch(/at least one UI language/)
    expect(problems({ adminPasswordMode: 'type', adminPassword: 'short' })).toMatch(/at least 12 characters/)
  })

  it('bad flag values list the valid choices', () => {
    expect(() => parseCommandLine(['a', '--deploy', 'heroku'])).toThrow('--deploy "heroku" is not a choice. Use one of: later, node, docker')
    expect(() => parseCommandLine(['a', '--ai-provider', 'skynet'])).toThrow(/Use one of: anthropic, openai, google, ollama/)
    expect(() => parseCommandLine(['a', '--ui-languages', 'en,klingon'])).toThrow(/"klingon" is not a choice/)
    expect(() => parseCommandLine(['a', '--feature-option', 'billing.provider'])).toThrow(/must look like <id>.<question>=<value>/)
    expect(() => parseCommandLine(['a', '--db-port', 'abc'])).toThrow(/is not a port number/)
  })
})

describe('the registry as one list', () => {
  it('covers blueprint rows 1–36 (row 37, the dev server, is asked after setup)', () => {
    const rows = new Set(QUESTIONS.map((q) => q.row))
    for (let row = 1; row <= 36; row++) expect(rows.has(row), `row ${row}`).toBe(true)
  })

  it('Recommended mode asks exactly the starred rows: 1, 2, 3, 5, 11, 13, 14, 24 (plus the opener)', () => {
    expect([...new Set(QUESTIONS.filter((q) => q.recommended).map((q) => q.row))].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 5, 11, 13, 14, 24])
  })

  it('every question has a flag, or (secrets only) an environment variable; flag names are unique', () => {
    for (const question of QUESTIONS) expect(question.flag !== undefined || question.secretEnv !== undefined, question.id).toBe(true)
    const names = QUESTIONS.flatMap((q) => (q.flag === undefined ? [] : [q.flag.name]))
    expect(new Set(names).size).toBe(names.length)
    expect(QUESTIONS.filter((q) => q.secretEnv !== undefined).map((q) => q.id)).toEqual(['dbPassword', 'adminPassword'])
  })

  it('--help lists every flag, grouped', () => {
    const help = helpText('x')
    for (const question of QUESTIONS) if (question.flag !== undefined && question.id !== 'name') expect(help, question.id).toContain(`--${question.flag.name}`)
    expect(help).toContain('STRUT_ADMIN_PASSWORD')
    expect(help).toMatch(/^Ops$/m)
  })

  it('"the same project without questions" reproduces the exact options (round trip)', () => {
    const samples: Answers[] = [
      {},
      { stack: 'api', auth: 'none', database: 'sqlite' },
      { teams: true, sso: true, tenantResolver: 'subdomain', social: ['google'], security: [], deploy: 'docker', devContainer: true },
      { docker: false, dbHost: 'db.local', dbPort: 3307, ai: true, aiProvider: 'ollama', features: ['billing', 'tags'], featureOptions: { 'billing.provider': 'paddle' } },
      { auth: 'magic-link', uiLanguages: ['en', 'hi'], appearance: 'dark', git: false, monitoring: 'otel', cache: 'redis', timezone: 'UTC' },
    ]
    for (const sample of samples) {
      const options = resolve(sample)
      const argv = equivalentCommand(options).split(' -- ')[1]?.split(' ') ?? []
      const again = resolveOptions({ ...parseCommandLine(['acme', ...argv]).answers, mode: options.mode }, '/code')
      expect(again).toEqual(options)
    }
  })

  it('packages come from the answers, the framework first, each once', () => {
    expect(projectPackages(answersOf(resolve()))).toEqual([
      '@strutvane/framework', '@strutvane/agent-tools', '@strutvane/auth', '@strutvane/design-crisp', '@strutvane/logs', '@strutvane/ui',
    ])
    const many = projectPackages(answersOf(resolve({
      teams: true, sso: true, social: ['github'], apiAccess: 'oauth', cache: 'redis', storage: 's3', testing: 'vitest-playwright',
      activityLog: true, ai: true, mcpServer: true, liveUpdates: true, monitoring: 'otel', features: ['billing', 'activity-log'],
    })))
    for (const name of ['@strutvane/sso', '@strutvane/social-login', '@strutvane/oauth-server', '@strutvane/redis', '@strutvane/files', '@strutvane/browser-testing',
      '@strutvane/activity-log', '@strutvane/ai', '@strutvane/mcp-server', '@strutvane/realtime', '@strutvane/observability', '@strutvane/health', '@strutvane/billing']) {
      expect(many, name).toContain(name)
    }
    expect(many.filter((name) => name === '@strutvane/activity-log')).toHaveLength(1) // question 27 and the catalogue pick
  })

  it('review titles fit the review column (choice labels: 74 max, checked by the scripted prompter)', () => {
    for (const question of QUESTIONS) expect(question.title.length, question.id).toBeLessThanOrEqual(24)
  })
})
