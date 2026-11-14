/**
 * The slim top bar of the content panel: search trigger on the left; screens switcher, theme,
 * notifications and help on the right. 48 px tall, one hairline below, nothing else.
 */
import { CircleHelp, LayoutGrid, Menu as MenuIcon, Monitor, Moon, Search, Sun } from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import { Kbd } from '../components/ui/badge.tsx'
import { Button } from '../components/ui/button.tsx'
import { Menu, MenuContent, MenuItem, MenuLabel, MenuRadioItem, MenuSeparator, Tooltip } from '../components/ui/menu.tsx'
import { useToast } from '../components/ui/toast.tsx'
import { FEATURED_INVOICE_ID, invoiceById } from '../data/invoices.ts'
import { useRouter } from '../lib/router.tsx'
import { type ThemeMode, useTheme } from '../lib/theme.tsx'
import { NotificationsButton } from './Notifications.tsx'
import { useOverlays } from './overlays.tsx'
import { SCREENS } from './screens.ts'

/** `⌘` on Apple platforms, `Ctrl` elsewhere, for shortcut hints. */
export function modKey(): string {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent) ? '⌘' : 'Ctrl'
}

function ThemeMenu() {
  const { mode, resolved, setMode } = useTheme()
  return (
    <Menu.Root>
      <Tooltip content="Theme">
        <Menu.Trigger asChild>
          <Button variant="ghost" size="icon" aria-label={`Theme: ${mode}`}>
            {resolved === 'dark' ? <Moon aria-hidden /> : <Sun aria-hidden />}
          </Button>
        </Menu.Trigger>
      </Tooltip>
      <MenuContent align="end" className="min-w-40">
        <DropdownMenu.RadioGroup value={mode} onValueChange={(value) => setMode(value as ThemeMode)}>
          <MenuRadioItem value="light">
            <Sun aria-hidden /> Light
          </MenuRadioItem>
          <MenuRadioItem value="dark">
            <Moon aria-hidden /> Dark
          </MenuRadioItem>
          <MenuRadioItem value="system">
            <Monitor aria-hidden /> System
          </MenuRadioItem>
        </DropdownMenu.RadioGroup>
      </MenuContent>
    </Menu.Root>
  )
}

/**
 * Mockup-only: jump to any screen or state, and trigger the global overlays, so the lead can
 * review everything without hunting. It would not exist in the product.
 */
export function ScreensMenu() {
  const { navigate } = useRouter()
  const { setPaletteOpen, setNotificationsOpen, confirm, peek } = useOverlays()
  const toast = useToast()
  const groups = ['Auth', 'Overview', 'Invoices', 'Settings'] as const
  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <Button variant="secondary" size="sm" className="border-dashed">
          <LayoutGrid aria-hidden /> <span className="max-sm:sr-only">Screens</span>
        </Button>
      </Menu.Trigger>
      <MenuContent align="end" className="scroll-quiet max-h-[min(640px,80vh)] w-64 overflow-y-auto">
        {groups.map((group) => (
          <div key={group}>
            <MenuLabel>{group}</MenuLabel>
            {SCREENS.filter((screen) => screen.group === group).map((screen) => (
              <MenuItem key={screen.id} onSelect={() => navigate(screen.path)}>
                {screen.label}
              </MenuItem>
            ))}
            <MenuSeparator />
          </div>
        ))}
        <MenuLabel>Overlays</MenuLabel>
        <MenuItem onSelect={() => setPaletteOpen(true)}>Command palette</MenuItem>
        <MenuItem onSelect={() => window.setTimeout(() => setNotificationsOpen(true), 0)}>Notifications</MenuItem>
        <MenuItem
          onSelect={() =>
            void confirm({ title: 'Delete INV-2264?', description: 'The invoice and its 4 files are removed for everyone. This cannot be undone.', confirmLabel: 'Delete invoice' })
          }
        >
          Confirm dialog
        </MenuItem>
        <MenuItem onSelect={() => toast({ title: 'Invoice sent', description: 'INV-2264 is on its way to Halcyon Freight.', action: { label: 'Undo', onClick: () => undefined } })}>Toast</MenuItem>
        <MenuItem
          onSelect={() => {
            const invoice = invoiceById(FEATURED_INVOICE_ID)
            if (invoice !== undefined) peek(invoice)
          }}
        >
          Side drawer
        </MenuItem>
      </MenuContent>
    </Menu.Root>
  )
}

export function Topbar({ onOpenNav }: { onOpenNav: () => void }) {
  const { setPaletteOpen, setShortcutsOpen } = useOverlays()
  return (
    <div className="flex h-topbar shrink-0 items-center gap-2 border-b border-border px-3 sm:px-4">
      <Button variant="ghost" size="icon" aria-label="Open navigation" onClick={onOpenNav} className="lg:hidden">
        <MenuIcon aria-hidden />
      </Button>
      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        aria-label="Search or jump to"
        aria-keyshortcuts="Control+K Meta+K"
        className="flex h-control-md w-full max-w-72 cursor-pointer items-center gap-2 rounded-md border border-border bg-subtle/60 px-2.5 text-sm text-fg-subtle transition-colors hover:border-border-strong hover:bg-subtle max-sm:w-8 max-sm:justify-center max-sm:border-transparent max-sm:bg-transparent max-sm:px-0"
      >
        <Search aria-hidden className="size-4 shrink-0" />
        <span className="flex-1 text-left max-sm:hidden">Search or jump to…</span>
        <span className="flex gap-0.5 max-sm:hidden" aria-hidden>
          <Kbd>{modKey()}</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>
      <div className="ml-auto flex items-center gap-1">
        <ScreensMenu />
        <ThemeMenu />
        <NotificationsButton />
        <Tooltip content="Keyboard shortcuts">
          <Button variant="ghost" size="icon" aria-label="Keyboard shortcuts" onClick={() => setShortcutsOpen(true)} className="max-sm:hidden">
            <CircleHelp aria-hidden />
          </Button>
        </Tooltip>
      </div>
    </div>
  )
}
