/**
 * The floating glass top bar: menu (mobile), search trigger (opens the command palette), the
 * Screens switcher, theme, notifications and the account menu.
 *
 * It is sticky with a `--chrome-gap` inset, so page content scrolls UNDER it: that is why it is
 * one of the few blurred layers.
 */
import {
  IconBell,
  IconDeviceDesktop,
  IconLogout,
  IconMenu2,
  IconMoon,
  IconSearch,
  IconSettings,
  IconShieldCheck,
  IconSun,
  IconUser,
  IconUsers,
} from '@tabler/icons-react'
import { Link, useNavigate } from 'react-router'
import { Avatar } from '../components/ui/avatar.tsx'
import { Button } from '../components/ui/button.tsx'
import { DropdownMenu, MenuCheckboxItem, MenuContent, MenuItem, MenuLabel, MenuSeparator } from '../components/ui/menu.tsx'
import { Kbd } from '../components/ui/misc.tsx'
import { NOTIFICATIONS } from '../data/workspace.ts'
import { CURRENT_USER } from '../data/people.ts'
import { cn } from '../lib/cn.ts'
import { formatRelative, TODAY } from '../lib/format.ts'
import { useTheme, type ThemeChoice } from '../lib/theme.tsx'
import { modKeyLabel } from '../lib/use-hotkey.ts'
import { ScreensMenu } from './ScreensMenu.tsx'
import { useShell } from './shell-state.tsx'

export function TopBar() {
  const { openPalette, setMobileNavOpen } = useShell()
  return (
    <header className="glass-chrome sticky top-(--chrome-gap) z-(--z-chrome) flex h-(--topbar-height) items-center gap-2 rounded-2xl px-2.5 sm:gap-3 sm:px-3">
      <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu" onClick={() => setMobileNavOpen(true)}>
        <IconMenu2 aria-hidden />
      </Button>
      <button
        type="button"
        onClick={openPalette}
        className="flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-md border border-glass-border bg-glass-hover px-3 text-left text-base text-fg-muted transition-base hover:bg-surface sm:max-w-sm"
      >
        <IconSearch className="size-4 shrink-0" aria-hidden />
        <span className="flex-1 truncate">Search or jump to…</span>
        <span className="hidden items-center gap-1 sm:flex" aria-hidden>
          <Kbd>{modKeyLabel()}</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>
      <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
        <ScreensMenu />
        <ThemeMenu />
        <NotificationsMenu />
        <UserMenu />
      </div>
    </header>
  )
}

const THEME_OPTIONS: readonly { value: ThemeChoice; label: string; icon: typeof IconSun }[] = [
  { value: 'light', label: 'Light', icon: IconSun },
  { value: 'dark', label: 'Dark', icon: IconMoon },
  { value: 'system', label: 'System', icon: IconDeviceDesktop },
]

