/**
 * Keyboard shortcuts for the whole admin, and the `?` overlay that lists them (DESIGN.md §11).
 *
 * Rules that keep shortcuts from getting in the way:
 * - single keys (`/`, `?`, `n`, `e`, `g d`) never fire while you type in a field, while a menu or
 *   listbox has focus, or while a dialog is open (`shortcutBlocked`);
 * - Ctrl/Cmd+K works everywhere; Alt+← follows the single-key rule, because it IS a typing key
 *   (word left on macOS);
 * - every shortcut has a visible, clickable equivalent (search button, New, Edit, Back).
 *
 * @module
 */
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useEffect, useId, useRef, type ReactElement } from 'react'
import { useSession } from '../auth/session.tsx'
import { Button } from '../components/ui/button.tsx'
import { Dialog } from '../components/ui/dialog.tsx'
import { shortcutBlocked } from '../lib/hooks.ts'
import { useRegistry } from '../registry.tsx'

/** How long after `g` the second key of a "go to" sequence is accepted. */
const SEQUENCE_MS = 1500

/**
 * The shortcut list, shown in the help overlay and in DESIGN.md.
 *
 * @example
 * SHORTCUTS[0] // { keys: ['Ctrl', 'K'], description: 'Search screens, records and actions' }
 */
export const SHORTCUTS: readonly { readonly keys: readonly string[]; readonly description: string }[] = [
  { keys: ['Ctrl', 'K'], description: 'Search screens, records and actions (⌘K on a Mac)' },
  { keys: ['/'], description: 'Search' },
  { keys: ['?'], description: 'Show this list of shortcuts' },
  { keys: ['g', 'd'], description: 'Go to the dashboard' },
  { keys: ['n'], description: 'New record (on a list or detail page)' },
  { keys: ['e'], description: 'Edit this record (on a detail page)' },
  { keys: ['Alt', '←'], description: 'Back' },
  { keys: ['Esc'], description: 'Close a dialog or menu; leave a form' },
]

/**
 * The resource route segments of a path: `/posts/my-post/edit` → `['posts', 'my-post', 'edit']`.
 *
 * @example
 * pathSegments('/posts/new') // ['posts', 'new']
 */
export function pathSegments(pathname: string): string[] {
  return pathname.split('/').filter((part) => part !== '').map(decodeURIComponent)
}

/**
 * Listen for the single-key shortcuts.
 *
 * @example
 * useShortcuts({ openSearch: () => setSearchOpen(true), openHelp: () => setHelpOpen(true) })
 */
export function useShortcuts({ openSearch, openHelp }: { readonly openSearch: () => void; readonly openHelp: () => void }): void {
  const navigate = useNavigate()
  // Select only the pathname (a string): subscribing to the whole location object re-rendered the
  // shell on every router tick, which ran out of memory in the test suite.
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const { byRoute } = useRegistry()
  const { can } = useSession()
  const pendingG = useRef(0)

  useEffect(() => {
    const [route, key, action] = pathSegments(pathname)
    const resource = route === undefined ? undefined : byRoute.get(route)
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.ctrlKey || event.metaKey || event.altKey || shortcutBlocked(event)) return
      const press = event.key
      if (press === 'd' && Date.now() - pendingG.current < SEQUENCE_MS) {
        pendingG.current = 0
        void navigate({ to: '/' })
      } else if (press === 'g') {
        pendingG.current = Date.now()
        return
      } else if (press === '/') {
        openSearch()
      } else if (press === '?') {
        openHelp()
      } else if (press === 'n' && resource !== undefined && can('create', resource.name) && key !== 'new') {
        void navigate({ to: '/$resource/new', params: { resource: resource.metadata.route } })
      } else if (press === 'e' && resource !== undefined && key !== undefined && key !== 'new' && action === undefined && can('update', resource.name)) {
        void navigate({ to: '/$resource/$key/edit', params: { resource: resource.metadata.route, key } })
      } else {
        return
      }
      // A handled key must not also type into whatever gets focus next.
      event.preventDefault()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pathname, byRoute, can, navigate, openSearch, openHelp])
}

/**
 * The `?` overlay listing every shortcut.
 *
 * @example
 * <ShortcutsDialog open={open} onClose={() => setOpen(false)} />
 */
export function ShortcutsDialog({ open, onClose }: { readonly open: boolean; readonly onClose: () => void }): ReactElement | null {
  const titleId = useId()
  return (
    <Dialog open={open} onClose={onClose} labelledBy={titleId}>
      <h2 id={titleId} className="text-lg font-semibold">
        Keyboard shortcuts
      </h2>
      <dl className="mt-4 divide-y">
        {SHORTCUTS.map((shortcut) => (
          <div key={shortcut.description} className="flex items-center justify-between gap-4 py-2.5 text-sm">
            <dt className="text-muted-foreground">{shortcut.description}</dt>
            <dd className="flex shrink-0 gap-1">
              {shortcut.keys.map((key) => (
                <kbd key={key} className="min-w-6 rounded-md border bg-muted px-1.5 py-0.5 text-center text-xs font-semibold">
                  {key}
                </kbd>
              ))}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-5 flex justify-end">
        <Button variant="outline" onClick={onClose}>
          Close
        </Button>
      </div>
    </Dialog>
  )
}
