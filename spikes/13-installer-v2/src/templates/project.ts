/**
 * The whole generated project as a list of files: package.json, `strut.js`, env files, the
 * git-ignored Docker compose file, the README, the app sources, and the spike's stub framework.
 *
 * Pure function of the options: no disk, no clock, no randomness (secrets come later), so the same
 * answers always produce the same files and tests can compare them directly.
 *
 * @module
 */
import { readFileSync } from 'node:fs'
import type { ProjectOptions } from '../options.ts'
import { appFiles, type GeneratedFile } from './app-files.ts'
import { dockerFiles } from './compose.ts'
import { buildEnvSections, renderEnv, type TypedSecrets } from './env.ts'

/** Where the static template files (strut.js, the stub framework) live. */
const FILES = new URL('./files/', import.meta.url)

/** Read one static template file. */
function staticFile(relative: string): string {
  return readFileSync(new URL(relative, FILES), 'utf8')
}

/**
 * Every file of a new project, sorted by path.
 *
 * @example
 * renderProject(options).find((f) => f.path === 'strut.js')
 */
export function renderProject(options: ProjectOptions, typed: TypedSecrets = {}): GeneratedFile[] {
  const sections = buildEnvSections(options, typed)
  const files: GeneratedFile[] = [
    { path: 'package.json', content: packageJson(options) },
    // Shipped lockfile (security review F-12): the first install is `npm ci`, so it installs the
    // tested versions, never whatever was published a minute ago.
    { path: 'package-lock.json', content: lockfile(options) },
    // Dependency install scripts never run unless listed in package.json "strutvane.rebuild".
    { path: '.npmrc', content: 'ignore-scripts=true\n' },
    { path: 'strut.js', content: staticFile('strut.js') },
    // Machine-local (git-ignored): tells strut.js whether to forward commands into Docker.
    { path: '.strutvane/env.json', content: envJson(options) },
    { path: '.env', content: renderEnv(sections, { example: false }) },
    { path: '.env.example', content: renderEnv(sections, { example: true }) },
    { path: '.gitignore', content: GITIGNORE },
    { path: 'README.md', content: readme(options) },
    { path: 'AGENTS.md', content: agents(options) },
    ...stubFramework(),
    ...appFiles(options),
    ...dockerFiles(options),
  ]
  return files.sort((a, b) => a.path.localeCompare(b.path))
}

/** The stub dependency's version (the lockfile and its package.json must agree). */
const STUB_VERSION = '0.0.0-spike'

/** The driver package each server database needs (SQLite uses Node's built-in node:sqlite). */
const DRIVERS = Object.freeze({ mysql: 'mysql2', postgres: 'pg' } as const)

/** One locked package entry, as npm writes it in package-lock.json. */
type LockEntry = Readonly<Record<string, unknown>>

/** The pre-resolved driver lock fragments (see files/driver-locks.json for how they were made). */
interface DriverLocks {
  readonly drivers: Readonly<Record<string, { readonly version: string; readonly packages: Readonly<Record<string, LockEntry>> }>>
}

/** Read the driver lock fragments once. */
function driverLocks(): DriverLocks {
  return JSON.parse(staticFile('driver-locks.json')) as DriverLocks
}

/**
 * The database driver dependency for these options, pinned exactly, or none for SQLite.
 *
 * @example
 * driverDependency(options) // { name: 'mysql2', version: '3.24.6' }
 */
export function driverDependency(options: ProjectOptions): { readonly name: string; readonly version: string } | undefined {
  if (options.database === 'sqlite') return undefined
  const name = DRIVERS[options.database]
  const locked = driverLocks().drivers[name]
  if (locked === undefined) throw new Error(`No locked version of ${name} in driver-locks.json`)
  return { name, version: locked.version }
}

/** The app's dependencies: the framework (a local stub in the spike) and the database driver. */
function dependencies(options: ProjectOptions): Record<string, string> {
  const result: Record<string, string> = { '@strutvane/framework': 'file:stubs/strutvane-framework' }
  const driver = driverDependency(options)
  if (driver !== undefined) result[driver.name] = driver.version
  return result
}

/**
 * `.strutvane/env.json`: how this copy of the project runs. strut.js reads it to decide whether to
 * forward commands into the app container (Docker mode) or run them here.
 */
function envJson(options: ProjectOptions): string {
  return `${JSON.stringify({ mode: options.docker ? 'docker' : 'host', composeFile: 'docker/compose.yaml', service: 'app' }, null, 2)}
`
}

/**
 * The shipped `package-lock.json`. In the spike it pins the local stub; a release ships one tested
 * lockfile per preset, built from versions at least 3 days old.
 */
function lockfile(options: ProjectOptions): string {
  const lock = {
    name: options.name,
    version: '0.1.0',
    lockfileVersion: 3,
    requires: true,
    packages: {
      '': {
        name: options.name,
        version: '0.1.0',
        dependencies: dependencies(options),
        engines: { node: '>=24.3' },
      },
      'node_modules/@strutvane/framework': { resolved: 'stubs/strutvane-framework', link: true },
      ...driverPackages(options),
      'stubs/strutvane-framework': { name: '@strutvane/framework', version: STUB_VERSION },
    },
  }
  return `${JSON.stringify(lock, null, 2)}\n`
}

