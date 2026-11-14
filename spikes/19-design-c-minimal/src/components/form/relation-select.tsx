/**
 * RelationSelect: pick a related record (here, a customer) from a server search.
 *
 * Why a combobox and not a `<select>`: relations can have thousands of rows, so options are
 * fetched as you type. Each keystroke cancels the previous request (AbortController), so a slow
 * old response can never overwrite a newer one, and a spinner row shows while a search runs.
 *
 * @example
 * <RelationSelect value={customer} onChange={setCustomer} control={control} />
 */
import { Command } from 'cmdk'
import { Check, ChevronsUpDown, LoaderCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { type Customer, searchCustomers } from '../../data/people.ts'
import { cn } from '../../lib/cn.ts'
import { Avatar } from '../ui/avatar.tsx'
import type { FieldControlProps } from '../ui/field.tsx'
import { controlClasses } from '../ui/input.tsx'
import { Popover, PopoverContent } from '../ui/menu.tsx'

interface RelationSelectProps {
  value: Customer | null
  onChange: (customer: Customer) => void
  control: FieldControlProps
}

/** Debounced, cancellable search. Returns the latest results and whether a request is in flight. */
function useCustomerSearch(term: string, enabled: boolean): { results: Customer[]; loading: boolean } {
  const [results, setResults] = useState<Customer[]>([])
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    if (!enabled) return undefined
    const controller = new AbortController()
    setLoading(true)
    const timer = window.setTimeout(() => {
      searchCustomers(term, controller.signal)
        .then((found) => {
          setResults(found)
          setLoading(false)
        })
        .catch((error: unknown) => {
          // A cancelled search is expected while typing; anything else ends the spinner.
          if (!(error instanceof DOMException && error.name === 'AbortError')) setLoading(false)
        })
    }, 120)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [term, enabled])
  return { results, loading }
}

export function RelationSelect({ value, onChange, control }: RelationSelectProps) {
  const [open, setOpen] = useState(false)
  const [term, setTerm] = useState('')
  const { results, loading } = useCustomerSearch(term, open)

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          {...control}
          className={cn(controlClasses, 'flex h-control-md cursor-pointer items-center gap-2 px-2.5 text-left')}
        >
          {value === null ? (
            <span className="flex-1 text-fg-subtle">Search customers…</span>
          ) : (
            <>
              <Avatar name={value.name} tint={value.tint} shape="square" size="xs" />
              <span className="min-w-0 flex-1 truncate">{value.name}</span>
              <span className="hidden truncate text-xs text-fg-subtle sm:inline">{value.contact}</span>
            </>
          )}
          <ChevronsUpDown aria-hidden className="size-3.5 shrink-0 text-fg-subtle" />
        </button>
      </Popover.Trigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-72 p-0" align="start">
        <Command shouldFilter={false} label="Customers" className="flex flex-col">
          <Command.Input
            value={term}
            onValueChange={setTerm}
            placeholder="Search by company or contact…"
            className="h-10 border-b border-border bg-transparent px-3 text-sm text-fg outline-none placeholder:text-fg-subtle"
          />
          <Command.List className="scroll-quiet max-h-64 overflow-y-auto p-1">
            {loading && (
              <Command.Loading>
                <div className="flex h-8 items-center gap-2 px-2 text-sm text-fg-subtle">
                  <LoaderCircle aria-hidden className="size-3.5 animate-spin" /> Searching…
                </div>
              </Command.Loading>
            )}
            {!loading && results.length === 0 && <div className="px-2 py-6 text-center text-sm text-fg-subtle">No customers match “{term}”.</div>}
            {!loading &&
              results.map((customer) => (
                <Command.Item
                  key={customer.id}
                  value={customer.id}
                  onSelect={() => {
                    onChange(customer)
                    setOpen(false)
                  }}
                  className="flex h-10 cursor-pointer items-center gap-2.5 rounded-md px-2 text-sm text-fg data-[selected=true]:bg-subtle"
                >
                  <Avatar name={customer.name} tint={customer.tint} shape="square" size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{customer.name}</span>
                    <span className="block truncate text-xs text-fg-subtle">
                      {customer.contact} · {customer.country}
                    </span>
                  </span>
                  {value?.id === customer.id && <Check aria-hidden className="size-4 text-accent-text" />}
                </Command.Item>
              ))}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover.Root>
  )
}
