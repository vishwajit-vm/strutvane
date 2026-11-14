/**
 * Routing: route definitions, groups, resources, compilation and URL generation (no HTTP here).
 */
import { describe, expect, it } from 'vitest'
import { compileRoutes, defineRoutes, Route, UrlGenerator } from '#strutvane/routing'
import { joinPath, parseParameters, toHonoPath } from '../src/routing/router.ts'
import { closestMatch, kebabCase, plural, singular, slugify } from '../src/support/str.ts'
import type { HttpContext } from '#strutvane/http'

/** A controller with all seven resource actions. */
class PhotoController {
  index(ctx: HttpContext): Response {
    return ctx.json('index')
  }
  create(ctx: HttpContext): Response {
    return ctx.json('create')
  }
  store(ctx: HttpContext): Response {
    return ctx.json('store')
  }
  show(ctx: HttpContext): Response {
    return ctx.json('show')
  }
  edit(ctx: HttpContext): Response {
    return ctx.json('edit')
  }
  update(ctx: HttpContext): Response {
    return ctx.json('update')
  }
  destroy(ctx: HttpContext): Response {
    return ctx.json('destroy')
  }
}

const ok = (): Response => new Response('ok')

describe('Route.resource and Route.apiResource', () => {
  it('generate Laravel\'s seven routes, names and order', () => {
    const table = compileRoutes({ web: defineRoutes([Route.resource('photos', PhotoController)]) })
    expect(table.map((route) => [route.methods.join('|'), route.uri, route.name])).toEqual([
      ['GET', '/photos', 'photos.index'],
      ['GET', '/photos/create', 'photos.create'],
      ['POST', '/photos', 'photos.store'],
      ['GET', '/photos/{photo}', 'photos.show'],
      ['GET', '/photos/{photo}/edit', 'photos.edit'],
      ['PUT|PATCH', '/photos/{photo}', 'photos.update'],
      ['DELETE', '/photos/{photo}', 'photos.destroy'],
    ])
    expect(table.every((route) => route.middleware[0] === 'web')).toBe(true)
  })

  it('apiResource drops the form pages and lives under /api', () => {
    const table = compileRoutes({ api: defineRoutes([Route.apiResource('photos', PhotoController)]) })
    expect(table.map((route) => route.name)).toEqual(['photos.index', 'photos.store', 'photos.show', 'photos.update', 'photos.destroy'])
    expect(table[0]?.uri).toBe('/api/photos')
    expect(table[0]?.middleware).toEqual(['api'])
  })

  it('supports only, except, a custom parameter, slug binding and per-action middleware', () => {
    const table = compileRoutes({
      web: defineRoutes([
        Route.resource('people', PhotoController, { only: ['index', 'show'], parameter: 'person' }),
        Route.resource('photos', PhotoController, { except: ['create', 'edit', 'destroy'], bindBy: 'slug' }).middlewareFor(['store', 'update'], 'auth'),
      ]),
    })
    expect(table.map((route) => route.uri)).toEqual(['/people', '/people/{person}', '/photos', '/photos', '/photos/{photo:slug}', '/photos/{photo:slug}'])
    expect(table.find((route) => route.name === 'photos.store')?.middleware).toEqual(['web', 'auth'])
    expect(table.find((route) => route.name === 'photos.show')?.middleware).toEqual(['web'])
    expect(table.find((route) => route.name === 'photos.show')?.parameters).toEqual([{ name: 'photo', field: 'slug' }])
  })

  it('refuses a resource name that is not a table-style plural', () => {
    expect(() => Route.resource('Photos', PhotoController)).toThrow(/not a valid resource name/)
  })
})

describe('groups and single routes', () => {
  it('nest prefixes, name prefixes and middleware in order', () => {
    const table = compileRoutes({
      web: defineRoutes([
        Route.group({ prefix: 'admin', name: 'admin.', middleware: ['auth'] }, [
          Route.group({ prefix: '/teams/{team}/', name: 'teams.', middleware: ['throttle:10,1'] }, [Route.get('/members', ok).name('members').middleware('admin')]),
        ]),
      ]),
    })
    expect(table[0]).toMatchObject({ uri: '/admin/teams/{team}/members', name: 'admin.teams.members', middleware: ['web', 'auth', 'throttle:10,1', 'admin'] })
  })

  it('are immutable: naming returns a new route', () => {
    const base = Route.get('/a', ok)
    const named = base.name('a')
    expect(base.routeName).toBeUndefined()
    expect(named.routeName).toBe('a')
  })

  it('refuse duplicate names and duplicate endpoints', () => {
    expect(() => compileRoutes({ web: defineRoutes([Route.get('/a', ok).name('x'), Route.get('/b', ok).name('x')]) })).toThrow(/Two routes are named "x": \/a and \/b/)
    expect(() => compileRoutes({ web: defineRoutes([Route.get('/p/{id}', ok), Route.get('/p/{post}', ok)]) })).toThrow(/GET \/p\/\{post\} is registered twice/)
  })

  it('refuse malformed parameters', () => {
    expect(() => parseParameters('/posts/{post')).toThrow(/unmatched brace/)
    expect(() => parseParameters('/posts/{po st}')).toThrow(/not a valid route parameter/)
    expect(() => parseParameters('/a/{x}/b/{x}')).toThrow(/uses \{x\} twice/)
  })

  it('normalise slashes and translate to Hono paths', () => {
    expect(joinPath('/api/', '//admin', 'posts/')).toBe('/api/admin/posts')
    expect(joinPath('', '')).toBe('/')
    expect(toHonoPath('/api/posts/{post:slug}/comments/{comment}')).toBe('/api/posts/:post/comments/:comment')
  })
})

describe('URL generation', () => {
  const table = compileRoutes({ api: defineRoutes([Route.apiResource('posts', PhotoController, { bindBy: 'slug' }), Route.get('/search', ok).name('search')]) })
  const urls = new UrlGenerator(table, 'https://blog.test/')

  it('fills parameters from strings, numbers and models (by the bound field)', () => {
    const post = { routeKey: (field?: string) => (field === 'slug' ? 'hello world' : 7) }
    expect(urls.route('posts.show', { post: 'hello-world' })).toBe('/api/posts/hello-world')
    expect(urls.route('posts.show', { post })).toBe('/api/posts/hello%20world')
    expect(urls.route('posts.update', { post: 5 }, { absolute: true })).toBe('https://blog.test/api/posts/5')
  })

  it('puts extra parameters in the query string', () => {
    expect(urls.route('search', { q: 'a&b' }, { query: { page: 2 } })).toBe('/api/search?q=a%26b&page=2')
  })

  it('explains a missing parameter and suggests the right name', () => {
    expect(() => urls.route('posts.show', {})).toThrow(/needs a value for \{post\}/)
    expect(() => urls.route('posts.shwo')).toThrow(expect.objectContaining({ message: 'No route is named "posts.shwo".', hint: 'Did you mean "posts.show"?' }))
  })
})

describe('string helpers', () => {
  it('inflect, case and slug', () => {
    expect(['posts', 'categories', 'addresses', 'class', 'news'].map(singular)).toEqual(['post', 'category', 'address', 'class', 'new'])
    expect(['post', 'category', 'box', 'day'].map(plural)).toEqual(['posts', 'categories', 'boxes', 'days'])
    expect(kebabCase('BlogPost')).toBe('blog-post')
    expect(slugify('  Crème brûlée, again! ')).toBe('creme-brulee-again')
    expect(closestMatch('rout:list', ['route:list', 'about'])).toBe('route:list')
    expect(closestMatch('zzzzzz', ['route:list'])).toBeUndefined()
  })
})
