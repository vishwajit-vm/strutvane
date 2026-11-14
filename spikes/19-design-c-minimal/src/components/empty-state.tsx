/**
 * Empty states with original line illustrations (drawn for this mockup, not sourced).
 *
 * The drawings use only `currentColor` and theme tokens, so they are quiet grey line art in both
 * themes with a single accent detail, matching the "one confident accent" rule.
 *
 * @example
 * <EmptyState illustration="invoices" title="No invoices yet" description="…" action={<Button>New invoice</Button>} />
 */
import type { ReactNode } from 'react'
import { cn } from '../lib/cn.ts'

type Illustration = 'invoices' | 'search' | 'inbox' | 'files'

/** A stack of documents with an accent "+" badge: "nothing here yet, create the first one". */
function InvoicesArt() {
  return (
    <svg viewBox="0 0 120 96" fill="none" aria-hidden className="h-24 w-30">
      <rect x="30" y="14" width="56" height="70" rx="6" fill="var(--surface-subtle)" stroke="var(--border-strong)" />
      <rect x="22" y="20" width="56" height="70" rx="6" fill="var(--surface)" stroke="var(--border-strong)" />
      <path d="M32 34h22M32 42h36M32 50h30" stroke="var(--border-strong)" strokeWidth="3" strokeLinecap="round" />
      <path d="M32 70h16" stroke="var(--fg-subtle)" strokeWidth="3" strokeLinecap="round" />
      <path d="M58 70h10" stroke="var(--fg-subtle)" strokeWidth="3" strokeLinecap="round" />
      <circle cx="84" cy="74" r="13" fill="var(--accent)" />
      <path d="M84 68v12M78 74h12" stroke="var(--accent-fg)" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}

/** A magnifier over dotted rows: "your search or filters hide everything". */
function SearchArt() {
  return (
    <svg viewBox="0 0 120 96" fill="none" aria-hidden className="h-24 w-30">
      <rect x="18" y="18" width="84" height="60" rx="6" fill="var(--surface)" stroke="var(--border-strong)" />
      <path d="M28 32h40M28 44h52M28 56h30" stroke="var(--border)" strokeWidth="3" strokeLinecap="round" strokeDasharray="1 6" />
      <circle cx="74" cy="54" r="14" fill="var(--surface)" stroke="var(--fg-subtle)" strokeWidth="2.4" />
      <path d="m84 64 10 10" stroke="var(--fg-subtle)" strokeWidth="3" strokeLinecap="round" />
      <path d="M69 54h10" stroke="var(--accent)" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  )
}

/** An open tray with a check: "all caught up". */
function InboxArt() {
  return (
    <svg viewBox="0 0 120 96" fill="none" aria-hidden className="h-24 w-30">
      <path d="M24 52 34 26h52l10 26v20a6 6 0 0 1-6 6H30a6 6 0 0 1-6-6z" fill="var(--surface)" stroke="var(--border-strong)" />
      <path d="M24 52h22l4 8h20l4-8h22" stroke="var(--border-strong)" />
      <circle cx="60" cy="38" r="9" fill="var(--accent-subtle)" stroke="var(--accent)" strokeWidth="1.5" />
      <path d="m56 38 3 3 5-6" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** A folder with a dashed outline: "no files yet". */
function FilesArt() {
  return (
    <svg viewBox="0 0 120 96" fill="none" aria-hidden className="h-24 w-30">
      <path d="M22 28a6 6 0 0 1 6-6h18l8 8h38a6 6 0 0 1 6 6v36a6 6 0 0 1-6 6H28a6 6 0 0 1-6-6z" fill="var(--surface)" stroke="var(--border-strong)" />
      <rect x="40" y="40" width="40" height="28" rx="4" stroke="var(--fg-subtle)" strokeDasharray="4 4" />
      <path d="M60 60V48m-5 5 5-5 5 5" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const ART: Record<Illustration, () => ReactNode> = { invoices: InvoicesArt, search: SearchArt, inbox: InboxArt, files: FilesArt }

interface EmptyStateProps {
  illustration: Illustration
  title: string
  description: ReactNode
  /** Primary and secondary actions, primary last. */
  action?: ReactNode
  className?: string
}

export function EmptyState({ illustration, title, description, action, className }: EmptyStateProps) {
  const Art = ART[illustration]
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      <Art />
      <h2 className="mt-4 text-base font-semibold text-fg">{title}</h2>
      <p className="mt-1 max-w-sm text-sm text-fg-muted">{description}</p>
      {action !== undefined && <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{action}</div>}
    </div>
  )
}
