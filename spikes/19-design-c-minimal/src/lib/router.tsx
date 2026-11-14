/**
 * A tiny History-API router: just enough for a clickable mockup with real, shareable URLs.
 *
 * Why not a router library: the mockup has ~20 flat routes and no data loading, so a 100-line
 * router keeps the bundle small and the behaviour obvious. `@strutvane/ui` itself will use
 * TanStack Router (spike 14); nothing here leaks into that decision.
 *
 * @example
 * <RouterProvider><App /></RouterProvider>
 * const { pathname, search, navigate } = useRouter()
 * <Link to="/invoices?status=overdue">Overdue</Link>
 */
import { type AnchorHTMLAttributes, createContext, type MouseEvent, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react'

interface RouterState {
  pathname: string
  /** The current query string, parsed. Treat as read-only; change it through `navigate`. */
  search: URLSearchParams
  /** Go to a path (with optional `?query`). `replace` swaps the history entry instead of adding one. */
  navigate: (to: string, options?: { replace?: boolean }) => void
}

const RouterContext = createContext<RouterState | null>(null)

function readLocation(): { pathname: string; search: string } {
  return { pathname: window.location.pathname, search: window.location.search }
}

/** Provide routing to the app; re-renders on `navigate` and on Back/Forward. */
export function RouterProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState(readLocation)

  useEffect(() => {
    const onPop = () => setLocation(readLocation())
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const navigate = useCallback((to: string, options?: { replace?: boolean }) => {
    if (options?.replace === true) window.history.replaceState(null, '', to)
    else window.history.pushState(null, '', to)
    setLocation(readLocation())
  }, [])

  const value = useMemo(
    () => ({ pathname: location.pathname, search: new URLSearchParams(location.search), navigate }),
    [location, navigate],
  )
  return <RouterContext value={value}>{children}</RouterContext>
}

/** Read the location and navigate. Must be used inside {@link RouterProvider}. */
export function useRouter(): RouterState {
  const state = useContext(RouterContext)
  if (state === null) throw new Error('useRouter() needs <RouterProvider> above it: wrap the app in <RouterProvider>.')
  return state
}

/**
 * Match a pattern such as `/invoices/:id/edit` against a pathname.
 *
 * @returns the named params (`{ id: 'inv-2041' }`), or `null` when the path does not match.
 * @example matchPath('/invoices/:id', '/invoices/inv-2041') // → { id: 'inv-2041' }
 */
export function matchPath(pattern: string, pathname: string): Record<string, string> | null {
  const want = pattern.split('/').filter(Boolean)
  const have = pathname.replace(/\/+$/, '').split('/').filter(Boolean)
  if (want.length !== have.length) return null
  const params: Record<string, string> = {}
  for (const [index, segment] of want.entries()) {
    const actual = have[index]
    if (actual === undefined) return null
    if (segment.startsWith(':')) params[segment.slice(1)] = decodeURIComponent(actual)
    else if (segment !== actual) return null
  }
  return params
}

/** Change one query parameter and keep the others: `withParam(search, 'page', '2')` → `page=2&q=…`. */
export function withParams(search: URLSearchParams, changes: Record<string, string | null>): string {
  const next = new URLSearchParams(search)
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === '') next.delete(key)
    else next.set(key, value)
  }
  const text = next.toString()
  return text === '' ? '' : `?${text}`
}

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & { to: string }

/**
 * An `<a>` that navigates without a page load. Modified clicks (Ctrl/Cmd/Shift/middle) keep the
 * browser's own behaviour, so "open in new tab" still works.
 */
export function Link({ to, onClick, ...props }: LinkProps) {
  const { navigate } = useRouter()
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event)
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    navigate(to)
  }
  return <a href={to} onClick={handleClick} {...props} />
}
