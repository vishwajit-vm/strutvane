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
import { INSTALLED_FRAMEWORK_VERSION } from '../catalogue.ts'
import { answersOf, designInfo, otherDesign, type ProjectOptions, SECRET_ANSWERS } from '../options.ts'
import { projectPackages } from '../question-registry.ts'
import { VERSION } from '../version.ts'
import { appFiles, type GeneratedFile } from './app-files.ts'
import { dockerFiles } from './compose.ts'
import { buildEnvSections, renderEnv, type TypedSecrets } from './env.ts'
import { workflowFiles } from './workflow-files.ts'

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
    // Every answer (never a secret), so `node strut install:<name>` later knows what was picked.
    { path: 'strutvane.json', content: strutvaneJson(options) },
    ...(options.agents ? [{ path: 'AGENTS.md', content: agents(options) }] : []),
    ...stubPackages(options),
    ...appFiles(options),
    ...workflowFiles(options),
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

/**
 * Where the spike's stand-in for a package lives: `@strutvane/design-crisp` →
 * `stubs/strutvane-design-crisp`. Every package is pinned the same way (a local `file:` stub), so
 * `npm ci` keeps working offline; a release pins the real packages exactly, like the drivers.
 *
 * Why the strict check: the name becomes a folder. Registry names are fixed and catalogue names
 * are checked when the index is read, but a path must never be built from an unchecked string.
 *
 * @example
 * stubFolder('@strutvane/design-crisp') // 'stubs/strutvane-design-crisp'
 */
export function stubFolder(packageName: string): string {
  if (!/^(@strutvane\/[a-z0-9][a-z0-9-]{0,49}|strutvane-[a-z0-9][a-z0-9-]{0,49})$/.test(packageName)) {
    throw new Error(`Refusing an unexpected package name: ${packageName}`)
  }
  return `stubs/${packageName.replace(/^@/, '').replace('/', '-')}`
}

/**
 * Every package the answers bring (read from the question registry's data, never a hard-coded
 * list), the framework first.
 */
export function packagesFor(options: ProjectOptions): string[] {
  return projectPackages(answersOf(options))
}

/** The app's dependencies: every Strutvane package (local stubs in the spike), and the driver. */
function dependencies(options: ProjectOptions): Record<string, string> {
  const result: Record<string, string> = {}
  for (const name of packagesFor(options)) result[name] = `file:${stubFolder(name)}`
  const driver = driverDependency(options)
  if (driver !== undefined) result[driver.name] = driver.version
  return result
}

/**
 * `strutvane.json`: the installer's answers, committed with the app. `node strut install:<name>`
 * and `node strut add` read it to know what was picked. Built from the resolved options, which
 * never hold a secret; the typed passwords are removed again anyway, so a future option can
 * never leak one here by accident.
 */
function strutvaneJson(options: ProjectOptions): string {
  const { directory: _directory, ...rest } = options
  const answers: Record<string, unknown> = { ...answersOf(rest) }
  for (const key of SECRET_ANSWERS) delete answers[key]
  const manifest = {
    version: 1,
    createdWith: `create-strutvane ${VERSION}`,
    framework: INSTALLED_FRAMEWORK_VERSION,
    answers,
    packages: packagesFor(options),
  }
  return `${JSON.stringify(manifest, null, 2)}\n`
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
      ...stubLockEntries(options),
      ...driverPackages(options),
    },
  }
  return `${JSON.stringify(lock, null, 2)}\n`
}

