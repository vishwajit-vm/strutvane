---
title: Service Providers
description: Service providers are where your app (and every package) plugs itself in. Learn the register-then-boot order, what belongs in each, and how packages add routes, commands and menu entries.
---

A **service provider** is a small class that sets up one part of your app when it starts. It can put services into the [container](../container/), add routes, add `node strut` commands, and add entries to the sidebar of the React UI.

Every app has at least one, `AppServiceProvider`, and every package you install brings its own. They're all listed, in order, in `bootstrap/providers.ts`.

:::tip[Coming from Laravel?]
Same idea, same two methods: `register()` binds, `boot()` uses. `bootstrap/providers.ts` is Laravel 11's `bootstrap/providers.php`.

One difference: there is **no auto-discovery** from `node_modules`. A package's installer adds its provider line to `bootstrap/providers.ts`, so the file always shows exactly what runs when your app starts.
:::

## The smallest example

```ts title="app/providers/app.provider.ts"
import { ServiceProvider, type Application } from '@strutvane/framework'

/** The app's own provider, Laravel's AppServiceProvider. */
export class AppServiceProvider extends ServiceProvider {
  override boot(app: Application): void {
    app.navigation.add({ label: 'Posts', route: 'posts.index', order: 10 })
  }
}
```

```ts title="bootstrap/providers.ts"
import type { ProviderClass } from '@strutvane/framework'
import { AppServiceProvider } from '../app/providers/app.provider.ts'

/** The app's service providers. Package installers append here. */
export const providers: ProviderClass[] = [AppServiceProvider]
```

What you'll see: run `node strut about` and the navigation section lists your entry:

```text
  Navigation
    Posts
```

## Register, then boot

When the app boots, Strutvane runs providers in **two rounds**:

1. **`register(app)` on every provider**, in the order of `bootstrap/providers.ts`.
2. **`boot(app)` on every provider**, in the same order.

| Method | Do here | Don't do here |
|---|---|---|
| `register(app)` | Bind services (`app.container.singleton(…)`), add routes (`app.addRoutes(…)`), add commands | Use other services: they may not be registered yet |
| `boot(app)` | Use services, read config, add navigation entries | Add routes (it's too late, they're already compiled) |

**Why two rounds?** So no provider ever sees a half-built app. By the time any `boot()` runs, every provider has registered everything.

Both methods may be `async` (return a `Promise`); Strutvane waits for each one.

## Binding services (typical)

The most common job of `register()` is putting your services into the container:

```ts title="app/providers/app.provider.ts"
import { hashToken, ServiceProvider, UserProviderToken, type Application, type AuthUser, type UserProvider } from '@strutvane/framework'
import { Author } from '../models/author.ts'

/** Finds the author who owns a bearer token (tokens are stored as SHA-256 hashes). */
class AuthorTokenProvider implements UserProvider {
  async retrieveByToken(plainToken: string): Promise<AuthUser | null> {
    return (await Author.query().where('api_token', hashToken(plainToken)).first()) ?? null
  }
}

export class AppServiceProvider extends ServiceProvider {
  /** Bind the user provider the `auth` middleware uses. */
  override register(app: Application): void {
    app.container.singleton(UserProviderToken, () => new AuthorTokenProvider())
  }
}
```

The `auth` middleware asks the container for `UserProviderToken`, so this one binding decides how bearer tokens are checked.

:::caution[Coming in 0.2]
Sign-in with sessions and the built-in users table come with `@strutvane/auth`. The token provider above is how the application-core prototype (spike 12) signs requests in today.
:::

## Adding sidebar entries (typical)

`app.navigation.add()` contributes an entry to the React sidebar. Use it in `boot()`:

```ts
override boot(app: Application): void {
  app.navigation.add({ label: 'Posts', route: 'posts.index', order: 10 })
  app.navigation.add({ label: 'Authors', route: 'authors.index', order: 20 })
  app.navigation.add({ label: 'Billing', route: 'billing.index', group: 'Account', icon: 'credit-card', order: 50 })
}
```

| Field | Meaning |
|---|---|
| `label` | The text in the sidebar |
| `route` | A **named** route the entry links to |
| `group` | Optional heading to group entries under |
| `icon` | Optional icon name |
| `order` | Sort order within the group (lower first) |

Entries are sorted by group, then `order`, then label. The UI hides entries the user may not `viewAny`.

## Adding routes and commands from a package (advanced)

A package's provider can bring its own routes and commands. Add both in `register()`:

```ts title="node_modules/@acme/billing/src/billing.provider.ts"
import { defineRoutes, Route, ServiceProvider, type Application } from '@strutvane/framework'
import { InvoiceController } from './invoice.controller.ts'
import { billingSyncCommand } from './billing-sync.command.ts'

const billingRoutes = defineRoutes([
  Route.get('/invoices', [InvoiceController, 'index']).name('billing.invoices'),
])

export class BillingServiceProvider extends ServiceProvider {
  override register(app: Application): void {
    app.addRoutes(billingRoutes, { prefix: '/api/billing', group: 'api' })
    app.addCommand(billingSyncCommand)
  }
}
```

What you'll see when you list the routes (something like this):

```bash
node strut route:list --path billing
```

```text
  Method  URI                     Name              Action                   Middleware
  ------  ----------------------  ----------------  -----------------------  ----------
  GET     /api/billing/invoices   billing.invoices  InvoiceController@index  api

  Showing 1 of 16 routes.
```

`group: 'api'` gives the routes the same middleware as your own API routes (CSRF check and rate limit).

:::caution[Coming in 0.2]
`node strut install:<package>` will add the provider line to `bootstrap/providers.ts` for you. Until then, add it by hand.
:::

## Order matters (a little)

Providers run in the order of the `providers` array. That matters only when two providers bind the **same** key: the later binding wins. Put `AppServiceProvider` last if you want your app to override a package's default.

```ts title="bootstrap/providers.ts"
export const providers: ProviderClass[] = [BillingServiceProvider, AppServiceProvider]
```

## Common mistakes

### "Routes were added after the app booted"

```text
✖ Routes were added after the app booted, so they would never be matched.
→ Call app.addRoutes() in a provider's register() method.
```

**Why:** routes are compiled between the two rounds. Anything added in `boot()` is too late.

**Fix:** move `app.addRoutes(...)` into `register()`.

### "Nothing is bound to … in the container" from inside `register()`

```text
✖ Nothing is bound to "Mailer" in the container.
→ Bind it in a service provider's register() method, for example: app.container.singleton(MailerToken, () => …).
```

**Why:** one provider's `register()` used a service another provider registers later.

**Fix:** don't *use* services in `register()`. Bind with a factory (it runs later, when someone asks), or move the code to `boot()`:

```ts
override register(app: Application): void {
  app.container.singleton(ReportServiceToken, (container) => new ReportService(container.make(MailerToken)))
}
```

### My provider never runs

**Why:** it isn't in `bootstrap/providers.ts`. There is no auto-discovery.

**Fix:** add it to the array.

## Next steps

- [Service Container](../container/): the bindings providers create.
- [Request Lifecycle](../lifecycle/): where boot happens.
- [CLI Reference](../cli-reference/): `node strut about` shows what your providers set up.
