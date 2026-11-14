/**
 * `<DetailPage>`: `/posts/my-first-post`. The record's fields, plus one tab per `hasMany`
 * relation the user may list (Filament's relation managers): the related list, filtered by the
 * foreign key, loaded only when its tab is opened. The open tab is in the URL (`?tab=posts`).
 *
 * Tabs follow the ARIA tabs pattern: Left/Right/Home/End move between tabs.
 *
 * @module
 */
import { Link, useNavigate, useParams, useSearch } from '@tanstack/react-router'
import { IconPencil } from '@tabler/icons-react'
import { useId, useRef, useState, type KeyboardEvent, type ReactElement } from 'react'
import { visibleFields, type RelationMetadata } from '../../shared/metadata.ts'
import type { ResolvedResourceUi } from '../../shared/resolve-ui.ts'
import type { ApiRow } from '../api/client.ts'
import type { ListParams } from '../api/list-params.ts'
import { useSession } from '../auth/session.tsx'
import { PageHeader } from '../components/PageHeader.tsx'
import { buttonVariants } from '../components/ui/button.tsx'
import { Card } from '../components/ui/card.tsx'
import { Skeleton } from '../components/ui/skeleton.tsx'
import { recordId, recordRouteKey, recordTitle, useRecord, useRelatedRows } from '../data/queries.ts'
import { cn } from '../lib/cn.ts'
import { useRegistry } from '../registry.tsx'
import { validateDetailSearch } from '../route-search.ts'
import { FieldValue } from './cells.tsx'
import { DeleteButton } from './DeleteButton.tsx'
import { ListView } from './ListView.tsx'
import { LoadError, ResourceGate } from './states.tsx'

/** The tab that shows the record's own fields. */
const DETAILS_TAB = 'details'

/**
 * The detail screen.
 *
 * @example
 * createRoute({ getParentRoute: () => appRoute, path: '$resource/$key', component: DetailPage })
 */
export function DetailPage(): ReactElement {
  return <ResourceGate ability="view">{(resource) => <DetailLoader key={resource.name} resource={resource} />}</ResourceGate>
}

function DetailLoader({ resource }: { readonly resource: ResolvedResourceUi }): ReactElement {
  const params = useParams({ strict: false })
  const record = useRecord(resource, params.key ?? '')
  if (record.isError) return <LoadError what={`this ${resource.label.singular.toLowerCase()}`} error={record.error} onRetry={() => void record.refetch()} />
  if (record.data === undefined) {
    return (
      <div aria-busy="true" aria-label="Loading" role="region" className="space-y-3">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }
  return <RecordDetail resource={resource} row={record.data} />
}

/** A `hasMany` relation that gets a tab: the target exists and the user may list it. */
interface RelationTab {
  readonly relation: RelationMetadata
  readonly target: ResolvedResourceUi
}

function RecordDetail({ resource, row }: { readonly resource: ResolvedResourceUi; readonly row: ApiRow }): ReactElement {
  const { can } = useSession()
  const { byName } = useRegistry()
  const navigate = useNavigate()
  const search = validateDetailSearch(useSearch({ strict: false }))
  const title = recordTitle(resource, row)
  const tabs: RelationTab[] = resource.metadata.relations.flatMap((relation) => {
    const target = relation.kind === 'hasMany' ? byName.get(relation.resource) : undefined
    return target !== undefined && can('viewAny', target.name) ? [{ relation, target }] : []
  })
  const current = tabs.some((tab) => tab.relation.name === search.tab) ? (search.tab ?? DETAILS_TAB) : DETAILS_TAB
  const params = { resource: resource.metadata.route, key: recordRouteKey(resource, row) }
  const selectTab = (tab: string): void => void navigate({ to: '/$resource/$key', params, search: tab === DETAILS_TAB ? {} : { tab }, replace: true })

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        crumbs={[{ label: 'Home', to: '/' }, { label: resource.label.plural, to: '/$resource', params: { resource: resource.metadata.route } }, { label: title }]}
        actions={
          <>
            {can('update', resource.name) && (
              <Link to="/$resource/$key/edit" params={params} className={buttonVariants()}>
                <IconPencil aria-hidden="true" />
                Edit
              </Link>
            )}
            {can('delete', resource.name) && <DeleteButton resource={resource} row={row} variant="full" onDeleted={() => void navigate({ to: '/$resource', params: { resource: resource.metadata.route } })} />}
          </>
        }
      />
      <Tabs tabs={[{ id: DETAILS_TAB, label: 'Details' }, ...tabs.map((tab) => ({ id: tab.relation.name, label: tab.target.label.plural }))]} current={current} onSelect={selectTab} />
      <Card role="tabpanel" id={`panel-${current}`} aria-labelledby={`tab-${current}`} tabIndex={0} className="p-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {current === DETAILS_TAB ? <FieldList resource={resource} row={row} /> : <RelationPanel tab={tabs.find((tab) => tab.relation.name === current)} parentId={recordId(resource, row)} />}
      </Card>
    </div>
  )
}

