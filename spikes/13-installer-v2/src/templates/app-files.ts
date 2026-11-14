/**
 * The generated app's source files, in the Laravel-style MVC layout fixed on the shared design
 * board (`app/http/controllers`, `app/models`, `app/policies`, `bootstrap/app.ts`, `routes/`,
 * `config/`, `database/{migrations,seeders,factories}`, `resources/ui`).
 *
 * These are deliberately small: spike 12 owns the real app core and spike 10 the migration format.
 * The installer spike only needs files that run, so `node strut migrate --seed` and
 * `node strut dev` prove the setup flow end to end.
 *
 * @module
 */
import { DESIGN_NAMES, designInfo, otherDesign, type ProjectOptions } from '../options.ts'

/** A generated file: POSIX path relative to the project root, and its text. */
export interface GeneratedFile {
  readonly path: string
  readonly content: string
}

/**
 * Every app source file for these options.
 *
 * @example
 * appFiles(options).map((f) => f.path) // ['bootstrap/app.ts', 'routes/web.ts', ...]
 */
export function appFiles(options: ProjectOptions): GeneratedFile[] {
  const files: GeneratedFile[] = [
    { path: 'bootstrap/app.ts', content: BOOTSTRAP },
    { path: 'routes/web.ts', content: webRoutes(options) },
    { path: 'routes/api.ts', content: API_ROUTES },
    { path: 'app/http/controllers/health-controller.ts', content: HEALTH_CONTROLLER },
    { path: 'config/app.ts', content: configApp(options) },
    { path: 'config/database.ts', content: CONFIG_DATABASE },
    ...answerConfigFiles(options),
    ...migrations(options),
    { path: 'database/seeders/database-seeder.ts', content: seeder(options) },
  ]
  // Email link sign-in has users too; only "no sign-in" has none.
  if (options.auth !== 'none') {
    files.push(
      { path: 'app/models/user.ts', content: USER_MODEL },
      { path: 'app/policies/user-policy.ts', content: USER_POLICY },
      { path: 'config/auth.ts', content: configAuth(options) },
      { path: 'database/factories/user-factory.ts', content: USER_FACTORY },
    )
  }
  if (options.teams) files.push({ path: 'config/tenancy.ts', content: tenancyConfig(options) })
  if (options.sampleData) files.push({ path: 'database/seeders/sample-data-seeder.ts', content: SAMPLE_DATA_SEEDER })
  if (options.ui !== undefined) files.push(...uiFiles(options))
  if (options.testing !== 'none') files.push({ path: 'tests/feature/health.test.ts', content: HEALTH_TEST })
  if (options.testing === 'vitest-playwright') {
    files.push({ path: 'tests/browser/home.spec.ts', content: BROWSER_TEST })
  }
  return files
}

const BOOTSTRAP = `// Builds the application: routes, providers and middleware are registered here (Laravel's
// bootstrap/app.php). \`node strut dev\` and the production server both start from this file.
import { createApplication } from '@strutvane/framework'
import api from '../routes/api.ts'
import web from '../routes/web.ts'

export default createApplication({ routes: { web, api } })
`

function webRoutes(options: ProjectOptions): string {
  const page =
    options.ui === undefined
      ? `'<h1>${options.name}</h1><p>API only. Try <a href="/api/v1/health">/api/v1/health</a>.</p>'`
      : `'<h1>${options.name}</h1><p>The React UI (resources/ui) is served here by Vite in development.</p>'`
  return `// Browser routes. The React UI is mounted here in development (Vite middleware) and production.
type Router = { get(path: string, handler: () => unknown): void }

export default function web(router: Router): void {
  router.get('/', () => ${page})${upRoute(options)}
}
`
}

/**
 * The \`/up\` health route (Laravel 11's name), written when a deploy target is chosen: hosts,
 * load balancers and the Dockerfile's HEALTHCHECK call it. It says only "up": no versions, no
 * internals, so it is safe to leave public.
 */
function upRoute(options: ProjectOptions): string {
  if (options.deploy === 'later') return ''
  return `
  // Health check for your host / load balancer / Docker HEALTHCHECK. Public, and says nothing else.
  router.get('/up', () => 'up')`
}

/**
 * A config file whose values are plain data. JSON is valid TypeScript, and every value was
 * checked by resolveOptions, so nothing typed by the user can break out of the literal.
 */
function dataConfig(path: string, comment: string, data: Readonly<Record<string, unknown>>): GeneratedFile {
  return { path, content: `${comment.trim()}\nexport default ${JSON.stringify(data, null, 2)}\n` }
}

/**
 * The config files that only record installer answers (the packages they name read them).
 * One small file per concern, like Laravel's config folder.
 */
