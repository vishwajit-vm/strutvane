/**
 * `node strut`: the command registry, help and errors, the inspect commands, the generators, and
 * the real `strut.js` entry run as a separate Node process.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { runConsole, type Output } from '#strutvane/console'
import { Application, ClockToken, LoggerToken, MemoryLogger } from '#strutvane/foundation'
import { client, refreshDatabase } from '#strutvane/testing'
import { exampleApp, removeQuietly, scratchDir, SLOW_TEST_TIMEOUT, testEnv } from './helpers.ts'

/** A path from a copied app back to a file of the spike, with forward slashes (tsconfig wants them). */
function toRoot(base: string, file: string): string {
  return relative(base, join(ROOT, file)).split(sep).join('/')
}

const ROOT = join(import.meta.dirname, '..')
const EXAMPLE = join(ROOT, 'fixtures', 'example-app')
// This file's own folder inside the spike, so `#strutvane/*` imports in copied apps resolve and
// no other test file's cleanup can delete these copies mid-run.
const SCRATCH = scratchDir('console')
afterAll(() => removeQuietly(SCRATCH))
let copies = 0

/** Captures command output. */
function buffer(): Output & { out: string[]; err: string[] } {
  const out: string[] = []
  const err: string[] = []
  return { out, err, line: (text = '') => out.push(text), error: (text) => err.push(text) }
}

/** A fresh copy of the example app that generators may write into. */
function appCopy(name: string): string {
  const target = join(SCRATCH, `${name}-${copies++}`)
  cpSync(EXAMPLE, target, { recursive: true, filter: (source) => !source.includes(`${join('example-app', 'tests')}`) })
  return target
}

const FIXED = (): Date => new Date('2026-11-14T09:30:00Z')

describe('the command registry, help and friendly errors', () => {
  it('lists commands grouped by namespace', async () => {
    const { app } = await exampleApp()
    const output = buffer()
    expect(await runConsole(app, [], { output })).toBe(0)
    const text = output.out.join('\n')
    expect(text).toContain('  route:list       List every registered route')
    expect(text).toContain(' make')
  })

  it('prints help for a command, from its declaration', async () => {
    const { app } = await exampleApp()
    const output = buffer()
    await runConsole(app, ['help', 'make:controller'], { output })
    const text = output.out.join('\n')
    expect(text).toContain('Usage: node strut make:controller <name> [options]')
    expect(text).toContain('-r, --resource')
    expect(text).toContain('--model=<value>')
  })

  it('suggests the closest command, option and argument fix', async () => {
    const { app } = await exampleApp()
    const unknown = buffer()
    expect(await runConsole(app, ['rout:list'], { output: unknown })).toBe(1)
    expect(unknown.err.join('\n')).toContain('Did you mean `node strut route:list`?')
    const option = buffer()
    expect(await runConsole(app, ['make:controller', 'PostController', '--resorce'], { output: option })).toBe(1)
    expect(option.err.join('\n')).toContain('make:controller has no --resorce option.\n  → Did you mean --resource?')
    const missing = buffer()
    expect(await runConsole(app, ['make:migration'], { output: missing })).toBe(1)
    expect(missing.err.join('\n')).toContain('make:migration needs <name>.')
  })
})

describe('inspect commands', () => {
  it('route:list shows every route, filters, and prints JSON', async () => {
    const { app } = await exampleApp()
    const table = buffer()
    await runConsole(app, ['route:list', '--path=posts'], { output: table })
    const text = table.out.join('\n')
    expect(text).toMatch(/POST\s+\/api\/posts\/\{post:slug\}\/publish\s+posts\.publish\s+PostController@publish\s+api, auth/)
    expect(text).toMatch(/PUT\|PATCH\s+\/api\/posts\/\{post:slug\}\s+posts\.update/)
    const json = buffer()
    await runConsole(app, ['route:list', '--json', '--name=admin'], { output: json })
    expect(JSON.parse(json.out.join('\n'))).toEqual([{ method: 'GET', uri: '/api/admin/stats', name: 'admin.stats', action: 'StatsController@show', middleware: 'api, auth, admin' }])
  })

  it('about summarises the app and never prints secrets', async () => {
    const { app } = await exampleApp()
    const output = buffer()
    await runConsole(app, ['about', '--json'], { output })
    const summary = JSON.parse(output.out.join('\n')) as { application: { name: string }; database: { connection: string; tables: string[] }; navigation: string[] }
    expect(summary.application.name).toBe('Blog Test')
    expect(summary.database).toMatchObject({ connection: 'sqlite', tables: ['authors', 'posts'] })
    expect(summary.navigation).toEqual(['Posts', 'Authors'])
    expect(output.out.join('\n')).not.toContain(testEnv.APP_KEY)
  })

  it('model:show describes columns from resources.json and suggests near misses', async () => {
    const { app } = await exampleApp()
    const output = buffer()
    await runConsole(app, ['model:show', 'Author'], { output })
    expect(output.out.join('\n')).toMatch(/api_token\s+string\?\s+yes/)
    const typo = buffer()
    expect(await runConsole(app, ['model:show', 'Authr'], { output: typo })).toBe(1)
    expect(typo.err.join('\n')).toContain('Did you mean "Author"?')
  })
})

