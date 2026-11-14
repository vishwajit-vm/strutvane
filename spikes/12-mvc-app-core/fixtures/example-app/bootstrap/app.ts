import { dirname } from 'node:path'
import { Application, type ConfigOf, type EnvSource } from '#strutvane/foundation'
import type { RoutesOf } from '#strutvane/routing'
import { EnsureAdmin } from '../app/http/middleware/ensure-admin.ts'
import { Author } from '../app/models/author.ts'
import { Post } from '../app/models/post.ts'
import { config } from '../config/index.ts'
import api from '../routes/api.ts'
import web from '../routes/web.ts'
import { providers } from './providers.ts'

/**
 * Build the application, Laravel's bootstrap/app.php. Tests call it with their own environment;
 * `node strut` and the server use the default export (which reads .env).
 */
export function createApp(env?: EnvSource): Application {
  return Application.configure({ basePath: dirname(import.meta.dirname), ...(env === undefined ? {} : { env }) })
    .withConfig(config)
    .withProviders(providers)
    .withRouting({ web, api, health: '/up', bindings: { post: Post, author: Author } })
    .withMiddleware((middleware) => {
      middleware.alias({ admin: EnsureAdmin })
      middleware.rateLimiter('api', { maxAttempts: 120, decaySeconds: 60 })
    })
    .withExceptions((exceptions) => {
      exceptions.shouldRenderJsonWhen((ctx) => ctx.wantsJson())
    })
    .create()
}

export default createApp()

/**
 * Teach the framework this app's route names, config keys and user type, so
 * `route('posts.show', { post })`, `config('app.debug')` and `ctx.user.is_admin` are all checked
 * by the compiler.
 */
declare module '#strutvane/registry' {
  interface RouteRegistry extends RoutesOf<[typeof web, typeof api]> {}
  interface ConfigRegistry extends ConfigOf<typeof config> {}
  interface UserRegistry {
    user: Author
  }
}
