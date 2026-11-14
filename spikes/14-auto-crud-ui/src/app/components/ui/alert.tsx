/**
 * `<Alert>`: an inline message box for errors and notices.
 *
 * @module
 */
import type { ReactElement, ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'

/**
 * Props of {@link Alert}.
 *
 * @example
 * const props: AlertProps = { tone: 'error', title: 'Could not load posts', children: 'Try again.' }
 */
export interface AlertProps {
  readonly title: string
  readonly children?: ReactNode
  readonly tone?: 'error' | 'info'
  /** `alert` interrupts screen readers (errors after an action); `status` waits politely. */
  readonly role?: 'alert' | 'status'
  readonly className?: string
}

/**
 * An inline alert.
 *
 * @example
 * <Alert tone="error" title="Could not save">The server is not reachable.</Alert>
 */
export function Alert({ title, children, tone = 'error', role = 'alert', className }: AlertProps): ReactElement {
  return (
    <div role={role} className={cn('rounded-md border p-3 text-sm', tone === 'error' ? 'border-destructive/40 bg-destructive/5' : 'border-border bg-muted', className)}>
      <p className={cn('font-medium', tone === 'error' && 'text-destructive')}>{title}</p>
      {children !== undefined && <div className="mt-1 text-muted-foreground">{children}</div>}
    </div>
  )
}
