/**
 * Turn "metadata + the developer's owned settings" into the concrete UI of one resource: which
 * columns, form fields and filters, in which order, under which label and icon.
 *
 * This runs at runtime in the browser, every time. That is what makes `auto()` follow new columns
 * without regenerating anything: the metadata changes, the owned file does not, and this function
 * produces the new screen.
 *
 * @module
 */
import { defaultColumns, defaultFilterFields, defaultFormFields, routeKeyOf } from './defaults.ts'
import { isAutoSelection, type FieldSelection, type PageSize, type ResourceUiConfig } from './define-ui.ts'
import { isExposedField } from './exposure.ts'
import { guessIcon, type IconName } from './icons.ts'
import type { FieldMetadata, ResourceMetadata } from './metadata.ts'

/** Page size used when an owned file does not choose one (design doc §4.3). */
export const DEFAULT_PAGE_SIZE: PageSize = 25

/**
 * The fully resolved UI of one resource. Everything a screen needs, already decided.
 *
 * @example
 * const ui = resolveResourceUi(posts, { columns: auto() })
 * ui.columns.map((field) => field.name) // ['title', 'slug', ...]
 */
export interface ResolvedResourceUi {
  readonly name: string
  readonly metadata: ResourceMetadata
  readonly label: { readonly singular: string; readonly plural: string }
  readonly columns: readonly FieldMetadata[]
  readonly formFields: readonly FieldMetadata[]
  readonly filterFields: readonly FieldMetadata[]
  readonly navigation: { readonly icon: IconName; readonly group: string | undefined; readonly sort: number | undefined; readonly hidden: boolean; readonly badge: string | undefined }
  readonly pageSize: PageSize
  readonly defaultSort: string
  /** `slug` or the primary key: the value used in UI URLs. */
  readonly routeKey: string
  /** Opt-in actions, resolved: `false` unless the owned file switched them on. */
  readonly actions: { readonly export: boolean; readonly bulk: boolean }
  /**
   * Field names the owned file mentions that the metadata no longer has. Normally a type error
   * catches these first; at runtime they are skipped rather than crashing the screen.
   */
  readonly unknownFields: readonly string[]
}

/**
 * Resolve one resource's UI.
 *
 * @example
 * resolveResourceUi(posts, undefined).columns // the auto() default
 * resolveResourceUi(posts, { columns: ['title', 'status'] }).columns.length // 2
 */
export function resolveResourceUi(metadata: ResourceMetadata, config: ResourceUiConfig<string> | undefined): ResolvedResourceUi {
  const unknownFields: string[] = []
  const pick = (selection: FieldSelection<string> | undefined, defaults: FieldMetadata[]): FieldMetadata[] =>
    resolveSelection(metadata, selection, defaults, unknownFields)
  return {
    name: metadata.table,
    metadata,
    label: config?.label ?? metadata.label,
    columns: pick(config?.columns, defaultColumns(metadata)),
    formFields: pick(config?.form, defaultFormFields(metadata)),
    filterFields: pick(config?.filters, defaultFilterFields(metadata)),
    navigation: {
      icon: config?.navigation?.icon ?? guessIcon(metadata.table),
      group: config?.navigation?.group,
      sort: config?.navigation?.sort,
      hidden: config?.navigation?.hidden ?? metadata.sidebar.hidden,
      badge: config?.navigation?.badge,
    },
    pageSize: config?.pageSize ?? DEFAULT_PAGE_SIZE,
    defaultSort: config?.defaultSort ?? metadata.defaultSort,
    routeKey: routeKeyOf(metadata),
    actions: { export: config?.actions?.export === true, bulk: config?.actions?.bulk === true },
    unknownFields: [...new Set(unknownFields)],
  }
}

/**
 * Resolve one selection.
 *
 * - `undefined` or `auto()`: the defaults, minus `except`, with `order` fields moved to the front.
 * - an explicit list: exactly those fields, in that order (a hidden field is never shown, even if
 *   listed, because the API does not return it).
 *
 * @example
 * resolveSelection(posts, auto({ order: ['status'] }), defaultColumns(posts), [])[0]?.name // 'status'
 */
export function resolveSelection(
  metadata: ResourceMetadata,
  selection: FieldSelection<string> | undefined,
  defaults: readonly FieldMetadata[],
  unknownFields: string[],
): FieldMetadata[] {
  if (selection !== undefined && !isAutoSelection(selection)) {
    return lookUpFields(metadata, selection, unknownFields)
  }
  const except = new Set(selection?.except ?? [])
  const kept = defaults.filter((field) => !except.has(field.name))
  const first = lookUpFields(metadata, selection?.order ?? [], unknownFields).filter((field) => kept.includes(field))
  return [...first, ...kept.filter((field) => !first.includes(field))]
}

/** Map names to visible fields, collecting the names that do not exist (any more). */
function lookUpFields(metadata: ResourceMetadata, names: readonly string[], unknownFields: string[]): FieldMetadata[] {
  const fields: FieldMetadata[] = []
  for (const name of names) {
    const field = metadata.fields.find((candidate) => candidate.name === name && isExposedField(candidate))
    if (field === undefined) unknownFields.push(name)
    else fields.push(field)
  }
  return fields
}
