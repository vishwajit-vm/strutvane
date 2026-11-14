/**
 * What the answers turn into: strutvane.json, package.json, config files, and the opt-in
 * container files (ADR-0021). Plus the secrets rules: nothing secret in a committed file, and the
 * installer never asks for an API key.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { createServer } from 'node:net'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { main } from '../src/main.ts'
import { type Answers, type ProjectOptions, resolveOptions } from '../src/options.ts'
import { askMissing } from '../src/questions.ts'
import { isForbiddenInCommit } from '../src/steps/git.ts'
import { parseEnv } from '../src/env-file.ts'
import { renderProject } from '../src/templates/project.ts'
import { DOCKERIGNORE } from '../src/templates/workflow-files.ts'
import { CUSTOM_ANSWERS, fakeEnvironment, scriptedPrompter, tempFolder } from './helpers/fakes.ts'
import { fakePrograms } from './helpers/programs.ts'

const options = (answers: Answers = {}): ProjectOptions => resolveOptions({ name: 'acme-portal', ...answers }, '/code')
const files = (answers: Answers = {}) => renderProject(options(answers))
const file = (project: ReturnType<typeof renderProject>, path: string): string => {
  const found = project.find((f) => f.path === path)
  if (found === undefined) throw new Error(`${path} was not generated`)
  return found.content
}
const paths = (answers: Answers = {}) => files(answers).map((f) => f.path)

/** Every file under a folder, as POSIX paths relative to it. */
function walk(root: string, folder = root): string[] {
  return readdirSync(folder).flatMap((name) => {
    const full = join(folder, name)
    if (name === 'node_modules') return []
    return statSync(full).isDirectory() ? walk(root, full) : [relative(root, full).replaceAll('\\', '/')]
  })
}

describe('strutvane.json', () => {
  it('records every answer, defaults included, the packages, and the versions', () => {
    const manifest = JSON.parse(file(files({ teams: true, features: ['billing'] }), 'strutvane.json')) as Record<string, unknown> & {
      answers: Record<string, unknown>
      packages: string[]
    }
    expect(manifest).toMatchObject({ version: 1, createdWith: 'create-strutvane 0.0.0-spike.13', framework: '0.1.0' })
    expect(manifest.answers).toMatchObject({
      name: 'acme-portal', mode: 'recommended', stack: 'full', design: 'crisp', auth: 'email', security: ['2fa', 'verification'],
      teams: true, database: 'postgres', docker: true, deploy: 'later', features: ['billing'],
      featureOptions: { 'billing.provider': 'stripe' }, activityLog: true, devContainer: false,
    })
    expect(manifest.answers).not.toHaveProperty('directory')
    expect(manifest.packages[0]).toBe('@strutvane/framework')
    expect(manifest.packages).toContain('@strutvane/billing')
  })

  it('package.json depends on exactly the packages strutvane.json lists (plus the driver)', () => {
    const project = files({ cache: 'redis', monitoring: 'otel' })
    const { packages } = JSON.parse(file(project, 'strutvane.json')) as { packages: string[] }
    const { dependencies } = JSON.parse(file(project, 'package.json')) as { dependencies: Record<string, string> }
    expect(Object.keys(dependencies).sort()).toEqual([...packages, 'mysql2'].sort())
    const lock = JSON.parse(file(project, 'package-lock.json')) as { packages: Record<string, unknown> }
    for (const name of packages) expect(lock.packages[`node_modules/${name}`], name).toEqual({ resolved: `stubs/${name.slice(1).replace('/', '-')}`, link: true })
  })
})

