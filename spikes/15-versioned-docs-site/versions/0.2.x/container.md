---
title: Service Container
description: How Strutvane creates and shares services (the database, the logger, your own classes), how constructor injection works without decorators, and how to swap a service in tests.
---

The **service container** is the place where your app keeps its shared services, like the database connection, the logger or the clock, and builds the objects that need them. You ask for something by its key; the container builds it (once, or every time) and hands it over.

You'll rarely call the container yourself. You *will* use it when a controller needs a service in its constructor, when you register your own services in a provider, and when a test replaces a real service with a fake.

:::tip[Coming from Laravel?]
`app()->bind()`, `app()->singleton()`, `app()->instance()` and `app()->make()` are `container.bind()`, `.singleton()`, `.instance()` and `.make()`.

The big difference is **autowiring**. Laravel reads PHP type hints at runtime to know what a constructor needs. TypeScript erases types when it runs, and Strutvane doesn't use decorators or reflection, so a class **lists what it needs** in `static inject`. The compiler checks that list against the constructor, so the two can't drift apart.
:::

## The smallest example

Make a key (a **token**), bind something to it, and get it back:

```ts title="scripts/container-demo.ts"
import { Container, token } from '@strutvane/framework'

const Greeting = token<string>('Greeting')

const container = new Container()
container.singleton(Greeting, () => 'Hello from the container')

console.log(container.make(Greeting))
```

What you'll see:

```text
Hello from the container
```

`container.make(Greeting)` is typed as `string`, because the token says so.

## Tokens: typed keys

A **token** is a key that also carries the type of the value it stands for. You create one with `token<Type>('ReadableName')`:

```ts title="app/services/tokens.ts"
import { token } from '@strutvane/framework'

export interface Mailer {
  send(to: string, subject: string): Promise<void>
}

/** The app's mailer. The name shows up in error messages and `node strut about`. */
export const MailerToken = token<Mailer>('Mailer')
```

**Why tokens and not strings like `'mailer'`?** A string can't tell TypeScript what comes back. With a token, `container.make(MailerToken)` is a `Mailer`, and a typo is a compile error.

Strutvane binds a few tokens for you during boot:

| Token | What you get |
|---|---|
| `ConfigToken` | The loaded config (what `config()` reads) |
| `LoggerToken` | The logger (`info`, `warn`, `error`) |
| `ClockToken` | A function returning the current `Date` (what `now()` uses) |
| `ConnectionToken` | The database connection (when `config/database.ts` exists) |

## Three ways to bind

| Method | Runs the factory… | Use it for |
|---|---|---|
| `bind(key, factory)` | on **every** `make()` | Something fresh each time, like a request id |
| `singleton(key, factory)` | **once**, then reuses the value | Shared services: a mailer, a client, a cache |
| `instance(key, value)` | never (you pass the value) | Something you already built |

```ts title="app/providers/app.provider.ts"
import { randomUUID } from 'node:crypto'
import { ServiceProvider, token, type Application } from '@strutvane/framework'
import { MailerToken } from '../services/tokens.ts'
import { LogMailer } from '../services/log-mailer.ts'

export const RequestIdToken = token<string>('RequestId')

export class AppServiceProvider extends ServiceProvider {
  override register(app: Application): void {
    app.container.bind(RequestIdToken, () => randomUUID())          // new every time
    app.container.singleton(MailerToken, () => new LogMailer())     // one for the whole app
  }
}
```

The factory receives the container, so one service can be built from another:

```ts
app.container.singleton(ReportServiceToken, (container) => new ReportService(container.make(ConnectionToken)))
```

Check whether something is bound with `container.has(MailerToken)` (it returns `true` or `false`).

## Constructor injection with `static inject`

A class that needs services lists their keys in `static inject`, **in the same order** as its constructor parameters. The container reads the list, builds each dependency, and passes them in.

