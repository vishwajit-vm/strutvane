/**
 * `<HomePage>`: the dashboard. A first-run welcome checklist (what happened, what to do next)
 * and a card per resource the user may open.
 *
 * @module
 */
import { Link } from '@tanstack/react-router'
import { Check } from 'lucide-react'
import type { ReactElement } from 'react'
import { useSession } from '../auth/session.tsx'
import { ResourceIcon } from '../icons.tsx'
import { useRegistry } from '../registry.tsx'

const CHECKLIST: readonly { readonly title: string; readonly detail: string; readonly done: boolean }[] = [
  { title: 'Run your migrations', detail: 'Every table now has a screen and a sidebar entry.', done: true },
  { title: 'Make a screen your own', detail: 'Edit resources/ui/<table>.ui.ts: columns, form fields, filters, icon and group. ui:sync never overwrites it.', done: false },
  { title: 'Decide who sees what', detail: 'New tables are invisible until a policy grants viewAny.', done: false },
]

/**
 * The dashboard screen.
 *
 * @example
 * createRoute({ getParentRoute: () => appRoute, path: '/', component: HomePage })
 */
export function HomePage(): ReactElement {
  const { resources } = useRegistry()
  const { can } = useSession()
  const visible = resources.filter((resource) => !resource.navigation.hidden && can('viewAny', resource.name))
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <section aria-labelledby="welcome-heading" className="rounded-lg border p-4">
        <h2 id="welcome-heading" className="font-medium">
          Welcome! Your admin is ready.
        </h2>
        <ol className="mt-3 space-y-2">
          {CHECKLIST.map((item) => (
            <li key={item.title} className="flex gap-3 text-sm">
              <span aria-hidden="true" className={`mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border ${item.done ? 'bg-primary text-primary-foreground' : ''}`}>
                {item.done && <Check className="size-3" />}
              </span>
              <span>
                <span className="font-medium">{item.title}</span>
                <span className="sr-only">{item.done ? ' (done)' : ' (to do)'}</span>
                <span className="block text-muted-foreground">{item.detail}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>
      <section aria-labelledby="resources-heading">
        <h2 id="resources-heading" className="mb-3 font-medium">
          Your data
        </h2>
        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">You do not have access to any screens yet. Ask an administrator to grant you access.</p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {visible.map((resource) => (
              <li key={resource.name}>
                <Link to="/$resource" params={{ resource: resource.metadata.route }} className="flex items-center gap-3 rounded-lg border p-4 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <ResourceIcon name={resource.navigation.icon} className="size-5" />
                  <span className="font-medium">{resource.label.plural}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
