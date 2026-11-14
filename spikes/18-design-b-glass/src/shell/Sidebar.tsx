/**
 * The floating glass sidebar (desktop) and the same content in a drawer (mobile).
 *
 * Layout: fixed, inset by `--chrome-gap` on three sides, so it floats over the mesh backdrop with
 * rounded corners. It is one of only two persistent blur layers (the other is the top bar).
 * Collapsing to icons is remembered; collapsed items keep their accessible names and get tooltips.
 */
import { IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand, IconSelector } from '@tabler/icons-react'
import { NavLink } from 'react-router'
import { BrandMark } from '../components/data-display.tsx'
import { Sheet } from '../components/ui/dialog.tsx'
import { Progress, Tooltip } from '../components/ui/misc.tsx'
import { WORKSPACE } from '../data/people.ts'
import { cn } from '../lib/cn.ts'
import { NAV_GROUPS, type NavItem } from './navigation.ts'
import { useShell } from './shell-state.tsx'

/** Desktop sidebar (≥ 1024 px). */
export function Sidebar() {
  const { collapsed, toggleCollapsed } = useShell()
  return (
    <aside
      aria-label="Main"
      className={cn(
        'glass-chrome fixed top-(--chrome-gap) bottom-(--chrome-gap) left-(--chrome-gap) z-(--z-chrome) hidden flex-col rounded-2xl transition-base lg:flex',
        collapsed ? 'w-(--sidebar-width-collapsed)' : 'w-(--sidebar-width)',
      )}
    >
      <SidebarContent collapsed={collapsed} />
      <div className={cn('border-t border-glass-border p-3', collapsed && 'flex justify-center')}>
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={cn(
            'flex h-9 items-center gap-2.5 rounded-sm px-2.5 text-sm font-medium text-fg-muted transition-fast hover:bg-glass-hover hover:text-fg',
            !collapsed && 'w-full',
          )}
        >
          {collapsed ? <IconLayoutSidebarLeftExpand className="size-[1.15rem]" aria-hidden /> : <IconLayoutSidebarLeftCollapse className="size-[1.15rem]" aria-hidden />}
          {!collapsed && 'Collapse'}
        </button>
      </div>
    </aside>
  )
}

/** Mobile navigation drawer (< 1024 px). */
export function MobileNav() {
  const { mobileNavOpen, setMobileNavOpen } = useShell()
  return (
    <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen} side="left" title="Menu" className="w-[min(18rem,calc(100vw-1rem))]" bodyClassName="flex flex-col p-0">
      <SidebarContent collapsed={false} onNavigate={() => setMobileNavOpen(false)} hideBrand />
    </Sheet>
  )
}

function SidebarContent({ collapsed, onNavigate, hideBrand = false }: { collapsed: boolean; onNavigate?: () => void; hideBrand?: boolean }) {
  return (
    <>
      {!hideBrand && (
        <div className={cn('flex items-center gap-3 px-4 pt-4 pb-3', collapsed && 'justify-center px-0')}>
          <BrandMark />
          {!collapsed && (
            <button type="button" className="flex min-w-0 flex-1 items-center gap-2 rounded-sm text-left hover:opacity-90" aria-label={`Workspace: ${WORKSPACE.name}. Switch workspace`}>
              <span className="min-w-0 flex-1">
                <span className="block text-md font-bold tracking-tight text-fg">Strutvane</span>
                <span className="block truncate text-xs text-fg-muted">{WORKSPACE.name}</span>
              </span>
              <IconSelector className="size-4 shrink-0 text-fg-muted" aria-hidden />
            </button>
          )}
        </div>
      )}
      <nav aria-label="Primary" className="scroll-thin min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mb-4 last:mb-0">
            {collapsed ? (
              <div className="mx-auto mb-2 h-px w-6 bg-border" aria-hidden />
            ) : (
              <h2 className="mb-1.5 px-2.5 text-2xs font-semibold tracking-[0.1em] text-fg-muted uppercase">{group.label}</h2>
            )}
            <ul className="flex flex-col gap-0.5">
              {group.items.map((item) => (
                <li key={item.to}>
                  <SidebarLink item={item} collapsed={collapsed} {...(onNavigate !== undefined ? { onNavigate } : {})} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      {!collapsed && <UsageCard />}
    </>
  )
}

function SidebarLink({ item, collapsed, onNavigate }: { item: NavItem; collapsed: boolean; onNavigate?: () => void }) {
  const Icon = item.icon
  const link = (
    <NavLink
      to={item.to}
      end={item.end ?? false}
      onClick={onNavigate}
      aria-label={collapsed ? (item.badge !== undefined ? `${item.label}, ${item.badge} open` : item.label) : undefined}
      className={({ isActive }) =>
        cn(
          'group relative flex h-10 items-center gap-3 rounded-md px-2.5 text-base font-medium transition-base',
          collapsed && 'justify-center px-0',
          isActive ? 'bg-surface text-fg shadow-glass' : 'text-fg-muted hover:bg-glass-hover hover:text-fg',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="bg-brand-gradient absolute top-2 bottom-2 left-0 w-[3px] rounded-full" aria-hidden />}
          <Icon className={cn('size-[1.2rem] shrink-0 transition-fast', isActive ? 'text-primary-text' : 'group-hover:text-fg')} aria-hidden />
          {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
          {!collapsed && item.badge !== undefined && (
            <span className="rounded-full bg-primary-soft px-2 py-px text-2xs font-bold text-primary-soft-fg tabular">{item.badge}</span>
          )}
        </>
      )}
    </NavLink>
  )
  return collapsed ? (
    <Tooltip label={item.label} side="right">
      {link}
    </Tooltip>
  ) : (
    link
  )
}

/** A small plan-usage card: gives the sidebar foot a purpose and shows the progress style. */
function UsageCard() {
  return (
    <div className="mx-3 mb-3 rounded-lg border border-glass-border bg-glass-hover p-3.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-fg">{WORKSPACE.plan} plan</span>
        <span className="text-fg-muted tabular">86 / 120</span>
      </div>
      <p className="mt-0.5 text-xs text-fg-muted">Invoices this month</p>
      <Progress value={72} label="72% of monthly invoices used" className="mt-2.5" />
    </div>
  )
}