function answerConfigFiles(options: ProjectOptions): GeneratedFile[] {
  const files = [
    dataConfig(
      'config/api.ts',
      `// The API (/api/v1). Deny by default: without sign-in every request needs an API token
// (create one with: node strut token:create); a route opts out only explicitly, one by one.`,
      {
        requireToken: options.auth === 'none',
        access: options.apiAccess,
        publicRoutes: ['/api/v1/health'],
      },
    ),
    dataConfig('config/cache.ts', '// Cache, queue and sessions. "database" needs no extra service; "redis" needs REDIS_URL in .env.', {
      store: options.cache,
      queue: options.cache,
      sessions: options.cache,
    }),
    dataConfig('config/filesystems.ts', '// Where uploaded files go. "s3" reads its bucket and keys from .env (never from this file).', {
      default: options.storage,
    }),
    dataConfig('config/mail.ts', '// Mail. Development always uses Mailpit (Docker) or the log; this is the production mailer.', {
      production: options.mailer,
    }),
    dataConfig(
      'config/security.ts',
      `// Security profile. "strict": 2FA required for admins, breached-password check, 8-hour sessions,
// strict Content-Security-Policy and HSTS preload. "standard" keeps the safe defaults.`,
      { profile: options.securityProfile, activityHistory: options.activityLog },
    ),
    dataConfig('config/monitoring.ts', '// Monitoring. "otel" exports traces and metrics with OpenTelemetry (endpoint from .env).', {
      exporter: options.monitoring,
      healthPage: options.monitoring === 'otel',
    }),
  ]
  if (options.roles !== undefined) {
    files.push(
      dataConfig('config/permissions.ts', '// The roles new apps start with. Change them here; policies decide what each role may do.', {
        roles: options.roles === 'extended' ? ['admin', 'manager', 'member', 'viewer'] : ['admin', 'member'],
      }),
    )
  }
  if (options.aiProvider !== undefined) {
    files.push(
      dataConfig(
        'config/ai.ts',
        `// AI features. The provider's API key lives only in .env (the installer never asks for it).
// MCP: lets AI agents use the app under your policies and teams.`,
        { provider: options.aiProvider, mcpServer: options.mcpServer },
      ),
    )
  } else if (options.mcpServer) {
    files.push(dataConfig('config/ai.ts', '// MCP: lets AI agents use the app under your policies and teams.', { mcpServer: true }))
  }
  return files
}

const API_ROUTES = `// API routes, served under /api/v1. Resource routes for your models are added here.
import { HealthController } from '../app/http/controllers/health-controller.ts'

type Router = { get(path: string, handler: () => unknown): void }

export default function api(router: Router): void {
  router.get('/health', HealthController.show)
}
`

const HEALTH_CONTROLLER = `// A tiny controller: GET /api/v1/health answers whether the app is up (used by load balancers).
export const HealthController = {
  show(): { status: string } {
    return { status: 'ok' }
  },
}
`

/** Application settings: per-machine values from .env, the regional defaults from the installer. */
function configApp(options: ProjectOptions): string {
  return `// Application settings. Per-machine values come from .env; change the regional defaults here.
export default {
  name: process.env['APP_NAME'] ?? 'app',
  env: process.env['APP_ENV'] ?? 'production',
  url: process.env['APP_URL'] ?? 'http://localhost:3000',
  debug: process.env['APP_DEBUG'] === 'true',
  locale: ${JSON.stringify(options.locale)},
  timezone: ${JSON.stringify(options.timezone)},
  currency: ${JSON.stringify(options.currency)},
}
`
}

const CONFIG_DATABASE = `// Database settings, read from .env (DB_CONNECTION is mysql, postgres or sqlite).
export default {
  connection: process.env['DB_CONNECTION'] ?? 'mysql',
  host: process.env['DB_HOST'] ?? '127.0.0.1',
  port: Number(process.env['DB_PORT'] ?? 3306),
  database: process.env['DB_DATABASE'] ?? '',
  username: process.env['DB_USERNAME'] ?? '',
  password: process.env['DB_PASSWORD'] ?? '',
}
`

/**
 * Sign-in settings: the switches come from .env (so each environment can differ), the shape of
 * sign-in (mode, social providers, SSO) from the installer answers.
 */
