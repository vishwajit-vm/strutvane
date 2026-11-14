/**
 * `<ScreenSwitcher>`: a mockup-only control that lists every screen, so the project lead can jump
 * between them while comparing design directions. Styled with a dashed outline on purpose: it is
 * scaffolding around the design, not part of it.
 *
 * `floating` pins it to the top-right corner (used on the shell-less auth pages).
 *
 * @example
 * <ScreenSwitcher />
 * <ScreenSwitcher floating />
 */
import { IconLayoutDashboard } from '@tabler/icons-react'
import { Fragment, type ReactElement } from 'react'
import { screensByGroup } from '../app/screens.ts'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '../components/ui/menu.tsx'
import { cn } from '../lib/cn.ts'
import { navigate, useLocation } from '../lib/router.tsx'

export function ScreenSwitcher({ floating = false }: { readonly floating?: boolean }): ReactElement {
  const { pathname, search } = useLocation()
  const current = pathname + (search.size > 0 ? `?${search.toString()}` : '')
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'inline-flex h-9 cursor-pointer items-center gap-2 rounded-full border border-dashed border-primary/60 px-2.5 text-label font-semibold text-primary-soft-foreground outline-none transition-colors hover:bg-primary-soft focus-visible:ring-3 focus-visible:ring-ring/30 sm:px-3.5',
          floating && 'fixed right-4 top-4 z-40 bg-card shadow-md',
        )}
        aria-label="Mockup screens"
      >
        <IconLayoutDashboard aria-hidden className="size-4.5" />
        <span className={cn(!floating && 'hidden md:inline')}>Screens</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="scrollbar-thin max-h-[min(36rem,80vh)] w-64 overflow-y-auto">
        {screensByGroup().map(([group, screens], index) => (
          <Fragment key={group}>
            {index > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuLabel>{group}</DropdownMenuLabel>
            {screens.map((screen) => (
              <DropdownMenuItem key={screen.id} onSelect={() => navigate(screen.path)} className={cn(current === screen.path && 'font-semibold text-primary-soft-foreground')}>
                {screen.label}
              </DropdownMenuItem>
            ))}
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
