/**
 * The invoice list toolbar: search, saved views, the Filters popover, density, column visibility
 * and the view switch on one row (wrapping on phones), plus removable filter chips below.
 *
 * @module
 */
import { IconAdjustmentsHorizontal, IconBookmark, IconChevronDown, IconColumns3, IconLayoutList, IconLayoutRows, IconSearch, IconX } from '@tabler/icons-react'
import type { ReactElement } from 'react'
import { Button } from '../../components/ui/button.tsx'
import { Checkbox } from '../../components/ui/checkbox.tsx'
import { Label } from '../../components/ui/field.tsx'
import { Input, InputGroup } from '../../components/ui/input.tsx'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  Popover,
  PopoverClose,
  PopoverContent,
  PopoverTrigger,
} from '../../components/ui/menu.tsx'
import { Tooltip } from '../../components/ui/misc.tsx'
import { Select } from '../../components/ui/select.tsx'
import type { PaymentMethod } from '../../data/invoices.ts'
import { team } from '../../data/people.ts'
import { cn } from '../../lib/cn.ts'
import { formatMoney } from '../../lib/format.ts'
import { NO_FILTERS, OPTIONAL_COLUMNS, SAVED_VIEWS, type ColumnId, type InvoiceFilters } from './list-model.ts'
import { ViewSwitch } from './ViewSwitch.tsx'

export type Density = 'comfortable' | 'compact'

/** Props of {@link InvoiceToolbar}. */
export interface InvoiceToolbarProps {
  readonly filters: InvoiceFilters
  readonly onFiltersChange: (filters: InvoiceFilters) => void
  readonly savedView: string
  readonly onSavedViewChange: (id: string) => void
  readonly hidden: ReadonlySet<ColumnId>
  readonly onToggleColumn: (id: ColumnId) => void
  readonly density: Density
  readonly onDensityChange: (density: Density) => void
}

const METHODS: readonly PaymentMethod[] = ['Card', 'Bank transfer', 'Direct debit', 'PayPal']

/** How many advanced filters (not search, not status) are active. */
export function activeFilterCount(filters: InvoiceFilters): number {
  return [filters.ownerId !== '', filters.methods.length > 0, filters.minAmount !== null, filters.overdueOnlyDays !== null].filter(Boolean).length
}

export function InvoiceToolbar(props: InvoiceToolbarProps): ReactElement {
  const { filters, onFiltersChange } = props
  return (
    <div className="flex flex-wrap items-center gap-2 px-5 sm:px-6">
      <InputGroup start={<IconSearch />} className="w-full sm:w-72">
        <Input type="search" aria-label="Search invoices" placeholder="Search number, customer, email…" value={filters.search} onChange={(event) => onFiltersChange({ ...filters, search: event.target.value })} />
      </InputGroup>
      <SavedViews {...props} />
      <FiltersPopover {...props} />
      <div className="ml-auto flex items-center gap-2">
        <DensityToggle {...props} />
        <ColumnsMenu {...props} />
        <ViewSwitch current="table" />
      </div>
    </div>
  )
}

