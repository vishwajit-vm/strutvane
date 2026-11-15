/**
 * The last line of defence for a screen: if rendering throws (a bad URL, a bug, a chunk that
 * failed to load), the shell stays and this message replaces the screen, instead of React
 * unmounting everything and leaving a blank page. Keyed by pathname in `App`, so navigating away
 * clears it.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { EmptyState } from '../components/empty-state.tsx'
import { Button } from '../components/ui/button.tsx'
import { Link } from '../lib/router.tsx'
import { PageContainer } from '../shell/AppShell.tsx'

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
      <PageContainer>
        <h1 className="sr-only">Something went wrong</h1>
        <div role="alert">
          <EmptyState
            illustration="search"
            title="This page couldn’t be shown"
            description="Something went wrong while opening it. Go back to the dashboard, or try again in a moment."
            action={
              <Button asChild variant="primary">
                <Link to="/">Dashboard</Link>
              </Button>
            }
          />
        </div>
      </PageContainer>
    )
  }
}
