/**
 * The command palette (Ctrl/⌘ K): Direction C's primary navigation tool, not an afterthought.
 *
 * - Empty query: recent records, every destination (with its `G` shortcut) and common actions.
 * - Typing: fuzzy-matches destinations and actions (cmdk) and searches all 238 invoices by number,
 *   customer or contact, showing status and amount so the right record is obvious before Enter.
 * - Sub-pages: "Change theme…" opens a nested list with a breadcrumb chip; Backspace on an empty
 *   query (or the chip's ×) goes back. Escape always closes.
 *
 * Built on cmdk (MIT) inside a Radix dialog so it has a real title for screen readers.
 */
import { Command } from 'cmdk'
import {
  ArrowRight,
  CalendarDays,
  ChevronRight,
  CornerDownLeft,
  FilePlus2,
  Keyboard,
  LayoutDashboard,
  LogOut,
  Monitor,
  Moon,
  Receipt,
  Search,
  Settings,
  SquareKanban,
  Sun,
  SunMoon,
  UserPlus,
  Users,
  X,
} from 'lucide-react'
import { Dialog, VisuallyHidden } from 'radix-ui'
import { type ReactNode, useMemo, useState } from 'react'
import { STATUS_TONE } from '../components/invoice-bits.tsx'
import { Kbd, StatusDot } from '../components/ui/badge.tsx'
import { filterInvoices, EMPTY_FILTERS, invoiceById, invoices } from '../data/invoices.ts'
import { formatMoney } from '../lib/format.ts'
import { useRouter } from '../lib/router.tsx'
import { type ThemeMode, useTheme } from '../lib/theme.tsx'
import { useOverlays } from './overlays.tsx'
import { GO_TO } from './shortcuts.ts'

const NAV_ICONS: Record<string, ReactNode> = {
  '/': <LayoutDashboard aria-hidden />,
  '/invoices': <Receipt aria-hidden />,
  '/invoices/board': <SquareKanban aria-hidden />,
  '/invoices/calendar': <CalendarDays aria-hidden />,
  '/settings/team': <Users aria-hidden />,
  '/settings/profile': <Settings aria-hidden />,
}

const RECENT_IDS = ['inv-2264', 'inv-2277', 'inv-2259'] as const

type Page = 'root' | 'theme'

const itemClasses =
  'group flex h-10 cursor-pointer select-none items-center gap-3 rounded-md px-2.5 text-sm text-fg outline-none data-[selected=true]:bg-subtle [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-fg-subtle data-[selected=true]:[&>svg]:text-fg'

const groupClasses =
  '[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-fg-subtle'

/** Right-aligned key hints inside an item. */
function Keys({ keys }: { keys: readonly string[] }) {
  return (
    <span className="ml-auto flex items-center gap-1" aria-hidden>
      {keys.map((key) => (
        <Kbd key={key}>{key}</Kbd>
      ))}
    </span>
  )
}

