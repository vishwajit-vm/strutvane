/**
 * `<BackButton>`: the "Back to Posts" control in the page header of every page below the top
 * level (detail, create, edit, custom pages). DESIGN.md §4 "Back control".
 *
 * Behaviour:
 * - when the previous history entry is inside the app, it goes **back in history**, so the list
 *   comes back with its filters, page and sort (they live in the URL) and its scroll position
 *   (router scroll restoration);
 * - otherwise (opened from a bookmark, a shared link, a new tab) it goes to the **parent route**
 *   (detail → list, edit → detail, create → list) instead of leaving the app;
 * - Alt+Left does the same from anywhere on the page.
 *
 * @module
 */
import { useCanGoBack, useNavigate, useRouter, type NavigateOptions } from '@tanstack/react-router'
import { IconArrowLeft } from '@tabler/icons-react'
import { useCallback, useEffect, type ReactElement } from 'react'

/**
 * Where "back" goes when there is no in-app history: a typed route target.
 *
 * @example
 * const parent: BackTarget = { to: '/$resource', params: { resource: 'posts' } }
 */
export type BackTarget = NavigateOptions

/**
 * Props of {@link BackButton}.
 *
 * @example
 * const props: BackButtonProps = { label: 'Back to Posts', parent: { to: '/$resource', params: { resource: 'posts' } } }
 */
export interface BackButtonProps {
  /** Full text, also the accessible name on small screens where only the arrow shows. */
  readonly label: string
  readonly parent: BackTarget
}

/**
 * Go back: history when it stays in the app, else the parent route. Shared by the button, Alt+Left
 * and "Escape leaves the form".
 *
 * @example
 * const goBack = useGoBack({ to: '/$resource', params: { resource: 'posts' } })
 */
export function useGoBack(parent: BackTarget): () => void {
  const router = useRouter()
  const navigate = useNavigate()
  // True only when this tab navigated inside the app before: history.back() then stays here.
  const canGoBack = useCanGoBack()
  const parentKey = JSON.stringify(parent)
  return useCallback(() => {
    if (canGoBack) router.history.back()
    else void navigate(parent)
    // `parent` is compared by value (parentKey): callers pass fresh object literals.
  }, [canGoBack, router, navigate, parentKey])
}

/**
 * The back control.
 *
 * @example
 * <BackButton label="Back to Posts" parent={{ to: '/$resource', params: { resource: 'posts' } }} />
 */
export function BackButton({ label, parent }: BackButtonProps): ReactElement {
  const goBack = useGoBack(parent)
  useAltLeft(goBack)
  return (
    <button
      type="button"
      onClick={goBack}
      aria-label={label}
      aria-keyshortcuts="Alt+ArrowLeft"
      title={`${label} (Alt+←)`}
      className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-muted-foreground transition-colors duration-(--duration-fast) hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-3"
    >
      <IconArrowLeft aria-hidden="true" className="size-5" />
      {/* Text on desktop; on small screens the arrow alone, named by aria-label. */}
      <span aria-hidden="true" className="hidden sm:inline">
        {label}
      </span>
    </button>
  )
}

/** Alt+Left (the browser's own Back chord) runs the same in-app logic. */
function useAltLeft(goBack: () => void): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.altKey && event.key === 'ArrowLeft' && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
        event.preventDefault()
        goBack()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [goBack])
}
