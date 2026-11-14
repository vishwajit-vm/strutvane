/**
 * `<Sidebar>`: the vertical menu. Logo, section headings, icon items, expandable groups, count
 * badges, a workspace card at the bottom, and an icon-only "rail" mode on desktop.
 *
 * Active states, from strongest to weakest:
 * - the current leaf item is a **gradient pill** with an accent glow;
 * - a group containing the current page gets a neutral tint and stays open;
 * - the current child inside a group is a **soft accent pill** with a filled dot.
 *
 * @example
 * <Sidebar collapsed={false} onToggleCollapsed={toggle} />
 */
import { IconChevronRight, IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand } from '@tabler/icons-react'
import { Collapsible } from 'radix-ui'
import { useState, type ReactElement } from 'react'
import { Logo } from '../components/brand.tsx'
import { Button } from '../components/ui/button.tsx'
import { Progress, Tooltip } from '../components/ui/misc.tsx'
import { cn } from '../lib/cn.ts'
import { Link, useLocation } from '../lib/router.tsx'
import { isActive, NAV, type NavItem } from './nav.ts'

/** Props of {@link Sidebar}. */
export interface SidebarProps {
  /** Icon-only rail (desktop only). */
  readonly collapsed?: boolean
  /** Shows the collapse button (desktop); omitted in the mobile drawer. */
  readonly onToggleCollapsed?: () => void
  /** Called after a navigation (closes the mobile drawer). */
  readonly onNavigate?: () => void
}