export function CommandPalette() {
  const { paletteOpen, setPaletteOpen, setShortcutsOpen } = useOverlays()
  const { navigate } = useRouter()
  const { setMode, mode } = useTheme()
  const [query, setQuery] = useState('')
  const [page, setPage] = useState<Page>('root')

  const close = () => {
    setPaletteOpen(false)
    setQuery('')
    setPage('root')
  }
  const go = (to: string) => {
    close()
    navigate(to)
  }

  // Record search runs only once there is a query; the top 6 matches are enough to choose from.
  const matches = useMemo(() => (query.trim().length < 2 ? [] : filterInvoices(invoices, { ...EMPTY_FILTERS, search: query }).slice(0, 6)), [query])

  const themes: readonly { value: ThemeMode; label: string; icon: ReactNode }[] = [
    { value: 'light', label: 'Light', icon: <Sun aria-hidden /> },
    { value: 'dark', label: 'Dark', icon: <Moon aria-hidden /> },
    { value: 'system', label: 'Match system', icon: <Monitor aria-hidden /> },
  ]

  return (
    <Dialog.Root open={paletteOpen} onOpenChange={(open) => (open ? setPaletteOpen(true) : close())}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay animate-fade-in" />
        <Dialog.Content
          aria-describedby={undefined}
          className="fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-24px)] max-w-[640px] -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-surface shadow-pop animate-pop-in outline-none"
        >
          <VisuallyHidden.Root>
            <Dialog.Title>Command palette</Dialog.Title>
          </VisuallyHidden.Root>
          <Command
            label="Command palette"
            loop
            onKeyDown={(event) => {
              if (event.key === 'Backspace' && query === '' && page !== 'root') {
                event.preventDefault()
                setPage('root')
              }
            }}
          >
            <div className="flex h-12 items-center gap-2 border-b border-border px-4">
              <Search aria-hidden className="size-4 shrink-0 text-fg-subtle" />
              {page === 'theme' && (
                <span className="inline-flex h-6 shrink-0 items-center gap-1 rounded-sm bg-subtle pl-2 pr-1 text-xs font-medium text-fg-muted">
                  Theme
                  <button type="button" aria-label="Back to all commands" onClick={() => setPage('root')} className="inline-flex size-4 cursor-pointer items-center justify-center rounded-xs hover:bg-muted">
                    <X aria-hidden className="size-3" />
                  </button>
                </span>
              )}
              <Command.Input
                value={query}
                onValueChange={setQuery}
                placeholder={page === 'theme' ? 'Choose a theme…' : 'Search invoices, pages and actions…'}
                className="h-full min-w-0 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-fg-subtle"
              />
              <Kbd aria-hidden className="hidden sm:inline-flex">
                Esc
              </Kbd>
            </div>
            <Command.List className="scroll-quiet max-h-[min(420px,60vh)] overflow-y-auto overscroll-contain px-2 pb-2">
              <Command.Empty className="flex flex-col items-center gap-1 py-12 text-center">
                <span className="text-sm font-medium text-fg">No results for “{query}”</span>
                <span className="text-xs text-fg-subtle">Try an invoice number like 2264 or a customer name.</span>
              </Command.Empty>

              {page === 'theme' ? (
                <Command.Group heading="Theme" className={groupClasses}>
                  {themes.map((theme) => (
                    <Command.Item
                      key={theme.value}
                      value={`theme ${theme.label}`}
                      onSelect={() => {
                        setMode(theme.value)
                        close()
                      }}
                      className={itemClasses}
                    >
                      {theme.icon}
                      {theme.label}
                      {mode === theme.value && <span className="ml-auto text-xs text-fg-subtle">Current</span>}
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : (
                <>
                  {matches.length > 0 && (
                    <Command.Group heading="Invoices" className={groupClasses}>
                      {matches.map((invoice) => (
                        <Command.Item
                          key={invoice.id}
                          value={`${invoice.number} ${invoice.customer.name} ${invoice.customer.contact}`}
                          onSelect={() => go(`/invoices/${invoice.id}`)}
                          className={itemClasses}
                        >
                          <Receipt aria-hidden />
                          <span className="num w-20 shrink-0 text-fg-muted">{invoice.number}</span>
                          <span className="min-w-0 flex-1 truncate">{invoice.customer.name}</span>
                          <StatusDot tone={STATUS_TONE[invoice.status]} />
                          <span className="num hidden w-28 shrink-0 text-right text-fg-muted sm:block">{formatMoney(invoice.amount, invoice.currency)}</span>
                        </Command.Item>
                      ))}
                    </Command.Group>
                  )}

                  {query === '' && (
                    <Command.Group heading="Recent" className={groupClasses}>
                      {RECENT_IDS.map((id) => invoiceById(id)).map(
                        (invoice) =>
                          invoice !== undefined && (
                            <Command.Item key={invoice.id} value={`recent ${invoice.number} ${invoice.customer.name}`} onSelect={() => go(`/invoices/${invoice.id}`)} className={itemClasses}>
                              <Receipt aria-hidden />
                              <span className="num text-fg-muted">{invoice.number}</span>
                              <span className="min-w-0 flex-1 truncate">{invoice.customer.name}</span>
                              <CornerDownLeft aria-hidden className="ml-auto size-3.5 opacity-0 group-data-[selected=true]:opacity-100" />
                            </Command.Item>
                          ),
                      )}
                    </Command.Group>
                  )}

                  <Command.Group heading="Go to" className={groupClasses}>
                    {GO_TO.map((item) => (
                      <Command.Item key={item.to} value={item.label} keywords={['navigate', 'open']} onSelect={() => go(item.to)} className={itemClasses}>
                        {NAV_ICONS[item.to]}
                        {item.label.replace('Go to ', '').replace(/^./, (letter) => letter.toUpperCase())}
                        <Keys keys={item.keys} />
                      </Command.Item>
                    ))}
                  </Command.Group>

                  <Command.Group heading="Actions" className={groupClasses}>
                    <Command.Item value="Create new invoice" keywords={['add', 'new']} onSelect={() => go('/invoices/new')} className={itemClasses}>
                      <FilePlus2 aria-hidden /> Create invoice
                      <Keys keys={['C']} />
                    </Command.Item>
                    <Command.Item value="Invite team member" keywords={['add', 'user', 'people']} onSelect={() => go('/settings/team?invite=1')} className={itemClasses}>
                      <UserPlus aria-hidden /> Invite team member
                    </Command.Item>
                    <Command.Item
                      value="Change theme"
                      keywords={['dark', 'light', 'appearance', 'mode']}
                      onSelect={() => {
                        setQuery('')
                        setPage('theme')
                      }}
                      className={itemClasses}
                    >
                      <SunMoon aria-hidden /> Change theme…
                      <ChevronRight aria-hidden className="ml-auto size-4 text-fg-subtle" />
                    </Command.Item>
                    <Command.Item
                      value="Keyboard shortcuts"
                      keywords={['help', 'keys', 'hotkeys']}
                      onSelect={() => {
                        close()
                        setShortcutsOpen(true)
                      }}
                      className={itemClasses}
                    >
                      <Keyboard aria-hidden /> Keyboard shortcuts
                      <Keys keys={['?']} />
                    </Command.Item>
                    <Command.Item value="Sign out" keywords={['log out', 'logout']} onSelect={() => go('/sign-in')} className={itemClasses}>
                      <LogOut aria-hidden /> Sign out
                    </Command.Item>
                  </Command.Group>
                </>
              )}
            </Command.List>
            <div className="flex h-10 items-center gap-4 border-t border-border bg-subtle/60 px-4 text-xs text-fg-subtle">
              <span className="flex items-center gap-1.5">
                <Kbd aria-hidden>↑</Kbd>
                <Kbd aria-hidden>↓</Kbd> Navigate
              </span>
              <span className="flex items-center gap-1.5">
                <Kbd aria-hidden>↵</Kbd> Open
              </span>
              <span className="ml-auto hidden items-center gap-1.5 sm:flex">
                <ArrowRight aria-hidden className="size-3" /> Type <span className="num text-fg-muted">2264</span> to jump to an invoice
              </span>
            </div>
          </Command>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