/** The locked packages of the chosen driver (resolved URLs and integrity hashes from npm). */
function driverPackages(options: ProjectOptions): Record<string, LockEntry> {
  const driver = driverDependency(options)
  if (driver === undefined) return {}
  return { ...driverLocks().drivers[driver.name]?.packages }
}

/** AGENTS.md: the short playbook AI coding agents read first (table stakes since Laravel 13). */
function agents(options: ProjectOptions): string {
  return `# AGENTS.md

This is a Strutvane app (TypeScript, MVC, npm only). Read this before changing code.

- Run project commands with \`node strut <command>\` (\`node strut help\` lists them). Never use pnpm or yarn.
- Columns live in migrations (\`database/migrations\`). Add a column with a new migration, then \`node strut migrate\`.
- Controllers: \`app/http/controllers\`. Models: \`app/models\`. Policies: \`app/policies\` (deny by default).
- Routes: \`routes/web.ts\` (pages) and \`routes/api.ts\` (served under /api/v1).
- Settings come from \`.env\` (never commit it). \`.env.example\` lists every key without secrets.
- ${options.docker ? 'Docker mode: every `node strut` command runs inside the app container (`node strut services:up` / `services:down`).' : 'Runs on this computer (no Docker).'} Database: ${options.database}.
- Before you finish: \`npm test\`.
`
}

/**
 * The spike's stand-in for `@strutvane/framework`, installed from a local folder (`file:`), so
 * `npm install` really runs but downloads nothing. The real package replaces it.
 */
function stubFramework(): GeneratedFile[] {
  return [
    {
      path: 'stubs/strutvane-framework/package.json',
      content: `${JSON.stringify(
        {
          name: '@strutvane/framework',
          version: STUB_VERSION,
          private: true,
          type: 'module',
          exports: { '.': './index.js', './cli': './cli.js' },
        },
        null,
        2,
      )}\n`,
    },
    { path: 'stubs/strutvane-framework/index.js', content: staticFile('stub-framework/index.js') },
    { path: 'stubs/strutvane-framework/cli.js', content: staticFile('stub-framework/cli.js') },
  ]
}

/** package.json with the scripts from the design (§3.6): everything goes through `node strut`. */
function packageJson(options: ProjectOptions): string {
  const scripts: Record<string, string> = {
    dev: 'node strut dev',
    build: 'node strut build',
    start: 'node build/server.js',
    test: 'node strut test',
  }
  if (options.testing === 'vitest-playwright') scripts['test:e2e'] = 'playwright test'
  // `npm install` first, so a fresh clone needs only this one command.
  // strut.js runs setup itself (no dependencies needed), so a fresh clone works too.
  scripts['setup'] = 'node strut setup'
  scripts['strut'] = 'node strut'
  const manifest = {
    name: options.name,
    version: '0.1.0',
    private: true,
    type: 'module',
    engines: { node: '>=24.3' },
    scripts,
    dependencies: dependencies(options),
    // The only dependencies whose install scripts may run (after `npm ci --ignore-scripts`, setup
    // runs `npm rebuild <these>`). A release lists the few that need it, e.g. "esbuild".
    strutvane: { rebuild: [] },
  }
  return `${JSON.stringify(manifest, null, 2)}\n`
}

/**
 * The generated `.gitignore`. The setup's git step checks with `git check-ignore` that every one
 * of these is really ignored before the first commit (security review F-17).
 */
const GITIGNORE = `node_modules/
build/

# Secrets and machine-local settings (every .env file except the example)
.env*
!.env.example

# Local Docker services (ADR-0006: never committed)
docker/

# Local data and installer state (SQLite -wal/-shm/-journal files hold data too)
database/*.sqlite*
storage/
.strutvane/
`

/** The README: the three commands a user needs, first. */
function readme(options: ProjectOptions): string {
  const docker = options.docker
    ? [
        '',
        '## Docker mode',
        '',
        'Everything runs in containers (like Laravel Sail): the app on node:24, the database and Mailpit',
        '(inbox: http://localhost:8025). `node strut <command>` on your computer runs the command inside the',
        'app container, so the three commands above work the same. The containers keep running in the',
        'background: `node strut services:down` stops them (your data stays), `node strut services:up`',
        'starts them again. `docker/compose.yaml` is git-ignored (Docker is local-only). On Windows, keep',
        'the project inside WSL2 for fast file watching.',
        '',
      ].join('\n')
    : ''
  return `# ${options.name}

A Strutvane app.

## The three commands you need

\`\`\`text
npm run dev        start the app on http://localhost:3000 (port from .env)
node strut help    every project command (make:model, migrate, db:seed, ...)
npm run setup      after git clone, or to finish a setup that stopped
\`\`\`
${docker}
## Where things are

- \`app/\`: controllers (\`app/http/controllers\`), models, policies
- \`routes/web.ts\`, \`routes/api.ts\`: routes
- \`database/\`: migrations, seeders, factories
- \`config/\`: settings (values come from \`.env\`)
${options.ui !== undefined ? '- `resources/ui/`: the React UI\n' : ''}`
}
