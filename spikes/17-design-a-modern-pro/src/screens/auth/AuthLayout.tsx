/**
 * `<AuthLayout>`: the split layout of the sign-in and password screens.
 *
 * Left (≥1024px): a branded panel on the accent gradient with an original illustration, a short
 * promise and social proof. Right: the form, centred in a calm column with the logo on top.
 * On phones and tablets the brand panel is dropped so the form is the first thing on screen.
 *
 * @example
 * <AuthLayout title="Welcome back" subtitle="Sign in to continue."><form>…</form></AuthLayout>
 */
import { IconStarFilled } from '@tabler/icons-react'
import type { ReactElement, ReactNode } from 'react'
import { Logo } from '../../components/brand.tsx'
import { AuthIllustration, CoverPattern } from '../../components/illustrations.tsx'
import { AvatarGroup } from '../../components/ui/misc.tsx'
import { team } from '../../data/people.ts'

export function AuthLayout({ title, subtitle, children, footer }: { readonly title: string; readonly subtitle: ReactNode; readonly children: ReactNode; readonly footer?: ReactNode }): ReactElement {
  return (
    <div className="grid min-h-dvh bg-background lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <BrandPanel />
      <main className="flex min-w-0 flex-col px-4 py-8 sm:px-10">
        <div className="lg:hidden">
          <Logo />
        </div>
        <div className="mx-auto flex w-full max-w-[25rem] flex-1 flex-col justify-center py-10">
          <h1 className="text-[1.75rem] font-bold leading-9 tracking-tight text-foreground">{title}</h1>
          <p className="mt-2 text-sm text-muted-foreground">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
        {footer === undefined ? null : <div className="mx-auto w-full max-w-[25rem] text-center text-sm text-muted-foreground">{footer}</div>}
      </main>
    </div>
  )
}

function BrandPanel(): ReactElement {
  return (
    <aside className="relative hidden overflow-hidden bg-brand-gradient p-10 text-primary-foreground lg:flex lg:flex-col xl:p-14">
      <CoverPattern className="pointer-events-none absolute inset-0" />
      <div className="relative flex items-center gap-2.5">
        <span className="grid size-9 place-items-center rounded-lg bg-primary-foreground/15 ring-1 ring-primary-foreground/25">
          <svg viewBox="0 0 32 32" aria-hidden className="size-6">
            <path d="M10.5 22.5 21.5 9.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
            <circle cx="10" cy="23" r="2.4" fill="currentColor" />
            <path d="M21.5 9.5c-.6 3.8-2.7 6.4-6.4 7.6 1.2-3.6 3.4-6.2 6.4-7.6Z" fill="currentColor" opacity="0.85" />
          </svg>
        </span>
        <span className="text-lg font-extrabold tracking-tight">strutvane</span>
      </div>
      <div className="relative mx-auto my-auto w-full max-w-lg py-10">
        <AuthIllustration className="drop-shadow-xl" />
      </div>
      <div className="relative max-w-lg">
        <p className="text-[1.625rem] font-bold leading-9 tracking-tight">Billing, customers and your whole team, in one calm workspace.</p>
        <p className="mt-3 text-sm text-primary-foreground/85">Declare your models, get a secured API and a polished admin, and own every line of it.</p>
        <div className="mt-8 flex items-center gap-4">
          <AvatarGroup people={team.slice(0, 5)} max={4} />
          <div>
            <div className="flex gap-0.5" aria-label="Rated 4.9 out of 5">
              {[0, 1, 2, 3, 4].map((star) => (
                <IconStarFilled key={star} aria-hidden className="size-3.5" />
              ))}
            </div>
            <p className="mt-0.5 text-xs text-primary-foreground/85">Trusted by 2,400+ finance teams</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
