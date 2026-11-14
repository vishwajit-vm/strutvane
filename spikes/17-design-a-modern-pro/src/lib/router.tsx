/**
 * A deliberately tiny client router (History API), enough for a clickable mockup: `navigate()`,
 * `<Link>`, `useLocation()` and `matchPath()` with `:param` segments.
 *
 * Why not TanStack Router here: the mockup's job is to compare *visual* directions; a small router
 * keeps every screen readable and lets tests start on any URL with `history.pushState`.
 *
 * @module
 */
import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent, type ReactElement } from 'react'

const NAVIGATE_EVENT = 'strutvane:navigate'

/** The current location, split the way screens need it. */
export interface Location {
  readonly pathname: string
  readonly search: URLSearchParams
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener('popstate', onChange)
  window.addEventListener(NAVIGATE_EVENT, onChange)
  return () => {
    window.removeEventListener('popstate', onChange)
    window.removeEventListener(NAVIGATE_EVENT, onChange)
  }
}

const snapshot = (): string => window.location.pathname + window.location.search

/**
 * Go to another screen. Scrolls to the top like a normal page load.
 *
 * @example
 * navigate('/invoices/INV-1042')
 */
export function navigate(to: string, options: { readonly replace?: boolean } = {}): void {
  if (options.replace === true) window.history.replaceState(null, '', to)
  else window.history.pushState(null, '', to)
  window.dispatchEvent(new Event(NAVIGATE_EVENT))
  window.scrollTo({ top: 0 })
}

/**
 * Subscribe to the current location; re-renders on navigation and Back/Forward.
 *
 * @example
 * const { pathname } = useLocation()
 */
export function useLocation(): Location {
  const href = useSyncExternalStore(subscribe, snapshot, snapshot)
  const url = new URL(href, 'http://local')
  return { pathname: url.pathname, search: url.searchParams }
}

/**
 * Match `/invoices/:id` style patterns. Returns the params, or `null` when the path differs.
 *
 * @example
 * matchPath('/invoices/:id', '/invoices/INV-1042') // { id: 'INV-1042' }
 */
export function matchPath(pattern: string, pathname: string): Record<string, string> | null {
  const want = pattern.split('/').filter(Boolean)
  const have = pathname.split('/').filter(Boolean)
  if (want.length !== have.length) return null
  const params: Record<string, string> = {}
  for (const [index, segment] of want.entries()) {
    const actual = have[index] ?? ''
    if (segment.startsWith(':')) params[segment.slice(1)] = decodeURIComponent(actual)
    else if (segment !== actual) return null
  }
  return params
}

/** Props of {@link Link}: an anchor whose `href` is a route. */
export interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  readonly to: string
}

/**
 * An `<a>` that navigates without reloading. Modified clicks (Ctrl/Cmd/Shift/middle) keep the
 * browser's default, so "open in new tab" still works.
 *
 * @example
 * <Link to="/invoices">Invoices</Link>
 */
export function Link({ to, onClick, ...rest }: LinkProps): ReactElement {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>): void => {
    onClick?.(event)
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    navigate(to)
  }
  return <a href={to} onClick={handleClick} {...rest} />
}