```ts title="app/http/controllers/stats.controller.ts"
import { ConnectionToken, Controller, type Connection, type HttpContext } from '@strutvane/framework'

export class StatsController extends Controller {
  static readonly inject = [ConnectionToken] as const
  readonly #db: Connection

  constructor(db: Connection) {
    super()
    this.#db = db
  }

  async show(ctx: HttpContext): Promise<Response> {
    const [posts] = await this.#db.select('SELECT COUNT(*) AS "total" FROM "posts" WHERE "deleted_at" IS NULL')
    return ctx.json({ data: { posts: Number(posts?.['total'] ?? 0) } })
  }
}
```

Route it as usual. Strutvane builds the controller through the container for each request:

```bash
curl http://localhost:3000/api/admin/stats -H "Authorization: Bearer <admin token>"
```

What you'll see:

```json
{ "data": { "posts": 5 } }
```

**Why `as const`?** It keeps the list's exact order and types, which is what lets the compiler compare it with the constructor. If the list and the constructor don't match (wrong order, wrong type, a missing entry), `make()` doesn't compile.

The same works for **middleware** and for **your own classes**: anything with `static inject` can be built with `container.make(TheClass)`. A class with no constructor parameters needs no `inject` at all.

## Getting a service

| Where you are | How to get it |
|---|---|
| In a provider | `app.container.make(MailerToken)` or `app.make(MailerToken)` |
| In a controller, middleware or your own class | Ask for it in `static inject` (preferred) |
| Anywhere during a request or command | `app().container.make(MailerToken)` (see [Helpers](../helpers/)) |

Prefer `static inject`: the class says up front what it depends on, and tests can see it.

## Swapping a service in tests

Because each app has its **own** container (nothing is global), a test can replace any service before the app boots. Strutvane only fills in its defaults (clock, logger, rate limit store) when you haven't bound them yourself:

```ts title="tests/feature/clock.test.ts"
import { expect, it } from 'vitest'
import { ClockToken, now } from '@strutvane/framework'
import { createApp } from '../../bootstrap/app.ts'

it('uses a frozen clock', async () => {
  const app = createApp({ APP_ENV: 'testing', APP_KEY: 'testing-key', DB_CONNECTION: 'sqlite', DB_DATABASE: ':memory:' })
  app.container.instance(ClockToken, () => new Date('2026-11-14T10:00:00Z'))
  await app.boot()

  expect(await app.run(() => now().toISOString())).toBe('2026-11-14T10:00:00.000Z')
})
```

What you'll see: the test passes, and every timestamp written through `now()` in that test is exactly `2026-11-14T10:00:00Z`.

## Common mistakes

### "Nothing is bound to … in the container"

```text
✖ Nothing is bound to "Mailer" in the container.
→ Bind it in a service provider's register() method, for example: app.container.singleton(MailerToken, () => …).
```

**Why:** you asked for a token nobody bound. (Classes are built automatically; tokens never are.)

**Fix:** bind it in a provider's `register()`:

```ts
app.container.singleton(MailerToken, () => new LogMailer())
```

### "These services depend on each other in a loop"

```text
✖ These services depend on each other in a loop: ReportService → Mailer → ReportService.
→ Break the loop by injecting a factory (() => service) instead of the service itself.
```

**Why:** A needs B and B needs A, so neither can be built first.

**Fix:** inject a function that builds the other service later:

```ts
app.container.singleton(MailerToken, (container) => new LogMailer(() => container.make(ReportServiceToken)))
```

### `make()` doesn't compile for my class

**Why:** the `static inject` list doesn't match the constructor (different order, a missing entry, or a wrong type), or you forgot `as const`.

**Fix:** write the list in the same order as the constructor parameters, and end it with `as const`:

```ts
static readonly inject = [ConnectionToken, LoggerToken] as const
constructor(db: Connection, logger: Logger) { … }
```

## Next steps

- [Service Providers](../providers/): where your bindings live.
- [Controllers](../controllers/): constructor injection in practice.
- [Helpers, Not Facades](../helpers/): reaching the container from anywhere.