describe('secrets: never asked for, never in a committed file', () => {
  it('a Custom run with every feature on never prompts for an API key, secret or token', async () => {
    const { prompter, prompts } = scriptedPrompter({
      ...CUSTOM_ANSWERS, ai: true, aiProvider: 'anthropic', social: ['google'], teams: true, sso: true, database: 'postgres', storage: 's3',
      mailer: 'postmark', features: ['billing', 'search', 'ai-sdk'], 'billing.provider': 'stripe', 'search.engine': 'meilisearch', 'ai-sdk.provider': 'openai',
      monitoring: 'otel', deploy: 'docker', devContainer: true,
    })
    await askMissing({}, prompter, { cwd: '/code', targetProblem: () => undefined })
    // The only free-text/masked prompts are the ones the blueprint allows (names, admin email, locale...).
    const typed = prompts.filter((p) => p.kind !== 'choice')
    expect(typed.map((p) => p.id)).toEqual(['name', 'adminEmail', 'locale', 'timezone', 'currency'])
    for (const prompt of prompts) expect(prompt.message, prompt.id).not.toMatch(/\b(api[\s_-]?key|secret|token|credential)s?\b/i)
  })

  it('AI keys get an empty line in .env and .env.example, and the secrets step never fills them', async () => {
    const cwd = tempFolder()
    const { environment } = fakeEnvironment({ cwd, argv: ['acme', '--yes', '--db', 'sqlite', '--ai', '--ai-provider', 'openai'], spawn: fakePrograms().spawn })
    expect(await main(environment)).toBe(0)
    const env = parseEnv(readFileSync(join(cwd, 'acme', '.env'), 'utf8'))
    expect(env.get('OPENAI_API_KEY')).toBe('')
    expect(env.get('AI_PROVIDER')).toBe('openai')
    expect(parseEnv(readFileSync(join(cwd, 'acme', '.env.example'), 'utf8')).get('OPENAI_API_KEY')).toBe('')
  })

  it('typed passwords (CI variables) reach only .env (database) or the seeder (admin), never strutvane.json or setup.json', async () => {
    const cwd = tempFolder()
    const world = fakePrograms()
    const dbPassword = 'Db-Pass-For-Test-9183'
    const adminPassword = 'Admin-Pass-For-Test-5521'
    // A real listening socket stands in for "your own MySQL server", so the database step passes.
    const server = createServer((socket) => socket.end())
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
    const address = server.address()
    const port = typeof address === 'object' && address !== null ? address.port : 0
    const { environment, output } = fakeEnvironment({
      cwd,
      argv: ['acme', '--yes', '--no-docker', '--db-host', '127.0.0.1', '--db-port', String(port), '--admin-password', 'type'],
      env: { STRUT_DB_PASSWORD: dbPassword, STRUT_ADMIN_PASSWORD: adminPassword },
      spawn: world.spawn,
      isPortFree: async () => true,
    })
    try {
      expect(await main(environment)).toBe(0)
    } finally {
      server.close()
    }
    const project = join(cwd, 'acme')
    for (const path of walk(project)) {
      const text = readFileSync(join(project, path), 'utf8')
      expect(text.includes(adminPassword), path).toBe(false)
      if (path !== '.env') expect(text.includes(dbPassword), path).toBe(false)
    }
    expect(parseEnv(readFileSync(join(project, '.env'), 'utf8')).get('DB_PASSWORD')).toBe(dbPassword)
    // The typed admin password went to the seeder through the environment only, and is not shown.
    const migrate = world.calls.find((call) => call.args.includes('migrate'))
    expect(migrate?.env).toEqual({ STRUT_SEED_ADMIN_PASSWORD: adminPassword })
    expect(migrate?.args.join(' ')).not.toContain(adminPassword)
    expect(output()).not.toContain(adminPassword)
    expect(output()).toContain('the one you typed')
  })

  it('"type it" without a terminal and without STRUT_ADMIN_PASSWORD stops before writing anything', async () => {
    const cwd = tempFolder()
    const { environment, output } = fakeEnvironment({ cwd, argv: ['acme', '--yes', '--db', 'sqlite', '--admin-password', 'type'] })
    expect(await main(environment)).toBe(1)
    expect(output()).toMatch(/STRUT_ADMIN_PASSWORD/)
    expect(readdirSync(cwd)).toEqual([])
  })

  it('public registration is off by default', () => {
    expect(parseEnv(file(files(), '.env.example')).get('AUTH_REGISTRATION')).toBe('false')
    expect(parseEnv(file(files({ security: ['registration'] }), '.env')).get('AUTH_REGISTRATION')).toBe('true')
  })

  it('no sign-in: the API requires tokens (deny by default), and the summary says how to get one', async () => {
    const project = files({ auth: 'none' })
    expect(file(project, 'config/api.ts')).toContain('"requireToken": true')
    expect(file(project, 'config/api.ts')).toContain('"access": "tokens"')
    expect(file(files(), 'config/api.ts')).toContain('"requireToken": false')
    expect(file(project, 'README.md')).toMatch(/every request needs an API token/)
    const cwd = tempFolder()
    const { environment, output } = fakeEnvironment({ cwd, argv: ['acme', '--yes', '--db', 'sqlite', '--auth', 'none'], spawn: fakePrograms().spawn })
    expect(await main(environment)).toBe(0)
    expect(output()).toMatch(/API\s+every request needs an API token. Create one: node strut token:create/)
  })

  it('email-link sign-in: an admin, no password shown, nullable password column', async () => {
    expect(file(files({ auth: 'magic-link' }), 'database/migrations/0001_01_01_000000_create_users_table.ts')).toContain("t.string('password').nullable()")
    const cwd = tempFolder()
    const { environment, output } = fakeEnvironment({ cwd, argv: ['acme', '--db', 'sqlite', '--auth', 'magic-link'], interactiveTerminal: true, prompter: scriptedPrompter({ mode: 'recommended', stack: 'full', design: 'crisp', teams: false, docker: 'host', agents: true, review: 'create', dev: false }).prompter, spawn: fakePrograms().spawn })
    expect(await main(environment)).toBe(0)
    expect(output()).toMatch(/Admin\s+admin@acme.test \(signs in with an emailed link; no password\)/)
    expect(output()).not.toContain('Abcd-Efgh-Jkmn-Pqrs')
  })
})

