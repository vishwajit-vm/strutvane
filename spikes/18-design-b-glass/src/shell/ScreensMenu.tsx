/**
 * The "Screens" switcher: a reviewer's map of the mockup. Lists every screen and notable state
 * (empty list, loading skeleton) grouped, plus quick theme and solid-surface toggles.
 *
 * It is a mockup tool, not part of the product design; it is styled like the rest so it does not
 * distract during a review.
 *
 * @example <ScreensMenu />  // in the top bar; <ScreensMenu floating /> on the sign-in pages
 */
import { IconLayoutGrid } from '@tabler/icons-react'
import { useNavigate } from 'react-router'
import { Button } from '../components/ui/button.tsx'
import { DropdownMenu, MenuCheckboxItem, MenuContent, MenuItem, MenuLabel, MenuSeparator } from '../components/ui/menu.tsx'
import { cn } from '../lib/cn.ts'
import { useTheme } from '../lib/theme.tsx'
import { SCREENS, type ScreenLink } from './navigation.ts'

const GROUPS: readonly ScreenLink['group'][] = ['Auth', 'App', 'Invoices', 'Account', 'Views', 'Overlays']

export function ScreensMenu({ floating = false }: { floating?: boolean }) {
  const navigate = useNavigate()
  const { resolved, setTheme, solid, setSolid } = useTheme()
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button
          variant={floating ? 'secondary' : 'ghost'}
          size={floating ? 'md' : 'icon'}
          aria-label="Screens"
          className={cn(floating ? 'glass-chrome fixed right-4 bottom-4 z-(--z-chrome) rounded-full' : 'xl:w-auto xl:px-3')}
        >
          <IconLayoutGrid aria-hidden />
          <span className={cn(floating ? '' : 'hidden xl:inline')}>Screens</span>
        </Button>
      </DropdownMenu.Trigger>
      <MenuContent align="end" side={floating ? 'top' : 'bottom'} className="scroll-thin max-h-[min(36rem,calc(100dvh-6rem))] w-72 overflow-y-auto">
        {GROUPS.map((group, index) => (
          <DropdownMenu.Group key={group}>
            {index > 0 && <MenuSeparator />}
            <MenuLabel>{group}</MenuLabel>
            {SCREENS.filter((screen) => screen.group === group).map((screen) => (
              <MenuItem key={screen.to} onSelect={() => void navigate(screen.to)}>
                {screen.label}
              </MenuItem>
            ))}
          </DropdownMenu.Group>
        ))}
        <MenuSeparator />
        <MenuLabel>Preview</MenuLabel>
        <MenuCheckboxItem checked={resolved === 'dark'} onCheckedChange={(dark) => setTheme(dark ? 'dark' : 'light')} onSelect={(event) => event.preventDefault()}>
          Dark theme
        </MenuCheckboxItem>
        <MenuCheckboxItem checked={solid} onCheckedChange={(checked) => setSolid(checked)} onSelect={(event) => event.preventDefault()}>
          Solid surfaces (fallback)
        </MenuCheckboxItem>
      </MenuContent>
    </DropdownMenu.Root>
  )
}
