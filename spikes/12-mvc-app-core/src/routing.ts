/**
 * `#strutvane/routing`: `Route`, `defineRoutes`, `route()` and the route types.
 */
export { defineRoutes, Route, RouteDefinition, RouteGroup, RouteList, ResourceRoutes, type HttpMethod, type RouteEntry } from './routing/route.ts'
export { compileRoutes, type CompiledRoute } from './routing/router.ts'
export { route, UrlGenerator, type UrlOptions } from './routing/url.ts'
export type { ActionMethods, ParamsOf, ResourceAction, RouteParam, RoutesOf, Singular, UrlRoutable } from './routing/types.ts'
