/**
 * Settings-style sections, shared by the invoice form and every settings page.
 *
 * `Section`: title and a one-line "why" on the left, content on the right, hairline between
 * sections. `SwitchRow`: a labelled on/off setting with its explanation.
 *
 * @example
 * <Section title="Profile" description="How you appear to teammates.">…fields…</Section>
 */
import type { ReactNode } from 'react'
import { cn } from '../lib/cn.ts'
import { Switch } from './ui/controls.tsx'

export function Section({ title, description, children, className }: { title: string; description: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('grid grid-cols-1 gap-x-10 gap-y-4 border-b border-border py-8 first:pt-2 last:border-b-0 md:grid-cols-[minmax(0,260px)_minmax(0,1fr)]', className)}>
      <div>
        <h2 className="text-sm font-semibold text-fg">{title}</h2>
        <p className="mt-1 text-sm text-fg-muted">{description}</p>
      </div>
      <div className="flex min-w-0 flex-col gap-5">{children}</div>
    </section>
  )
}

interface SwitchRowProps {
  id: string
  title: string
  description: string
  checked: boolean
  onChange: (value: boolean) => void
  disabled?: boolean
}

export function SwitchRow({ id, title, description, checked, onChange, disabled = false }: SwitchRowProps) {
  return (
    <div className="flex items-start justify-between gap-6">
      <div>
        <label htmlFor={id} className="text-sm font-medium text-fg">
          {title}
        </label>
        <p id={`${id}-description`} className="mt-0.5 text-sm text-fg-muted">
          {description}
        </p>
      </div>
      <Switch id={id} aria-describedby={`${id}-description`} checked={checked} onCheckedChange={onChange} disabled={disabled} className="mt-0.5" />
    </div>
  )
}
