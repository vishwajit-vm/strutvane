/**
 * The list toolbar: saved views, search, filters on the left; density, columns and the view
 * switch on the right. Below it, active filters appear as removable chips.
 *
 * Search updates the URL after a 200 ms pause (typing stays instant), and `/` focuses it from
 * anywhere on the page, the convention users know from other tools.
 */
import { Check, ChevronDown, Columns3, ListFilter, Rows2, Rows3, Rows4, Search, X } from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import { useEffect, useRef, useState } from 'react'
import { STATUS_TONE } from '../../components/invoice-bits.tsx'
import { Avatar } from '../../components/ui/avatar.tsx'
import { Kbd, StatusDot } from '../../components/ui/badge.tsx'
import { Button } from '../../components/ui/button.tsx'
import { Checkbox, Segmented } from '../../components/ui/controls.tsx'
import { Input, InputGroup } from '../../components/ui/input.tsx'
import { Menu, MenuCheckboxItem, MenuContent, MenuItem, MenuLabel, MenuSeparator, Popover, PopoverContent } from '../../components/ui/menu.tsx'
import { type InvoiceFilters, type InvoiceStatus, invoices, SAVED_VIEWS, STATUS_LABELS, STATUSES, totalsByStatus } from '../../data/invoices.ts'
import { memberById, members } from '../../data/people.ts'
import { formatMoney } from '../../lib/format.ts'
import { shortcutBlocked } from '../../shell/shortcuts.ts'
import { activeFilterCount, type ListState } from './list-state.ts'
import { ViewSwitch } from './InvoicesHeader.tsx'
import { COLUMNS, type ColumnId, type Density } from './view-prefs.ts'

/** A partial change to the URL state; `null` removes a param. */
export type ListChange = Partial<Record<'q' | 'status' | 'owner' | 'min' | 'sort' | 'page' | 'size' | 'view', string | null>>

interface ToolbarProps {
  state: ListState
  onChange: (change: ListChange, options?: { push?: boolean }) => void
  density: Density
  onDensity: (density: Density) => void
  columns: readonly ColumnId[]
  onToggleColumn: (id: ColumnId) => void
  disabled?: boolean
}

const statusCounts = totalsByStatus(invoices)

function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

function SearchBox({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled: boolean }) {
  const [draft, setDraft] = useState(value)
  const input = useRef<HTMLInputElement>(null)

  // Follow outside changes (Clear all, saved view) without fighting the user's typing.
  useEffect(() => setDraft(value), [value])

  useEffect(() => {
    if (draft === value) return undefined
    const timer = window.setTimeout(() => onChange(draft), 200)
    return () => window.clearTimeout(timer)
  }, [draft, value, onChange])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !shortcutBlocked(event)) {
        event.preventDefault()
        input.current?.focus()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <InputGroup
      className="w-full sm:w-64"
      leading={<Search aria-hidden />}
      trailing={
        draft !== '' ? (
          <Button variant="ghost" size="icon-sm" aria-label="Clear search" onClick={() => setDraft('')} className="size-6">
            <X aria-hidden />
          </Button>
        ) : (
          <Kbd aria-hidden className="mr-0.5">
            /
          </Kbd>
        )
      }
    >
      <Input ref={input} type="search" aria-label="Search invoices" placeholder="Search invoices…" value={draft} disabled={disabled} onChange={(event) => setDraft(event.target.value)} className="[&::-webkit-search-cancel-button]:hidden" />
    </InputGroup>
  )
}