function configAuth(options: ProjectOptions): string {
  return `// Sign-in settings. Feature switches are read from .env; password reset is always on.
// Mode "${options.auth}"${options.auth === 'magic-link' ? ': single-use links, valid 15 minutes, bound to the browser that asked' : ''}.
export default {
  mode: ${JSON.stringify(options.auth)},
  registration: process.env['AUTH_REGISTRATION'] === 'true',
  emailVerification: process.env['AUTH_EMAIL_VERIFICATION'] === 'true',
  twoFactor: process.env['AUTH_TWO_FACTOR'] === 'true',
  passkeys: process.env['AUTH_PASSKEYS'] === 'true',
  // Client ids and secrets for these come from .env, never from this file.
  social: ${JSON.stringify(options.social)},
  enterpriseSso: ${JSON.stringify(options.sso)},
}
`
}

function tenancyConfig(options: ProjectOptions): string {
  const how =
    options.database === 'postgres'
      ? 'the ORM tenant scope, plus PostgreSQL row-level security as a second lock'
      : 'the ORM tenant scope (PostgreSQL would add row-level security as a second lock)'
  return `// Teams: each customer company sees only its own data. Isolation here: ${how}.
// "resolver": how a request picks its team (the in-app team switcher, or the subdomain).
export default {
  enabled: process.env['TENANCY_ENABLED'] === 'true',
  model: 'Team',
  resolver: ${JSON.stringify(options.tenantResolver ?? 'switcher')},
}
`
}

const SAMPLE_DATA_SEEDER = `// Sample records so the generated screens are not empty on day one. Add a factory call per
// model here as you create models (node strut make:model Post -f). Development only.
import { seeder } from '@strutvane/framework'

export default seeder(async () => {})
`

const USER_MODEL = `// The User model. Columns come from the users migration (database/migrations).
export class User {
  static table = 'users'
}
`

const USER_POLICY = `// Who may do what with users. Deny by default: anything not allowed here is refused.
export const UserPolicy = {
  view(actor: { id: number }, user: { id: number }): boolean {
    return actor.id === user.id
  },
}
`

const USER_FACTORY = `// Fake users for tests and seeders.
let next = 1

export function userFactory(): { name: string; email: string } {
  const n = next++
  return { name: \`User \${n}\`, email: \`user\${n}@example.test\` }
}
`

/** Migrations, named like Laravel's (\`0001_01_01_000000_create_users_table\`). */
function migrations(options: ProjectOptions): GeneratedFile[] {
  const files: GeneratedFile[] = []
  const add = (index: number, table: string, body: string) =>
    files.push({
      path: `database/migrations/0001_01_01_00000${index}_create_${table}_table.ts`,
      content: `import { migration } from '@strutvane/framework'

export default migration({
  up(schema) {
${body}
  },
  down(schema) {
    schema.dropIfExists('${table}')
  },
})
`,
    })
  if (options.auth !== 'none') {
    const twoFactor = options.security.includes('2fa') ? "\n      t.text('two_factor_secret').nullable()" : ''
    // Email-link sign-in has no passwords; the column stays (nullable) so switching later is one setting.
    const passwordColumn = options.auth === 'magic-link' ? "t.string('password').nullable()" : "t.string('password')"
    add(
      0,
      'users',
      `    schema.create('users', (t) => {
      t.id()
      t.string('name')
      t.string('email').unique()
      t.timestamp('email_verified_at').nullable()
      ${passwordColumn}
      t.boolean('must_change_password').default(false)${twoFactor}
      t.timestamps()
    })`,
    )
    add(
      1,
      'sessions',
      `    schema.create('sessions', (t) => {
      t.string('id', 128).primary()
      t.foreignId('user_id').nullable().constrained('users').cascadeOnDelete()
      t.string('ip_address', 45).nullable()
      t.timestamp('last_activity').nullable()
    })`,
    )
  }
  add(
    2,
    'cache',
    `    schema.create('cache', (t) => {
      t.string('cache_key').primary() // "key" is a reserved word in MySQL
      t.text('value')
      t.integer('expiration')
    })`,
  )
  if (options.teams) {
    add(
      3,
      'teams',
      `    schema.create('teams', (t) => {
      t.id()
      t.string('name')
      t.timestamps()
    })
    schema.create('team_user', (t) => {
      t.foreignId('team_id').constrained('teams').cascadeOnDelete()
      t.foreignId('user_id').constrained('users').cascadeOnDelete()
      t.string('role', 50)
    })`,
    )
  }
  return files
}

