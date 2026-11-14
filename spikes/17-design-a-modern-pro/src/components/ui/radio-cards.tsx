/**
 * `<RadioCards>`: a radio group shown as selectable cards (Radix RadioGroup: arrow keys move,
 * one tab stop). Better than a select when there are 2–4 choices that each need a sentence.
 *
 * @example
 * <RadioCards aria-label="Payment terms" value={terms} onValueChange={setTerms}
 *   options={[{ value: 'net30', title: 'Net 30', description: 'Due 30 days after issue' }]} />
 */
import { RadioGroup } from 'radix-ui'
import type { ReactElement, ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'

export interface RadioCardOption {
  readonly value: string
  readonly title: string
  readonly description: string
  readonly icon?: ReactNode
}

/** Props of {@link RadioCards}. */
export interface RadioCardsProps {
  readonly value: string
  readonly onValueChange: (value: string) => void
  readonly options: readonly RadioCardOption[]
  readonly className?: string
  readonly 'aria-label'?: string
  readonly 'aria-labelledby'?: string
}

export function RadioCards({ value, onValueChange, options, className, ...aria }: RadioCardsProps): ReactElement {
  return (
    <RadioGroup.Root value={value} onValueChange={onValueChange} className={cn('grid gap-3 sm:grid-cols-3', className)} {...aria}>
      {options.map((option) => (
        <RadioGroup.Item
          key={option.value}
          value={option.value}
          className={cn(
            'group relative flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-card p-4 text-left outline-none transition-[border-color,box-shadow,background-color]',
            'hover:border-muted-foreground focus-visible:ring-3 focus-visible:ring-ring/25',
            'data-[state=checked]:border-primary data-[state=checked]:bg-primary-soft/40 data-[state=checked]:shadow-xs',
          )}
        >
          {option.icon === undefined ? null : (
            <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-md bg-secondary text-secondary-foreground group-data-[state=checked]:bg-primary group-data-[state=checked]:text-primary-foreground [&_svg]:size-4.5">
              {option.icon}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold text-foreground">{option.title}</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">{option.description}</span>
          </span>
          <span aria-hidden className="mt-0.5 grid size-4.5 shrink-0 place-items-center rounded-full border border-input group-data-[state=checked]:border-primary">
            <RadioGroup.Indicator className="size-2.5 rounded-full bg-primary" />
          </span>
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  )
}