function FiltersPopover({ filters, onChange, disabled }: { filters: InvoiceFilters; onChange: ToolbarProps['onChange']; disabled: boolean }) {
  const count = activeFilterCount(filters)
  const setStatuses = (next: InvoiceStatus[]) => onChange({ status: next.length === 0 ? null : next.join(','), page: null })
  const setOwners = (next: string[]) => onChange({ owner: next.length === 0 ? null : next.join(','), page: null })
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <Button disabled={disabled} className={count > 0 ? 'border-accent/50 bg-accent-subtle/50 text-accent-text hover:bg-accent-subtle' : ''}>
          <ListFilter aria-hidden /> Filters
          {count > 0 && <span className="num -mr-1 inline-flex size-4 items-center justify-center rounded-xs bg-accent text-2xs text-accent-fg">{count}</span>}
        </Button>
      </Popover.Trigger>
      <PopoverContent className="w-80 p-0" aria-label="Filters">
        <fieldset className="border-b border-border p-3">
          <legend className="float-left mb-2 w-full text-xs font-medium text-fg-subtle">Status</legend>
          <div className="clear-both flex flex-col">
            {STATUSES.map((status) => (
              <label key={status} className="flex h-8 cursor-pointer items-center gap-2.5 rounded-md px-1.5 text-sm text-fg hover:bg-subtle">
                <Checkbox checked={filters.statuses.includes(status)} onCheckedChange={() => setStatuses(toggle(filters.statuses, status))} />
                <StatusDot tone={STATUS_TONE[status]} />
                <span className="flex-1">{STATUS_LABELS[status]}</span>
                <span className="num text-xs text-fg-subtle">{statusCounts[status].count}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="border-b border-border p-3">
          <legend className="float-left mb-2 w-full text-xs font-medium text-fg-subtle">Owner</legend>
          <div className="clear-both flex flex-col">
            {members
              .filter((member) => member.status === 'active' && member.role !== 'viewer')
              .map((member) => (
                <label key={member.id} className="flex h-8 cursor-pointer items-center gap-2.5 rounded-md px-1.5 text-sm text-fg hover:bg-subtle">
                  <Checkbox checked={filters.ownerIds.includes(member.id)} onCheckedChange={() => setOwners(toggle(filters.ownerIds, member.id))} />
                  <Avatar name={member.name} tint={member.tint} size="xs" />
                  {member.name}
                </label>
              ))}
          </div>
        </fieldset>
        <div className="p-3">
          <label htmlFor="filter-min" className="mb-2 block text-xs font-medium text-fg-subtle">
            Minimum amount (EUR)
          </label>
          <InputGroup leading={<span>€</span>}>
            <Input
              id="filter-min"
              inputMode="numeric"
              placeholder="0"
              className="num"
              value={filters.minAmount ?? ''}
              onChange={(event) => {
                const digits = event.target.value.replace(/\D/g, '')
                onChange({ min: digits === '' ? null : digits, page: null })
              }}
            />
          </InputGroup>
        </div>
        <div className="flex items-center justify-between border-t border-border px-3 py-2">
          <span className="text-xs text-fg-subtle">Filters apply as you choose</span>
          <Button variant="ghost" size="sm" disabled={count === 0} onClick={() => onChange({ status: null, owner: null, min: null, page: null })}>
            Reset
          </Button>
        </div>
      </PopoverContent>
    </Popover.Root>
  )
}

function SavedViewsMenu({ state, onChange }: { state: ListState; onChange: ToolbarProps['onChange'] }) {
  const current = state.view?.name ?? 'All invoices'
  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <Button variant="ghost" className="-ml-2 gap-1 px-2 font-semibold text-fg">
          {current}
          {state.edited && <span className="font-normal text-fg-subtle">(edited)</span>}
          <ChevronDown aria-hidden className="text-fg-subtle" />
        </Button>
      </Menu.Trigger>
      <MenuContent align="start" className="w-64">
        <MenuLabel>Saved views</MenuLabel>
        {SAVED_VIEWS.map((view) => {
          const active = (state.view?.id ?? 'all') === view.id
          return (
            <MenuItem key={view.id} onSelect={() => onChange({ view: view.id === 'all' ? null : view.id, q: null, status: null, owner: null, min: null, sort: null, page: null }, { push: true })}>
              <span className="flex-1">{view.name}</span>
              {active && <Check aria-hidden className="text-accent-text!" />}
            </MenuItem>
          )
        })}
        <MenuSeparator />
        <MenuItem disabled={!state.edited}>Save changes to view</MenuItem>
        <MenuItem>Save as new view…</MenuItem>
      </MenuContent>
    </Menu.Root>
  )
}

export function ListToolbar({ state, onChange, density, onDensity, columns, onToggleColumn, disabled = false }: ToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <SavedViewsMenu state={state} onChange={onChange} />
      <span aria-hidden className="mx-1 hidden h-5 w-px bg-border sm:block" />
      <SearchBox value={state.filters.search} disabled={disabled} onChange={(q) => onChange({ q: q === '' ? null : q, page: null })} />
      <FiltersPopover filters={state.filters} onChange={onChange} disabled={disabled} />
      <div className="ml-auto flex items-center gap-2">
        <Segmented
          aria-label="Row density"
          value={density}
          onValueChange={onDensity}
          className="max-md:hidden"
          items={[
            { value: 'compact', label: 'Compact rows', icon: <Rows4 aria-hidden />, iconOnly: true },
            { value: 'default', label: 'Default rows', icon: <Rows3 aria-hidden />, iconOnly: true },
            { value: 'comfortable', label: 'Comfortable rows', icon: <Rows2 aria-hidden />, iconOnly: true },
          ]}
        />
        <Menu.Root>
          <Menu.Trigger asChild>
            <Button aria-label="Columns" disabled={disabled}>
              <Columns3 aria-hidden /> <span className="max-sm:hidden">Columns</span>
            </Button>
          </Menu.Trigger>
          <MenuContent align="end" className="w-52">
            <MenuLabel>Visible columns</MenuLabel>
            <DropdownMenu.Group>
              {COLUMNS.map((column) => (
                <MenuCheckboxItem
                  key={column.id}
                  checked={columns.includes(column.id)}
                  // Keep the menu open so several columns can be toggled in one go.
                  onSelect={(event) => event.preventDefault()}
                  onCheckedChange={() => onToggleColumn(column.id)}
                >
                  {column.label}
                </MenuCheckboxItem>
              ))}
            </DropdownMenu.Group>
          </MenuContent>
        </Menu.Root>
        <ViewSwitch value="table" />
      </div>
    </div>
  )
}

