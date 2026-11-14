/**
 * `<FilterPanel>`: one typed control per filterable field (design doc §4.5), all compiled to
 * spike 10's `filter[field][op]=value`:
 *
 * | Field type        | Control                     | Sends                    |
 * |-------------------|-----------------------------|--------------------------|
 * | boolean           | Any / Yes / No              | `featured.eq=true`       |
 * | enum              | checkbox group              | `status.in=draft,published` |
 * | foreign key       | async relation select       | `author_id.eq=3`         |
 * | number / decimal  | min and max                 | `price.gte`, `price.lte` |
 * | date / timestamp  | from and to                 | `published_on.gte`, `.lte` |
 * | text / slug       | "contains"                  | `title.contains=launch`  |
 *
 * Selects and checkboxes apply at once; typed inputs apply on Enter or when focus leaves, so a
 * half-typed number never fires a request.
 *
 * @module
 */
import { useId, useState, type ReactElement } from 'react'
import type { FieldMetadata, FilterOperator } from '../../shared/metadata.ts'
import type { ResolvedResourceUi } from '../../shared/resolve-ui.ts'
import { filterKey, type FilterState } from '../api/list-params.ts'
import { Input } from '../components/ui/input.tsx'
import { NativeSelect } from '../components/ui/native-select.tsx'
import { useRegistry } from '../registry.tsx'
import { RelationSelect } from './widgets/RelationSelect.tsx'

/**
 * Props of {@link FilterPanel}.
 *
 * @example
 * const props: FilterPanelProps = { resource: posts, filters: {}, onFilter: setFilter }
 */
export interface FilterPanelProps {
  readonly resource: ResolvedResourceUi
  readonly filters: FilterState
  /** Set (or with `''`, clear) one filter by key (`price.gte`). */
  readonly onFilter: (key: string, value: string) => void
}

/**
 * The filter controls of a list.
 *
 * @example
 * <FilterPanel resource={posts} filters={params.filters} onFilter={setFilter} />
 */
export function FilterPanel({ resource, filters, onFilter }: FilterPanelProps): ReactElement {
  return (
    <div className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-3">
      {resource.filterFields.map((field) => (
        <FilterControl key={field.name} field={field} filters={filters} onFilter={onFilter} />
      ))}
    </div>
  )
}

/** Pick the control for one field's type. */
function FilterControl({ field, filters, onFilter }: { readonly field: FieldMetadata; readonly filters: FilterState; readonly onFilter: FilterPanelProps['onFilter'] }): ReactElement | null {
  const { byName } = useRegistry()
  const target = field.references === undefined ? undefined : byName.get(field.references)
  if (target !== undefined) return <RelationFilter field={field} target={target} filters={filters} onFilter={onFilter} />
  if (field.kind === 'boolean') return <BooleanFilter field={field} filters={filters} onFilter={onFilter} />
  if (field.options !== undefined && field.filterOperators.includes('in')) return <EnumFilter field={field} options={field.options} filters={filters} onFilter={onFilter} />
  if (field.kind === 'date' || field.kind === 'timestamp') return <RangeFilter field={field} filters={filters} onFilter={onFilter} inputType="date" />
  if (field.cast === 'integer' || field.cast === 'number' || field.cast === 'decimal') return <RangeFilter field={field} filters={filters} onFilter={onFilter} inputType="number" />
  const textOperator = (['contains', 'startsWith', 'eq'] as const).find((operator) => field.filterOperators.includes(operator))
  return textOperator === undefined ? null : <TextFilter field={field} operator={textOperator} filters={filters} onFilter={onFilter} />
}

interface ControlProps {
  readonly field: FieldMetadata
  readonly filters: FilterState
  readonly onFilter: FilterPanelProps['onFilter']
}

function BooleanFilter({ field, filters, onFilter }: ControlProps): ReactElement {
  const id = useId()
  const key = filterKey(field.name, 'eq')
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {field.label}
      </label>
      <NativeSelect id={id} value={filters[key] ?? ''} onChange={(event) => onFilter(key, event.target.value)}>
        <option value="">Any</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </NativeSelect>
    </div>
  )
}

