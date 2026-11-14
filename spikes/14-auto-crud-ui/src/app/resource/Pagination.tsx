/**
 * `<Pagination>`: "Showing 26–50 of 137", rows per page (10/25/50/100), and numbered pages with
 * first/previous/next/last (design doc §4.3: admin users expect page numbers, not only "Next").
 *
 * @module
 */
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { useId, type ReactElement, type ReactNode } from 'react'
import type { ListPage } from '../api/client.ts'
import { Button } from '../components/ui/button.tsx'
import { NativeSelect } from '../components/ui/native-select.tsx'
import { PAGE_SIZES } from '../route-search.ts'

/**
 * Page numbers to show, with `'gap'` where pages are skipped: always the first and last page,
 * plus the current page and its neighbours.
 *
 * @example
 * pageWindow(1, 3) // [1, 2, 3]
 * pageWindow(6, 12) // [1, 'gap', 5, 6, 7, 'gap', 12]
 */
export function pageWindow(current: number, last: number): (number | 'gap')[] {
  const wanted = new Set([1, last, current - 1, current, current + 1].filter((page) => page >= 1 && page <= last))
  const pages = [...wanted].sort((a, b) => a - b)
  const result: (number | 'gap')[] = []
  for (const page of pages) {
    const previous = result.at(-1)
    // Bridge a gap of exactly one page with the page itself: "1 2 3" reads better than "1 … 3".
    if (typeof previous === 'number' && page - previous === 2) result.push(previous + 1)
    else if (typeof previous === 'number' && page - previous > 2) result.push('gap')
    result.push(page)
  }
  return result
}

/**
 * Props of {@link Pagination}.
 *
 * @example
 * const props: PaginationProps = { meta: page.meta, noun: 'posts', onPage: setPage, onPerPage: setPerPage }
 */
export interface PaginationProps {
  readonly meta: ListPage['meta']
  /** Plural noun for the summary, lower case ("posts"). */
  readonly noun: string
  readonly onPage: (page: number) => void
  readonly onPerPage: (perPage: number) => void
}

/**
 * The pagination bar under a list.
 *
 * @example
 * <Pagination meta={page.meta} noun="posts" onPage={setPage} onPerPage={setPerPage} />
 */
export function Pagination({ meta, noun, onPage, onPerPage }: PaginationProps): ReactElement {
  const sizeId = useId()
  const { page, lastPage } = meta
  return (
    <div className="flex flex-col gap-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
      <p className="text-muted-foreground">{meta.from === null ? `No ${noun}` : `Showing ${meta.from}–${meta.to ?? meta.from} of ${meta.total} ${noun}`}</p>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label htmlFor={sizeId} className="whitespace-nowrap text-muted-foreground">
            Rows per page
          </label>
          <NativeSelect id={sizeId} className="w-20" value={meta.perPage} onChange={(event) => onPerPage(Number(event.target.value))}>
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </NativeSelect>
        </div>
        <nav aria-label="Pagination" className="flex items-center gap-1">
          <PageButton label="First page" disabled={page <= 1} onClick={() => onPage(1)}>
            <ChevronsLeft aria-hidden="true" />
          </PageButton>
          <PageButton label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            <ChevronLeft aria-hidden="true" />
          </PageButton>
          {pageWindow(page, lastPage).map((item, index) =>
            item === 'gap' ? (
              <span key={`gap-${index}`} aria-hidden="true" className="px-1 text-muted-foreground">
                …
              </span>
            ) : (
              <Button key={item} variant={item === page ? 'default' : 'ghost'} size="sm" className="min-w-8" aria-label={`Page ${item}`} aria-current={item === page ? 'page' : undefined} onClick={() => onPage(item)}>
                {item}
              </Button>
            ),
          )}
          <PageButton label="Next page" disabled={page >= lastPage} onClick={() => onPage(page + 1)}>
            <ChevronRight aria-hidden="true" />
          </PageButton>
          <PageButton label="Last page" disabled={page >= lastPage} onClick={() => onPage(lastPage)}>
            <ChevronsRight aria-hidden="true" />
          </PageButton>
        </nav>
      </div>
    </div>
  )
}

function PageButton({ label, disabled, onClick, children }: { readonly label: string; readonly disabled: boolean; readonly onClick: () => void; readonly children: ReactNode }): ReactElement {
  return (
    <Button variant="ghost" size="icon" className="size-8" aria-label={label} disabled={disabled} onClick={onClick}>
      {children}
    </Button>
  )
}
