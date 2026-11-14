/**
 * `<HomePage>`: the dashboard. A first-run welcome checklist, one stat card per resource (row
 * counts), and two charts derived from metadata alone:
 *
 * - "Rows per table" (bar chart);
 * - the breakdown of the first enum column it finds ("Posts by status", donut).
 *
 * Counts come from the list endpoint's `meta.total` (`perPage=10`), and the enum breakdown from
 * one `filter[field][in]=value` count per option. That works on spike 10 today; the design doc's
 * `count`/`aggregate` endpoints would make it one request each.
 *
 * @module
 */
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { IconCheck } from '@tabler/icons-react'
import { useId, type ReactElement } from 'react'
import type { FieldMetadata } from '../../shared/metadata.ts'
import type { ResolvedResourceUi } from '../../shared/resolve-ui.ts'
import type { ApiClient } from '../api/client.ts'
import { useSession } from '../auth/session.tsx'
import { PageHeader } from '../components/PageHeader.tsx'
import { Card, CardContent, CardHeader } from '../components/ui/card.tsx'
import { Skeleton } from '../components/ui/skeleton.tsx'
import { ResourceIcon } from '../icons.tsx'
import { cn } from '../lib/cn.ts'
import { useApi, useRegistry } from '../registry.tsx'
import { CategoryBarChart, DonutChart, type ChartDatum } from './charts.tsx'

const CHECKLIST: readonly { readonly title: string; readonly detail: string; readonly done: boolean }[] = [
  { title: 'Run your migrations', detail: 'Every table now has a screen and a menu entry.', done: true },
  { title: 'Make a screen your own', detail: 'Edit resources/ui/<table>.ui.ts: columns, form, filters, icon and group. Migrate never overwrites it.', done: false },
  { title: 'Decide who sees what', detail: 'New tables stay invisible until a policy grants viewAny.', done: false },
]

/** Stat card accent tones, cycled (all pairs are contrast-checked tokens). */
const TONES = ['bg-primary-soft text-primary-soft-foreground', 'bg-success-soft text-success', 'bg-info-soft text-info', 'bg-warning-soft text-warning'] as const

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
  const counts = useResourceCounts(visible)
  const breakdown = firstEnum(visible)

  return (
    <div className="space-y-6">
      <PageHeader title="Dashboard" crumbs={[{ label: 'Home', to: '/' }, { label: 'Dashboard' }]} />
      <WelcomeCard />
      {visible.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground">You do not have access to any screens yet. Ask an administrator to grant you access.</CardContent>
        </Card>
      ) : (
        <>
          <ul aria-label="Totals" className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
            {visible.slice(0, 4).map((resource, index) => (
              <li key={resource.name}>
                <StatCard resource={resource} total={counts.data?.get(resource.name)} tone={TONES[index % TONES.length] ?? TONES[0]} />
              </li>
            ))}
          </ul>
          <div className="grid gap-6 lg:grid-cols-3">
            <ChartCard title="Rows per table" subtitle="Live counts from the API" className="lg:col-span-2" data={visible.map((resource) => ({ label: resource.label.plural, value: counts.data?.get(resource.name) ?? 0 }))} loading={counts.isPending} kind="bar" />
            {breakdown !== undefined && <EnumBreakdown resource={breakdown.resource} field={breakdown.field} />}
          </div>
        </>
      )}
    </div>
  )
}

