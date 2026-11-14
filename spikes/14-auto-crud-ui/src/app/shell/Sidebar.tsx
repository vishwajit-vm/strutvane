/**
 * `<Sidebar>`: one entry per resource the user may list, grouped and ordered by
 * `buildNavigation` (design doc §4.9). A table added by `migrate` appears here with no file edit.
 *
 * @module
 */
import { Link } from '@tanstack/react-router'
import { LayoutDashboard, X } from 'lucide-react'
import { useMemo, type ReactElement } from 'react'
import { buildNavigation, type NavigationGroup } from '../../shared/navigation.ts'
import { useSession } from '../auth/session.tsx'
import { Button } from '../components/ui/button.tsx'
import { ResourceIcon } from '../icons.tsx'
import { cn } from '../lib/cn.ts'
import { useRegistry } from '../registry.tsx'

const LINK = 'flex min-h-9 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground'
const ACTIVE = 'bg-accent font-medium text-accent-foreground'

/**
 * Props of {@link Sidebar}.
 *
 * @example
 * const props: SidebarProps = { mobileOpen: false, onCloseMobile: () => undefined }
 */
export interface SidebarProps {
  /** On small screens the sidebar is a drawer; this says whether it is open. */
  readonly mobileOpen: boolean
  readonly onCloseMobile: () => void
}

/**
 * The navigation sidebar. Always visible from the `md` breakpoint; a drawer below it.
 *
 * @example
 * <Sidebar mobileOpen={open} onCloseMobile={() => setOpen(false)} />
 */
export function Sidebar({ mobileOpen, onCloseMobile }: SidebarProps): ReactElement {
  const { resources } = useRegistry()
  const { can } = useSession()
  const groups = useMemo(() => buildNavigation(resources, (name) => can('viewAny', name)), [resources, can])

  return (
    <>
      {mobileOpen && <div aria-hidden="true" className="fixed inset-0 z-30 bg-black/40 md:hidden" onClick={onCloseMobile} />}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-64 border-r bg-sidebar p-3 transition-transform md:static md:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="mb-4 flex items-center justify-between px-2">
          <span className="text-base font-semibold">Strutvane</span>
          <Button variant="ghost" size="icon" className="md:hidden" onClick={onCloseMobile} aria-label="Close menu">
            <X aria-hidden="true" />
          </Button>
        </div>
        <nav aria-label="Main">
          <Link to="/" className={LINK} activeProps={{ className: ACTIVE, 'aria-current': 'page' }} activeOptions={{ exact: true }} onClick={onCloseMobile}>
            <LayoutDashboard aria-hidden="true" className="size-4" />
            Dashboard
          </Link>
          {groups.map((group) => (
            <SidebarGroup key={group.heading ?? '(ungrouped)'} group={group} onNavigate={onCloseMobile} />
          ))}
        </nav>
      </aside>
    </>
  )
}

function SidebarGroup({ group, onNavigate }: { readonly group: NavigationGroup; readonly onNavigate: () => void }): ReactElement {
  const headingId = `nav-group-${group.heading ?? 'main'}`.replace(/\s+/g, '-').toLowerCase()
  return (
    <section className="mt-4" aria-labelledby={group.heading === undefined ? undefined : headingId}>
      {group.heading !== undefined && (
        <h2 id={headingId} className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {group.heading}
        </h2>
      )}
      <ul className="space-y-0.5">
        {group.entries.map((entry) => (
          <li key={entry.name}>
            <Link
              to="/$resource"
              params={{ resource: entry.path.slice(1) }}
              className={LINK}
              activeProps={{ className: ACTIVE, 'aria-current': 'page' }}
              onClick={onNavigate}
            >
              <ResourceIcon name={entry.icon} />
              {entry.label}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
