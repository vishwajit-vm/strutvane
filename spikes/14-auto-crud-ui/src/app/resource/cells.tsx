/**
 * How one value looks in a table cell or on the detail page, chosen by the field's type.
 *
 * Formatting uses `Intl` in the user's locale. Dates without a time are formatted in UTC, because
 * `2026-10-05` is a calendar day, not an instant: formatting it in a time zone west of UTC would
 * show the 4th.
 *
 * @module
 */
import { Link } from '@tanstack/react-router'
import { Check, Minus } from 'lucide-react'
import type { ReactElement } from 'react'
import type { FieldMetadata } from '../../shared/metadata.ts'
import type { ResolvedResourceUi } from '../../shared/resolve-ui.ts'
import type { ApiRow } from '../api/client.ts'
import { Badge } from '../components/ui/badge.tsx'
import { VisuallyHidden } from '../components/ui/skeleton.tsx'
import { recordRouteKey, recordTitle } from '../data/queries.ts'

/**
 * Is this field shown right-aligned (numbers line up by their digits)?
 *
 * @example
 * isNumeric(priceField) // true
 */
export function isNumeric(field: FieldMetadata): boolean {
  return field.cast === 'integer' || field.cast === 'number' || field.cast === 'decimal'
}

/**
 * Props of {@link FieldValue}.
 *
 * @example
 * const props: FieldValueProps = { field: priceField, value: '12.50' }
 */
export interface FieldValueProps {
  readonly field: FieldMetadata
  readonly value: unknown
  /** For foreign keys: the related resource and its rows (loaded in one batch by the caller). */
  readonly related?: { readonly resource: ResolvedResourceUi; readonly rows: ReadonlyMap<number, ApiRow> | undefined }
}

/**
 * Render a value by field type.
 *
 * @example
 * <FieldValue field={statusField} value="draft" /> // a "draft" badge
 */
export function FieldValue({ field, value, related }: FieldValueProps): ReactElement {
  if (value === null || value === undefined || value === '') return <EmptyValue />
  if (related !== undefined && typeof value === 'number') return <RelationValue id={value} {...related} />
  switch (field.kind) {
    case 'boolean':
      return <BooleanValue value={value === true} />
    case 'enum':
      return <Badge tone="muted">{String(value)}</Badge>
    case 'slug':
      return <code className="font-mono text-xs">{String(value)}</code>
    case 'date':
      return <>{formatDate(String(value))}</>
    case 'timestamp':
      return <time dateTime={String(value)} title={String(value)}>{formatDateTime(String(value))}</time>
    case 'json':
      return <code className="font-mono text-xs">{JSON.stringify(value)}</code>
    default:
      return isNumeric(field) ? <>{formatNumber(field, value)}</> : <span title={String(value)}>{String(value)}</span>
  }
}

function EmptyValue(): ReactElement {
  return (
    <span className="text-muted-foreground">
      <span aria-hidden="true">—</span>
      <VisuallyHidden>empty</VisuallyHidden>
    </span>
  )
}

/** Icon plus the word, so the meaning never depends on the icon or its colour alone. */
function BooleanValue({ value }: { readonly value: boolean }): ReactElement {
  const Icon = value ? Check : Minus
  return (
    <span className="inline-flex items-center gap-1">
      <Icon aria-hidden="true" className="size-4" />
      {value ? 'Yes' : 'No'}
    </span>
  )
}

function RelationValue({ id, resource, rows }: { readonly id: number; readonly resource: ResolvedResourceUi; readonly rows: ReadonlyMap<number, ApiRow> | undefined }): ReactElement {
  const row = rows?.get(id)
  // While titles load (or if the related row is gone), show the id rather than nothing.
  if (row === undefined) return <span className="text-muted-foreground">#{id}</span>
  return (
    <Link to="/$resource/$key" params={{ resource: resource.metadata.route, key: recordRouteKey(resource, row) }} className="text-primary underline-offset-4 hover:underline">
      {recordTitle(resource, row)}
    </Link>
  )
}

/**
 * Format a number or decimal string. Decimals keep their scale (`12.50`, not `12.5`), because
 * money with a missing zero looks like a bug.
 *
 * @example
 * formatNumber(priceField, '1234.5') // '1,234.50' in en-US
 */
export function formatNumber(field: FieldMetadata, value: unknown): string {
  const number = Number(value)
  if (!Number.isFinite(number)) return String(value)
  const scale = field.cast === 'decimal' ? (field.scale ?? 2) : undefined
  return new Intl.NumberFormat(undefined, scale === undefined ? {} : { minimumFractionDigits: scale, maximumFractionDigits: scale }).format(number)
}

/**
 * Format a `YYYY-MM-DD` calendar date (in UTC, so the day never shifts).
 *
 * @example
 * formatDate('2026-10-05') // 'Oct 5, 2026' in en-US
 */
export function formatDate(text: string): string {
  const date = new Date(`${text}T00:00:00Z`)
  return Number.isNaN(date.getTime()) ? text : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(date)
}

/**
 * Format an ISO timestamp in the user's own time zone.
 *
 * @example
 * formatDateTime('2026-11-01T09:00:00.000Z') // 'Nov 1, 2026, 2:30 PM' in Asia/Kolkata
 */
export function formatDateTime(text: string): string {
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? text : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}
