/**
 * Default table cells, keyed by field type (`default` is the required fallback). Cells are pure
 * presentational components; per-column overrides are registered as `Resource.field`.
 */
import type { Cell } from './registry.tsx'
import { useRelationOptions } from './relations.ts'

const EMPTY = '—'

export const DefaultCell: Cell = ({ value }) => <>{value === null || value === undefined || value === '' ? EMPTY : String(value)}</>

export const BooleanCell: Cell = ({ value }) => <>{value === true ? 'Yes' : value === false ? 'No' : EMPTY}</>

const decimalFormat = new Intl.NumberFormat('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const DecimalCell: Cell = ({ value }) => <>{typeof value === 'number' ? decimalFormat.format(value) : EMPTY}</>

export const RelationCell: Cell = ({ field, value }) => {
  const { options } = useRelationOptions(field.relation?.target)
  if (value === null || value === undefined) return <>{EMPTY}</>
  const label = options.find((o) => o.value === value)?.label
  return <>{label ?? String(value)}</>
}

export const defaultCells: Readonly<Record<string, Cell>> = Object.freeze({
  default: DefaultCell,
  boolean: BooleanCell,
  decimal: DecimalCell,
  money: DecimalCell,
  belongsTo: RelationCell,
})
