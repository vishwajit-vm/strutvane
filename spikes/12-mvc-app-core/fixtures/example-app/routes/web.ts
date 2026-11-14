import { defineRoutes, Route } from '#strutvane/routing'
import { DiagnosticsController } from '../app/http/controllers/diagnostics.controller.ts'
import { SpaController } from '../app/http/controllers/spa.controller.ts'

/** Web routes: the React app's pages (the UI is React only), with the `web` middleware group. */
export default defineRoutes([
  Route.get('/', [SpaController, 'show']).name('home'),
  Route.get('/posts/{post:slug}', [SpaController, 'show']).name('posts.page'),
  Route.get('/_diagnostics/boom', [DiagnosticsController, 'boom']).name('diagnostics.boom'),
])
