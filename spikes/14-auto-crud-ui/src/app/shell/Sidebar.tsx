/**
 * `<Sidebar>`: the vertical menu. One entry per resource the user may list (grouped and ordered
 * by `buildNavigation`, design doc §4.9), so a table added by `migrate` appears with no file edit.
 *
 * Anatomy (DESIGN.md §4 "Sidebar"): brand at the top, collapsible group headings, items with an
 * icon, a label and an optional badge, the active item as a filled accent pill. On desktop it can
 * collapse to icons (remembered per browser); below `md` it is a drawer.
 *
 * @module
 */
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { IconChevronDown, IconLayoutDashboard, IconLayoutSidebarLeftCollapse, IconLayoutSidebarLeftExpand, IconX } from '@tabler/icons-react'
import { useId, useMemo, useState, type ReactElement, type ReactNode } from 'react'
import { buildNavigation, type NavigationEntry, type NavigationGroup } from '../../shared/navigation.ts'
import { useSession } from '../auth/session.tsx'
import { ResourceIcon } from '../icons.tsx'
import { cn } from '../lib/cn.ts'
import { useApi, useRegistry } from '../registry.tsx'
import { BrandMark } from './BrandMark.tsx'

/** Item shape, shared by every menu link. Colours come from exactly one of the two sets below. */
const ITEM = 'group/item flex min-h-10 items-center gap-3 rounded-lg px-3 text-base transition-colors duration-(--duration-fast) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
/** A resting item. */
const INACTIVE = 'text-foreground/80 hover:bg-accent hover:text-accent-foreground'
/** The active item: a filled accent pill with a soft coloured shadow. */
const ACTIVE = 'bg-primary font-medium text-primary-foreground shadow-primary'

/**
 * Props of {@link Sidebar}.
 *
 * @example
 * const props: SidebarProps = { mobileOpen: false, onCloseMobile: close, collapsed: false, onToggleCollapsed: toggle }
 */
export interface SidebarProps {
  /** Below `md` the sidebar is a drawer; this says whether it is open. */
  readonly mobileOpen: boolean
  readonly onCloseMobile: () => void
  /** Desktop: icons only. */
  readonly collapsed: boolean
  readonly onToggleCollapsed: () => void
}

/**
 * The navigation sidebar.
 *
 * @example
 * <Sidebar mobileOpen={open} onCloseMobile={close} collapsed={false} onToggleCollapsed={toggle} />
 */
export function Sidebar({ mobileOpen, onCloseMobile, collapsed, onToggleCollapsed }: SidebarProps): ReactElement {
  const { resources } = useRegistry()
  const { can } = useSession()
  const groups = useMemo(() => buildNavigation(resources, (name) => can('viewAny', name)), [resources, can])
  // In the drawer the full labels are always shown: collapsing is a desktop space saver.
  const iconsOnly = collapsed && !mobileOpen

  return (
    <>
      {mobileOpen && <div aria-hidden="true" className="fixed inset-0 z-(--z-sidebar) bg-overlay md:hidden" onClick={onCloseMobile} />}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-(--z-sidebar) flex flex-col bg-sidebar shadow-card transition-[width,translate] duration-(--duration-base) ease-(--ease-standard)',
          iconsOnly ? 'w-(--sidebar-width-collapsed)' : 'w-(--sidebar-width)',
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0',
        )}
      >
        <div className="flex h-(--navbar-height) shrink-0 items-center justify-between gap-2 px-5">
          <Link to="/" className="flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={onCloseMobile}>
            <BrandMark />
            <span className={cn('text-xl font-semibold tracking-tight', iconsOnly && 'sr-only')}>Strutvane</span>
          </Link>
          <button type="button" className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent md:hidden" onClick={onCloseMobile} aria-label="Close menu">
            <IconX aria-hidden="true" className="size-5" />
          </button>
        </div>
        <nav aria-label="Main" className="flex-1 overflow-y-auto px-3.5 pb-4">
          <ul className="space-y-1">
            <li>
              <Link to="/" title={iconsOnly ? 'Dashboard' : undefined} className={ITEM} activeProps={{ className: ACTIVE, 'aria-current': 'page' }} inactiveProps={{ className: INACTIVE }} activeOptions={{ exact: true }} onClick={onCloseMobile}>
                <IconLayoutDashboard aria-hidden="true" stroke={1.75} className="size-5 shrink-0" />
                <span className={cn('flex-1 truncate', iconsOnly && 'sr-only')}>Dashboard</span>
              </Link>
            </li>
          </ul>
          {groups.map((group) => (
            <SidebarGroup key={group.heading ?? '(ungrouped)'} group={group} iconsOnly={iconsOnly} onNavigate={onCloseMobile} />
          ))}
        </nav>
        <div className="hidden border-t p-3 md:block">
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-pressed={collapsed}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {collapsed ? <IconLayoutSidebarLeftExpand aria-hidden="true" className="size-5 shrink-0" /> : <IconLayoutSidebarLeftCollapse aria-hidden="true" className="size-5 shrink-0" />}
            <span className={cn(iconsOnly && 'sr-only')}>Collapse menu</span>
          </button>
        </div>
      </aside>
    </>
  )
}

