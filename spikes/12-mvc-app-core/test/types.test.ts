/**
 * Type-level tests. `npm test` runs `tsc --noEmit` first, so every `@ts-expect-error` below must
 * really be an error and every `expectTypeOf` must hold, or the suite fails before Vitest starts.
 * The code inside `typeOnly` never runs: it only has to compile (or not).
 */
import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import type { AuthUser, Policy } from '#strutvane/auth'
import { defineCommand } from '#strutvane/console'
import { config, Container, token, type CheckInjectable } from '#strutvane/foundation'
import type { HttpContext } from '#strutvane/http'
import { FormRequest } from '#strutvane/validation'
import type { RouteRegistry } from '#strutvane/registry'
import { defineRoutes, Route, route, type ParamsOf, type RoutesOf, type Singular } from '#strutvane/routing'
import type { Connection } from '#strutvane/database'
import { ConnectionToken } from '#strutvane/database'
import { PostController } from '../fixtures/example-app/app/http/controllers/post.controller.ts'
import { SpaController } from '../fixtures/example-app/app/http/controllers/spa.controller.ts'
import { StatsController } from '../fixtures/example-app/app/http/controllers/stats.controller.ts'
import type { Author } from '../fixtures/example-app/app/models/author.ts'
import { Post } from '../fixtures/example-app/app/models/post.ts'

/** Wraps code that must type-check but never run (it would need a live app). */
function typeOnly(_check: () => void): void {}

describe('route names and parameters are typed from the routes files', () => {
  it('knows every named route of the example app', () => {
    expectTypeOf<keyof RouteRegistry>().toEqualTypeOf<
      | 'home'
      | 'posts.page'
      | 'diagnostics.boom'
      | 'posts.index'
      | 'posts.store'
      | 'posts.show'
      | 'posts.update'
      | 'posts.destroy'
      | 'posts.publish'
      | 'authors.index'
      | 'authors.show'
      | 'authors.store'
      | 'me'
      | 'admin.stats'
    >()
  })

  it('types the parameters of each route', () => {
    expectTypeOf<RouteRegistry['posts.show']>().toEqualTypeOf<ParamsOf<'/posts/{post:slug}'>>()
    expectTypeOf<keyof RouteRegistry['posts.publish']>().toEqualTypeOf<'post'>()
    expectTypeOf<keyof RouteRegistry['posts.index']>().toEqualTypeOf<never>()
  })

  it('accepts correct route() calls and rejects wrong ones', () => {
    typeOnly(() => {
      const post = new Post({} as never)
      route('posts.show', { post })
      route('posts.show', { post: 'hello-world' })
      route('home')
      route('posts.index', {}, { query: { page: 2 } })
      route('admin.stats')
      // @ts-expect-error: no route has this name (typo)
      route('posts.shwo', { post })
      // @ts-expect-error: posts.show needs {post}
      route('posts.show', {})
      // @ts-expect-error: the params object is required when the path has parameters
      route('posts.show')
      // @ts-expect-error: authors.update is excluded by `only`
      route('authors.update', { author: 1 })
      // @ts-expect-error: a boolean can't fill a URL parameter
      route('posts.show', { post: true })
    })
  })

  it('applies group prefixes to names and keeps their parameters', () => {
    const routes = defineRoutes([
      Route.group({ prefix: 'teams/{team}', name: 'teams.' }, [Route.get('/members/{member}', () => new Response()).name('members.show'), Route.get('/hidden', () => new Response())]),
    ])
    type Names = RoutesOf<[typeof routes]>
    expectTypeOf<keyof Names>().toEqualTypeOf<'teams.members.show'>()
    expectTypeOf<keyof Names['teams.members.show']>().toEqualTypeOf<'team' | 'member'>()
  })

  it('names resource parameters with the same singular rule as the runtime', () => {
    expectTypeOf<Singular<'posts'>>().toEqualTypeOf<'post'>()
    expectTypeOf<Singular<'categories'>>().toEqualTypeOf<'category'>()
    expectTypeOf<Singular<'addresses'>>().toEqualTypeOf<'address'>()
    expectTypeOf<Singular<'news'>>().toEqualTypeOf<'new'>() // the honest limit: use `parameter`
  })
})

