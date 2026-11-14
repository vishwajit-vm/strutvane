/**
 * `<ThemeSwitch>`: Light / Dark / System, as three pressed-state buttons in a labelled group.
 *
 * Why buttons with `aria-pressed` instead of a dropdown: all three choices are visible at once,
 * one click changes the theme, and a screen reader announces which one is on.
 *
 * @module
 */
import { IconDeviceDesktop, IconMoon, IconSun, type Icon as TablerIcon } from '@tabler/icons-react'
import type { ReactElement } from 'react'
import { cn } from '../lib/cn.ts'
import { useTheme, type ThemePreference } from '../theme/theme.tsx'

const CHOICES: readonly { readonly value: ThemePreference; readonly label: string; readonly icon: TablerIcon }[] = [
  { value: 'light', label: 'Light theme', icon: IconSun },
  { value: 'dark', label: 'Dark theme', icon: IconMoon },
  { value: 'system', label: 'System theme', icon: IconDeviceDesktop },
]

/**
 * The theme switch shown in the top bar.
 *
 * @example
 * <ThemeSwitch />
 */
export function ThemeSwitch(): ReactElement {
  const { preference, setPreference } = useTheme()
  return (
    <div role="group" aria-label="Theme" className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
      {CHOICES.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          aria-label={label}
          aria-pressed={preference === value}
          title={label}
          onClick={() => setPreference(value)}
          className={cn(
            'inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors duration-(--duration-fast) hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            preference === value && 'bg-card text-primary shadow-sm',
          )}
        >
          <Icon aria-hidden="true" className="size-4" />
        </button>
      ))}
    </div>
  )
}
