/**
 * `<Card>` and its parts: the main container of the design. White (light) or one step above the
 * page (dark), 14px radius, a soft shadow and a hairline border so cards stay distinct in dark mode.
 *
 * Spacing is owned by the card, not by its parts: the card is a vertical flex with a 20px gap and
 * 20/24px vertical padding; header, content and footer only add horizontal padding. That keeps
 * every card's rhythm identical no matter which parts it uses. Full-bleed content (tables) uses
 * `<CardContent flush>`.
 *
 * @example
 * <Card>
 *   <CardHeader><CardTitle>Revenue</CardTitle><CardDescription>Last 12 months</CardDescription></CardHeader>
 *   <CardContent>…</CardContent>
 * </Card>
 */
import type { ComponentProps, ReactElement } from 'react'
import { cn } from '../../lib/cn.ts'

export function Card({ className, ...props }: ComponentProps<'section'>): ReactElement {
  return (
    <section
      data-slot="card"
      className={cn('flex min-w-0 flex-col gap-5 rounded-xl border border-border/70 bg-card py-5 text-card-foreground shadow-sm sm:py-6 dark:border-border', className)}
      {...props}
    />
  )
}

/** Title row: title/description on the left, an optional action (menu, button) on the right. */
export function CardHeader({ className, ...props }: ComponentProps<'header'>): ReactElement {
  return <header data-slot="card-header" className={cn('flex items-start justify-between gap-4 px-5 sm:px-6', className)} {...props} />
}

export function CardTitle({ className, ...props }: ComponentProps<'h2'>): ReactElement {
  return <h2 data-slot="card-title" className={cn('text-base font-semibold leading-6 text-foreground', className)} {...props} />
}

export function CardDescription({ className, ...props }: ComponentProps<'p'>): ReactElement {
  return <p data-slot="card-description" className={cn('mt-0.5 text-label text-muted-foreground', className)} {...props} />
}

/** Body. `flush` removes the side padding for edge-to-edge tables and lists. */
export function CardContent({ className, flush = false, ...props }: ComponentProps<'div'> & { readonly flush?: boolean }): ReactElement {
  return <div data-slot="card-content" className={cn(!flush && 'px-5 sm:px-6', 'min-w-0', className)} {...props} />
}

export function CardFooter({ className, ...props }: ComponentProps<'footer'>): ReactElement {
  return <footer data-slot="card-footer" className={cn('flex items-center gap-3 border-t border-border px-5 pt-4 sm:px-6 sm:pt-5', className)} {...props} />
}
