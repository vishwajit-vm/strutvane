---
title: Routing
description: Map URLs to controllers in routes/web.ts and routes/api.ts. Single routes, names and typed URLs, groups, resource routes, slug binding, 405s and the /up health check, each with a complete example.
---

A **route** connects a URL and an HTTP method (GET, POST…) to the code that answers it. Your routes live in two files:

- `routes/api.ts`: your JSON API. Every route here is served under `/api` and gets the `api` middleware group (CSRF check and rate limit).
- `routes/web.ts`: pages for the browser (the React app's HTML shell). These get the `web` group (CSRF check).

:::tip[Coming from Laravel?]
`Route::get()`, `->name()`, `->middleware()`, `Route::group()`, `Route::resource()` and `Route::apiResource()` are all here as `Route.get()`, `.name()`, `.middleware()`, `Route.group()`, `Route.resource()` and `Route.apiResource()`. `{post:slug}` binding works the same way.

Two differences: routes are **values** in an array (`defineRoutes([...])`), not global side effects, and every route **name and parameter is typed**, so `route('posts.shwo')` doesn't compile.
:::

## The smallest example

```ts title="routes/api.ts"
import { defineRoutes, Route } from '@strutvane/framework'

export default defineRoutes([
  Route.get('/hello', (ctx) => ctx.json({ message: 'Hello!' })).name('hello'),
])
```

Start the app (`npm run dev`, or `node strut serve`) and call it:

```bash
curl http://localhost:3000/api/hello
```

What you'll see:

```json
{ "message": "Hello!" }
```

The route was defined as `/hello`, but it's served at `/api/hello`, because everything in `routes/api.ts` gets the `/api` prefix.

## Routes are values

`Route.get()` doesn't register anything. It returns a route object, and `defineRoutes([...])` returns the list. `bootstrap/app.ts` hands the lists to the app:

```ts title="bootstrap/app.ts"
.withRouting({ web, api, health: '/up', bindings: { post: Post } })
```

**Why values?** Your routes file can be imported twice (by the server, `node strut route:list` and your tests) without registering anything twice, and TypeScript can read every name and path from `typeof api`.

## Single routes

There's one method per HTTP verb, plus `match` for several at once:

```ts title="routes/api.ts"
import { defineRoutes, Route } from '@strutvane/framework'
import { ReportController } from '../app/http/controllers/report.controller.ts'

export default defineRoutes([
  Route.get('/reports', [ReportController, 'index']),
  Route.post('/reports', [ReportController, 'store']),
  Route.put('/reports/{report}', [ReportController, 'replace']),
  Route.patch('/reports/{report}', [ReportController, 'update']),
  Route.delete('/reports/{report}', [ReportController, 'destroy']),
  Route.match(['GET', 'POST'], '/reports/search', [ReportController, 'search']),
])
```

The second argument is the **action**: either `[ControllerClass, 'methodName']`, or a function `(ctx) => Response` for tiny routes. A method name that doesn't exist on the controller is a compile error.

## Naming routes

Give a route a **name** with `.name()`, then build its URL anywhere with `route()`:

```ts title="routes/api.ts"
Route.post('/posts/{post:slug}/publish', [PostController, 'publish']).name('posts.publish'),
```

```ts title="app/http/controllers/post.controller.ts"
return ctx.json({ links: { publish: route('posts.publish', { post }) } })
```

What you'll see in the response:

```json
{ "links": { "publish": "/api/posts/hello-world/publish" } }
```

### Every way to call `route()`

| Call | Result |
|---|---|
| `route('posts.index')` | `/api/posts` |
| `route('posts.show', { post })` | `/api/posts/hello-world` (a model fills the parameter with the field the route binds by) |
| `route('posts.show', { post: 'hello-world' })` | `/api/posts/hello-world` (a plain string or number works too) |
| `route('posts.index', {}, { query: { page: 2, sort: '-created_at' } })` | `/api/posts?page=2&sort=-created_at` |
| `route('posts.show', { post }, { absolute: true })` | `http://localhost:3000/api/posts/hello-world` (prefixed with `APP_URL`) |

These are **compile errors**, caught before you run anything:

```ts
route('posts.shwo', { post })   // no route has that name
route('posts.show')             // {post} is required
route('posts.show', { pots: post }) // wrong parameter name
```

To make this work, `bootstrap/app.ts` has one block that tells TypeScript about your routes (new apps already have it):

```ts title="bootstrap/app.ts"
declare module '@strutvane/framework' {
  interface RouteRegistry extends RoutesOf<[typeof web, typeof api]> {}
}
```

## Route parameters

A part of the path in braces is a **parameter**: `{report}` matches any value in that position. Read it as a string with `ctx.param()`:

```ts
Route.get('/reports/{report}', (ctx) => ctx.json({ id: ctx.param('report') })),
```

`GET /api/reports/42` answers `{ "id": "42" }`.

Parameter names use letters, digits and underscores, and each name appears once per path.

## Route model binding

Usually a parameter stands for a database record. **Route model binding** looks the record up for you before your controller runs. Register which model a parameter name means, once, in `bootstrap/app.ts`:

```ts title="bootstrap/app.ts"
.withRouting({ web, api, health: '/up', bindings: { post: Post, author: Author } })
```

Now any route with `{post}` gets a `Post`:

```ts title="routes/api.ts"
Route.get('/posts/{post}', [PostController, 'show']),
```

```ts title="app/http/controllers/post.controller.ts"
show(ctx: HttpContext): Response {
  const post = ctx.model(Post)   // typed as Post
  return ctx.json({ data: post })
}
```

What you'll see:

| Request | Response |
|---|---|
| `GET /api/posts/1` (exists) | `200` with the post |
| `GET /api/posts/999` (missing) | `404`: `No post matches "999".` |

### Binding by slug: `{post:slug}`

Add `:field` to look the record up by another column. `{post:slug}` finds the post whose `slug` matches:

```ts
Route.get('/posts/{post:slug}', [PostController, 'show']),
```

`GET /api/posts/hello-world` → the post with slug `hello-world`. And `route('posts.show', { post })` builds `/api/posts/hello-world` from the model.

Binding runs **after** middleware, so a guest on an `auth` route gets `401` before they can learn whether a record exists.

## Groups

A **group** shares a path prefix, a name prefix and middleware between routes:

```ts title="routes/api.ts"
import { defineRoutes, Route } from '@strutvane/framework'
import { StatsController } from '../app/http/controllers/stats.controller.ts'
import { UserAdminController } from '../app/http/controllers/user-admin.controller.ts'

export default defineRoutes([
  Route.group({ prefix: 'admin', name: 'admin.', middleware: ['auth', 'admin'] }, [
    Route.get('/stats', [StatsController, 'show']).name('stats'),
    Route.get('/users', [UserAdminController, 'index']).name('users'),
  ]),
])
```

What you'll see in `node strut route:list`:

```text
  Method  URI               Name         Action                     Middleware
  ------  ----------------  -----------  -------------------------  ----------------
  GET     /api/admin/stats  admin.stats  StatsController@show       api, auth, admin
  GET     /api/admin/users  admin.users  UserAdminController@index  api, auth, admin
```

The name prefix is typed too: `route('admin.stats')` compiles, `route('stats')` doesn't. Groups can be nested; prefixes, names and middleware add up.

## Middleware on routes

Add middleware to one route with `.middleware()`:

```ts
Route.get('/me', (ctx) => ctx.json({ data: ctx.requireUser() })).name('me').middleware('auth'),
```

Middleware can take parameters after a colon: `'auth:optional'`, `'throttle:5,1'`. See [Middleware](../middleware/).

## Resource routes

Most models need the same set of routes. One line gives you all of them, with standard names.

### `Route.resource()`: seven routes (with form pages)

```ts
Route.resource('posts', PostController),
```

| Method | URI | Name | Action |
|---|---|---|---|
| GET | `/posts` | `posts.index` | `index` |
| GET | `/posts/create` | `posts.create` | `create` |
| POST | `/posts` | `posts.store` | `store` |
| GET | `/posts/{post}` | `posts.show` | `show` |
| GET | `/posts/{post}/edit` | `posts.edit` | `edit` |
| PUT\|PATCH | `/posts/{post}` | `posts.update` | `update` |
| DELETE | `/posts/{post}` | `posts.destroy` | `destroy` |

The parameter name is the singular of the resource name: `posts` → `{post}`.

### `Route.apiResource()`: five routes (no form pages)

APIs don't need `create` and `edit` pages, so `apiResource` leaves them out:

```ts title="routes/api.ts"
Route.apiResource('posts', PostController),
```

You get `index`, `store`, `show`, `update` and `destroy`. Pair it with a `ResourceController` and every action works with no further code. See [Controllers](../controllers/).

### Resource options

| Option | What it does | Example |
|---|---|---|
| `only` | Keep just these actions | `{ only: ['index', 'show'] }` |
| `except` | Drop these actions | `{ except: ['destroy'] }` |
| `bindBy` | Bind the parameter by this column | `{ bindBy: 'slug' }` → `/posts/{post:slug}` |
| `parameter` | Rename the parameter (for irregular plurals) | `Route.resource('news', NewsController, { parameter: 'story' })` → `{story}` |

And two methods to add middleware to the whole resource or to some actions:

```ts title="routes/api.ts"
Route.apiResource('posts', PostController, { bindBy: 'slug' })
  .middlewareFor(['index', 'show'], 'auth:optional')
  .middlewareFor(['store', 'update', 'destroy'], 'auth'),

Route.apiResource('authors', AuthorController, { only: ['index', 'show', 'store'] })
  .middleware('throttle:30,1'),
```

The controller must have a method for **every** action you keep; if it doesn't, the line doesn't compile.

## The health route: `/up`

`health: '/up'` in `withRouting` adds a route that answers when the app is alive, for load balancers and uptime checks:

```bash
curl http://localhost:3000/up
```

What you'll see:

```json
{ "status": "ok" }
```

## Wrong method: 405 with `Allow`

When the path exists but not for that method, you get `405` and an `Allow` header naming the methods that work:

```bash
curl -i -X DELETE http://localhost:3000/api/hello
```

```text
HTTP/1.1 405 Method Not Allowed
allow: GET

{"type":"https://strutvane.dev/problems/method_not_allowed","title":"Method not allowed","status":405,"code":"method_not_allowed","detail":"DELETE is not supported here. Use GET."}
```

A path that doesn't exist at all is a `404`: `Nothing is at GET /api/helo.`

## Checking your routes

```bash
node strut route:list                 # every route
node strut route:list --path posts    # only URIs containing "posts"
node strut route:list --name admin.   # only names containing "admin."
node strut route:list --json          # machine-readable
```

What you'll see (the example app, shortened):

```text
  Method     URI                             Name           Action                 Middleware
  ---------  ------------------------------  -------------  ---------------------  ----------------
  GET        /api/posts                      posts.index    PostController@index   api, auth:optional
  POST       /api/posts                      posts.store    PostController@store   api, auth
  GET        /api/posts/{post:slug}          posts.show     PostController@show    api, auth:optional
  PUT|PATCH  /api/posts/{post:slug}          posts.update   PostController@update  api, auth
  DELETE     /api/posts/{post:slug}          posts.destroy  PostController@destroy api, auth
  POST       /api/posts/{post:slug}/publish  posts.publish  PostController@publish api, auth
```

## Common mistakes

### "No middleware is called …"

```text
✖ No middleware is called "auht" (used by GET /api/me).
→ Did you mean "auth"?
```

**Fix:** correct the alias. Strutvane checks every alias when the app starts, so this shows up in `route:list` and your tests, never in production.

### "… binds {post:slug}, but no model is bound to "post""

```text
✖ /api/posts/{post:slug} binds {post:slug}, but no model is bound to "post".
→ Add it in bootstrap/app.ts: withRouting({ bindings: { post: YourModel } }).
```

**Fix:**

```ts title="bootstrap/app.ts"
.withRouting({ web, api, bindings: { post: Post } })
```

### "Two routes are named …"

```text
✖ Two routes are named "posts.show": /api/posts/{post:slug} and /api/articles/{post}.
→ Route names must be unique, because route() would not know which URL to build. Rename one of them.
```

### "… is registered twice"

```text
✖ GET /api/posts is registered twice.
→ The second one could never run. Remove it, or change its path or method.
```

### "… has an unmatched brace"

```text
✖ The route path "/posts/{post" has an unmatched brace.
→ Write parameters as {post} or {post:slug}.
```

### "route('…') needs a value for {post}"

```text
✖ route('posts.show') needs a value for {post}.
→ Pass every parameter of /api/posts/{post:slug}: { post }.
```

This only happens when the name comes from a variable (otherwise it's a compile error). **Fix:** pass the parameter: `route('posts.show', { post })`.

### `Route.resource('Posts', …)` fails

```text
✖ "Posts" is not a valid resource name.
→ Use the plural, lower-case table-style name, for example Route.resource('posts', PostController).
```

## Next steps

- [Controllers](../controllers/): what your routes call.
- [Middleware](../middleware/): `auth`, `throttle` and your own.
- [Requests](../requests/): reading parameters, query strings and bodies.
