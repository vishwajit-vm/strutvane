/**
 * The 404 inside the shell: says what happened and offers the two ways out.
 */
import { EmptyState } from '../components/empty-state.tsx'
import { Button } from '../components/ui/button.tsx'
import { Link } from '../lib/router.tsx'
import { PageContainer } from '../shell/AppShell.tsx'

export function NotFound() {
  return (
    <PageContainer>
      <h1 className="sr-only">Page not found</h1>
      <EmptyState
        illustration="search"
        title="This page doesn’t exist"
        description="The link may be old, or the record was deleted. Search with Ctrl K, or go back to the dashboard."
        action={
          <>
            <Button asChild>
              <Link to="/invoices">All invoices</Link>
            </Button>
            <Button asChild variant="primary">
              <Link to="/">Dashboard</Link>
            </Button>
          </>
        }
      />
    </PageContainer>
  )
}