function SavedViews({ savedView, onSavedViewChange }: InvoiceToolbarProps): ReactElement {
  const current = SAVED_VIEWS.find((view) => view.id === savedView)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">
          <IconBookmark /> <span className="max-w-32 truncate">{current?.label ?? 'Custom view'}</span> <IconChevronDown className="size-4! text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>Saved views</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={savedView} onValueChange={onSavedViewChange}>
          {SAVED_VIEWS.map((view) => (
            <DropdownMenuRadioItem key={view.id} value={view.id}>
              {view.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function FiltersPopover({ filters, onFiltersChange }: InvoiceToolbarProps): ReactElement {
  const count = activeFilterCount(filters)
  const toggleMethod = (method: PaymentMethod): void => {
    const methods = filters.methods.includes(method) ? filters.methods.filter((item) => item !== method) : [...filters.methods, method]
    onFiltersChange({ ...filters, methods })
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn(count > 0 && 'border-primary text-primary-soft-foreground')}>
          <IconAdjustmentsHorizontal /> Filters
          {count > 0 ? <span className="grid size-5 place-items-center rounded-full bg-primary text-overline font-bold tracking-normal text-primary-foreground">{count}</span> : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Filters</h2>
          <Button variant="link" size="sm" onClick={() => onFiltersChange({ ...NO_FILTERS, search: filters.search, status: filters.status })}>
            Reset
          </Button>
        </div>
        <div className="flex flex-col gap-5 p-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="filter-owner">Owner</Label>
            <Select
              id="filter-owner"
              value={filters.ownerId === '' ? 'any' : filters.ownerId}
              onValueChange={(value) => onFiltersChange({ ...filters, ownerId: value === 'any' ? '' : value })}
              options={[{ value: 'any', label: 'Anyone' }, ...team.filter((member) => member.status === 'active').map((member) => ({ value: member.id, label: member.name }))]}
            />
          </div>
          <fieldset className="flex flex-col gap-2.5">
            <legend className="mb-2 text-label font-semibold">Payment method</legend>
            {METHODS.map((method) => {
              const id = `method-${method.replaceAll(' ', '-').toLowerCase()}`
              return (
                <div key={method} className="flex items-center gap-2.5">
                  <Checkbox id={id} checked={filters.methods.includes(method)} onCheckedChange={() => toggleMethod(method)} />
                  <Label htmlFor={id} className="font-medium">
                    {method}
                  </Label>
                </div>
              )
            })}
          </fieldset>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="filter-min">Minimum amount</Label>
            <InputGroup start="$">
              <Input
                id="filter-min"
                inputMode="numeric"
                placeholder="0"
                value={filters.minAmount ?? ''}
                onChange={(event) => {
                  const digits = event.target.value.replace(/\D/g, '')
                  onFiltersChange({ ...filters, minAmount: digits === '' ? null : Number(digits) })
                }}
              />
            </InputGroup>
          </div>
        </div>
        <div className="flex justify-end border-t border-border px-4 py-3">
          <PopoverClose asChild>
            <Button variant="primary" size="sm">
              Done
            </Button>
          </PopoverClose>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function DensityToggle({ density, onDensityChange }: InvoiceToolbarProps): ReactElement {
  const next: Density = density === 'comfortable' ? 'compact' : 'comfortable'
  return (
    <Tooltip content={density === 'comfortable' ? 'Compact rows' : 'Comfortable rows'} side="bottom">
      <Button variant="outline" size="icon" aria-label={`Row density: ${density}. Switch to ${next}.`} onClick={() => onDensityChange(next)}>
        {density === 'comfortable' ? <IconLayoutRows /> : <IconLayoutList />}
      </Button>
    </Tooltip>
  )
}

function ColumnsMenu({ hidden, onToggleColumn }: InvoiceToolbarProps): ReactElement {
  return (
    <DropdownMenu>
      <Tooltip content="Columns" side="bottom">
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="Show or hide columns">
            <IconColumns3 />
          </Button>
        </DropdownMenuTrigger>
      </Tooltip>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
        {OPTIONAL_COLUMNS.map((column) => (
          <DropdownMenuCheckboxItem key={column.id} checked={!hidden.has(column.id)} onCheckedChange={() => onToggleColumn(column.id)} onSelect={(event) => event.preventDefault()}>
            {column.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Removable chips for every active filter, plus "Clear all". */
export function FilterChips({ filters, onFiltersChange }: Pick<InvoiceToolbarProps, 'filters' | 'onFiltersChange'>): ReactElement | null {
  const chips: { readonly key: string; readonly label: string; readonly clear: InvoiceFilters }[] = []
  if (filters.search.trim() !== '') chips.push({ key: 'search', label: `Search: “${filters.search.trim()}”`, clear: { ...filters, search: '' } })
  if (filters.ownerId !== '') chips.push({ key: 'owner', label: `Owner: ${team.find((member) => member.id === filters.ownerId)?.name ?? 'Unknown'}`, clear: { ...filters, ownerId: '' } })
  for (const method of filters.methods) chips.push({ key: method, label: `Method: ${method}`, clear: { ...filters, methods: filters.methods.filter((item) => item !== method) } })
  if (filters.minAmount !== null) chips.push({ key: 'min', label: `Amount ≥ ${formatMoney(filters.minAmount)}`, clear: { ...filters, minAmount: null } })
  if (filters.overdueOnlyDays !== null) chips.push({ key: 'overdue', label: `Overdue ${filters.overdueOnlyDays}+ days`, clear: { ...filters, overdueOnlyDays: null } })
  if (chips.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2 px-5 sm:px-6">
      <span className="text-label text-muted-foreground">Active filters:</span>
      {chips.map((chip) => (
        <span key={chip.key} className="inline-flex h-7 items-center gap-1 rounded-full bg-primary-soft pl-3 pr-1 text-label font-medium text-primary-soft-foreground">
          {chip.label}
          <button type="button" onClick={() => onFiltersChange(chip.clear)} aria-label={`Remove filter ${chip.label}`} className="grid size-5 cursor-pointer place-items-center rounded-full hover:bg-primary/15">
            <IconX aria-hidden className="size-3.5" />
          </button>
        </span>
      ))}
      <Button variant="link" size="sm" onClick={() => onFiltersChange({ ...NO_FILTERS, status: filters.status })}>
        Clear all
      </Button>
    </div>
  )
}
