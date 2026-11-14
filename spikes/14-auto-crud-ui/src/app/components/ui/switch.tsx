/**
 * `<Switch>`: an on/off toggle (shadcn look, `role="switch"` semantics).
 *
 * @module
 */
import type { ReactElement } from 'react'
import { cn } from '../../lib/cn.ts'

/**
 * Props of {@link Switch}.
 *
 * @example
 * const props: SwitchProps = { id: 'featured', checked: true, onCheckedChange: setFeatured }
 */
export interface SwitchProps {
  readonly id: string
  readonly checked: boolean
  readonly onCheckedChange: (checked: boolean) => void
  readonly disabled?: boolean
  readonly 'aria-describedby'?: string | undefined
  readonly 'aria-invalid'?: boolean | undefined
}

/**
 * A switch. It is a `<button role="switch">`, so Space and Enter toggle it and screen readers
 * announce on/off; the visible label is wired with `<label htmlFor>`.
 *
 * @example
 * <Switch id="featured" checked={featured} onCheckedChange={setFeatured} />
 */
export function Switch({ id, checked, onCheckedChange, disabled, ...aria }: SwitchProps): ReactElement {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'inline-flex h-6 w-11 shrink-0 items-center rounded-full border-2 border-transparent transition-colors duration-(--duration-fast) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card disabled:opacity-50',
        checked ? 'bg-primary shadow-primary' : 'bg-input',
      )}
      {...aria}
    >
      <span aria-hidden="true" className={cn('size-5 rounded-full bg-card shadow-sm transition-transform duration-(--duration-fast)', checked ? 'translate-x-5' : 'translate-x-0')} />
    </button>
  )
}