/** A group: a heading that collapses its items (open by default). */
function SidebarGroup({ group, iconsOnly, onNavigate }: { readonly group: NavigationGroup; readonly iconsOnly: boolean; readonly onNavigate: () => void }): ReactElement {
  const listId = useId()
  const [open, setOpen] = useState(true)
  const items = (
    <ul id={listId} className="space-y-1" hidden={!open && !iconsOnly}>
      {group.entries.map((entry) => (
        <li key={entry.name}>
          <SidebarItem entry={entry} iconsOnly={iconsOnly} onNavigate={onNavigate} />
        </li>
      ))}
    </ul>
  )
  if (group.heading === undefined) return <div className="mt-1">{items}</div>
  return (
    <section className="mt-5" aria-label={group.heading}>
      {iconsOnly ? (
        <hr className="mx-3 mb-2" />
      ) : (
        <h2>
          <button
            type="button"
            aria-expanded={open}
            aria-controls={listId}
            onClick={() => setOpen((current) => !current)}
            className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {group.heading}
            <IconChevronDown aria-hidden="true" className={cn('size-4 transition-transform duration-(--duration-fast)', !open && '-rotate-90')} />
          </button>
        </h2>
      )}
      {items}
    </section>
  )
}

function SidebarItem({ entry, iconsOnly, onNavigate }: { readonly entry: NavigationEntry; readonly iconsOnly: boolean; readonly onNavigate: () => void }): ReactElement {
  const content: ReactNode = (
    <>
      <ResourceIcon name={entry.icon} className="size-5 shrink-0" />
      <span className={cn('flex-1 truncate', iconsOnly && 'sr-only')}>{entry.label}</span>
      {entry.badge !== undefined && !iconsOnly && <EntryBadge entry={entry} />}
    </>
  )
  if (!entry.isResource) {
    // Package pages (logs viewer, settings) are served outside the SPA router.
    return (
      <a href={entry.path} title={iconsOnly ? entry.label : undefined} className={cn(ITEM, INACTIVE)} onClick={onNavigate}>
        {content}
      </a>
    )
  }
  return (
    <Link to="/$resource" params={{ resource: entry.path.slice(1) }} title={iconsOnly ? entry.label : undefined} className={ITEM} activeProps={{ className: ACTIVE, 'aria-current': 'page' }} inactiveProps={{ className: INACTIVE }} onClick={onNavigate}>
      {content}
    </Link>
  )
}

/** A text badge, or a live row count for `badge: 'count'`. */
function EntryBadge({ entry }: { readonly entry: NavigationEntry }): ReactElement | null {
  const api = useApi()
  const { byName } = useRegistry()
  const resource = entry.badge === 'count' ? byName.get(entry.name) : undefined
  const count = useQuery({
    queryKey: ['badge-count', entry.name],
    enabled: resource !== undefined,
    staleTime: 60_000,
    queryFn: async () => (resource === undefined ? 0 : (await api.list(resource.metadata, { page: 1, perPage: 10, search: '', sort: '', filters: {}, trashed: 'without' })).meta.total),
  })
  const text = entry.badge === 'count' ? count.data : entry.badge
  if (text === undefined) return null
  // The visible pill is decorative; screen readers get one clean phrase ("Posts, 35 rows"),
  // because accessible names drop the spaces between inline children ("Posts35rows").
  return (
    <>
      <span aria-hidden="true" className="rounded-full bg-primary-soft px-2 py-0.5 text-xs font-semibold text-primary-soft-foreground group-aria-[current=page]/item:bg-primary-foreground group-aria-[current=page]/item:text-primary">
        {text}
      </span>
      <span className="sr-only">{entry.badge === 'count' ? `, ${text} rows` : `, ${text}`}</span>
    </>
  )
}