/** Theme picker; also holds the "Solid surfaces" switch (the reduced-transparency fallback). */
export function ThemeMenu() {
  const { theme, resolved, setTheme, solid, setSolid } = useTheme()
  const Current = resolved === 'dark' ? IconMoon : IconSun
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Theme: ${theme}. Change theme`}>
          <Current aria-hidden />
        </Button>
      </DropdownMenu.Trigger>
      <MenuContent align="end" className="w-56">
        <MenuLabel>Appearance</MenuLabel>
        <DropdownMenu.RadioGroup value={theme} onValueChange={(value) => setTheme(value as ThemeChoice)}>
          {THEME_OPTIONS.map((option) => (
            <DropdownMenu.RadioItem
              key={option.value}
              value={option.value}
              className="flex cursor-default items-center gap-2.5 rounded-sm px-2.5 py-2 text-base text-fg outline-none data-highlighted:bg-primary-soft data-highlighted:text-primary-soft-fg data-[state=checked]:font-semibold"
            >
              <option.icon className="size-4" aria-hidden />
              <span className="flex-1">{option.label}</span>
              <DropdownMenu.ItemIndicator className="size-1.5 rounded-full bg-control" />
            </DropdownMenu.RadioItem>
          ))}
        </DropdownMenu.RadioGroup>
        <MenuSeparator />
        <MenuCheckboxItem checked={solid} onCheckedChange={(checked) => setSolid(checked)} onSelect={(event) => event.preventDefault()}>
          Solid surfaces
        </MenuCheckboxItem>
      </MenuContent>
    </DropdownMenu.Root>
  )
}

const TONE_DOT = { success: 'bg-success', warning: 'bg-warning', info: 'bg-info', danger: 'bg-danger' } as const

export function NotificationsMenu() {
  const unread = NOTIFICATIONS.filter((item) => item.unread).length
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Notifications, ${unread} unread`} className="relative">
          <IconBell aria-hidden />
          {unread > 0 && (
            <span className="bg-brand-gradient absolute top-1.5 right-1.5 grid min-w-4 place-items-center rounded-full px-1 text-2xs leading-4 font-bold text-primary-fg ring-2 ring-glass-border" aria-hidden>
              {unread}
            </span>
          )}
        </Button>
      </DropdownMenu.Trigger>
      <MenuContent align="end" className="w-[min(24rem,calc(100vw-1.5rem))] p-0">
        <div className="flex items-center justify-between px-4 pt-3.5 pb-2.5">
          <DropdownMenu.Label className="text-md font-semibold text-fg">Notifications</DropdownMenu.Label>
          <span className="rounded-full bg-primary-soft px-2 py-0.5 text-2xs font-bold text-primary-soft-fg">{unread} new</span>
        </div>
        <div className="scroll-thin max-h-96 overflow-y-auto px-1.5 pb-1.5">
          {NOTIFICATIONS.map((item) => (
            <DropdownMenu.Item
              key={item.id}
              className="flex cursor-default gap-3 rounded-md px-2.5 py-2.5 outline-none data-highlighted:bg-glass-hover"
            >
              <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', item.unread ? TONE_DOT[item.tone] : 'bg-neutral-soft')} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className={cn('block text-base text-fg', item.unread && 'font-semibold')}>
                  {item.title}
                  {item.unread && <span className="sr-only"> (unread)</span>}
                </span>
                <span className="mt-0.5 block text-sm text-fg-muted">{item.body}</span>
                <span className="mt-1 block text-xs text-fg-muted">{formatRelative(new Date(TODAY.getTime() - item.minutesAgo * 60_000))}</span>
              </span>
            </DropdownMenu.Item>
          ))}
        </div>
        <div className="border-t border-border p-1.5">
          <MenuItem className="justify-center font-semibold text-primary-text">Mark all as read</MenuItem>
        </div>
      </MenuContent>
    </DropdownMenu.Root>
  )
}

export function UserMenu() {
  const navigate = useNavigate()
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" aria-label={`Account: ${CURRENT_USER.name}`} className="ml-0.5 flex items-center gap-2.5 rounded-full p-0.5 transition-base hover:bg-glass-hover sm:pr-3">
          <Avatar name={CURRENT_USER.name} status="online" />
          <span className="hidden text-left leading-tight xl:block">
            <span className="block text-sm font-semibold text-fg">{CURRENT_USER.name}</span>
            <span className="block text-xs text-fg-muted">{CURRENT_USER.role}</span>
          </span>
        </button>
      </DropdownMenu.Trigger>
      <MenuContent align="end" className="w-60">
        <div className="flex items-center gap-3 px-2.5 py-2">
          <Avatar name={CURRENT_USER.name} size="md" />
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-fg">{CURRENT_USER.name}</p>
            <p className="truncate text-xs text-fg-muted">{CURRENT_USER.email}</p>
          </div>
        </div>
        <MenuSeparator />
        <MenuItem icon={<IconUser />} onSelect={() => void navigate('/settings/profile')}>
          Profile
        </MenuItem>
        <MenuItem icon={<IconShieldCheck />} onSelect={() => void navigate('/settings/security')}>
          Security
        </MenuItem>
        <MenuItem icon={<IconUsers />} onSelect={() => void navigate('/team')}>
          Team
        </MenuItem>
        <MenuItem icon={<IconSettings />} onSelect={() => void navigate('/settings/notifications')}>
          Settings
        </MenuItem>
        <MenuSeparator />
        <DropdownMenu.Item asChild>
          <Link
            to="/sign-in"
            className="flex cursor-default items-center gap-2.5 rounded-sm px-2.5 py-2 text-base text-danger outline-none data-highlighted:bg-danger-soft [&_svg]:size-4"
          >
            <IconLogout aria-hidden />
            Sign out
          </Link>
        </DropdownMenu.Item>
      </MenuContent>
    </DropdownMenu.Root>
  )
}
