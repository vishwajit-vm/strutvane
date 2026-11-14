/**
 * 404 inside the shell: friendly, with the two most likely next steps.
 */
import { Link } from 'react-router'
import { EmptyState } from '../components/data-display.tsx'
import { LostArt } from '../components/illustrations.tsx'
import { Button } from '../components/ui/button.tsx'
import { Card } from '../components/ui/card.tsx'
import { useShell } from '../shell/shell-state.tsx'

export function NotFoundPage() {
  const { openPalette } = useShell()
  return (
    <Card className="mx-auto mt-8 max-w-xl">
      <h1 className="sr-only">Page not found</h1>
      <EmptyState
        art={<LostArt className="h-32" />}
        title="We couldn’t find that page"
        description="The link may be old, or the record was deleted. Search for it, or head back to the dashboard."
        actions={
          <>
            <Button variant="secondary" onClick={openPalette}>
              Search
            </Button>
            <Button asChild>
              <Link to="/">Go to dashboard</Link>
            </Button>
          </>
        }
      />
    </Card>
  )
}