function EnumFilter({ field, options, filters, onFilter }: ControlProps & { readonly options: readonly string[] }): ReactElement {
  const key = filterKey(field.name, 'in')
  const chosen = new Set((filters[key] ?? '').split(',').filter((value) => value !== ''))
  const toggle = (option: string, on: boolean): void => {
    if (on) chosen.add(option)
    else chosen.delete(option)
    // Keep the metadata's order, so the URL is stable whatever order boxes were ticked in.
    onFilter(key, options.filter((value) => chosen.has(value)).join(','))
  }
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium">{field.label}</legend>
      <div className="flex flex-wrap gap-3">
        {options.map((option) => (
          <label key={option} className="inline-flex min-h-6 items-center gap-1.5 text-sm">
            <input type="checkbox" className="size-4 accent-primary" checked={chosen.has(option)} onChange={(event) => toggle(option, event.target.checked)} />
            {option}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function RelationFilter({ field, target, filters, onFilter }: ControlProps & { readonly target: ResolvedResourceUi }): ReactElement {
  const id = useId()
  const key = filterKey(field.name, 'eq')
  const raw = filters[key]
  const value = raw === undefined || !/^\d+$/.test(raw) ? null : Number(raw)
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {field.label}
      </label>
      <RelationSelect id={id} target={target} value={value} clearable onChange={(next) => onFilter(key, next === null ? '' : String(next))} />
    </div>
  )
}

function RangeFilter({ field, filters, onFilter, inputType }: ControlProps & { readonly inputType: 'number' | 'date' }): ReactElement {
  const fromKey = filterKey(field.name, 'gte')
  const toKey = filterKey(field.name, 'lte')
  // Timestamps are instants: a picked day becomes the user's local midnight (or end of day) in UTC.
  const toWire = (day: string, end: boolean): string => (field.kind === 'timestamp' && day !== '' ? localDayBoundary(day, end) : day)
  const fromWire = (value: string | undefined): string => (value === undefined ? '' : field.kind === 'timestamp' ? localDayOf(value) : value)
  return (
    <fieldset className="space-y-1.5">
      <legend className="text-sm font-medium">{field.label}</legend>
      <div className="flex items-center gap-2">
        <CommitInput label={inputType === 'date' ? 'From' : 'Min'} fieldLabel={field.label} type={inputType} value={fromWire(filters[fromKey])} onCommit={(value) => onFilter(fromKey, toWire(value, false))} />
        <CommitInput label={inputType === 'date' ? 'To' : 'Max'} fieldLabel={field.label} type={inputType} value={fromWire(filters[toKey])} onCommit={(value) => onFilter(toKey, toWire(value, true))} />
      </div>
    </fieldset>
  )
}

function TextFilter({ field, operator, filters, onFilter }: ControlProps & { readonly operator: FilterOperator }): ReactElement {
  const key = filterKey(field.name, operator)
  const label = operator === 'eq' ? `${field.label} is` : operator === 'startsWith' ? `${field.label} starts with` : `${field.label} contains`
  return (
    <div className="space-y-1.5">
      <CommitInput label={label} visibleLabel type="text" value={filters[key] ?? ''} onCommit={(value) => onFilter(key, value.trim())} />
    </div>
  )
}

/**
 * An input that reports its value on Enter or blur only. Its draft resets when the applied value
 * changes from outside (for example "Clear filters").
 */
function CommitInput({ label, fieldLabel, visibleLabel = false, type, value, onCommit }: { readonly label: string; readonly fieldLabel?: string; readonly visibleLabel?: boolean; readonly type: 'text' | 'number' | 'date'; readonly value: string; readonly onCommit: (value: string) => void }): ReactElement {
  const id = useId()
  const [draft, setDraft] = useState(value)
  const [applied, setApplied] = useState(value)
  if (applied !== value) {
    // The applied value changed elsewhere: adopt it (React's "adjust state on prop change" pattern).
    setApplied(value)
    setDraft(value)
  }
  const commit = (): void => {
    if (draft !== value) onCommit(draft)
  }
  const accessibleName = fieldLabel === undefined ? label : `${fieldLabel} ${label.toLowerCase()}`
  return (
    <div className="flex-1 space-y-1">
      <label htmlFor={id} className={visibleLabel ? 'text-sm font-medium' : 'sr-only'}>
        {visibleLabel ? label : accessibleName}
      </label>
      <Input
        id={id}
        type={type === 'number' ? 'text' : type}
        inputMode={type === 'number' ? 'decimal' : undefined}
        placeholder={visibleLabel ? undefined : label}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit()
          }
        }}
      />
    </div>
  )
}

/**
 * The UTC instant at the start (or end) of a day in the user's time zone.
 *
 * @example
 * localDayBoundary('2026-11-01', false) // '2026-10-31T18:30:00.000Z' in Asia/Kolkata
 */
export function localDayBoundary(day: string, end: boolean): string {
  const local = new Date(`${day}T${end ? '23:59:59.999' : '00:00:00.000'}`)
  return Number.isNaN(local.getTime()) ? day : local.toISOString()
}

/** The local calendar day of an ISO instant (the reverse of {@link localDayBoundary}). */
function localDayOf(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (number: number): string => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