describe('controller method references are checked', () => {
  it('rejects a method the controller does not have', () => {
    typeOnly(() => {
      Route.get('/posts', [PostController, 'index'])
      Route.post('/posts/{post}/publish', [PostController, 'publish'])
      // @ts-expect-error: PostController has no `nope` action
      Route.get('/posts', [PostController, 'nope'])
      // @ts-expect-error: `policy` is a property, not an action
      Route.get('/posts', [PostController, 'policy'])
    })
  })

  it('requires every resource action to exist on the controller', () => {
    typeOnly(() => {
      Route.apiResource('posts', PostController)
      Route.resource('posts', PostController, { only: ['index', 'show', 'store', 'update', 'destroy'] })
      // @ts-expect-error: a full resource needs create() and edit(), which PostController lacks
      Route.resource('posts', PostController)
      // @ts-expect-error: SpaController has no index/store/update/destroy
      Route.apiResource('posts', SpaController)
    })
  })
})

describe('container injection is checked against constructors', () => {
  it('accepts a matching inject list and rejects a wrong one', () => {
    const container = new Container()
    typeOnly(() => {
      expectTypeOf(container.make(StatsController)).toEqualTypeOf<StatsController>()
      expectTypeOf(container.make(ConnectionToken)).toEqualTypeOf<Connection>()
    })
    class WrongInject {
      static readonly inject = [token<number>('n')] as const
      readonly value: string
      constructor(value: string) {
        this.value = value
      }
    }
    expectTypeOf<CheckInjectable<typeof WrongInject>>().toBeNever()
    typeOnly(() => {
      // @ts-expect-error: inject resolves a number, the constructor wants a string
      container.make(WrongInject)
    })
  })
})

describe('config(), the user and models are typed', () => {
  it('types config values by dot path', () => {
    typeOnly(() => {
      expectTypeOf(config('app.debug')).toEqualTypeOf<boolean>()
      expectTypeOf(config('app.env')).toEqualTypeOf<'local' | 'testing' | 'production'>()
      expectTypeOf(config('database.connections.sqlite.database')).toEqualTypeOf<string>()
      // @ts-expect-error: no such key
      config('app.nmae')
    })
  })

  it('types the signed-in user and bound models', () => {
    typeOnly(() => {
      const ctx = {} as HttpContext
      expectTypeOf(ctx.user).toEqualTypeOf<Author | null>()
      expectTypeOf(ctx.model(Post)).toEqualTypeOf<Post>()
      expectTypeOf(ctx.model(Post).status).toEqualTypeOf<'draft' | 'published'>()
      expectTypeOf<AuthUser>().toEqualTypeOf<Author>()
    })
  })

  it('checks policy method signatures against the model', () => {
    class Wrong implements Policy<Post> {
      // @ts-expect-error: the record must be a Post, not a number
      update(_user: AuthUser | null, _post: number): boolean {
        return false
      }
    }
    expectTypeOf<Wrong>().not.toBeAny()
  })

  it('types validated form request output', () => {
    class Store extends FormRequest<{ title: string }> {
      rules() {
        return z.object({ title: z.string() })
      }
    }
    typeOnly(() => {
      expectTypeOf(new Store().validate({} as HttpContext)).resolves.toEqualTypeOf<{ title: string }>()
    })
  })
})

describe('command options are typed from their declaration', () => {
  it('gives booleans and strings their types inside run()', () => {
    defineCommand({
      name: 'demo',
      description: 'demo',
      options: { force: { type: 'boolean', description: '' }, model: { type: 'string', description: '' } },
      run({ options }) {
        expectTypeOf(options.force).toEqualTypeOf<boolean>()
        expectTypeOf(options.model).toEqualTypeOf<string | undefined>()
        // @ts-expect-error: undeclared option
        void options.nope
      },
    })
  })
})
