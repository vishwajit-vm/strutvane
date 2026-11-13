/**
 * The extension point of the renderer (levels of control L1/L2, blueprint 04 §4).
 *
 * Two registries decide how a field is drawn:
 * - widgets: form inputs, resolved by `Resource.field` → `field.widget` name → field type → `default`;
 * - cells:   table cells, resolved by `Resource.field` → field type → `default`.
 *
 * Apps override any entry through <StrutvaneUIProvider overrides={…}>, without forking or
 * re-implementing ResourceList / ResourceForm. Defaults live in widgets.tsx / cells.tsx and are
 * merged underneath the overrides, so an override never has to re-declare everything.
 */
import { createContext, type ComponentType, type ReactNode, useContext, useMemo } from 'react'
import type { ResourceApi } from './api.ts'
import type { ApiRecord, FieldDescriptor, ResourceDescriptor, ResourceManifest } from './contracts.ts'
import { defaultMessages, type MessageCatalog } from './messages.ts'

/** Props every form widget receives. Widgets render only the control; labels/errors are shared. */
export interface WidgetProps {
  readonly field: FieldDescriptor
  /** DOM id; the shared label's `htmlFor` points here. */
  readonly id: string
  /** Form field name, e.g. `amount` or `lines[1].amount`. */
  readonly name: string
  readonly value: unknown
  readonly onChange: (value: unknown) => void
  readonly onBlur: () => void
  readonly readOnly: boolean
  readonly invalid: boolean
  /** Space-separated ids of the help text and error message (for aria-describedby). */
  readonly describedBy: string | undefined
}

/** Props every table cell receives. */
export interface CellProps {
  readonly field: FieldDescriptor
  readonly value: unknown
  readonly record: ApiRecord
  readonly resource: ResourceDescriptor
}

export type Widget = ComponentType<WidgetProps>
export type Cell = ComponentType<CellProps>

export interface Registry {
  /** By widget name or field type (`decimal`, `relation-picker`, …). Must contain `default`. */
  readonly widgets: Readonly<Record<string, Widget>>
  /** Per field: `Invoice.amount`. Highest priority. */
  readonly fieldWidgets: Readonly<Record<string, Widget>>
  /** By field type. Must contain `default`. */
  readonly cells: Readonly<Record<string, Cell>>
  /** Per column: `Invoice.amount`. Highest priority. */
  readonly fieldCells: Readonly<Record<string, Cell>>
  readonly messages: MessageCatalog
}

export type RegistryOverrides = {
  readonly [K in keyof Registry]?: Partial<Registry[K]>
}

export function resolveWidget(registry: Registry, resource: ResourceDescriptor, field: FieldDescriptor): Widget {
  return (
    registry.fieldWidgets[`${resource.name}.${field.name}`] ??
    (field.widget ? registry.widgets[field.widget] : undefined) ??
    registry.widgets[field.type] ??
    registry.widgets.default ??
    missing('widgets.default')
  )
}

export function resolveCell(registry: Registry, resource: ResourceDescriptor, field: FieldDescriptor): Cell {
  return (
    registry.fieldCells[`${resource.name}.${field.name}`] ??
    registry.cells[field.type] ??
    registry.cells.default ??
    missing('cells.default')
  )
}

function missing(what: string): never {
  throw new Error(`Strutvane UI registry is missing the required fallback "${what}".`)
}

/** Merge overrides on top of defaults (shallow per map; later wins). */
export function mergeRegistry(base: Registry, overrides: RegistryOverrides = {}): Registry {
  const pick = <T,>(a: Readonly<Record<string, T>>, b?: Partial<Readonly<Record<string, T>>>) =>
    ({ ...a, ...(b ?? {}) }) as Readonly<Record<string, T>>
  return {
    widgets: pick(base.widgets, overrides.widgets),
    fieldWidgets: pick(base.fieldWidgets, overrides.fieldWidgets),
    cells: pick(base.cells, overrides.cells),
    fieldCells: pick(base.fieldCells, overrides.fieldCells),
    messages: { ...defaultMessages, ...base.messages, ...(overrides.messages ?? {}) } as MessageCatalog,
  }
}

interface UIContextValue {
  readonly api: ResourceApi
  readonly manifest: ResourceManifest
  readonly registry: Registry
}

const UIContext = createContext<UIContextValue | null>(null)

export interface StrutvaneUIProviderProps {
  readonly api: ResourceApi
  readonly manifest: ResourceManifest
  /** Defaults (widgets.tsx / cells.tsx). Injected so the registry module stays dependency-free. */
  readonly defaults: Registry
  readonly overrides?: RegistryOverrides
  readonly children: ReactNode
}

/** Must be rendered inside a TanStack QueryClientProvider (the app owns its QueryClient). */
export function StrutvaneUIProvider({ api, manifest, defaults, overrides, children }: StrutvaneUIProviderProps) {
  const registry = useMemo(() => mergeRegistry(defaults, overrides), [defaults, overrides])
  const value = useMemo(() => ({ api, manifest, registry }), [api, manifest, registry])
  return <UIContext.Provider value={value}>{children}</UIContext.Provider>
}

export function useUI(): UIContextValue {
  const ctx = useContext(UIContext)
  if (!ctx) throw new Error('useUI() must be used inside <StrutvaneUIProvider>.')
  return ctx
}

/** Look up a resource descriptor by model name (e.g. a belongsTo target). */
export function useResource(name: string): ResourceDescriptor | undefined {
  const { manifest } = useUI()
  return manifest.resources.find((r) => r.name === name)
}
