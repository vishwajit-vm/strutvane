/**
 * Friendly screen states shared by the resource pages: not found / no access, load errors with
 * Retry, and the gate that resolves `/$resource` to a resource the user may use.
 *
 * @module
 */
import { Link, useParams } from '@tanstack/react-router'
import { IconMoodEmpty } from '@tabler/icons-react'
import type { ReactElement, ReactNode } from 'react'
import type { ResolvedResourceUi } from '../../shared/resolve-ui.ts'
import { ApiError } from '../api/client.ts'
import { useSession, type Ability } from '../auth/session.tsx'
import { Alert } from '../components/ui/alert.tsx'
import { Button, buttonVariants } from '../components/ui/button.tsx'
import { useRegistry } from '../registry.tsx'

/**
 * "Not found or no access". The same message for both, so the UI never confirms that a screen or
 * record exists to someone who may not see it (no enumeration).
 *
 * @example
 * <NotFoundPage />
 */
export function NotFoundPage(): ReactElement {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <span aria-hidden="true" className="mx-auto flex size-16 items-center justify-center rounded-full bg-primary-soft text-primary-soft-foreground">
        <IconMoodEmpty className="size-8" />
      </span>
      <h1 className="mt-4 text-xl font-semibold">Nothing here</h1>
      <p className="mt-2 text-sm text-muted-foreground">This page does not exist, or you do not have access to it.</p>
      <Link to="/" className={buttonVariants({ variant: 'outline', className: 'mt-6' })}>
        Back to the dashboard
      </Link>
    </div>
  )
}

/**
 * Props of {@link LoadError}.
 *
 * @example
 * const props: LoadErrorProps = { what: 'posts', error, onRetry: refetch }
 */
export interface LoadErrorProps {
  /** What failed to load, in plain words ("posts", "this post"). */
  readonly what: string
  readonly error: unknown
  readonly onRetry: () => void
}

/**
 * An inline load error with the server's friendly detail and a Retry button.
 *
 * @example
 * {query.isError && <LoadError what="posts" error={query.error} onRetry={() => query.refetch()} />}
 */
export function LoadError({ what, error, onRetry }: LoadErrorProps): ReactElement {
  const detail = error instanceof ApiError ? error.message : 'Something unexpected happened.'
  const issues = error instanceof ApiError ? error.issues : []
  return (
    <Alert title={`Could not load ${what}`}>
      <p>{detail}</p>
      {issues.length > 0 && (
        <ul className="mt-1 list-disc pl-5">
          {issues.map((issue) => (
            <li key={`${issue.field}-${issue.code}`}>{issue.message}</li>
          ))}
        </ul>
      )}
      <Button variant="outline" size="sm" className="mt-2" onClick={onRetry}>
        Retry
      </Button>
    </Alert>
  )
}

/**
 * Props of {@link ResourceGate}.
 *
 * @example
 * const props: ResourceGateProps = { ability: 'viewAny', children: (resource) => <List resource={resource} /> }
 */
export interface ResourceGateProps {
  readonly ability: Ability
  readonly children: (resource: ResolvedResourceUi) => ReactNode
}

/**
 * Resolve `$resource` from the URL and check one ability. Unknown resource and "not allowed" both
 * render {@link NotFoundPage}.
 *
 * @example
 * <ResourceGate ability="create">{(resource) => <ResourceForm resource={resource} />}</ResourceGate>
 */
export function ResourceGate({ ability, children }: ResourceGateProps): ReactElement {
  const params = useParams({ strict: false })
  const { byRoute } = useRegistry()
  const { can } = useSession()
  const resource = params.resource === undefined ? undefined : byRoute.get(params.resource)
  if (resource === undefined || !can(ability, resource.name)) return <NotFoundPage />
  return <>{children(resource)}</>
}
