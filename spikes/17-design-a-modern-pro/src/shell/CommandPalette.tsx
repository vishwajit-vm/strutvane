/**
 * The command palette (Ctrl+K / ⌘K): jump to any screen, run a quick action or open a recent
 * invoice, all from the keyboard. Built on `cmdk` (fuzzy filtering, arrow-key selection, ARIA
 * combobox/listbox) inside a Radix dialog (focus trap, Escape, return focus).
 *
 * `useCommandPalette().open()` lets any button open it (top-bar search, UI kit page).
 *
 * @example
 * <CommandPaletteProvider><AppShell /></CommandPaletteProvider>
 * const { open } = useCommandPalette()
 */
import { IconArrowRight, IconFileInvoice, IconMoon, IconPlus, IconSearch, IconUserPlus } from '@tabler/icons-react'
import { Command } from 'cmdk'
import { Dialog as DialogPrimitive, VisuallyHidden } from 'radix-ui'
import { createContext, useContext, useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react'
import { SCREENS } from '../app/screens.ts'
import { STATUS_META } from '../components/data-display.tsx'
import { Kbd } from '../components/ui/misc.tsx'
import { invoices } from '../data/invoices.ts'
import { cn } from '../lib/cn.ts'
import { formatMoney } from '../lib/format.ts'
import { navigate } from '../lib/router.tsx'
import { useTheme } from '../lib/theme.tsx'

interface PaletteContextValue {
  readonly open: () => void
}

const PaletteContext = createContext<PaletteContextValue | null>(null)

/** Open the palette from anywhere inside {@link CommandPaletteProvider}. */
export function useCommandPalette(): PaletteContextValue {
  const value = useContext(PaletteContext)
  if (value === null) throw new Error('useCommandPalette() must be used inside <CommandPaletteProvider>.')
  return value
}

/** Provides the palette and its global Ctrl/⌘+K shortcut. */
export function CommandPaletteProvider({ children }: { readonly children: ReactNode }): ReactElement {
  const [isOpen, setOpen] = useState(false)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((value) => !value)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const value = useMemo<PaletteContextValue>(() => ({ open: () => setOpen(true) }), [])
  return (
    <PaletteContext value={value}>
      {children}
      <CommandPalette open={isOpen} onOpenChange={setOpen} />
    </PaletteContext>
  )
}

const itemClasses = cn(
  'flex h-11 cursor-pointer select-none items-center gap-3 rounded-lg px-3 text-sm text-foreground outline-none',
  'data-[selected=true]:bg-primary-soft data-[selected=true]:text-primary-soft-foreground [&_svg]:size-4.5 [&_svg]:shrink-0',
)
const groupClasses = '[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-overline [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:text-muted-foreground'

function CommandPalette({ open, onOpenChange }: { readonly open: boolean; readonly onOpenChange: (open: boolean) => void }): ReactElement {
  const { toggle } = useTheme()
  const run = (action: () => void): void => {
    onOpenChange(false)
    action()
  }
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-overlay backdrop-blur-[2px] animate-fade-in" />
        <DialogPrimitive.Content className="fixed left-1/2 top-[12vh] z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-xl outline-none animate-pop-in">
          <VisuallyHidden.Root>
            <DialogPrimitive.Title>Command palette</DialogPrimitive.Title>
            <DialogPrimitive.Description>Search screens, invoices and actions.</DialogPrimitive.Description>
          </VisuallyHidden.Root>
          <Command label="Command palette" loop>
            <div className="flex items-center gap-3 border-b border-border px-4">
              <IconSearch aria-hidden className="size-5 shrink-0 text-muted-foreground" />
              <Command.Input placeholder="Search screens, invoices, actions…" className="h-14 w-full bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground" />
              <Kbd>Esc</Kbd>
            </div>
            <Command.List className="scrollbar-thin max-h-[min(26rem,60vh)] overflow-y-auto p-2">
              <Command.Empty className="px-3 py-10 text-center text-sm text-muted-foreground">No results. Try “invoice” or “settings”.</Command.Empty>
              <Command.Group heading="Quick actions" className={groupClasses}>
                <Command.Item className={itemClasses} onSelect={() => run(() => navigate('/invoices/new'))}>
                  <IconPlus aria-hidden /> Create invoice
                </Command.Item>
                <Command.Item className={itemClasses} onSelect={() => run(() => navigate('/team?invite=1'))}>
                  <IconUserPlus aria-hidden /> Invite a team member
                </Command.Item>
                <Command.Item className={itemClasses} onSelect={() => run(toggle)}>
                  <IconMoon aria-hidden /> Toggle light / dark theme
                </Command.Item>
              </Command.Group>
              <Command.Group heading="Go to" className={groupClasses}>
                {SCREENS.map((screen) => (
                  <Command.Item key={screen.id} value={`${screen.label} ${screen.group}`} className={itemClasses} onSelect={() => run(() => navigate(screen.path))}>
                    <IconArrowRight aria-hidden />
                    <span className="flex-1 truncate">{screen.label}</span>
                    <span className="text-xs text-muted-foreground">{screen.group}</span>
                  </Command.Item>
                ))}
              </Command.Group>
              <Command.Group heading="Recent invoices" className={groupClasses}>
                {invoices.slice(0, 5).map((invoice) => (
                  <Command.Item key={invoice.id} value={`${invoice.id} ${invoice.customer.name}`} className={itemClasses} onSelect={() => run(() => navigate(`/invoices/${invoice.id}`))}>
                    <IconFileInvoice aria-hidden />
                    <span className="flex-1 truncate">
                      {invoice.id} · {invoice.customer.name}
                    </span>
                    <span className="text-xs text-muted-foreground tabular">
                      {formatMoney(invoice.amount)} · {STATUS_META[invoice.status].label}
                    </span>
                  </Command.Item>
                ))}
              </Command.Group>
            </Command.List>
            <div className="flex items-center gap-4 border-t border-border bg-muted/60 px-4 py-2.5 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd> navigate
              </span>
              <span className="flex items-center gap-1.5">
                <Kbd>↵</Kbd> open
              </span>
              <span className="ml-auto hidden sm:inline">Strutvane command palette</span>
            </div>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
