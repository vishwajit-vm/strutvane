/**
 * A deliberately tiny client router (History API), enough for a clickable mockup: `navigate()`,
 * `<Link>`, `useLocation()` and `matchPath()` with `:param` segments.
 *
 * Why not TanStack Router here: the mockup's job is to compare *visual* directions; a small router
 * keeps every screen readable and lets tests start on any URL with `history.pushState`.
 *
 * @module
 */
import { useEffect, useState, useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent, type ReactElement } from 'react'

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
/** Asked before an in-app navigation leaves the page; resolves `true` to leave. */
export type LeaveGuard = () => Promise<boolean>

let guard: LeaveGuard | null = null
/** The location on screen (Back/Forward has already changed the URL when popstate fires). */
let shown = typeof window === 'undefined' ? '' : snapshot()

if (typeof window !== 'undefined') {
  // Installed at import, BEFORE React subscribes, so it runs first: with a guard up, Back/Forward
  // puts the URL back (React then sees no change), asks, and goes only if allowed.
  window.addEventListener('popstate', () => {
    const target = snapshot()
    const ask = guard
    if (ask === null || new URL(target, 'http://local').pathname === new URL(shown, 'http://local').pathname) {
      shown = target
      return
    }
    window.history.pushState(null, '', shown)
    void ask().then((leave) => {
      if (!leave) return
      guard = null
      navigate(target)
    })
  })
}

export function navigate(to: string, options: { readonly replace?: boolean; readonly keepScroll?: boolean } = {}): void {
  const ask = guard
  if (ask !== null && new URL(to, window.location.href).pathname !== window.location.pathname) {
    void ask().then((leave) => {
      if (!leave) return
      guard = null
      navigate(to, options)
    })
    return
  }
  if (options.replace === true) window.history.replaceState(null, '', to)
  else window.history.pushState(null, '', to)
  shown = snapshot()
  window.dispatchEvent(new Event(NAVIGATE_EVENT))
  // A list filter change rewrites the URL in place; jumping to the top would lose the user's place.
  if (options.keepScroll !== true) window.scrollTo({ top: 0 })
}

/**
 * Subscribe to the current location; re-renders on navigation and Back/Forward.
 *
 * @example
 * const { pathname } = useLocation()
 */
/**
 * Guard a page with unsaved changes: in-app navigation (links, Back/Forward) waits for an answer,
 * and closing or reloading the tab shows the browser's own prompt. Render a confirm dialog with
 * the returned `open`, `stay` and `leave`.
 *
 * @example
 * const leaving = useLeaveGuard(dirty && !saving)
 * <ConfirmDialog open={leaving.open} onOpenChange={(open) => !open && leaving.stay()} onConfirm={leaving.leave} … />
 */
export function useLeaveGuard(when: boolean): { readonly open: boolean; readonly stay: () => void; readonly leave: () => void } {
  const [pending, setPending] = useState<((leave: boolean) => void) | null>(null)
  useEffect(() => {
    if (!when) return undefined
    const ask: LeaveGuard = () => new Promise<boolean>((resolve) => setPending(() => resolve))
    guard = ask
    const onBeforeUnload = (event: BeforeUnloadEvent): void => event.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      if (guard === ask) guard = null
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [when])
  const answer = (leave: boolean): void => {
    pending?.(leave)
    setPending(null)
  }
  return { open: pending !== null, stay: () => answer(false), leave: () => answer(true) }
}

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
    if (segment.startsWith(':')) {
      // Malformed percent-encoding (`/invoices/%E0%A4%A`, `/invoices/50%`) makes decodeURIComponent
      // THROW during render, which blanked the whole app: treat it as "no match" (the 404).
      try {
        params[segment.slice(1)] = decodeURIComponent(actual)
      } catch {
        return null
      }
    } else if (segment !== actual) return null
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
