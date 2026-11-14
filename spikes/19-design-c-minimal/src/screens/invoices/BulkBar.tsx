/**
 * The bulk-action bar: floats at the bottom of the content panel while rows are selected. It uses
 * the inverse surface (dark on light, light on dark) so it reads as a temporary mode, separate
 * from the page, and it announces the selection count politely.
 */
import { CircleCheck, Download, Mail, Trash2, X } from 'lucide-react'
import type { ComponentProps } from 'react'
import { Kbd } from '../../components/ui/badge.tsx'
import { cn } from '../../lib/cn.ts'
import { plural } from '../../lib/format.ts'

function BarButton({ className, ...props }: ComponentProps<'button'>) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-inverse-fg transition-colors hover:bg-inverse-fg/12 [&_svg]:size-4 [&_svg]:text-inverse-muted',
        className,
      )}
      {...props}
    />
  )
}

interface BulkBarProps {
  count: number
  onMarkPaid: () => void
  onRemind: () => void
  onExport: () => void
  onDelete: () => void
  onClear: () => void
}

export function BulkBar({ count, onMarkPaid, onRemind, onExport, onDelete, onClear }: BulkBarProps) {
  if (count === 0) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-5 z-40 flex justify-center px-3 lg:left-sidebar">
      <div role="toolbar" aria-label="Bulk actions" className="relative pointer-events-auto flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl bg-inverse p-1.5 shadow-pop animate-rise-in">
        <span className="num whitespace-nowrap px-2.5 text-sm font-medium text-inverse-fg" aria-live="polite">
          {plural(count, 'selected', 'selected')}
        </span>
        <span aria-hidden className="mx-1 h-4 w-px bg-inverse-muted/40" />
        <BarButton onClick={onMarkPaid}>
          <CircleCheck aria-hidden /> <span className="max-sm:sr-only">Mark paid</span>
        </BarButton>
        <BarButton onClick={onRemind}>
          <Mail aria-hidden /> <span className="max-sm:sr-only">Remind</span>
        </BarButton>
        <BarButton onClick={onExport}>
          <Download aria-hidden /> <span className="max-sm:sr-only">Export</span>
        </BarButton>
        <BarButton onClick={onDelete}>
          <Trash2 aria-hidden /> <span className="max-sm:sr-only">Delete</span>
        </BarButton>
        <span aria-hidden className="mx-1 h-4 w-px bg-inverse-muted/40" />
        <BarButton onClick={onClear} aria-label="Clear selection" className="px-2">
          <X aria-hidden />
          <Kbd aria-hidden className="border-transparent bg-inverse-fg/12 text-inverse-muted max-sm:hidden">
            Esc
          </Kbd>
        </BarButton>
      </div>
    </div>
  )
}
