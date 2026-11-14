/**
 * The sidebar: workspace switcher, primary navigation, saved views and the account menu.
 *
 * It sits on the canvas colour while content lives in an inset surface panel; the active item is
 * a small raised chip (surface + hairline + 1 px shadow), the only "lifted" thing in the nav, so
 * position is obvious without a loud fill.
 */
import {
  CalendarDays,
  ChevronsUpDown,
  Hash,
  Keyboard,
  LayoutDashboard,
  LogOut,
  Plus,
  Receipt,
  Settings,
  SquareKanban,
  UserRound,
  Users,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { LogoMark } from '../components/brand.tsx'
import { Avatar } from '../components/ui/avatar.tsx'
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuShortcut } from '../components/ui/menu.tsx'
import { invoices } from '../data/invoices.ts'
import { me } from '../data/people.ts'
import { cn } from '../lib/cn.ts'
import { formatCount } from '../lib/format.ts'
import { Link, useRouter } from '../lib/router.tsx'
import { useOverlays } from './overlays.tsx'

interface NavItem {
  label: string
  to: string
  icon: ReactNode
  /** Decides "you are here"; board and calendar live under /invoices but are their own items. */
  isActive: (pathname: string, search: URLSearchParams) => boolean
  count?: number
}

const isInvoicePath = (pathname: string) => pathname.startsWith('/invoices') && !pathname.startsWith('/invoices/board') && !pathname.startsWith('/invoices/calendar')

const outstanding = invoices.filter((invoice) => invoice.status === 'open' || invoice.status === 'overdue').length

const PRIMARY: readonly NavItem[] = [
  { label: 'Dashboard', to: '/', icon: <LayoutDashboard aria-hidden />, isActive: (path) => path === '/' },
  { label: 'Invoices', to: '/invoices', icon: <Receipt aria-hidden />, isActive: (path, search) => isInvoicePath(path) && !search.has('view'), count: outstanding },
  { label: 'Board', to: '/invoices/board', icon: <SquareKanban aria-hidden />, isActive: (path) => path.startsWith('/invoices/board') },
  { label: 'Calendar', to: '/invoices/calendar', icon: <CalendarDays aria-hidden />, isActive: (path) => path.startsWith('/invoices/calendar') },
]

const VIEWS: readonly NavItem[] = [
  { label: 'Overdue, largest first', to: '/invoices?view=overdue', icon: <Hash aria-hidden />, isActive: (path, search) => path === '/invoices' && search.get('view') === 'overdue' },
  { label: 'My open invoices', to: '/invoices?view=mine', icon: <Hash aria-hidden />, isActive: (path, search) => path === '/invoices' && search.get('view') === 'mine' },
  { label: 'Over €10,000', to: '/invoices?view=large', icon: <Hash aria-hidden />, isActive: (path, search) => path === '/invoices' && search.get('view') === 'large' },
]

const ORGANISATION: readonly NavItem[] = [
  { label: 'Team', to: '/settings/team', icon: <Users aria-hidden />, isActive: (path) => path === '/settings/team' },
  { label: 'Settings', to: '/settings/profile', icon: <Settings aria-hidden />, isActive: (path) => path.startsWith('/settings') && path !== '/settings/team' },
]

function NavLink({ item, onNavigate }: { item: NavItem; onNavigate?: (() => void) | undefined }) {
  const { pathname, search } = useRouter()
  const active = item.isActive(pathname, search)
  return (
    <Link
      to={item.to}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex h-control-md items-center gap-2.5 rounded-md border border-transparent px-2 text-sm text-fg-muted transition-colors duration-100',
        'hover:bg-muted/70 hover:text-fg [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-fg-subtle',
        active && 'border-border bg-surface font-medium text-fg shadow-xs hover:bg-surface [&>svg]:text-fg',
      )}
    >
      {item.icon}
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.count !== undefined && <span className="num text-xs text-fg-subtle">{formatCount(item.count)}</span>}
    </Link>
  )
}

