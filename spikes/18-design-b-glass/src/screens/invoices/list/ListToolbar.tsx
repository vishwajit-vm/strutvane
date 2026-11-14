/**
 * The list toolbar: saved-view tabs, search, the filters popover, column visibility, density and
 * the table/grid view switch, plus the row of removable filter chips.
 */
import {
  IconAdjustmentsHorizontal,
  IconBookmarkPlus,
  IconColumns3,
  IconLayoutGrid,
  IconLayoutList,
  IconLineHeight,
  IconSearch,
  IconX,
} from '@tabler/icons-react'
import { Button } from '../../../components/ui/button.tsx'
import { Input, InputGroup } from '../../../components/ui/input.tsx'
import { DropdownMenu, MenuCheckboxItem, MenuContent, MenuLabel, Popover, PopoverContent, PopoverTrigger } from '../../../components/ui/menu.tsx'
import { Select } from '../../../components/ui/select.tsx'
import { Checkbox } from '../../../components/ui/toggles.tsx'
import { INVOICE_STATUSES, STATUS_LABEL } from '../../../data/invoices.ts'
import { TEAM } from '../../../data/people.ts'
import { cn } from '../../../lib/cn.ts'
import { activeChips, SAVED_VIEWS, type ListQuery } from './list-state.ts'

export type ColumnId = 'customer' | 'owner' | 'issuedAt' | 'dueAt' | 'status' | 'collected' | 'total'
export type Density = 'comfortable' | 'compact'
export type ViewMode = 'table' | 'grid'

export const COLUMN_LABELS: Readonly<Record<ColumnId, string>> = {
  customer: 'Customer',
  owner: 'Owner',
  issuedAt: 'Issued',
  dueAt: 'Due',
  status: 'Status',
  collected: 'Collected',
  total: 'Amount',
}

const TAGS = ['Q4', 'Renewal', 'Enterprise', 'Net 30', 'Priority', 'EU VAT', 'Partner', 'Upsell'] as const

// ── Saved views ───────────────────────────────────────────────────────────

export function SavedViews({ active, counts, onSelect, onSave }: { active: string | null; counts: Readonly<Record<string, number>>; onSelect: (id: string) => void; onSave: () => void }) {
  return (
    <div className="flex items-center gap-2 border-b border-border px-4 sm:px-5">
      <div role="group" aria-label="Saved views" className="scroll-thin -mb-px flex min-w-0 flex-1 gap-1 overflow-x-auto">
        {SAVED_VIEWS.map((view) => {
          const selected = view.id === active
          return (
            <button
              key={view.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(view.id)}
              className={cn(
                'relative flex h-12 shrink-0 items-center gap-2 px-3 text-base font-semibold transition-fast',
                selected ? 'text-fg' : 'text-fg-muted hover:text-fg',
              )}
            >
              {view.label}
              <span className={cn('rounded-full px-1.5 text-2xs tabular', selected ? 'bg-primary-soft text-primary-soft-fg' : 'bg-neutral-soft text-fg-muted')}>{counts[view.id] ?? 0}</span>
              {selected && <span className="bg-brand-gradient absolute inset-x-2 bottom-0 h-0.5 rounded-full" aria-hidden />}
            </button>
          )
        })}
      </div>
      <Button variant="ghost" size="sm" onClick={onSave} className="hidden shrink-0 sm:inline-flex">
        <IconBookmarkPlus aria-hidden /> Save view
      </Button>
    </div>
  )
}

// ── Toolbar ───────────────────────────────────────────────────────────────

export interface ToolbarProps {
  readonly query: ListQuery
  readonly onQueryChange: (query: ListQuery) => void
  readonly columns: ReadonlySet<ColumnId>
  readonly onToggleColumn: (column: ColumnId) => void
  readonly density: Density
  readonly onDensityChange: (density: Density) => void
  readonly view: ViewMode
  readonly onViewChange: (view: ViewMode) => void
}

export function ListToolbar({ query, onQueryChange, columns, onToggleColumn, density, onDensityChange, view, onViewChange }: ToolbarProps) {
  const filterCount = query.statuses.length + (query.owner !== null ? 1 : 0) + (query.minAmount !== null ? 1 : 0) + query.tags.length
  return (
    <div className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:px-5">
      <InputGroup start={<IconSearch />} className="w-full sm:max-w-xs">
        <Input type="search" aria-label="Search invoices" placeholder="Search number, customer…" value={query.search} onChange={(event) => onQueryChange({ ...query, search: event.target.value })} className="h-9" />
      </InputGroup>
      <div className="flex items-center gap-2">
        <FiltersPopover query={query} onQueryChange={onQueryChange} count={filterCount} />
        <div className="ml-auto flex items-center gap-2 sm:ml-0">
          <ColumnsMenu columns={columns} onToggle={onToggleColumn} />
          <Button
            variant="outline"
            size="icon-sm"
            className="size-9"
            aria-label={density === 'compact' ? 'Comfortable rows' : 'Compact rows'}
            aria-pressed={density === 'compact'}
            onClick={() => onDensityChange(density === 'compact' ? 'comfortable' : 'compact')}
          >
            <IconLineHeight aria-hidden />
          </Button>
        </div>
      </div>
      <div role="group" aria-label="View" className="flex rounded-md border border-input bg-surface-input p-0.5 sm:ml-auto">
        {(
          [
            ['table', 'Table view', IconLayoutList],
            ['grid', 'Grid view', IconLayoutGrid],
          ] as const
        ).map(([mode, label, Icon]) => (
          <button
            key={mode}
            type="button"
            aria-label={label}
            aria-pressed={view === mode}
            onClick={() => onViewChange(mode)}
            className={cn('grid h-7 flex-1 place-items-center rounded-sm px-2.5 text-fg-muted transition-fast hover:text-fg sm:flex-none', view === mode && 'bg-primary-soft text-primary-soft-fg')}
          >
            <Icon className="size-4" aria-hidden />
          </button>
        ))}
      </div>
    </div>
  )
}

