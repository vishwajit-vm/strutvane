/**
 * The route tree (TanStack Router, as D14 names it). One set of routes serves every resource:
 *
 *   /sign-in                     sign-in stub
 *   /                            dashboard
 *   /$resource                   list            (/posts?page=2&sort=-price)
 *   /$resource/new               create
 *   /$resource/$key              detail          (/posts/my-first-post, /tags/7)
 *   /$resource/$key/edit         edit
 *
 * `$key` is the slug when the table has one, else the id (design doc §4.7).
 *
 * @module
 */
import { createRootRoute, createRoute, createRouter, Outlet, type RouterHistory } from '@tanstack/react-router'
import { CreatePage, EditPage } from './resource/FormPage.tsx'
import { DetailPage } from './resource/DetailPage.tsx'
import { ListPage } from './resource/ListPage.tsx'
import { NotFoundPage } from './resource/states.tsx'
import { validateDetailSearch, validateListSearch } from './route-search.ts'
import { AppShell } from './shell/AppShell.tsx'
import { HomePage } from './shell/HomePage.tsx'
import { SignInPage } from './shell/SignInPage.tsx'

const rootRoute = createRootRoute({ component: Outlet, notFoundComponent: NotFoundPage })
const signInRoute = createRoute({ getParentRoute: () => rootRoute, path: '/sign-in', component: SignInPage })
const appRoute = createRoute({ getParentRoute: () => rootRoute, id: 'app', component: AppShell })
const homeRoute = createRoute({ getParentRoute: () => appRoute, path: '/', component: HomePage })
const listRoute = createRoute({ getParentRoute: () => appRoute, path: '$resource', component: ListPage, validateSearch: validateListSearch })
// "new" is a fixed segment, so it wins over `$key`. A slug may therefore never be "new"; the
// design doc reserves it (spike 10 does not yet; see README finding).
const createPageRoute = createRoute({ getParentRoute: () => appRoute, path: '$resource/new', component: CreatePage })
const detailRoute = createRoute({ getParentRoute: () => appRoute, path: '$resource/$key', component: DetailPage, validateSearch: validateDetailSearch })
const editRoute = createRoute({ getParentRoute: () => appRoute, path: '$resource/$key/edit', component: EditPage })

const routeTree = rootRoute.addChildren([signInRoute, appRoute.addChildren([homeRoute, listRoute, createPageRoute, detailRoute, editRoute])])

/**
 * Create the router. Tests pass a memory history; the browser uses the default.
 *
 * @example
 * const router = createAppRouter(createMemoryHistory({ initialEntries: ['/posts'] }))
 */
export function createAppRouter(history?: RouterHistory) {
  return createRouter({ routeTree, ...(history === undefined ? {} : { history }), defaultPreload: false })
}

/**
 * The router type, registered below so `<Link to>` and `navigate()` are checked.
 *
 * @example
 * const router: AppRouter = createAppRouter()
 */
export type AppRouter = ReturnType<typeof createAppRouter>

declare module '@tanstack/react-router' {
  interface Register {
    router: AppRouter
  }
}
