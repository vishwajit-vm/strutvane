/**
 * The last line of defence for a screen: if rendering throws (a bad URL, a bug, a chunk that
 * failed to load), the shell stays and this message replaces the screen, instead of React
 * unmounting everything and leaving a blank page. Keyed by location in `App`, so navigating away
 * clears it.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { EmptyState } from '../../components/data-display.tsx'
import { Button } from '../../components/ui/button.tsx'
import { Card } from '../../components/ui/card.tsx'
import { Link } from '../../lib/router.tsx'

interface State {
  readonly failed: boolean
}

export class ScreenErrorBoundary extends Component<{ readonly children: ReactNode }, State> {
  override state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  override componentDidCatch(_error: unknown, _info: ErrorInfo): void {
    // A real app reports this to its logger; the mockup only shows the message.
  }

  override render(): ReactNode {
    if (!this.state.failed) return this.props.children
    return (
      <Card role="alert">
        <EmptyState
          title="This page couldn’t be shown"
          description="Something went wrong while opening it. Go back to the dashboard, or try again in a moment."
          action={
            <Button asChild variant="primary">
              <Link to="/dashboard">Go to the dashboard</Link>
            </Button>
          }
        />
      </Card>
    )
  }
}