describe('generators', () => {
  it('make:migration writes spike 10\'s format, always the model for create_*, plus seeder and factory', async () => {
    const base = appCopy('migration')
    const app = Application.configure({ basePath: base }).create()
    const output = buffer()
    expect(await runConsole(app, ['make:migration', 'create_blog_categories_table', '--seeder', '--factory'], { output, now: FIXED })).toBe(0)
    const migration = readFileSync(join(base, 'database', 'migrations', '2026_11_14_093000_create_blog_categories_table.ts'), 'utf8')
    expect(migration).toContain("import { migration } from '#strutvane/schema'")
    expect(migration).toContain("schema.create('blog_categories', (t) => {")
    expect(migration).toContain("schema.dropIfExists('blog_categories')")
    const model = readFileSync(join(base, 'app', 'models', 'blog-category.ts'), 'utf8')
    expect(model).toContain("export class BlogCategory extends Model('blog_categories') {")
    expect(model).toContain('static override readonly fillable: readonly string[] = []')
    expect(existsSync(join(base, 'database', 'seeders', 'blog-category.seeder.ts'))).toBe(true)
    expect(existsSync(join(base, 'database', 'factories', 'blog-category.factory.ts'))).toBe(true)
    expect(output.out).toContain('  Created app/models/blog-category.ts')
  })

  it('make:migration alters without a model, and explains bad names', async () => {
    const base = appCopy('alter')
    const app = Application.configure({ basePath: base }).create()
    await runConsole(app, ['make:migration', 'add_subtitle_to_posts_table'], { output: buffer(), now: FIXED })
    expect(readFileSync(join(base, 'database', 'migrations', '2026_11_14_093000_add_subtitle_to_posts_table.ts'), 'utf8')).toContain("schema.table('posts', (t) => {")
    expect(readdirSync(join(base, 'app', 'models')).sort()).toEqual(['author.ts', 'post.ts'])
    const bad = buffer()
    expect(await runConsole(app, ['make:migration', 'CreatePostsTable'], { output: bad })).toBe(1)
    expect(bad.err.join('\n')).toContain('node strut make:migration create_posts_table')
  })

  it('make:controller writes each variant, with a deny-all policy, and never overwrites without --force', async () => {
    const base = appCopy('controller')
    const app = Application.configure({ basePath: base }).create()
    const run = async (...argv: string[]): Promise<{ code: number; text: string }> => {
      const output = buffer()
      const code = await runConsole(app, argv, { output })
      return { code, text: [...output.out, ...output.err].join('\n') }
    }
    expect((await run('make:controller', 'ReportController')).code).toBe(0)
    expect(readFileSync(join(base, 'app', 'http', 'controllers', 'report.controller.ts'), 'utf8')).toContain('export class ReportController extends Controller {')
    const resource = await run('make:controller', 'CommentController', '--resource')
    expect(resource.text).toContain('Created app/policies/comment.policy.ts (denies everyone but admins until you edit it)')
    expect(resource.text).toContain("Route.resource('comments', CommentController)")
    const source = readFileSync(join(base, 'app', 'http', 'controllers', 'comment.controller.ts'), 'utf8')
    for (const action of ['index', 'create', 'store', 'show', 'edit', 'update', 'destroy']) expect(source).toContain(`async ${action}(ctx: HttpContext)`)
    expect(source.match(/await authorize\(this\.policy, /g)).toHaveLength(7)
    const policy = readFileSync(join(base, 'app', 'policies', 'comment.policy.ts'), 'utf8')
    expect(policy.match(/return false/g)).toHaveLength(5)
    expect((await run('make:controller', 'TagController', '--model=Tag')).code).toBe(0)
    expect(readFileSync(join(base, 'app', 'http', 'controllers', 'tag.controller.ts'), 'utf8')).toContain('extends ResourceController<typeof Tag>')
    const again = await run('make:controller', 'ReportController')
    expect(again.code).toBe(1)
    expect(again.text).toContain('add --force to overwrite it')
    expect((await run('make:controller', 'posts')).text).toContain('node strut make:controller PostsController')
    expect((await run('make:controller', 'PostController', '--api', '--resource')).code).toBe(1)
  })
})

describe('F-11: a generated, owned resource controller authorizes every action', () => {
  it('compiles under strict TypeScript and denies until the policy is edited', async () => {
    const base = appCopy('owned')
    rmSync(join(base, 'app', 'policies', 'post.policy.ts'))
    const generator = Application.configure({ basePath: base }).create()
    expect(await runConsole(generator, ['make:controller', 'PostController', '--api', '--force'], { output: buffer() })).toBe(0)
    writeFileSync(
      join(base, 'routes', 'api.ts'),
      "import { defineRoutes, Route } from '#strutvane/routing'\nimport { PostController } from '../app/http/controllers/post.controller.ts'\n\nexport default defineRoutes([Route.apiResource('posts', PostController, { bindBy: 'slug' }).middleware('auth:optional')])\n",
    )
    // The generated controller and policy must compile with the app (strict tsconfig, no `any`).
    writeFileSync(join(base, 'tsconfig.json'), JSON.stringify({ extends: toRoot(base, 'tsconfig.json'), include: [toRoot(base, 'src'), '**/*.ts', '.strutvane/types/*.d.ts'], exclude: ['tests', 'resources'] }))
    const tsc = spawnSync(process.execPath, [join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc'), '--noEmit', '-p', base], { encoding: 'utf8' })
    expect(tsc.stdout + tsc.stderr).toBe('')
    expect(tsc.status).toBe(0)

    const { createApp } = (await import(join(base, 'bootstrap', 'app.ts'))) as { createApp: (env: Record<string, string>) => Application }
    const { DatabaseSeeder, demoTokens } = (await import(join(base, 'database', 'seeders', 'database.seeder.ts'))) as { DatabaseSeeder: new () => { run(): Promise<void> }; demoTokens: Record<'admin' | 'alice' | 'bob', string> }
    const app = createApp({ ...testEnv })
    app.container.instance(LoggerToken, new MemoryLogger())
    app.container.instance(ClockToken, FIXED)
    await refreshDatabase(app)
    await app.run(() => new DatabaseSeeder().run())
    ;(await client(app).getJson('/api/posts')).assertProblem(403, 'forbidden')
    ;(await client(app).actingAs(demoTokens.alice).getJson('/api/posts/hello-world')).assertProblem(403, 'forbidden')
    ;(await client(app).actingAs(demoTokens.alice).patchJson('/api/posts/hello-world', { title: 'Mine?' })).assertProblem(403, 'forbidden')
    ;(await client(app).actingAs(demoTokens.alice).deleteJson('/api/posts/hello-world')).assertProblem(403, 'forbidden')
    ;(await client(app).actingAs(demoTokens.admin).getJson('/api/posts')).assertStatus(200).assertJsonPath('meta.total', 5)
    ;(await client(app).actingAs(demoTokens.admin).deleteJson('/api/posts/hello-world')).assertStatus(204)
  }, SLOW_TEST_TIMEOUT)
})

describe('the real `node strut` entry (strut.js), as a separate process', { timeout: SLOW_TEST_TIMEOUT }, () => {
  const env = { ...process.env, ...testEnv }
  const strut = (args: string[], extraEnv: Record<string, string | undefined> = env) => spawnSync(process.execPath, ['strut', ...args], { cwd: EXAMPLE, env: extraEnv, encoding: 'utf8' })

  it('runs route:list in plain Node (type stripping, no build step)', () => {
    const result = strut(['route:list', '--json'])
    expect(result.stderr).toBe('')
    expect(result.status).toBe(0)
    const names = (JSON.parse(result.stdout) as { name: string }[]).map((row) => row.name)
    expect(names).toContain('posts.publish')
    expect(names).toContain('admin.stats')
  })

  it('exits 1 with a suggestion for a typo', () => {
    const result = strut(['abuot'])
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Did you mean `node strut about`?')
  })

  it('lists every missing or wrong environment variable at once', () => {
    const { APP_KEY: _key, APP_DEBUG: _debug, ...rest } = env
    const result = strut(['about'], { ...rest, APP_DEBUG: 'yes' })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('APP_DEBUG must be true or false (got "yes") (read in config/app.ts)')
    expect(result.stderr).toContain('APP_KEY is required (a text value); add it to .env')
  })

  it('make:* commands work before .env is complete', () => {
    const base = appCopy('cli')
    const result = spawnSync(process.execPath, ['strut', 'make:controller', 'HelloController'], { cwd: base, env: { PATH: process.env['PATH'] ?? '' }, encoding: 'utf8' })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Created app/http/controllers/hello.controller.ts')
    expect(execFileSync(process.execPath, ['--version']).toString()).toMatch(/^v2[4-9]/)
  })
})