function seeder(options: ProjectOptions): string {
  if (options.auth === 'none') {
    return `// Seeds the database. Add records here; \`node strut db:seed\` runs this file.
import { seeder } from '@strutvane/framework'

export default seeder(async () => {})
`
  }
  return `// Seeds the database (development only: it refuses with APP_ENV=production or staging).
// The first admin (SEED_ADMIN_EMAIL in .env) is created once, with a one-time password that is
// shown once and never stored in .env; it must be changed at the first sign-in.
// Lost it? Run: node strut user:password <email>
import { seeder } from '@strutvane/framework'

type Db = {
  env: Record<string, string>
  createAdminOnce(admin: { name: string; email: string }): Promise<void>
}

export default seeder(async (db: Db) => {
  await db.createAdminOnce({ name: 'Admin', email: db.env['SEED_ADMIN_EMAIL'] ?? '' })${
    options.sampleData
      ? `
  // Sample data (chosen in the installer): see database/seeders/sample-data-seeder.ts.`
      : ''
  }
})
`
}

function uiFiles(options: ProjectOptions): GeneratedFile[] {
  const starter = options.ui === 'admin' ? 'admin screens generated from your models' : 'a blank React app'
  return [
    {
      path: 'resources/ui/index.html',
      content: `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${options.name}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
`,
    },
    {
      path: 'resources/ui/main.tsx',
      content: `// The React UI entry (${starter}). Vite serves it through \`node strut dev\`.
export const starter = '${options.ui ?? 'blank'}'
`,
    },
    ...designFiles(options),
  ]
}

/**
 * The design choice: `config/ui.ts` (which design package styles the UI) and
 * `resources/ui/theme.css` (the developer's own overrides, owned code the design never touches).
 *
 * Why two files: switching design rewrites only the one line in config/ui.ts, so a brand colour
 * set in theme.css survives the switch and every design upgrade.
 */
function designFiles(options: ProjectOptions): GeneratedFile[] {
  if (options.design === undefined) return []
  const { packageName } = designInfo(options.design)
  const other = otherDesign(options.design)
  const switchHint =
    other === undefined
      ? ''
      : `//
// Switch to another design later with one command (it swaps the package and updates this file):
//   node strut design:use ${other}
// Designs available: ${DESIGN_NAMES.join(', ')}.
`
  return [
    {
      path: 'config/ui.ts',
      content: `// The look of the React UI. The screens come from @strutvane/ui (behaviour only); the design
// package ${packageName} gives them their colours, fonts, layout shell and component styles.
${switchHint}//
// Your own brand colour, font or corner radius? Do not edit the design package: put your overrides
// in resources/ui/theme.css. That file is yours, so it stays when you switch or upgrade the design.
export default {
  design: '${options.design}',
  // Light, dark, or follow the system setting (each user can still switch in the app).
  appearance: ${JSON.stringify(options.appearance ?? 'system')},
  // UI languages; add more any time (translations live in resources/ui/lang).
  languages: ${JSON.stringify(options.uiLanguages ?? ['en'])},
  // Installable app (PWA): home-screen icon and an offline page.
  pwa: ${JSON.stringify(options.pwa ?? false)},
  // Live updates: tables refresh when someone else changes the data.
  liveUpdates: ${JSON.stringify(options.liveUpdates ?? false)},
}
`,
    },
    { path: 'resources/ui/theme.css', content: themeCss(packageName) },
  ]
}

/**
 * The owned theme file: every override is commented out, so a fresh app looks exactly like the
 * chosen design until the developer uncomments a line. Token names follow @strutvane/ui
 * (spike 14: one accent knob `--brand-hue`, `--font-sans`, `--radius`).
 */
function themeCss(packageName: string): string {
  return `/*
 * Your theme overrides. This file is yours: upgrades and \`node strut design:use\` never change it.
 *
 * The design (${packageName}, chosen in config/ui.ts) sets every token below. It loads first and
 * this file loads after it, so whatever you set here wins. Uncomment a line and change its value
 * to restyle the whole app; anything left commented keeps the design's own value.
 */

:root {
  /* Brand colour: buttons, links, focus rings and the active menu item. It is an OKLCH hue from
     0 to 360 (250 = blue, 150 = green, 25 = red); the design derives every shade from it and keeps
     text contrast readable (WCAG AA) for any hue. */
  /* --brand-hue: 250; */

  /* Font for the whole UI. Load a web font in resources/ui/index.html first, or use one the
     computer already has. */
  /* --font-sans: 'Inter', ui-sans-serif, system-ui, sans-serif; */

  /* Corner radius of cards, inputs and buttons: 0 for square corners, 0.75rem for soft ones. */
  /* --radius: 0.5rem; */
}

/* Dark mode: the same tokens, set only for the dark theme. */
/* .dark { --brand-hue: 250; } */
`
}

const HEALTH_TEST = `// A first feature test: the health controller answers "ok". Run: npm test
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HealthController } from '../../app/http/controllers/health-controller.ts'

test('GET /api/v1/health answers ok', () => {
  assert.deepEqual(HealthController.show(), { status: 'ok' })
})
`

const BROWSER_TEST = `// Browser test (Playwright). Browsers download on the first: npm run test:e2e
export const homePage = '/'
`