export function Sidebar({ collapsed = false, onToggleCollapsed, onNavigate }: SidebarProps): ReactElement {
  const { pathname } = useLocation()
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className={cn('flex h-16 shrink-0 items-center gap-2', collapsed ? 'justify-center px-2' : 'justify-between pl-6 pr-3')}>
        <Link to="/dashboard" onClick={onNavigate} className="rounded-md" aria-label="Strutvane home">
          <Logo compact={collapsed} />
        </Link>
        {onToggleCollapsed === undefined || collapsed ? null : (
          <Button variant="ghost" size="icon-sm" onClick={onToggleCollapsed} aria-label="Collapse sidebar" className="text-sidebar-muted">
            <IconLayoutSidebarLeftCollapse />
          </Button>
        )}
      </div>
      <nav aria-label="Main" className={cn('scrollbar-thin flex-1 overflow-y-auto pb-4', collapsed ? 'px-3' : 'px-4')}>
        {NAV.map((section, index) => (
          <div key={section.heading ?? index} className={cn(index > 0 && 'mt-5')}>
            {section.heading === undefined ? null : collapsed ? (
              <div aria-hidden className="mx-auto mb-3 h-px w-6 bg-border" />
            ) : (
              <h2 className="mb-2 flex items-center gap-3 px-3 text-overline font-semibold uppercase text-sidebar-muted">{section.heading}</h2>
            )}
            <ul className="flex flex-col gap-1">
              {section.items.map((item) => (
                <li key={item.label}>
                  {item.children === undefined ? (
                    <LeafItem item={item} active={isActive(pathname, item)} collapsed={collapsed} {...(onNavigate === undefined ? {} : { onNavigate })} />
                  ) : (
                    <GroupItem item={item} pathname={pathname} collapsed={collapsed} {...(onNavigate === undefined ? {} : { onNavigate })} />
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      {collapsed ? (
        onToggleCollapsed === undefined ? null : (
          <div className="flex justify-center pb-4">
            <Tooltip content="Expand sidebar" side="right">
              <Button variant="ghost" size="icon" onClick={onToggleCollapsed} aria-label="Expand sidebar" className="text-sidebar-muted">
                <IconLayoutSidebarLeftExpand />
              </Button>
            </Tooltip>
          </div>
        )
      ) : (
        <WorkspaceCard />
      )}
    </div>
  )
}

const itemBase = 'group flex h-10.5 w-full cursor-pointer items-center gap-3 rounded-lg px-3 text-sm font-medium outline-none transition-[background-color,color,box-shadow,transform] duration-150'

function ItemBadge({ badge, onAccent }: { readonly badge: NonNullable<NavItem['badge']>; readonly onAccent: boolean }): ReactElement {
  const tones = { primary: 'bg-primary-soft text-primary-soft-foreground', danger: 'bg-danger-soft text-danger', success: 'bg-success-soft text-success' }
  return <span className={cn('ml-auto inline-flex h-5 items-center rounded-full px-2 text-overline font-bold tracking-normal', onAccent ? 'bg-primary-foreground/20 text-primary-foreground' : tones[badge.tone])}>{badge.text}</span>
}

function LeafItem({ item, active, collapsed, onNavigate }: { readonly item: NavItem; readonly active: boolean; readonly collapsed: boolean; readonly onNavigate?: () => void }): ReactElement {
  const Icon = item.icon
  const link = (
    <Link
      to={item.to ?? '/'}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={cn(
        itemBase,
        collapsed && 'justify-center px-0',
        active ? 'bg-brand-gradient font-semibold text-primary-foreground shadow-primary' : 'hover:translate-x-0.5 hover:bg-subtle hover:text-foreground',
      )}
    >
      <Icon aria-hidden className="size-5.5 shrink-0" stroke={1.75} />
      {collapsed ? null : <span className="truncate">{item.label}</span>}
      {collapsed || item.badge === undefined ? null : <ItemBadge badge={item.badge} onAccent={active} />}
    </Link>
  )
  return collapsed ? (
    <Tooltip content={item.label} side="right">
      {link}
    </Tooltip>
  ) : (
    link
  )
}

function GroupItem({ item, pathname, collapsed, onNavigate }: { readonly item: NavItem; readonly pathname: string; readonly collapsed: boolean; readonly onNavigate?: () => void }): ReactElement {
  const children = item.children ?? []
  const containsActive = children.some((child) => isActive(pathname, child))
  const [open, setOpen] = useState(containsActive)
  const Icon = item.icon

  // In the rail there is no room for children: the icon goes to the group's first page.
  if (collapsed) {
    return <LeafItem item={{ ...item, to: children[0]?.to ?? '/', match: children.flatMap((child) => child.match ?? [child.to]) }} active={containsActive} collapsed onNavigate={onNavigate ?? (() => undefined)} />
  }

  return (
    <Collapsible.Root open={open} onOpenChange={setOpen}>
      <Collapsible.Trigger className={cn(itemBase, containsActive ? 'bg-subtle font-semibold text-foreground' : 'hover:translate-x-0.5 hover:bg-subtle hover:text-foreground')}>
        <Icon aria-hidden className="size-5.5 shrink-0" stroke={1.75} />
        <span className="truncate">{item.label}</span>
        {item.badge === undefined ? null : <ItemBadge badge={item.badge} onAccent={false} />}
        <IconChevronRight aria-hidden className={cn('size-4 shrink-0 text-sidebar-muted transition-transform duration-200', item.badge === undefined && 'ml-auto', open && 'rotate-90')} />
      </Collapsible.Trigger>
      <Collapsible.Content>
        <ul className="mt-1 flex flex-col gap-0.5">
          {children.map((child) => {
            const active = isActive(pathname, child)
            return (
              <li key={child.to}>
                <Link
                  to={child.to}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex h-9.5 items-center gap-3 rounded-lg pl-[1.1875rem] pr-3 text-sm outline-none transition-colors duration-150',
                    active ? 'bg-primary-soft font-semibold text-primary-soft-foreground' : 'hover:bg-subtle hover:text-foreground',
                  )}
                >
                  <span aria-hidden className="grid size-5.5 place-items-center">
                    <span className={cn('rounded-full transition-all', active ? 'size-2 bg-primary ring-4 ring-primary/15' : 'size-1.5 border-[1.5px] border-sidebar-muted')} />
                  </span>
                  <span className="truncate">{child.label}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      </Collapsible.Content>
    </Collapsible.Root>
  )
}

/** The workspace / plan card pinned to the bottom of the sidebar. */
function WorkspaceCard(): ReactElement {
  return (
    <div className="m-4 mt-0 rounded-xl border border-border bg-muted/70 p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-label font-semibold text-foreground">Halyard Systems</p>
        <span className="rounded-sm bg-brand-gradient px-1.5 py-0.5 text-overline font-bold tracking-normal text-primary-foreground">PRO</span>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">8 of 10 seats used</p>
      <Progress value={80} label="Seats used" className="mt-3" />
      <Link to="/settings/profile" className="mt-3 inline-block rounded-sm text-xs font-semibold text-primary-soft-foreground hover:underline">
        Manage plan
      </Link>
    </div>
  )
}
