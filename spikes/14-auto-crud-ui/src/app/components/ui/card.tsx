/**
 * `<Card>`: the content surface of the admin (rounded, soft shadow, card colour in both themes).
 *
 * @module
 */
import type { HTMLAttributes, ReactElement, ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'

/**
 * A card. Pass `as="section"` with `aria-labelledby` when the card is a page region.
 *
 * @example
 * <Card><CardHeader title="Posts by status" /><CardContent>…</CardContent></Card>
 */
export function Card({ className, as: Tag = 'div', ...props }: HTMLAttributes<HTMLElement> & { readonly as?: 'div' | 'section' | 'article' }): ReactElement {
  return <Tag className={cn('rounded-xl border border-border/60 bg-card text-card-foreground shadow-card', className)} {...props} />
}

/**
 * A card's heading row: title, optional subtitle, optional actions on the right.
 *
 * @example
 * <CardHeader title="Recent posts" subtitle="Last 7 days" actions={<Button>View all</Button>} />
 */
export function CardHeader({ title, subtitle, actions, id }: { readonly title: ReactNode; readonly subtitle?: ReactNode; readonly actions?: ReactNode; readonly id?: string }): ReactElement {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2 px-5 pt-5">
      <div>
        <h2 id={id} className="text-base font-semibold">
          {title}
        </h2>
        {subtitle !== undefined && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions}
    </div>
  )
}

/**
 * A card's padded body.
 *
 * @example
 * <CardContent>…</CardContent>
 */
export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>): ReactElement {
  return <div className={cn('p-5', className)} {...props} />
}