function WelcomeCard(): ReactElement {
  const headingId = useId()
  return (
    <Card as="section" aria-labelledby={headingId}>
      <CardHeader id={headingId} title="Welcome! Your admin is ready." subtitle="Three steps to a screen your team will love." />
      <CardContent>
        <ol className="grid gap-4 md:grid-cols-3">
          {CHECKLIST.map((item, index) => (
            <li key={item.title} className="flex gap-3 text-sm">
              <span aria-hidden="true" className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg font-semibold', item.done ? 'bg-primary text-primary-foreground' : 'bg-primary-soft text-primary-soft-foreground')}>
                {item.done ? <IconCheck className="size-4" /> : index + 1}
              </span>
              <span>
                <span className="font-semibold">{item.title}</span>
                <span className="sr-only">{item.done ? ' (done)' : ' (to do)'}</span>
                <span className="block text-muted-foreground">{item.detail}</span>
              </span>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  )
}

/** A stat card: soft-coloured icon tile, the number, the label; the whole card links to the list. */
function StatCard({ resource, total, tone }: { readonly resource: ResolvedResourceUi; readonly total: number | undefined; readonly tone: string }): ReactElement {
  return (
    <Link to="/$resource" params={{ resource: resource.metadata.route }} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <Card className="flex items-center gap-4 p-5 transition-shadow duration-(--duration-base) hover:shadow-popover">
        <span aria-hidden="true" className={cn('flex size-11 items-center justify-center rounded-lg', tone)}>
          <ResourceIcon name={resource.navigation.icon} className="size-6" />
        </span>
        <span>
          <span className="block text-2xl font-semibold">{total === undefined ? <Skeleton className="h-7 w-12" /> : total.toLocaleString()}</span>
          <span className="block text-sm text-muted-foreground">{resource.label.plural}</span>
        </span>
      </Card>
    </Link>
  )
}

/** One chart in a card. */
function ChartCard({ title, subtitle, data, loading, kind, className }: { readonly title: string; readonly subtitle: string; readonly data: readonly ChartDatum[]; readonly loading: boolean; readonly kind: 'bar' | 'donut'; readonly className?: string }): ReactElement {
  const headingId = useId()
  return (
    <Card as="section" aria-labelledby={headingId} className={className}>
      <CardHeader id={headingId} title={title} subtitle={subtitle} />
      <CardContent>{loading ? <Skeleton className="h-56 w-full" /> : kind === 'bar' ? <CategoryBarChart title={title} data={data} /> : <DonutChart title={title} data={data} />}</CardContent>
    </Card>
  )
}

function EnumBreakdown({ resource, field }: { readonly resource: ResolvedResourceUi; readonly field: FieldMetadata }): ReactElement {
  const api = useApi()
  const options = field.options ?? []
  const counts = useQuery({
    queryKey: ['dashboard-enum', resource.name, field.name],
    queryFn: async () => Promise.all(options.map(async (option) => ({ label: option, value: await countRows(api, resource, { [`${field.name}.in`]: option }) }))),
  })
  return <ChartCard title={`${resource.label.plural} by ${field.label.toLowerCase()}`} subtitle="Share of rows per value" data={counts.data ?? []} loading={counts.isPending} kind="donut" />
}

/** Row counts per resource, in parallel; a resource that fails shows 0 rather than breaking the page. */
function useResourceCounts(resources: readonly ResolvedResourceUi[]) {
  const api = useApi()
  return useQuery({
    queryKey: ['dashboard-counts', resources.map((resource) => resource.name)],
    queryFn: async () => {
      const settled = await Promise.allSettled(resources.map(async (resource) => [resource.name, await countRows(api, resource, {})] as const))
      return new Map(settled.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : [])))
    },
  })
}

async function countRows(api: ApiClient, resource: ResolvedResourceUi, filters: Readonly<Record<string, string>>): Promise<number> {
  const page = await api.list(resource.metadata, { page: 1, perPage: 10, search: '', sort: '', filters, trashed: 'without' })
  return page.meta.total
}

/** The first visible resource with an enum column that can be filtered with `in`. */
function firstEnum(resources: readonly ResolvedResourceUi[]): { resource: ResolvedResourceUi; field: FieldMetadata } | undefined {
  for (const resource of resources) {
    const field = resource.filterFields.find((candidate) => candidate.kind === 'enum' && candidate.filterOperators.includes('in'))
    if (field !== undefined) return { resource, field }
  }
  return undefined
}