function NavSection({ title, items, onNavigate }: { title?: string; items: readonly NavItem[]; onNavigate?: (() => void) | undefined }) {
  return (
    <div className="flex flex-col gap-px">
      {title !== undefined && <h2 className="flex h-7 items-center px-2 text-xs font-medium text-fg-subtle">{title}</h2>}
      {items.map((item) => (
        <NavLink key={item.to} item={item} onNavigate={onNavigate} />
      ))}
    </div>
  )
}

function WorkspaceSwitcher() {
  return (
    <Menu.Root>
      <Menu.Trigger className="flex h-10 w-full cursor-pointer items-center gap-2.5 rounded-md px-2 text-left hover:bg-muted/70 data-[state=open]:bg-muted/70">
        <LogoMark className="text-fg" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-fg">Northwind Labs</span>
          <span className="block truncate text-2xs text-fg-subtle">Business plan · EU</span>
        </span>
        <ChevronsUpDown aria-hidden className="size-3.5 text-fg-subtle" />
      </Menu.Trigger>
      <MenuContent align="start" className="w-60">
        <MenuLabel>Workspaces</MenuLabel>
        <MenuItem>
          <LogoMark className="size-5 text-fg" /> Northwind Labs <MenuShortcut>Current</MenuShortcut>
        </MenuItem>
        <MenuItem>
          <Avatar name="Acme Holdings" tint={3} shape="square" size="xs" /> Acme Holdings
        </MenuItem>
        <MenuSeparator />
        <MenuItem>
          <Plus aria-hidden /> Create workspace
        </MenuItem>
      </MenuContent>
    </Menu.Root>
  )
}

function AccountMenu() {
  const { navigate } = useRouter()
  const { setShortcutsOpen } = useOverlays()
  return (
    <Menu.Root>
      <Menu.Trigger aria-label="Account" className="flex h-11 w-full cursor-pointer items-center gap-2.5 rounded-md px-2 text-left hover:bg-muted/70 data-[state=open]:bg-muted/70">
        <span className="relative">
          <Avatar name={me.name} tint={me.tint} size="md" />
          <span aria-hidden className="absolute -bottom-px -right-px size-2.5 rounded-full bg-success ring-2 ring-bg" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-fg">{me.name}</span>
          <span className="block truncate text-xs text-fg-subtle">{me.email}</span>
        </span>
        <ChevronsUpDown aria-hidden className="size-3.5 text-fg-subtle" />
      </Menu.Trigger>
      <MenuContent side="top" align="start" className="w-60">
        <MenuItem onSelect={() => navigate('/settings/profile')}>
          <UserRound aria-hidden /> Profile
        </MenuItem>
        <MenuItem onSelect={() => navigate('/settings/security')}>
          <Settings aria-hidden /> Account settings <MenuShortcut>G S</MenuShortcut>
        </MenuItem>
        <MenuItem onSelect={() => setShortcutsOpen(true)}>
          <Keyboard aria-hidden /> Keyboard shortcuts <MenuShortcut>?</MenuShortcut>
        </MenuItem>
        <MenuSeparator />
        <MenuItem onSelect={() => navigate('/sign-in')}>
          <LogOut aria-hidden /> Sign out
        </MenuItem>
      </MenuContent>
    </Menu.Root>
  )
}

/** The sidebar content; rendered inline on desktop and inside a drawer on smaller screens. */
export function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col gap-4 px-3 py-3">
      <WorkspaceSwitcher />
      <nav aria-label="Main" className="scroll-quiet flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto">
        <NavSection items={PRIMARY} onNavigate={onNavigate} />
        <NavSection title="Saved views" items={VIEWS} onNavigate={onNavigate} />
        <NavSection title="Organisation" items={ORGANISATION} onNavigate={onNavigate} />
      </nav>
      <AccountMenu />
    </div>
  )
}
