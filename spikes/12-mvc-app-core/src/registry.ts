/**
 * The three registries an app fills in with declaration merging: its route names, its config
 * shape and its user type. They are empty here on purpose, so the framework never imports app
 * code. The app adds one block (in `bootstrap/app.ts`):
 *
 * ```ts
 * declare module '#strutvane/registry' {
 *   interface RouteRegistry extends RoutesOf<[typeof web, typeof api]> {}
 *   interface ConfigRegistry extends ConfigOf<typeof config> {}
 *   interface UserRegistry { user: Author }
 * }
 * ```
 *
 * Why declaration merging instead of code generation: the route names and config keys already
 * exist as TypeScript values in the app's own files, so `typeof` gets their exact types for free,
 * with nothing to regenerate and nothing to go stale.
 */

/**
 * Every named route, mapped to the parameters its URL needs. Filled in by the app.
 *
 * @example
 * // after augmentation: RouteRegistry['posts.show'] is { post: RouteParam }
 * route('posts.show', { post })
 */
export interface RouteRegistry {}

/**
 * The app's config tree (`config/*.ts`), keyed by file name. Filled in by the app.
 *
 * @example
 * // after augmentation: config('app.debug') is typed as boolean
 */
export interface ConfigRegistry {}

/**
 * The type of the signed-in user. Filled in by the app as `{ user: Author }`.
 *
 * @example
 * // after augmentation: ctx.user is Author | null
 */
export interface UserRegistry {}

/**
 * The smallest thing every user has: an id. Used until the app fills in {@link UserRegistry}.
 *
 * @example
 * const user: GenericUser = { id: 1 }
 */
export interface GenericUser {
  readonly id: number | string
}

/**
 * The app's user type, or {@link GenericUser} when the app hasn't said.
 *
 * @example
 * function greet(user: AuthUser): string { return `Hello #${user.id}` }
 */
export type AuthUser = UserRegistry extends { readonly user: infer TUser extends GenericUser } ? TUser : GenericUser
