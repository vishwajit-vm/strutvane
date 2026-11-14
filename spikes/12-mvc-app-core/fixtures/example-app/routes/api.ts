import { defineRoutes, Route } from '#strutvane/routing'
import { AuthorController } from '../app/http/controllers/author.controller.ts'
import { PostController } from '../app/http/controllers/post.controller.ts'
import { StatsController } from '../app/http/controllers/stats.controller.ts'

/** API routes, served under /api with the `api` middleware group (CSRF check + throttle). */
export default defineRoutes([
  Route.apiResource('posts', PostController, { bindBy: 'slug' })
    .middlewareFor(['index', 'show'], 'auth:optional')
    .middlewareFor(['store', 'update', 'destroy'], 'auth'),
  Route.post('/posts/{post:slug}/publish', [PostController, 'publish']).name('posts.publish').middleware('auth'),

  Route.apiResource('authors', AuthorController, { only: ['index', 'show', 'store'] }).middlewareFor(['store'], 'auth'),

  Route.get('/me', (ctx) => ctx.json({ data: ctx.requireUser() }))
    .name('me')
    .middleware('auth'),

  Route.group({ prefix: 'admin', name: 'admin.', middleware: ['auth', 'admin'] }, [Route.get('/stats', [StatsController, 'show']).name('stats')]),
])
