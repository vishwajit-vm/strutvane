/**
 * `#strutvane/ui`: what a developer-owned `resources/ui/<resource>.ui.ts` file imports.
 * (In the product this would be `@strutvane/ui/define`; the spike maps it with package.json
 * `imports`.)
 *
 * The typing trick: {@link UiRegistry} starts empty, and the machine-owned `.strutvane/ui.gen.ts`
 * fills it by declaration merging with every resource and its field names. So when a migration
 * drops a column that an owned file still names, the owned file stops compiling, instead of
 * rendering a blank column at runtime.
 *
 * @module
 */
import type { IconName } from './icons.ts'

export type { IconName } from './icons.ts'
export type { AppMetadata, FieldMetadata, RelationMetadata, ResourceMetadata } from './metadata.ts'

/**
 * Resource name → union of its field names. Empty here; `.strutvane/ui.gen.ts` augments it.
 *
 * @example
 * // in .strutvane/ui.gen.ts (generated):
 * declare module '#strutvane/ui' { interface UiRegistry { posts: 'id' | 'title' | 'status' } }
 */
// Deliberately empty: it is filled by declaration merging from ui.gen.ts.
export interface UiRegistry {}

/**
 * Every resource the generated registry knows (`'posts' | 'users' | ...`).
 *
 * @example
 * const name: ResourceName = 'posts'
 */
export type ResourceName = keyof UiRegistry & string

/**
 * The field names of one resource, from the generated registry.
 *
 * @example
 * const field: FieldName<'posts'> = 'title'
 */
export type FieldName<R extends ResourceName> = UiRegistry[R] & string

/**
 * The marker `auto()` returns: "use the inferred default, and keep picking up new columns".
 *
 * @example
 * const selection: AutoSelection<'title' | 'body'> = auto({ except: ['body'] })
 */
export interface AutoSelection<F extends string> {
  readonly kind: 'auto'
  /** Fields to leave out of the default. */
  readonly except: readonly F[]
  /** Fields to put first, in this order; the rest follow in schema order. */
  readonly order: readonly F[]
}

/**
 * Options for {@link auto}.
 *
 * @example
 * const options: AutoOptions<'title' | 'meta'> = { except: ['meta'], order: ['title'] }
 */
export interface AutoOptions<F extends string> {
  readonly except?: readonly F[]
  readonly order?: readonly F[]
}

/**
 * "Use the inferred default for this list (columns, form fields or filters), and include new
 * columns automatically after each migrate."
 *
 * Why options instead of `auto().except('x')` chaining: a chained call loses the contextual type,
 * so `auto().except('typo')` would compile. With an options object the field names are checked
 * against the resource (`NoInfer` makes the context, not the argument, decide the field type).
 *
 * @example
 * defineResourceUi('posts', { columns: auto(), form: auto({ except: ['meta'] }) })
 */
export function auto<F extends string = string>(options: AutoOptions<NoInfer<F>> = {}): AutoSelection<F> {
  return { kind: 'auto', except: options.except ?? [], order: options.order ?? [] }
}

/**
 * A list of fields: `auto(...)` (follows the schema) or an explicit list (never rewritten by
 * `ui:sync`; new columns are reported instead).
 *
 * @example
 * const columns: FieldSelection<'title' | 'status'> = ['title', 'status']
 */
export type FieldSelection<F extends string> = AutoSelection<F> | readonly F[]

/**
 * Sidebar settings for one resource.
 *
 * @example
 * const navigation: NavigationConfig = { icon: 'file-text', group: 'Content', sort: 1 }
 */
export interface NavigationConfig {
  readonly icon?: IconName
  /** Sidebar group heading. Ungrouped entries come first. */
  readonly group?: string
  /** Lower numbers come first inside a group; ties sort by plural label. */
  readonly sort?: number
  /** Keep the routes but hide the sidebar entry. */
  readonly hidden?: boolean
}

/**
 * Allowed page sizes in lists.
 *
 * @example
 * const size: PageSize = 25
 */
export type PageSize = 10 | 25 | 50 | 100

/**
 * High-level actions. All are **off by default** and must be switched on per resource (security
 * review F-15: export and bulk changes are mass-exfiltration and mass-edit tools).
 *
 * @example
 * const actions: ActionsConfig = { export: true }
 */
export interface ActionsConfig {
  /** Show "Export CSV" (needs the API's export endpoint and an exact `export` grant). */
  readonly export?: boolean
  /** Show row checkboxes and bulk delete/restore (needs the API's bulk endpoint). */
  readonly bulk?: boolean
}

/**
 * The developer-owned, purely visual settings of one resource. Anything that changes what the API
 * accepts (searchable, sortable, slug) lives in the migration/model instead (design doc §6.4).
 *
 * @example
 * const config: ResourceUiConfig<'title' | 'status'> = { columns: auto(), navigation: { group: 'Content' } }
 */
export interface ResourceUiConfig<F extends string> {
  readonly columns?: FieldSelection<F>
  readonly form?: FieldSelection<F>
  readonly filters?: FieldSelection<F>
  readonly label?: { readonly singular: string; readonly plural: string }
  readonly navigation?: NavigationConfig
  readonly pageSize?: PageSize
  /** `'title'` (A to Z) or `'-created_at'` (newest first). */
  readonly defaultSort?: F | `-${F}`
  /** Opt-in high-level actions; everything here defaults to off. */
  readonly actions?: ActionsConfig
}

/**
 * What an owned file exports: the resource name plus its settings, as plain data.
 *
 * @example
 * const ui: ResourceUi = defineResourceUi('posts', {})
 * ui.resource // 'posts'
 */
export interface ResourceUi {
  readonly resource: string
  readonly config: ResourceUiConfig<string>
}

/**
 * Declare the UI settings of one resource. The first argument picks the resource, and from then on
 * every field name in the settings is checked against that resource's columns.
 *
 * @example
 * export default defineResourceUi('posts', {
 *   columns: auto(),
 *   form: auto({ except: ['meta'] }),
 *   navigation: { icon: 'file-text', group: 'Content' },
 * })
 */
export function defineResourceUi<R extends ResourceName>(resource: R, config: ResourceUiConfig<FieldName<R>>): ResourceUi {
  return { resource, config }
}

/**
 * Is this selection the `auto()` marker (as opposed to an explicit list)?
 *
 * @example
 * isAutoSelection(auto()) // true
 * isAutoSelection(['title']) // false
 */
export function isAutoSelection<F extends string>(selection: FieldSelection<F>): selection is AutoSelection<F> {
  // An explicit list is an array; the marker is the only non-array shape allowed.
  return !Array.isArray(selection)
}
