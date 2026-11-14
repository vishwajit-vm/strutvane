/**
 * 404 inside the shell: the empty-state illustration with a way back.
 */
import type { ReactElement } from 'react'
import { EmptyState } from '../../components/data-display.tsx'
import { Button } from '../../components/ui/button.tsx'
import { Card } from '../../components/ui/card.tsx'
import { Link } from '../../lib/router.tsx'

export function NotFoundPage(): ReactElement {
  return (
    <Card>
      <EmptyState
        title="Page not found"
        description="The link may be broken, or the page was moved. Use the Screens menu at the top to jump to any mockup screen."
        action={
          <Button asChild variant="primary">
            <Link to="/dashboard">Go to the dashboard</Link>
          </Button>
        }
      />
    </Card>
  )
}
