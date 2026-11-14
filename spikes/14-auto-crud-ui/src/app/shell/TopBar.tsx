/**
 * `<TopBar>`: the sticky navbar. Menu button (small screens), the global search trigger with its
 * shortcut hint, the theme switch, notifications and the user menu.
 *
 * It floats as a card above the content (blurred backdrop), so scrolled content stays readable
 * under it in both themes.
 *
 * @module
 */
import { useNavigate } from '@tanstack/react-router'
import { IconBell, IconLayoutDashboard, IconLogout, IconMenu2, IconSearch } from '@tabler/icons-react'
import type { ReactElement } from 'react'
import { useSession } from '../auth/session.tsx'
import { Avatar } from '../components/ui/avatar.tsx'
import { DropdownMenu } from '../components/ui/dropdown-menu.tsx'
import { NOTIFICATIONS } from './notifications.ts'
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
 * The navbar.
 *
 * @example
 * <TopBar onOpenMenu={openMenu} onOpenSearch={openSearch} />
 */
export function TopBar({ onOpenMenu, onOpenSearch }: TopBarProps): ReactElement {
  const { user, signOut } = useSession()
  const navigate = useNavigate()
  return (
    <header className="sticky top-0 z-(--z-sticky) px-4 pt-3 md:px-6">
      <div className="flex h-(--navbar-height) items-center gap-2 rounded-xl bg-card/90 px-3 shadow-card backdrop-blur md:px-4">
        <button type="button" className="rounded-lg p-2 text-muted-foreground hover:bg-accent md:hidden" onClick={onOpenMenu} aria-label="Open menu">
          <IconMenu2 aria-hidden="true" className="size-5" />
        </button>
        <button
          type="button"
          onClick={onOpenSearch}
          aria-keyshortcuts="Control+K Meta+K"
          className="flex min-h-9 flex-1 items-center gap-2 rounded-lg px-2 text-left text-base text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:max-w-sm"
        >
          <IconSearch aria-hidden="true" className="size-5" />
          <span className="flex-1">Search…</span>
          <kbd className="hidden rounded border px-1.5 text-xs sm:inline">{shortcutHint()}</kbd>
        </button>
        <div className="ml-auto flex items-center gap-1.5">
          <ThemeSwitch />
          <DropdownMenu
            label="Notifications"
            trigger={
              <>
                <IconBell aria-hidden="true" className="size-5" />
                {NOTIFICATIONS.length > 0 && <span aria-hidden="true" className="absolute right-1.5 top-1.5 size-2 rounded-full bg-destructive ring-2 ring-card" />}
              </>
            }
            header={<p className="text-sm font-semibold">Notifications</p>}
            items={NOTIFICATIONS.map((note) => ({ id: note.id, label: <><span className="block font-medium">{note.title}</span><span className="block text-xs text-muted-foreground">{note.detail}</span></> }))}
            empty="You're all caught up."
          />
          {user !== null && (
            <DropdownMenu
              label="Account"
              trigger={
                <span className="relative">
                  <Avatar name={user.email} />
                  <span aria-hidden="true" className="absolute bottom-0 right-0 size-2.5 rounded-full bg-success ring-2 ring-card" />
                </span>
              }
              header={
                <div className="flex items-center gap-3">
                  <Avatar name={user.email} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{user.email}</p>
                    <p className="text-xs capitalize text-muted-foreground">{user.role}</p>
                  </div>
                </div>
              }
              items={[
                { id: 'dashboard', label: 'Dashboard', icon: <IconLayoutDashboard aria-hidden="true" className="size-4" />, onSelect: () => void navigate({ to: '/' }) },
                {
                  id: 'sign-out',
                  label: 'Sign out',
                  icon: <IconLogout aria-hidden="true" className="size-4" />,
                  onSelect: () => {
                    signOut()
                    void navigate({ to: '/sign-in' })
                  },
                },
              ]}
            />
          )}
        </div>
      </div>
    </header>
  )
}
