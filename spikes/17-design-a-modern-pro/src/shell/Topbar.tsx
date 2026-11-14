/**
 * `<Topbar>`: the sticky bar above every inner page. Translucent with a backdrop blur, so content
 * scrolling beneath stays faintly visible and the bar feels light, not like a heavy header.
 *
 * Left: the mobile menu button and the search trigger (opens the command palette).
 * Right: the mockup's Screens switcher, theme toggle, quick-action shortcuts, notifications and
 * the user menu. Every icon button has an accessible name and a 38px hit target.
 *
 * @example
 * <Topbar onOpenMenu={() => setDrawerOpen(true)} />
 */
import {
  IconBell,
  IconCalendarMonth,
  IconCash,
  IconCreditCardOff,
  IconFileInvoice,
  IconLayoutGrid,
  IconLogout,
  IconMenu2,
  IconMoon,
  IconReportAnalytics,
  IconSearch,
  IconSettings,
  IconShieldLock,
  IconSun,
  IconUser,
  IconUserPlus,
  IconUsersGroup,
  type Icon,
} from '@tabler/icons-react'
import { useState, type ReactElement } from 'react'
import { Button } from '../components/ui/button.tsx'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, Popover, PopoverContent, PopoverTrigger } from '../components/ui/menu.tsx'
import { Avatar, IconChip, Kbd, Tooltip } from '../components/ui/misc.tsx'
import { notifications as initialNotifications, type Notification } from '../data/account.ts'
import { currentUser } from '../data/people.ts'
import { cn } from '../lib/cn.ts'
import { formatRelative, TODAY } from '../lib/format.ts'
import { Link, navigate } from '../lib/router.tsx'
import { useTheme } from '../lib/theme.tsx'
import { useCommandPalette } from './CommandPalette.tsx'
import { ScreenSwitcher } from './ScreenSwitcher.tsx'

export function Topbar({ onOpenMenu }: { readonly onOpenMenu: () => void }): ReactElement {
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-topbar backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-[90rem] items-center gap-2 px-4 sm:gap-3 sm:px-6 lg:px-8">
        <Button variant="ghost" size="icon" className="-ml-1.5 lg:hidden" onClick={onOpenMenu} aria-label="Open menu">
          <IconMenu2 />
        </Button>
        <SearchTrigger />
        <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
          <ScreenSwitcher />
          <ThemeToggle />
          <QuickActions />
          <NotificationsMenu />
          <UserMenu />
        </div>
      </div>
    </header>
  )
}

/** Looks like a search field on desktop, an icon on phones; both open the command palette. */
function SearchTrigger(): ReactElement {
  const { open } = useCommandPalette()
  return (
    <>
      <Button variant="ghost" size="icon" className="sm:hidden" onClick={open} aria-label="Search (Ctrl+K)">
        <IconSearch />
      </Button>
      <button
        type="button"
        onClick={open}
        className="hidden h-10 w-full max-w-80 cursor-pointer items-center gap-2.5 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:text-foreground sm:flex"
      >
        <IconSearch aria-hidden className="size-5" />
        <span className="flex-1 text-left">Search anything…</span>
        <Kbd>Ctrl K</Kbd>
      </button>
    </>
  )
}

function ThemeToggle(): ReactElement {
  const { resolved, toggle } = useTheme()
  const label = resolved === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'
  return (
    <Tooltip content={label} side="bottom">
      <Button variant="ghost" size="icon" onClick={toggle} aria-label={label} className="rounded-full">
        {resolved === 'dark' ? <IconSun /> : <IconMoon />}
      </Button>
    </Tooltip>
  )
}

const SHORTCUTS: readonly { readonly label: string; readonly hint: string; readonly icon: Icon; readonly to: string; readonly tone: 'primary' | 'success' | 'info' | 'warning' }[] = [
  { label: 'Invoices', hint: 'Manage billing', icon: IconFileInvoice, to: '/invoices', tone: 'primary' },
  { label: 'Calendar', hint: 'Due dates', icon: IconCalendarMonth, to: '/invoices/calendar', tone: 'info' },
  { label: 'Team', hint: 'Roles & invites', icon: IconUsersGroup, to: '/team', tone: 'success' },
  { label: 'Reports', hint: 'Revenue overview', icon: IconReportAnalytics, to: '/dashboard', tone: 'warning' },
  { label: 'Security', hint: '2FA & sessions', icon: IconShieldLock, to: '/settings/security', tone: 'info' },
  { label: 'Settings', hint: 'Account', icon: IconSettings, to: '/settings/profile', tone: 'primary' },
]

