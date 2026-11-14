/**
 * Small display primitives: Tabs, Tooltip, Skeleton, Kbd, Progress, Separator, VisuallyHidden.
 *
 * @example
 *   <Tabs value={tab} onValueChange={setTab} tabs={[{ value: 'overview', label: 'Overview' }]} aria-label="Invoice sections" />
 *   <Tooltip label="Copy number"><Button size="icon-sm">…</Button></Tooltip>
 *   <Progress value={72} tone="success" label="72% collected" />
 */
import { Tabs as RadixTabs, Tooltip as RadixTooltip } from 'radix-ui'
import type { ComponentProps, ReactElement, ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'

// ── Tabs ─────────────────────────────────────────────────────────────────

export interface TabItem {
  readonly value: string
  readonly label: string
  readonly count?: number
}

export interface TabsProps {
  readonly value: string
  readonly onValueChange: (value: string) => void
  readonly tabs: readonly TabItem[]
  readonly 'aria-label': string
  readonly children?: ReactNode
  readonly className?: string
}

/** Underline-free "pill" tabs on a glass track. Panels are `<TabPanel value>` children. */
export function Tabs({ value, onValueChange, tabs, children, className, ...aria }: TabsProps) {
  return (
    <RadixTabs.Root value={value} onValueChange={onValueChange} className={className}>
      <RadixTabs.List
        {...aria}
        className="scroll-thin glass-card inline-flex max-w-full gap-1 overflow-x-auto rounded-lg p-1"
      >
        {tabs.map((tab) => (
          <RadixTabs.Trigger
            key={tab.value}
            value={tab.value}
            className={cn(
              'inline-flex h-8 shrink-0 items-center gap-2 rounded-sm px-3.5 text-sm font-semibold text-fg-muted transition-base',
              'hover:text-fg data-[state=active]:bg-surface data-[state=active]:text-fg data-[state=active]:shadow-glass',
            )}
          >
            {tab.label}
            {tab.count !== undefined && <span className="rounded-full bg-neutral-soft px-1.5 text-2xs tabular">{tab.count}</span>}
          </RadixTabs.Trigger>
        ))}
      </RadixTabs.List>
      {children}
    </RadixTabs.Root>
  )
}

export function TabPanel({ className, ...props }: ComponentProps<typeof RadixTabs.Content>) {
  return <RadixTabs.Content className={cn('mt-5 outline-none', className)} {...props} />
}

// ── Tooltip ──────────────────────────────────────────────────────────────

/** A short label on hover/focus. Wrap icon-only buttons that already have an aria-label. */
export function Tooltip({ label, children, side = 'top' }: { label: string; children: ReactElement; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <RadixTooltip.Root delayDuration={300}>
      <RadixTooltip.Trigger asChild>{children}</RadixTooltip.Trigger>
      <RadixTooltip.Portal>
        <RadixTooltip.Content side={side} sideOffset={6} className="glass-overlay animate-glass-in z-(--z-toast) rounded-sm px-2.5 py-1.5 text-xs font-medium text-fg">
          {label}
        </RadixTooltip.Content>
      </RadixTooltip.Portal>
    </RadixTooltip.Root>
  )
}

export const TooltipProvider = RadixTooltip.Provider

// ── Skeleton, Kbd, Progress, Separator ───────────────────────────────────

/** A shimmering placeholder block (static under reduced motion). */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-sm', className)} aria-hidden />
}

/** A keyboard key hint, e.g. <Kbd>Ctrl</Kbd><Kbd>K</Kbd>. */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd className={cn('inline-flex h-5 min-w-5 items-center justify-center rounded-xs border border-border bg-surface px-1 font-sans text-2xs font-semibold text-fg-muted', className)}>
      {children}
    </kbd>
  )
}

const PROGRESS_TONES = { primary: 'bg-brand-gradient', success: 'bg-success', warning: 'bg-warning', danger: 'bg-danger' } as const

export interface ProgressProps {
  /** 0–100. */
  readonly value: number
  readonly tone?: keyof typeof PROGRESS_TONES
  /** Accessible name, e.g. "72% collected". */
  readonly label: string
  readonly className?: string
}

export function Progress({ value, tone = 'primary', label, className }: ProgressProps) {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-neutral-soft', className)}
    >
      <div className={cn('h-full rounded-full transition-base', PROGRESS_TONES[tone])} style={{ width: `${clamped}%` }} />
    </div>
  )
}

export function Separator({ className }: { className?: string }) {
  return <hr className={cn('border-0 border-t border-border', className)} />
}

/** Text for screen readers only. */
export function VisuallyHidden({ children }: { children: ReactNode }) {
  return <span className="sr-only">{children}</span>
}
