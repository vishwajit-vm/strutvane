/**
 * The frame for sign-in and password reset: a single centred card on the canvas with a faint dot
 * grid that fades out toward the edges. One focal point, nothing to read but the form.
 */
import type { ReactNode } from 'react'
import { Logo } from '../../components/brand.tsx'
import { ScreensMenu } from '../../shell/Topbar.tsx'
import { ThemeQuickToggle } from './ThemeQuickToggle.tsx'

interface AuthLayoutProps {
  title: string
  description: ReactNode
  children: ReactNode
  /** Under the card: "No account? Request access" style links. */
  footer?: ReactNode
}

export function AuthLayout({ title, description, children, footer }: AuthLayoutProps) {
  return (
    <div className="auth-backdrop relative flex min-h-dvh flex-col bg-bg">
      <header className="flex h-14 items-center justify-between px-4 sm:px-6">
        <Logo />
        <div className="flex items-center gap-1">
          <ScreensMenu />
          <ThemeQuickToggle />
        </div>
      </header>
      <main id="main" className="flex flex-1 items-start justify-center px-4 pb-16 pt-[8vh] sm:pt-[12vh]">
        <div className="w-full max-w-[400px]">
          <div className="rounded-xl border border-border bg-surface px-6 py-8 shadow-sm sm:px-8">
            <h1 className="text-xl font-semibold tracking-(--tracking-title) text-fg">{title}</h1>
            <p className="mt-1.5 text-sm text-fg-muted">{description}</p>
            <div className="mt-6">{children}</div>
          </div>
          {footer !== undefined && <div className="mt-6 text-center text-sm text-fg-muted">{footer}</div>}
        </div>
      </main>
      <footer className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 pb-6 text-xs text-fg-subtle">
        <span>© 2026 Northwind Labs</span>
        <a href="#privacy" className="hover:text-fg">
          Privacy
        </a>
        <a href="#terms" className="hover:text-fg">
          Terms
        </a>
        <a href="#status" className="inline-flex items-center gap-1.5 hover:text-fg">
          <span aria-hidden className="size-1.5 rounded-full bg-success" /> All systems normal
        </a>
      </footer>
    </div>
  )
}