function FiltersPopover({ query, onQueryChange, count }: { query: ListQuery; onQueryChange: (query: ListQuery) => void; count: number }) {
  const toggleStatus = (status: (typeof INVOICE_STATUSES)[number]): void =>
    onQueryChange({ ...query, statuses: query.statuses.includes(status) ? query.statuses.filter((s) => s !== status) : [...query.statuses, status] })
  const toggleTag = (tag: string): void => onQueryChange({ ...query, tags: query.tags.includes(tag) ? query.tags.filter((t) => t !== tag) : [...query.tags, tag] })
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9">
          <IconAdjustmentsHorizontal aria-hidden /> Filters
          {count > 0 && <span className="bg-brand-gradient grid min-w-5 place-items-center rounded-full px-1 text-2xs text-primary-fg">{count}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(22rem,calc(100vw-2rem))]" aria-label="Filters">
        <div className="flex items-center justify-between">
          <h2 className="text-md font-semibold text-fg">Filters</h2>
          <Button variant="ghost" size="sm" onClick={() => onQueryChange({ ...query, statuses: [], owner: null, minAmount: null, tags: [] })}>
            Reset
          </Button>
        </div>
        <fieldset className="mt-3">
          <legend className="text-xs font-semibold text-fg-muted">Status</legend>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {INVOICE_STATUSES.map((status) => (
              <label key={status} className="flex items-center gap-2.5 rounded-sm px-1 py-1 text-base text-fg">
                <Checkbox checked={query.statuses.includes(status)} onCheckedChange={() => toggleStatus(status)} />
                {STATUS_LABEL[status]}
              </label>
            ))}
          </div>
        </fieldset>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div>
            <p className="mb-1.5 text-xs font-semibold text-fg-muted">
              Owner
            </p>
            <Select
              aria-label="Owner"
              size="sm"
              value={query.owner ?? 'any'}
              onValueChange={(value) => onQueryChange({ ...query, owner: value === 'any' ? null : value })}
              options={[{ value: 'any', label: 'Anyone' }, ...TEAM.filter((person) => person.role !== 'Viewer').map((person) => ({ value: person.id, label: person.name }))]}
            />
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold text-fg-muted">Minimum amount</p>
            <Select
              aria-label="Minimum amount"
              size="sm"
              value={query.minAmount === null ? 'any' : String(query.minAmount)}
              onValueChange={(value) => onQueryChange({ ...query, minAmount: value === 'any' ? null : Number(value) })}
              options={[
                { value: 'any', label: 'Any amount' },
                { value: '1000', label: '$1,000+' },
                { value: '5000', label: '$5,000+' },
                { value: '10000', label: '$10,000+' },
                { value: '25000', label: '$25,000+' },
              ]}
            />
          </div>
        </div>
        <fieldset className="mt-4">
          <legend className="text-xs font-semibold text-fg-muted">Tags</legend>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {TAGS.map((tag) => {
              const on = query.tags.includes(tag)
              return (
                <button
                  key={tag}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleTag(tag)}
                  className={cn(
                    'h-7 rounded-full border px-2.5 text-xs font-semibold transition-fast',
                    on ? 'border-control bg-primary-soft text-primary-soft-fg' : 'border-input text-fg-muted hover:text-fg',
                  )}
                >
                  {tag}
                </button>
              )
            })}
          </div>
        </fieldset>
      </PopoverContent>
    </Popover>
  )
}

function ColumnsMenu({ columns, onToggle }: { columns: ReadonlySet<ColumnId>; onToggle: (column: ColumnId) => void }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="outline" size="icon-sm" className="size-9" aria-label="Columns">
          <IconColumns3 aria-hidden />
        </Button>
      </DropdownMenu.Trigger>
      <MenuContent align="end">
        <MenuLabel>Show columns</MenuLabel>
        {(Object.keys(COLUMN_LABELS) as ColumnId[]).map((column) => (
          <MenuCheckboxItem key={column} checked={columns.has(column)} onCheckedChange={() => onToggle(column)} onSelect={(event) => event.preventDefault()}>
            {COLUMN_LABELS[column]}
          </MenuCheckboxItem>
        ))}
      </MenuContent>
    </DropdownMenu.Root>
  )
}

// ── Filter chips ──────────────────────────────────────────────────────────

export function FilterChips({ query, onQueryChange }: { query: ListQuery; onQueryChange: (query: ListQuery) => void }) {
  const chips = activeChips(query, (id) => TEAM.find((person) => person.id === id)?.name ?? id)
  if (chips.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 pb-3.5 sm:px-5">
      {chips.map((chip) => (
        <span key={chip.id} className="inline-flex h-7 items-center gap-1 rounded-full border border-glass-border bg-primary-soft pr-1 pl-3 text-xs font-semibold text-primary-soft-fg">
          {chip.label}
          <button type="button" aria-label={`Remove filter ${chip.label}`} onClick={() => onQueryChange(chip.remove(query))} className="grid size-5 place-items-center rounded-full hover:bg-glass-hover">
            <IconX className="size-3" aria-hidden />
          </button>
        </span>
      ))}
      <button type="button" onClick={() => onQueryChange({ ...query, statuses: [], owner: null, minAmount: null, tags: [] })} className="text-xs font-semibold text-primary-text hover:underline">
        Clear all
      </button>
    </div>
  )
}
