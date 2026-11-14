/**
 * `<FilterChips>`: every active search, filter and deleted-rows setting as a removable chip, plus
 * "Clear all". You see at a glance why the list is shorter, and undo any part in one click.
 *
 * @module
 */
import { IconX } from '@tabler/icons-react'
import type { ReactElement } from 'react'
import type { FieldMetadata } from '../../shared/metadata.ts'
import type { ResolvedResourceUi } from '../../shared/resolve-ui.ts'
import { withFilter, type ListParams } from '../api/list-params.ts'
import { Button } from '../components/ui/button.tsx'

/** Words for operators, so a chip reads like a sentence ("Price at least 10"). */
const OPERATOR_WORDS: Readonly<Record<string, string>> = {
  eq: 'is',
  ne: 'is not',
  in: 'is',
  gt: 'more than',
  gte: 'at least',
  lt: 'less than',
  lte: 'at most',
  contains: 'contains',
  startsWith: 'starts with',
  null: 'is empty',
}

/**
 * One chip: what it says, and the params without it.
 *
 * @example
 * const chip: Chip = { key: 'status.in', text: 'Status is draft', without: { ... } }
 */
export interface Chip {
  readonly key: string
  readonly text: string
  readonly without: Partial<ListParams>
}

/**
 * The chips for the current list params.
 *
 * @example
 * chipsFor(posts, { ...params, filters: { 'price.gte': '10' } }) // [{ text: 'Price at least 10', ... }]
 */
export function chipsFor(resource: ResolvedResourceUi, params: ListParams): Chip[] {
  const chips: Chip[] = []
  if (params.search.trim() !== '') chips.push({ key: 'search', text: `Search “${params.search.trim()}”`, without: { search: '', page: 1 } })
  for (const [key, value] of Object.entries(params.filters)) {
    const [name = '', operator = 'eq'] = key.split('.')
    const field = resource.metadata.fields.find((candidate) => candidate.name === name)
    chips.push({ key, text: chipText(field, name, operator, value), without: { filters: withFilter(params.filters, key, ''), page: 1 } })
  }
  if (params.trashed !== 'without') chips.push({ key: 'trashed', text: params.trashed === 'only' ? 'Only deleted' : 'Including deleted', without: { trashed: 'without', page: 1 } })
  return chips
}

function chipText(field: FieldMetadata | undefined, name: string, operator: string, value: string): string {
  const label = field?.label ?? name
  if (operator === 'null') return value === 'true' ? `${label} is empty` : `${label} is not empty`
  const shown = field?.kind === 'boolean' ? (value === 'true' ? 'Yes' : 'No') : value.split(',').join(' or ')
  return `${label} ${OPERATOR_WORDS[operator] ?? operator} ${shown}`
}

/**
 * The chip row (nothing when no filter is active).
 *
 * @example
 * <FilterChips resource={posts} params={params} onChange={update} />
 */
export function FilterChips({ resource, params, onChange }: { readonly resource: ResolvedResourceUi; readonly params: ListParams; readonly onChange: (patch: Partial<ListParams>) => void }): ReactElement | null {
  const chips = chipsFor(resource, params)
  if (chips.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="Active filters" role="group">
      {chips.map((chip) => (
        <span key={chip.key} className="inline-flex items-center gap-1 rounded-full bg-primary-soft py-1 pl-3 pr-1 text-sm text-primary-soft-foreground">
          {chip.text}
          <button type="button" aria-label={`Remove filter: ${chip.text}`} onClick={() => onChange(chip.without)} className="rounded-full p-0.5 hover:bg-primary hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <IconX aria-hidden="true" className="size-3.5" />
          </button>
        </span>
      ))}
      <Button variant="link" size="sm" onClick={() => onChange({ search: '', filters: {}, trashed: 'without', page: 1 })}>
        Clear all
      </Button>
    </div>
  )
}