/** Active filters as chips ("Status is Open, Overdue ×"), plus Clear all. Renders nothing when empty. */
export function FilterChips({ filters, onChange }: { filters: InvoiceFilters; onChange: ToolbarProps['onChange'] }) {
  const chips: { key: string; label: string; value: string; clear: ListChange }[] = []
  if (filters.search !== '') chips.push({ key: 'q', label: 'Search', value: `“${filters.search}”`, clear: { q: null } })
  if (filters.statuses.length > 0) chips.push({ key: 'status', label: 'Status is', value: filters.statuses.map((status) => STATUS_LABELS[status]).join(', '), clear: { status: null } })
  if (filters.ownerIds.length > 0) chips.push({ key: 'owner', label: 'Owner is', value: filters.ownerIds.map((id) => memberById(id).name.split(' ')[0]).join(', '), clear: { owner: null } })
  if (filters.minAmount !== null) chips.push({ key: 'min', label: 'Amount ≥', value: formatMoney(filters.minAmount * 100, 'EUR', true), clear: { min: null } })
  if (chips.length === 0) return null
  return (
    <ul className="flex flex-wrap items-center gap-1.5" aria-label="Active filters">
      {chips.map((chip) => (
        <li key={chip.key} className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-subtle/60 pl-2 pr-0.5 text-xs">
          <span className="text-fg-subtle">{chip.label}</span>
          <span className="font-medium text-fg">{chip.value}</span>
          <button
            type="button"
            aria-label={`Remove filter: ${chip.label} ${chip.value}`}
            onClick={() => onChange({ ...chip.clear, page: null })}
            className="ml-0.5 inline-flex size-6 cursor-pointer items-center justify-center rounded-sm text-fg-subtle hover:bg-muted hover:text-fg"
          >
            <X aria-hidden className="size-3" />
          </button>
        </li>
      ))}
      <li>
        <Button variant="ghost" size="sm" onClick={() => onChange({ q: null, status: null, owner: null, min: null, page: null })}>
          Clear all
        </Button>
      </li>
    </ul>
  )
}