/** A grid of shortcuts to the most used areas. */
function QuickActions(): ReactElement {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Tooltip content="Shortcuts" side="bottom">
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Shortcuts" className="hidden rounded-full sm:inline-flex">
            <IconLayoutGrid />
          </Button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent align="end" className="w-[22rem] p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Shortcuts</h2>
          <span className="text-xs text-muted-foreground">Jump to an area</span>
        </div>
        <ul className="grid grid-cols-2">
          {SHORTCUTS.map((shortcut, index) => (
            <li key={shortcut.label} className={cn('border-border', index % 2 === 0 && 'border-r', index < SHORTCUTS.length - 2 && 'border-b')}>
              <Link to={shortcut.to} onClick={() => setOpen(false)} className="flex flex-col items-center gap-2 px-3 py-5 text-center transition-colors hover:bg-subtle">
                <IconChip icon={<shortcut.icon />} tone={shortcut.tone} size="lg" className="rounded-full" />
                <span>
                  <span className="block text-sm font-semibold text-foreground">{shortcut.label}</span>
                  <span className="block text-xs text-muted-foreground">{shortcut.hint}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  )
}

const NOTIFICATION_ICONS: Readonly<Record<Notification['kind'], Icon>> = {
  payment: IconCash,
  failed: IconCreditCardOff,
  member: IconUserPlus,
  report: IconReportAnalytics,
  security: IconShieldLock,
}

/** The bell: unread count, a list with tinted icons and "Mark all as read". */
export function NotificationsMenu(): ReactElement {
  const [items, setItems] = useState(initialNotifications)
  const unread = items.filter((item) => item.unread).length
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'} className="relative rounded-full">
          <IconBell />
          {unread > 0 ? (
            <span aria-hidden className="absolute right-1 top-1 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-danger-solid px-1 text-[0.625rem] font-bold text-danger-solid-foreground ring-2 ring-background">
              {unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[23rem] p-0">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Notifications</h2>
          {unread > 0 ? <span className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary-soft-foreground">{unread} new</span> : null}
        </div>
        <ul className="scrollbar-thin max-h-[22rem] overflow-y-auto">
          {items.map((item) => {
            const ItemIcon = NOTIFICATION_ICONS[item.kind]
            return (
              <li key={item.id} className={cn('flex gap-3 border-b border-border px-4 py-3.5 transition-colors last:border-b-0 hover:bg-subtle', item.unread && 'bg-primary-soft/25')}>
                <IconChip icon={<ItemIcon />} tone={item.tone} className="rounded-full" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">{item.title}</p>
                  <p className="text-label text-muted-foreground">{item.body}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{formatRelative(new Date(TODAY.getTime() - item.minutesAgo * 60_000))}</p>
                </div>
                {item.unread ? <span aria-label="Unread" className="mt-1.5 size-2 shrink-0 rounded-full bg-primary" /> : null}
              </li>
            )
          })}
        </ul>
        <div className="border-t border-border p-3">
          <Button variant="soft" className="w-full" onClick={() => setItems(items.map((item) => ({ ...item, unread: false })))} disabled={unread === 0}>
            Mark all as read
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function UserMenu(): ReactElement {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Account menu" className="ml-1 cursor-pointer rounded-full outline-none transition-shadow hover:ring-4 hover:ring-primary/15 focus-visible:ring-4 focus-visible:ring-ring/40">
          <Avatar name={currentUser.name} tone="primary" status="online" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <div className="flex items-center gap-3 px-2.5 py-2.5">
          <Avatar name={currentUser.name} tone="primary" status="online" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{currentUser.name}</p>
            <p className="truncate text-xs text-muted-foreground">{currentUser.email}</p>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate('/profile')}>
          <IconUser /> My profile
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate('/settings/profile')}>
          <IconSettings /> Account settings
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate('/settings/security')}>
          <IconShieldLock /> Security
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate('/team')}>
          <IconUsersGroup /> Team
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="danger" onSelect={() => navigate('/sign-in')}>
          <IconLogout /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
