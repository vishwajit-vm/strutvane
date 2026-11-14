/**
 * `<TopBar>`: menu button (small screens), the global search trigger with its shortcut hint,
 * the theme switch, and the signed-in user with "Sign out".
 *
 * @module
 */
import { useNavigate } from '@tanstack/react-router'
import { LogOut, Menu, Search } from 'lucide-react'
import type { ReactElement } from 'react'
import { useSession } from '../auth/session.tsx'
import { Button } from '../components/ui/button.tsx'
import { ThemeSwitch } from './ThemeSwitch.tsx'

/**
 * Props of {@link TopBar}.
 *
 * @example
 * const props: TopBarProps = { onOpenMenu: open, onOpenSearch: openPalette }
 */
export interface TopBarProps {
  readonly onOpenMenu: () => void
  readonly onOpenSearch: () => void
}

/** "Ctrl K" on Windows/Linux, "⌘K" on a Mac, so the hint matches the keyboard in front of you. */
function shortcutHint(): string {
  const platform = typeof navigator === 'undefined' ? '' : navigator.platform
  return /mac|iphone|ipad/i.test(platform) ? '⌘K' : 'Ctrl K'
}

/**
 * The top bar.
 *
 * @example
 * <TopBar onOpenMenu={openMenu} onOpenSearch={openSearch} />
 */
export function TopBar({ onOpenMenu, onOpenSearch }: TopBarProps): ReactElement {
  const { user, signOut } = useSession()
  const navigate = useNavigate()
  return (
    <header className="flex h-14 items-center gap-2 border-b px-4">
      <Button variant="ghost" size="icon" className="md:hidden" onClick={onOpenMenu} aria-label="Open menu">
        <Menu aria-hidden="true" />
      </Button>
      <Button variant="outline" className="w-full max-w-sm justify-start text-muted-foreground" onClick={onOpenSearch} aria-keyshortcuts="Control+K Meta+K">
        <Search aria-hidden="true" />
        <span className="flex-1 text-left">Search…</span>
        <kbd className="hidden rounded border px-1.5 text-xs sm:inline">{shortcutHint()}</kbd>
      </Button>
      <div className="ml-auto flex items-center gap-2">
        <ThemeSwitch />
        {user !== null && (
          <>
            <span className="hidden text-sm text-muted-foreground lg:inline">{user.email}</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Sign out"
              title="Sign out"
              onClick={() => {
                signOut()
                void navigate({ to: '/sign-in' })
              }}
            >
              <LogOut aria-hidden="true" />
            </Button>
          </>
        )}
      </div>
    </header>
  )
}
