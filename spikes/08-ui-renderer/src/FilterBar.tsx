/**
 * Filter chips: pick a filterable field, one of ITS allowed operators, and a value. The value is
 * validated by `buildSimpleFilter` (the same function that parses URLs), so the UI can never send
 * a filter the server would reject. Active filters render as removable chips.
 */
import { type FormEvent, useId, useState } from 'react'
import type { FieldDescriptor, FilterOperator, ResourceDescriptor } from './contracts.ts'
import { buildSimpleFilter, type SimpleFilter } from './list-query-url.ts'

export const OPERATOR_LABELS: Readonly<Record<FilterOperator, string>> = {
  eq: 'is', ne: 'is not', gt: '>', gte: '≥', lt: '<', lte: '≤', in: 'is any of', nin: 'is none of',
  isNull: 'is empty', isNotNull: 'is not empty', contains: 'contains', startsWith: 'starts with',
  endsWith: 'ends with', between: 'is between',
}

/** Human-readable chip text, e.g. "Status is any of draft, sent". */
export function describeFilter(f: SimpleFilter, field: FieldDescriptor | undefined): string {
  const label = field?.label ?? f.field
  const op = OPERATOR_LABELS[f.op]
  switch (f.op) {
    case 'isNull':
    case 'isNotNull':
      return `${label} ${op}`
    case 'in':
    case 'nin':
      return `${label} ${op} ${f.values.join(', ')}`
    case 'between':
      return `${label} ${op} ${f.from} and ${f.to}`
    default:
      return `${label} ${op} ${String(f.value)}`
  }
}

export interface FilterBarProps {
  readonly resource: ResourceDescriptor
  readonly filters: readonly SimpleFilter[]
  readonly onAdd: (filter: SimpleFilter) => void
  readonly onRemove: (index: number) => void
}

export function FilterBar({ resource, filters, onAdd, onRemove }: FilterBarProps) {
  const filterable = resource.fields.filter((f) => f.filterOperators.length > 0)
  const ids = useId()
  const [fieldName, setFieldName] = useState(filterable[0]?.name ?? '')
  const field = filterable.find((f) => f.name === fieldName)
  const [op, setOp] = useState<FilterOperator | ''>(field?.filterOperators[0] ?? '')
  const [value, setValue] = useState('')
  const [valueTo, setValueTo] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (filterable.length === 0) return null

  const needsValue = op !== 'isNull' && op !== 'isNotNull' && op !== ''
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!field || op === '') return
    const raw =
      op === 'between' ? [value, valueTo] : op === 'in' || op === 'nin' ? value.split(',').map((v) => v.trim()) : op === 'isNull' || op === 'isNotNull' ? ['true'] : [value]
    const built = buildSimpleFilter(field, op, raw)
    if (!built) {
      setError(`Enter a valid value for ${field.label}.`)
      return
    }
    setError(null)
    setValue('')
    setValueTo('')
    onAdd(built)
  }

  return (
    <div>
      <form aria-label={`Filter ${resource.pluralLabel}`} onSubmit={submit} noValidate>
        <label htmlFor={`${ids}-field`}>Filter field</label>
        <select
          id={`${ids}-field`}
          value={fieldName}
          onChange={(e) => {
            const next = filterable.find((f) => f.name === e.target.value)
            setFieldName(e.target.value)
            setOp(next?.filterOperators[0] ?? '')
          }}
        >
          {filterable.map((f) => (
            <option key={f.name} value={f.name}>
              {f.label}
            </option>
          ))}
        </select>
        <label htmlFor={`${ids}-op`}>Operator</label>
        <select id={`${ids}-op`} value={op} onChange={(e) => setOp(e.target.value as FilterOperator)}>
          {(field?.filterOperators ?? []).map((o) => (
            <option key={o} value={o}>
              {OPERATOR_LABELS[o]}
            </option>
          ))}
        </select>
        {needsValue && (
          <>
            <label htmlFor={`${ids}-value`}>{op === 'between' ? 'From' : 'Value'}</label>
            <input
              id={`${ids}-value`}
              value={value}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? `${ids}-error` : undefined}
              onChange={(e) => setValue(e.target.value)}
            />
          </>
        )}
        {op === 'between' && (
          <>
            <label htmlFor={`${ids}-to`}>To</label>
            <input id={`${ids}-to`} value={valueTo} onChange={(e) => setValueTo(e.target.value)} />
          </>
        )}
        <button type="submit">Add filter</button>
        {error && (
          <p id={`${ids}-error`} role="alert">
            {error}
          </p>
        )}
      </form>
      {filters.length > 0 && (
        <ul aria-label="Active filters">
          {filters.map((f, i) => {
            const text = describeFilter(f, resource.fields.find((x) => x.name === f.field))
            return (
              <li key={`${f.field}-${f.op}-${i}`}>
                {text}{' '}
                <button type="button" aria-label={`Remove filter: ${text}`} onClick={() => onRemove(i)}>
                  ×
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