function Tabs({ tabs, current, onSelect }: { readonly tabs: readonly { readonly id: string; readonly label: string }[]; readonly current: string; readonly onSelect: (id: string) => void }): ReactElement {
  const refs = useRef(new Map<string, HTMLButtonElement>())
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const index = tabs.findIndex((tab) => tab.id === current)
    const target = event.key === 'ArrowRight' ? index + 1 : event.key === 'ArrowLeft' ? index - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : undefined
    if (target === undefined) return
    event.preventDefault()
    const next = tabs[(target + tabs.length) % tabs.length]
    if (next === undefined) return
    onSelect(next.id)
    refs.current.get(next.id)?.focus()
  }
  return (
    <div role="tablist" aria-label="Sections" onKeyDown={onKeyDown} className="flex flex-wrap gap-2">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          ref={(element) => {
            if (element === null) refs.current.delete(tab.id)
            else refs.current.set(tab.id, element)
          }}
          id={`tab-${tab.id}`}
          role="tab"
          type="button"
          aria-selected={tab.id === current}
          aria-controls={`panel-${tab.id}`}
          // Roving tabindex: Tab enters the tab list once; arrows move inside it.
          tabIndex={tab.id === current ? 0 : -1}
          onClick={() => onSelect(tab.id)}
          className={cn(
            'min-h-10 rounded-lg px-5 text-base font-medium transition-colors duration-(--duration-fast) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            tab.id === current ? 'bg-primary text-primary-foreground shadow-primary' : 'text-foreground/80 hover:bg-accent hover:text-accent-foreground',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

/** Every field the API returns, including timestamps; relations as links to their records. */
function FieldList({ resource, row }: { readonly resource: ResolvedResourceUi; readonly row: ApiRow }): ReactElement {
  const { byName } = useRegistry()
  const fields = visibleFields(resource.metadata)
  const related = useRelatedRows(resource, fields, [row])
  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-[12rem_1fr]">
      {fields.map((field) => {
        const target = field.references === undefined ? undefined : byName.get(field.references)
        return (
          <div key={field.name} className="contents">
            <dt className="text-sm font-medium text-muted-foreground">{field.label}</dt>
            <dd className="break-words text-base">
              <FieldValue field={field} value={row[field.name]} {...(target === undefined ? {} : { related: { resource: target, rows: related.data?.get(field.name) } })} />
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

/** The related list for one tab, filtered by the foreign key, with its own paging state. */
function RelationPanel({ tab, parentId }: { readonly tab: RelationTab | undefined; readonly parentId: number | undefined }): ReactElement {
  const headingId = useId()
  const [params, setParams] = useState<ListParams | undefined>(() =>
    tab === undefined || parentId === undefined
      ? undefined
      : { page: 1, perPage: 10, search: '', sort: tab.target.defaultSort, filters: { [`${tab.relation.foreignKey}.eq`]: String(parentId) }, trashed: 'without' },
  )
  if (tab === undefined || params === undefined) return <p className="text-sm text-muted-foreground">Nothing to show here.</p>
  return (
    <section aria-labelledby={headingId} className="pt-2">
      <h2 id={headingId} className="sr-only">
        {tab.target.label.plural}
      </h2>
      <ListView compact resource={tab.target} params={params} onChange={(patch) => setParams({ ...params, ...patch })} />
    </section>
  )
}
