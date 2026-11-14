/**
 * Pagination footer: "1–25 of 238" on the left; rows per page and page buttons on the right.
 * The current page is `aria-current`; Previous/Next are disabled (not hidden) at the ends so the
 * controls never shift position.
 */
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '../../components/ui/button.tsx'
import { Select } from '../../components/ui/controls.tsx'
import { cn } from '../../lib/cn.ts'
import { formatCount } from '../../lib/format.ts'
import { PAGE_SIZES, pageWindow } from './list-state.ts'

interface PaginationProps {
  page: number
  pageCount: number
  pageSize: number
  total: number
  onPage: (page: number) => void
  onPageSize: (size: number) => void
}

export function Pagination({ page, pageCount, pageSize, total, onPage, onPageSize }: PaginationProps) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <p className="text-sm text-fg-muted" aria-live="polite">
        <span className="num text-fg">
          {formatCount(from)}–{formatCount(to)}
        </span>{' '}
        of <span className="num text-fg">{formatCount(total)}</span>
      </p>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm text-fg-muted max-sm:hidden">
          <span id="page-size-label">Rows per page</span>
          <Select
            value={String(pageSize)}
            onValueChange={(value) => onPageSize(Number(value))}
            options={PAGE_SIZES.map((size) => ({ value: String(size), label: String(size) }))}
            triggerProps={{ 'aria-labelledby': 'page-size-label', className: 'w-[72px] num' }}
          />
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon-sm" aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            <ChevronLeft aria-hidden />
          </Button>
          {pageWindow(page, pageCount).map((item, index) =>
            item === '…' ? (
              <span key={`gap-${index}`} aria-hidden className="w-6 text-center text-sm text-fg-subtle">
                …
              </span>
            ) : (
              <button
                key={item}
                type="button"
                aria-label={`Page ${item}`}
                aria-current={item === page ? 'page' : undefined}
                onClick={() => onPage(item)}
                className={cn(
                  'num inline-flex h-control-sm min-w-control-sm cursor-pointer items-center justify-center rounded-md px-1.5 text-sm transition-colors max-sm:hidden',
                  item === page ? 'border border-border-strong bg-surface font-medium text-fg shadow-xs max-sm:inline-flex' : 'text-fg-muted hover:bg-subtle hover:text-fg',
                )}
              >
                {item}
              </button>
            ),
          )}
          <Button size="icon-sm" aria-label="Next page" disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
            <ChevronRight aria-hidden />
          </Button>
        </div>
      </div>
    </nav>
  )
}
