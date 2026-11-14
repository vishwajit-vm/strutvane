/**
 * Command palette (Ctrl/⌘+K): jump to any page, find an invoice by number or customer, or run an
 * action. A Radix Dialog holding an ARIA combobox + listbox: typing filters, ↑/↓ move, Enter runs,
 * Escape closes and returns focus to where the user was.
 */
import { IconArrowRight, IconCornerDownLeft, IconFileInvoice, IconMoon, IconPlus, IconSearch, IconUserPlus } from '@tabler/icons-react'
import { Dialog as RadixDialog } from 'radix-ui'
import { useId, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { StatusBadge } from '../components/data-display.tsx'
import { Kbd } from '../components/ui/misc.tsx'
import { INVOICES } from '../data/invoices.ts'
import { cn } from '../lib/cn.ts'
import { formatMoney } from '../lib/format.ts'
import { useTheme } from '../lib/theme.tsx'
import { NAV_GROUPS } from './navigation.ts'
import { useShell } from './shell-state.tsx'

interface Command {
  readonly id: string
  readonly group: 'Pages' | 'Invoices' | 'Actions'
  readonly label: string
  readonly hint?: ReactNode
  readonly icon: ReactNode
  readonly keywords: string
  readonly run: () => void
}

export function CommandPalette() {
  const { paletteOpen, setPaletteOpen } = useShell()
  return (
    <RadixDialog.Root open={paletteOpen} onOpenChange={setPaletteOpen}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="animate-glass-fade fixed inset-0 z-(--z-overlay) bg-scrim" />
        <RadixDialog.Content
          aria-describedby={undefined}
          className="glass-overlay animate-glass-in fixed top-[12vh] left-1/2 z-(--z-overlay) flex max-h-[min(34rem,76vh)] w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 flex-col overflow-hidden rounded-2xl"
        >
          <RadixDialog.Title className="sr-only">Command palette</RadixDialog.Title>
          {/* Re-mount on open so the query and selection start fresh every time. */}
          {paletteOpen && <PaletteBody onClose={() => setPaletteOpen(false)} />}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}

function PaletteBody({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const { resolved, setTheme } = useTheme()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const listId = useId()

  const commands = useMemo<Command[]>(() => {
    const go = (to: string) => () => {
      void navigate(to)
      onClose()
    }
    const pages: Command[] = NAV_GROUPS.flatMap((group) =>
      group.items.map((item) => ({
        id: `page-${item.to}`,
        group: 'Pages' as const,
        label: item.label,
        hint: group.label,
        icon: <item.icon aria-hidden />,
        keywords: `${item.label} ${group.label}`,
        run: go(item.to),
      })),
    )
    const invoices: Command[] = INVOICES.map((invoice) => ({
      id: `invoice-${invoice.id}`,
      group: 'Invoices' as const,
      label: `${invoice.number} · ${invoice.customer.name}`,
      hint: (
        <span className="flex items-center gap-2">
          <span className="tabular">{formatMoney(invoice.total)}</span>
          <StatusBadge status={invoice.status} />
        </span>
      ),
      icon: <IconFileInvoice aria-hidden />,
      keywords: `${invoice.number} ${invoice.customer.name} ${invoice.customer.contact}`,
      run: go(`/invoices/${invoice.id}`),
    }))
    const actions: Command[] = [
      { id: 'new-invoice', group: 'Actions', label: 'Create invoice', icon: <IconPlus aria-hidden />, keywords: 'new add create invoice', run: go('/invoices/new') },
      { id: 'invite', group: 'Actions', label: 'Invite team member', icon: <IconUserPlus aria-hidden />, keywords: 'invite member user team', run: go('/team') },
      {
        id: 'theme',
        group: 'Actions',
        label: resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
        icon: <IconMoon aria-hidden />,
        keywords: 'theme dark light mode appearance',
        run: () => {
          setTheme(resolved === 'dark' ? 'light' : 'dark')
          onClose()
        },
      },
    ]
    return [...pages, ...invoices, ...actions]
  }, [navigate, onClose, resolved, setTheme])

  const results = useMemo(() => {
    const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean)
    const matches = commands.filter((command) => terms.every((term) => command.keywords.toLowerCase().includes(term)))
    // Without a query, show pages + actions and only a few recent invoices.
    const invoiceLimit = terms.length === 0 ? 3 : 6
    let invoiceCount = 0
    return matches.filter((command) => command.group !== 'Invoices' || invoiceCount++ < invoiceLimit)
  }, [commands, query])

  const activeIndex = Math.min(active, Math.max(0, results.length - 1))
  const activeCommand = results[activeIndex]

  const onKeyDown = (event: React.KeyboardEvent): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((activeIndex + step + results.length) % Math.max(1, results.length))
    } else if (event.key === 'Enter' && activeCommand !== undefined) {
      event.preventDefault()
      activeCommand.run()
    }
  }

  return (
    <>
      <div className="flex items-center gap-3 border-b border-border px-4">
        <IconSearch className="size-5 shrink-0 text-fg-muted" aria-hidden />
        <input
          autoFocus
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-label="Search pages, invoices and actions"
          aria-activedescendant={activeCommand !== undefined ? `${listId}-${activeCommand.id}` : undefined}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(0)
          }}
          onKeyDown={onKeyDown}
          placeholder="Search pages, invoices, actions…"
          className="h-14 min-w-0 flex-1 bg-transparent text-md text-fg outline-none placeholder:text-fg-muted"
        />
        <Kbd>Esc</Kbd>
      </div>
      <div id={listId} role="listbox" aria-label="Results" className="scroll-thin min-h-0 flex-1 overflow-y-auto p-2">
        {results.length === 0 && <p className="px-3 py-10 text-center text-base text-fg-muted">No results for “{query}”.</p>}
        {(['Pages', 'Invoices', 'Actions'] as const).map((group) => {
          const items = results.filter((command) => command.group === group)
          if (items.length === 0) return null
          return (
            <div key={group} role="group" aria-label={group} className="mb-1">
              <div className="px-3 pt-2 pb-1 text-2xs font-semibold tracking-[0.08em] text-fg-muted uppercase" aria-hidden>
                {group}
              </div>
              {items.map((command) => {
                const selected = command === activeCommand
                return (
                  <div
                    key={command.id}
                    id={`${listId}-${command.id}`}
                    role="option"
                    aria-selected={selected}
                    onMouseMove={() => setActive(results.indexOf(command))}
                    onClick={command.run}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-base text-fg [&_svg]:size-[1.1rem]',
                      selected && 'bg-primary-soft text-primary-soft-fg',
                    )}
                  >
                    <span className={cn('shrink-0', selected ? 'text-primary-soft-fg' : 'text-fg-muted')}>{command.icon}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{command.label}</span>
                    {command.hint !== undefined && <span className="hidden shrink-0 text-xs text-fg-muted sm:block">{command.hint}</span>}
                    {selected && <IconArrowRight className="shrink-0" aria-hidden />}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
      <div className="flex items-center gap-4 border-t border-border px-4 py-2.5 text-xs text-fg-muted">
        <span className="flex items-center gap-1.5">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> to move
        </span>
        <span className="flex items-center gap-1.5">
          <Kbd>
            <IconCornerDownLeft className="size-3" aria-label="Enter" />
          </Kbd>
          to open
        </span>
      </div>
    </>
  )
}