describe('container files (ADR-0021: committed only when chosen)', () => {
  const containerPath = /(^|\/)(Dockerfile|\.dockerignore|\.devcontainer\/.*)$/

  it('none by default; the Dockerfile only for "Docker image"; the dev container only when chosen', () => {
    expect(paths().filter((p) => containerPath.test(p))).toEqual([])
    expect(paths({ deploy: 'node' }).filter((p) => containerPath.test(p))).toEqual([])
    expect(paths({ deploy: 'docker' }).filter((p) => containerPath.test(p))).toEqual(['.dockerignore', 'Dockerfile'])
    expect(paths({ devContainer: true }).filter((p) => containerPath.test(p))).toEqual(['.devcontainer/compose.yaml', '.devcontainer/devcontainer.json'])
  })

  it('the Dockerfile: multi-stage, pinned Node major, npm ci, only build/ + prod deps, non-root USER, HEALTHCHECK on /up', () => {
    const dockerfile = file(files({ deploy: 'docker' }), 'Dockerfile')
    expect(dockerfile.match(/^FROM /gm)).toHaveLength(3)
    expect(dockerfile).toMatch(/^FROM node:24-bookworm-slim AS build$/m)
    expect(dockerfile).toContain('RUN npm ci --ignore-scripts')
    expect(dockerfile).toContain('RUN npm ci --omit=dev --ignore-scripts')
    expect(dockerfile).toMatch(/^USER node$/m)
    expect(dockerfile).toMatch(/^HEALTHCHECK .*\n.*\/up/m)
    // The last stage copies only node_modules (prod), the stub packages, build/ and package.json.
    const runStage = dockerfile.slice(dockerfile.lastIndexOf('\nFROM '))
    const copies = runStage.split('\n').filter((line) => line.startsWith('COPY'))
    expect(copies.map((line) => line.split(' ').at(-1))).toEqual(['./node_modules', './stubs', './build', './'])
    expect(runStage.indexOf('USER node')).toBeLessThan(runStage.indexOf('CMD'))
  })

  it('container files never contain or copy a secret, and never copy .env', () => {
    const project = files({ deploy: 'docker', devContainer: true, database: 'postgres', ai: true })
    for (const path of ['Dockerfile', '.dockerignore', '.devcontainer/devcontainer.json', '.devcontainer/compose.yaml']) {
      const text = file(project, path)
      expect(text, path).not.toMatch(/COPY[^\n]*\.env/)
      expect(text, path).not.toMatch(/(PASSWORD|SECRET|APP_KEY|API_KEY|TOKEN)\s*[=:]\s*\S/)
      expect(text, path).not.toMatch(/secret-\d{3}|Abcd-Efgh/)
    }
    // The dev container reads ../.env at runtime (optional), it does not copy it.
    expect(file(project, '.devcontainer/compose.yaml')).toMatch(/env_file:\n\s+- path: \.\.\/\.env\n\s+required: false/)
  })

  it('.dockerignore always excludes .env*, .git, node_modules, storage/ and tests', () => {
    const lines = DOCKERIGNORE.split('\n')
    for (const required of ['.env*', '.git', 'node_modules', 'storage/', 'tests/', '**/*.test.ts']) expect(lines, required).toContain(required)
    expect(lines.some((line) => line.startsWith('!.env'))).toBe(false)
  })

  it('a deploy target writes a recipe and the public /up route', () => {
    for (const deploy of ['node', 'docker'] as const) {
      const project = files({ deploy })
      expect(file(project, 'deploy/README.md')).toContain('/up')
      expect(file(project, 'routes/web.ts')).toContain("router.get('/up', () => 'up')")
    }
    expect(file(files(), 'routes/web.ts')).not.toContain('/up')
  })

  it('container files are committed; the local Sail-style compose stays git-ignored (ADR-0006)', () => {
    for (const path of ['Dockerfile', '.dockerignore', '.devcontainer/devcontainer.json']) expect(isForbiddenInCommit(path), path).toBe(false)
    expect(isForbiddenInCommit('docker/compose.yaml')).toBe(true)
    expect(file(files(), '.gitignore')).toMatch(/^docker\/$/m)
  })
})

