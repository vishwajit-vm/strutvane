/**
 * The foundation: container, env, config, providers and the boot lifecycle.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { Application, ConfigError, Container, defineConfig, loadConfig, loadEnvSource, ServiceProvider, StrutvaneError, token } from '#strutvane/foundation'
import { defineRoutes, Route } from '#strutvane/routing'
import { config } from '../fixtures/example-app/config/index.ts'
import { testEnv } from './helpers.ts'

const temporary: string[] = []
afterEach(() => {
  for (const folder of temporary.splice(0)) rmSync(folder, { recursive: true, force: true })
})

describe('Container', () => {
  it('binds, makes singletons once and transients every time', () => {
    const container = new Container()
    const Counter = token<{ n: number }>('Counter')
    let built = 0
    container.singleton(Counter, () => ({ n: (built += 1) }))
    expect(container.make(Counter)).toBe(container.make(Counter))
    const Fresh = token<object>('Fresh')
    container.bind(Fresh, () => ({}))
    expect(container.make(Fresh)).not.toBe(container.make(Fresh))
    expect(built).toBe(1)
  })

  it('builds unbound classes from their inject list', () => {
    const container = new Container()
    const Greeting = token<string>('Greeting')
    container.instance(Greeting, 'hello')
    class Greeter {
      static readonly inject = [Greeting] as const
      readonly text: string
      constructor(text: string) {
        this.text = text
      }
    }
    expect(container.make(Greeter).text).toBe('hello')
  })

  it('explains an unbound token and a dependency loop', () => {
    const container = new Container()
    const Missing = token<string>('Mailer')
    expect(() => container.make(Missing)).toThrow(/Nothing is bound to "Mailer"/)
    const A = token<unknown>('A')
    const B = token<unknown>('B')
    container.bind(A, (c) => c.make(B))
    container.bind(B, (c) => c.make(A))
    expect(() => container.make(A)).toThrow(/A → B → A/)
  })
})

describe('Env and config', () => {
  it('reads typed values and collects every problem at once', () => {
    const files = { app: defineConfig((env) => ({ debug: env.boolean('APP_DEBUG'), port: env.integer('PORT'), mode: env.oneOf('MODE', ['a', 'b']), url: env.url('URL') })) }
    let error: unknown
    try {
      loadConfig(files, { APP_DEBUG: 'yes', PORT: '80x', URL: 'not a url' })
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(ConfigError)
    const problems = (error as ConfigError).problems.map((problem) => problem.key)
    expect(problems).toEqual(['APP_DEBUG', 'PORT', 'MODE', 'URL'])
    expect((error as ConfigError).message).toContain('APP_DEBUG must be true or false (got "yes") (read in config/app.ts)')
  })

  it('accepts Laravel-style values, empties as unset, and fallbacks', () => {
    const files = { app: defineConfig((env) => ({ a: env.boolean('A'), b: env.boolean('B', true), c: env.string('C', 'fallback'), d: env.optional('D') })) }
    const repository = loadConfig(files, { A: '1', C: '' })
    expect(repository.get('app')).toEqual({ a: true, b: true, c: 'fallback', d: undefined })
  })

  it('refuses unknown keys and freezes the tree', () => {
    const repository = loadConfig(config, testEnv)
    expect(repository.get('database.connections.sqlite.database')).toBe(':memory:')
    expect(() => repository.get('app.nmae')).toThrow(/no config value at "app.nmae"/)
    expect(Object.isFrozen(repository.get('database.connections'))).toBe(true)
  })

  it('defaults to MySQL with Laravel env keys', () => {
    const repository = loadConfig(config, { APP_KEY: 'k' })
    expect(repository.get('database.default')).toBe('mysql')
    expect(repository.get('database.connections.mysql')).toEqual({ driver: 'mysql', host: '127.0.0.1', port: 3306, database: 'strutvane', username: 'root', password: undefined })
  })

  it('reads .env from the base path, with the real environment winning', () => {
    const folder = mkdtempSync(join(tmpdir(), 'strut-env-'))
    temporary.push(folder)
    writeFileSync(join(folder, '.env'), 'APP_NAME="From file"\nAPP_KEY=file-key\n')
    expect(loadEnvSource(folder, { APP_KEY: 'override' })).toEqual({ APP_NAME: 'From file', APP_KEY: 'override' })
  })
})

describe('Application lifecycle', () => {
  it('registers every provider before booting any', async () => {
    const order: string[] = []
    const Flag = token<string>('Flag')
    class First extends ServiceProvider {
      override register(app: Application): void {
        order.push('first.register')
        app.container.instance(Flag, 'bound by first')
      }
      override boot(): void {
        order.push('first.boot')
      }
    }
    class Second extends ServiceProvider {
      override register(): void {
        order.push('second.register')
      }
      override boot(app: Application): void {
        order.push(`second.boot sees ${app.make(Flag)}`)
      }
    }
    const app = Application.configure({ basePath: tmpdir(), env: testEnv }).withConfig(config).withProviders([First, Second]).create()
    await app.boot()
    await app.boot() // idempotent
    expect(order).toEqual(['first.register', 'second.register', 'first.boot', 'second.boot sees bound by first'])
  })

  it('lets a package provider add routes, commands and navigation', async () => {
    class BillingProvider extends ServiceProvider {
      override register(app: Application): void {
        app.addRoutes(defineRoutes([Route.get('/plans', (ctx) => ctx.json({ plans: ['basic'] })).name('billing.plans')]), { prefix: '/api/billing', group: 'api' })
        app.addCommand({ name: 'billing:sync', description: 'Sync plans', run: () => 0 })
      }
      override boot(app: Application): void {
        app.navigation.add({ label: 'Billing', route: 'billing.plans', group: 'Account' })
      }
    }
    const app = Application.configure({ basePath: tmpdir(), env: testEnv }).withConfig(config).withProviders([BillingProvider]).create()
    const response = await app.handle(new Request('http://localhost/api/billing/plans'))
    expect(await response.json()).toEqual({ plans: ['basic'] })
    expect(app.url.route('billing.plans')).toBe('/api/billing/plans')
    expect(app.commands.map((command) => command.name)).toContain('billing:sync')
    expect(app.navigation.items).toEqual([{ label: 'Billing', route: 'billing.plans', group: 'Account' }])
    expect(() => app.addRoutes(defineRoutes([]))).toThrow(StrutvaneError)
  })

  it('fails boot with every bad environment variable listed', async () => {
    const app = Application.configure({ basePath: tmpdir(), env: { APP_DEBUG: 'maybe' } }).withConfig(config).create()
    await expect(app.boot()).rejects.toThrow(/APP_DEBUG must be true or false[\s\S]*APP_KEY is required/)
  })

  it('refuses to be used before boot, with the fix in the message', () => {
    const app = Application.configure({ basePath: tmpdir() }).create()
    expect(() => app.routes).toThrow(expect.objectContaining({ code: 'NOT_BOOTED', hint: 'Call `await app.boot()` first (requests and commands do it for you).' }))
  })
})