/** Each stub's lock entries: a link from node_modules to its local folder, and the folder itself. */
function stubLockEntries(options: ProjectOptions): Record<string, LockEntry> {
  const entries: Record<string, LockEntry> = {}
  for (const name of packagesFor(options)) {
    entries[`node_modules/${name}`] = { resolved: stubFolder(name), link: true }
    entries[stubFolder(name)] = { name, version: STUB_VERSION }
  }
  return entries
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
 * The spike's stand-ins for the Strutvane packages, installed from local folders (`file:`), so
 * `npm install` really runs but downloads nothing. `@strutvane/framework` carries the working stub
 * (migrations, seeders, `node strut`); every other package only names itself, which is enough to
 * prove the dependency list installs. The real packages replace these folders.
 */
function stubPackages(options: ProjectOptions): GeneratedFile[] {
  return packagesFor(options).flatMap((name): GeneratedFile[] => {
    const folder = stubFolder(name)
    const framework = name === '@strutvane/framework'
    const manifest = {
      name,
      version: STUB_VERSION,
      private: true,
      type: 'module',
      exports: framework ? { '.': './index.js', './cli': './cli.js' } : { '.': './index.js' },
    }
    const files: GeneratedFile[] = [{ path: `${folder}/package.json`, content: `${JSON.stringify(manifest, null, 2)}\n` }]
    if (framework) {
      files.push(
        { path: `${folder}/index.js`, content: staticFile('stub-framework/index.js') },
        { path: `${folder}/cli.js`, content: staticFile('stub-framework/cli.js') },
        { path: `${folder}/db.js`, content: staticFile('stub-framework/db.js') },
      )
    } else {
      files.push({ path: `${folder}/index.js`, content: `// SPIKE STUB of ${name} (spike 13). The real package replaces this folder.\nexport const stub = ${JSON.stringify(name)}\n` })
    }
    return files
  })
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

# Local Sail-style Docker services (ADR-0006: git-ignored). A production Dockerfile or a
# .devcontainer/ is different: committed when you choose it (ADR-0021).
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
        'app container, so the three commands above work the same: `npm run dev` (API, UI dev server, queue',
        'worker, scheduler), `migrate` and every other command run in the container.',
        '',
        '```text',
        'node strut shell            a shell inside the app container (bash, or sh when there is none)',
        'node strut npm install x    npm inside the container (also: node strut npx ..., node strut node ...)',
        'node strut services:down    stop the containers (your data stays); services:up starts them',
        '```',
        '',
        'Arguments are passed as they are (no shell in between) and the exit code comes back to you.',
        '`docker/compose.yaml` is local only and git-ignored (ADR-0006). On Windows, keep the project inside',
        'WSL2 for fast file watching.',
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
${options.ui !== undefined ? '- `resources/ui/`: the React UI\n' : ''}- \`strutvane.json\`: what you picked in the installer (read by \`node strut install:<name>\`)
${signInSection(options)}${designSection(options)}${deploySection(options)}`
}

/** How sign-in works in this app, in one or two sentences. */
function signInSection(options: ProjectOptions): string {
  const admin = options.adminEmail ?? ''
  const text =
    options.auth === 'none'
      ? 'There is no sign-in. The API is still closed by default: every request needs an API token\n(`node strut token:create`); a route opts out only explicitly.'
      : options.auth === 'magic-link'
        ? `People sign in with a single-use link sent by email (valid 15 minutes). First admin: ${admin}.`
        : `People sign in with email and password. First admin: ${admin}\n(\`node strut user:password <email>\` sets a new one-time password).`
  return `\n## Sign-in\n\n${text}\n`
}

/** Where the deploy recipe and the opt-in container files are. */
function deploySection(options: ProjectOptions): string {
  const lines: string[] = []
  if (options.deploy !== 'later') lines.push('- `deploy/README.md`: how to deploy; the app answers `GET /up` for health checks.')
  if (options.deploy === 'docker') {
    lines.push('- `Dockerfile` + `.dockerignore`: the production image (non-root, no secrets inside; ADR-0021). Regenerate: `node strut docker:prod`.')
  }
  if (options.devContainer) lines.push('- `.devcontainer/`: open the project in Codespaces or VS Code Dev Containers (ADR-0021).')
  return lines.length === 0 ? '' : `\n## Deploy and containers\n\n${lines.join('\n')}\n`
}

/** The README's "Design" section: which design is installed, how to restyle it, how to switch. */
function designSection(options: ProjectOptions): string {
  if (options.design === undefined) return ''
  const other = otherDesign(options.design)
  const switchLine =
    other === undefined
      ? ''
      : `\nTo switch design later: \`node strut design:use ${other}\` (it swaps the package and updates\n\`config/ui.ts\`; your \`resources/ui/theme.css\` stays as it is).\n`
  return `
## Design

The React UI uses the **${options.design}** design (\`${designInfo(options.design).packageName}\`, set in
\`config/ui.ts\`). Your own brand colour, font and corner radius go in \`resources/ui/theme.css\`.
${switchLine}`
}