describe('config files follow the answers', () => {
  it('records each answer where the packages read it', () => {
    const project = files({
      cache: 'redis', storage: 's3', mailer: 'ses', locale: 'de', timezone: 'Europe/Berlin', currency: 'EUR', roles: 'extended', teams: true,
      tenantResolver: 'subdomain', securityProfile: 'strict', activityLog: false, monitoring: 'otel', ai: true, aiProvider: 'ollama', mcpServer: true,
      appearance: 'dark', uiLanguages: ['en', 'de'], pwa: true, liveUpdates: true, social: ['github'], sso: true,
    })
    expect(file(project, 'config/cache.ts')).toContain('"store": "redis"')
    expect(file(project, 'config/filesystems.ts')).toContain('"default": "s3"')
    expect(file(project, 'config/mail.ts')).toContain('"production": "ses"')
    expect(file(project, 'config/app.ts')).toMatch(/locale: "de",\n\s+timezone: "Europe\/Berlin",\n\s+currency: "EUR"/)
    expect(file(project, 'config/permissions.ts')).toContain('"manager"')
    expect(file(project, 'config/tenancy.ts')).toContain('resolver: "subdomain"')
    expect(file(project, 'config/security.ts')).toMatch(/"profile": "strict",\n\s+"activityHistory": false/)
    expect(file(project, 'config/monitoring.ts')).toContain('"exporter": "otel"')
    expect(file(project, 'config/ai.ts')).toMatch(/"provider": "ollama",\n\s+"mcpServer": true/)
    expect(file(project, 'config/ui.ts')).toMatch(/appearance: "dark",[\s\S]*languages: \["en","de"\],[\s\S]*pwa: true,[\s\S]*liveUpdates: true/)
    expect(file(project, 'config/auth.ts')).toMatch(/social: \["github"\],\n\s+enterpriseSso: true/)
    expect(parseEnv(file(project, '.env')).get('OLLAMA_HOST')).toBe('http://127.0.0.1:11434')
  })

  it('CI workflow only with git + CI; editor settings only with editor setup; AGENTS.md only with AI assistants', () => {
    expect(paths()).toEqual(expect.arrayContaining(['.github/workflows/ci.yml', '.vscode/settings.json', '.vscode/extensions.json', 'AGENTS.md']))
    expect(paths({ ci: false, editor: false, agents: false }).filter((p) => /^(\.github|\.vscode|AGENTS)/.test(p))).toEqual([])
    expect(paths({ git: false })).not.toContain('.github/workflows/ci.yml')
    expect(file(files(), '.github/workflows/ci.yml')).toMatch(/permissions:\n\s+contents: read[\s\S]*npm ci --ignore-scripts[\s\S]*npm test/)
  })

  it('sample data writes its own seeder only when chosen', () => {
    expect(paths()).toContain('database/seeders/sample-data-seeder.ts')
    expect(paths({ sampleData: false })).not.toContain('database/seeders/sample-data-seeder.ts')
  })
})
