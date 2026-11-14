/**
 * Layout for the signed-out screens: a glass card over the mesh backdrop, with an illustrated
 * brand panel on wide screens. On phones the art is dropped and the card fills the width.
 */
import type { ReactNode } from 'react'
import { BrandMark } from '../../components/data-display.tsx'
import { DashboardHeroArt } from '../../components/illustrations.tsx'
import { Backdrop } from '../../shell/AppShell.tsx'
import { ScreensMenu } from '../../shell/ScreensMenu.tsx'

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <Backdrop />
      <main className="grid min-h-dvh place-items-center p-4 sm:p-8">
        <div className="grid w-full max-w-5xl overflow-hidden rounded-2xl lg:grid-cols-[1.05fr_1fr] lg:glass-chrome">
          <aside className="relative hidden flex-col justify-between p-10 lg:flex" aria-label="About Strutvane">
            <div className="flex items-center gap-3">
              <BrandMark />
              <span className="text-lg font-bold tracking-tight text-fg">Strutvane</span>
            </div>
            <DashboardHeroArt className="my-8 w-full" />
            <div>
              <p className="text-xl font-semibold tracking-tight text-fg">Your models in, a complete admin out.</p>
              <p className="mt-2 max-w-sm text-base text-fg-muted">Invoices, customers and teams with secure APIs and screens you own, generated from a few lines of TypeScript.</p>
            </div>
          </aside>
          <div className="glass-overlay rounded-2xl p-6 sm:p-10 lg:m-2.5 lg:rounded-[calc(var(--radius-2xl)-0.25rem)]">
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <BrandMark />
              <span className="text-lg font-bold tracking-tight text-fg">Strutvane</span>
            </div>
            {children}
          </div>
        </div>
      </main>
      <ScreensMenu floating />
    </>
  )
}
