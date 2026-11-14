---
title: Helpers, Not Facades
description: config(), route(), now() and app() give you Laravel's convenient helpers as plain, fully typed functions. Learn how they find the current app, and what to do outside a request.
---

Strutvane has four small helper functions you can import anywhere in your app: `config()`, `route()`, `now()` and `app()`. They save you from passing the application object around, and every one of them is **fully typed**: a wrong config key or route name is a compile error, not a runtime surprise.

:::tip[Coming from Laravel?]
`config('app.name')`, `route('posts.show', $post)` and `now()` work as you expect. What's missing on purpose is **facades** (`Cache::get()`, `DB::table()`, `Route::get()` as global static proxies).

Why: a facade hides which object you're really calling, and its types can't be checked. Strutvane uses plain functions you import, constructor injection for services, and values (`Route.get()` returns a route; it doesn't register one globally).
:::

## The smallest example

```ts title="app/http/controllers/home.controller.ts"
import { config, Controller, now, route, type HttpContext } from '@strutvane/framework'

export class HomeController extends Controller {
  index(ctx: HttpContext): Response {
    return ctx.json({
      app: config('app.name'),
      time: now().toISOString(),
      posts: route('posts.index'),
    })
  }
}
```

What you'll see at `GET /api/home`:

```json
{
  "app": "My App",
  "time": "2026-11-14T10:00:00.000Z",
  "posts": "/api/posts"
}
```

## The four helpers

| Helper | Returns | Laravel equivalent |
|---|---|---|
| `config(key)` | A config value, typed by your `config/*.ts` files | `config('app.name')` |
| `route(name, params?, options?)` | The URL of a named route | `route('posts.show', $post)` |
| `now()` | The current `Date`, from the app's clock | `now()` |
| `app()` | The current application: `container`, `config`, `url` | `app()` |

### `config()`: typed settings

```ts
config('app.name')   // string
config('app.debug')  // boolean
config('app.env')    // 'local' | 'testing' | 'production'
config('app.nmae')   // compile error: there is no such key
```

The key is a **dot path**: the first part is the file name in `config/`, the rest is the path inside it. The return type comes from that file, so `config('app.debug')` is a `boolean`, never "anything". See [Configuration](../configuration/).

### `route()`: URLs from names

```ts
route('posts.index')                                   // '/api/posts'
route('posts.show', { post })                          // '/api/posts/hello-world' (the post's slug)
route('posts.index', {}, { query: { page: 2 } })       // '/api/posts?page=2'
route('posts.show', { post }, { absolute: true })      // 'http://localhost:3000/api/posts/hello-world'
route('posts.shwo', { post })                          // compile error: no such route
route('posts.show')                                    // compile error: {post} is missing
```

Pass a model and Strutvane uses the field the route binds by (`{post:slug}` uses the slug). `absolute: true` prefixes `APP_URL`. Full details in [Routing](../routing/).

### `now()`: a clock you can freeze

```ts
await post.fill({ status: 'published' }).save()
const publishedAt = now()        // a Date
```

`now()` reads the clock bound to `ClockToken` in the container. In tests, bind a fixed clock and every timestamp is predictable:

```ts
app.container.instance(ClockToken, () => new Date('2026-11-14T10:00:00Z'))
```

### `app()`: the current application

```ts
import { app, ConnectionToken } from '@strutvane/framework'

const db = app().container.make(ConnectionToken)
const url = app().url.route('posts.index')
```

Prefer constructor injection (`static inject`) in your own classes; `app()` is the escape hatch for places where injection isn't available.

## How they know which app you mean

There is no global app object. Instead, Strutvane remembers "the current app" for the duration of each request and each `node strut` command, using Node's `AsyncLocalStorage` (a built-in feature that follows your code across every `await`).

```text
request arrives ──► app.handle(request) ──► [ current app = this app ] ──► middleware ──► controller ──► config() ✓
```

**Why go to this trouble?** Because one Node process can hold several apps: every test file creates its own. With a global, test A could read test B's config. With `AsyncLocalStorage`, each request only ever sees its own app.

## Outside a request: `app.run()`

Code that runs at the top level of a file (when it's imported), in a standalone script, or in a test runs **outside** any request. There's no current app there, so the helpers stop with a clear message. Wrap the code in `app.run()`:

```ts title="scripts/print-routes.ts"
import app from '../bootstrap/app.ts'
import { route } from '@strutvane/framework'

await app.boot()
const url = app.run(() => route('posts.index'))
console.log(url)
```

What you'll see:

```bash
node scripts/print-routes.ts
```

```text
/api/posts
```

In a test, `await app.run(async () => …)` works the same way and supports `await` inside.

## Common mistakes

### "… was called outside a request or console command"

```text
✖ route() was called outside a request or console command, so there is no current app.
→ Call it from a controller, middleware or command, or wrap the code in app.run(() => …) (tests: await app.run(async () => …)).
```

**Why:** the helper ran when no request or command was active, for example in a constant at the top of a file:

```ts
const POSTS_URL = route('posts.index')   // runs on import: too early
```

**Fix:** compute it inside a function that runs during a request, or use `app.run()`:

```ts
function postsUrl(): string {
  return route('posts.index')
}
```

### "There is no config value at …"

```text
✖ There is no config value at "app.nmae".
→ Check the key against the files in config/; the first segment is the file name (for example "app.name" reads config/app.ts).
```

**Why:** a key built at runtime (from a variable) skipped the compile-time check, and it doesn't exist.

**Fix:** use a literal key so TypeScript checks it, or fix the spelling.

### "No route is named …"

```text
✖ No route is named "post.show".
→ Did you mean "posts.show"?
```

**Fix:** use the suggested name, or run `node strut route:list` to see every name.

## Next steps

- [Configuration](../configuration/): the files `config()` reads.
- [Routing](../routing/): naming routes for `route()`.
- [Service Container](../container/): what `app().container` holds.
