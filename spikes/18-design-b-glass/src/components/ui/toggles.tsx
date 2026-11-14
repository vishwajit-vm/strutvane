/**
 * Boolean and choice controls on Radix: Checkbox, Switch and RadioCards.
 *
 * Checked fills use the `control` token (3:1 against every surface, both themes), and the check
 * mark uses `control-foreground` (4.5:1 on the fill).
 *
 * @example
 *   <Checkbox checked={selected} onCheckedChange={toggle} aria-label="Select INV-2026-1042" />
 *   <Switch id="reminders" checked={on} onCheckedChange={setOn} />
 *   <RadioCards value={terms} onValueChange={setTerms} options={[{ value: '30', label: 'Net 30', description: 'Due in 30 days' }]} />
 */
import { IconCheck, IconMinus } from '@tabler/icons-react'
import { Checkbox as RadixCheckbox, RadioGroup, Switch as RadixSwitch } from 'radix-ui'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'

export interface CheckboxProps {
  readonly checked: boolean | 'indeterminate'
  readonly onCheckedChange: (checked: boolean) => void
  readonly id?: string
  readonly 'aria-label'?: string
  readonly className?: string
}

export function Checkbox({ checked, onCheckedChange, className, ...rest }: CheckboxProps) {
  return (
    <RadixCheckbox.Root
      checked={checked}
      onCheckedChange={(value) => onCheckedChange(value === true)}
      className={cn(
        'grid size-[1.125rem] shrink-0 place-items-center rounded-xs border border-input bg-surface-input transition-fast',
        'data-[state=checked]:border-control data-[state=checked]:bg-control data-[state=indeterminate]:border-control data-[state=indeterminate]:bg-control',
        'text-control-fg hover:border-fg-muted',
        className,
      )}
      {...rest}
    >
      <RadixCheckbox.Indicator>
        {checked === 'indeterminate' ? <IconMinus className="size-3.5" stroke={3} aria-hidden /> : <IconCheck className="size-3.5" stroke={3} aria-hidden />}
      </RadixCheckbox.Indicator>
    </RadixCheckbox.Root>
  )
}

export interface SwitchProps {
  readonly checked: boolean
  readonly onCheckedChange: (checked: boolean) => void
  readonly id?: string
  readonly disabled?: boolean
  readonly 'aria-label'?: string
  readonly 'aria-describedby'?: string
}

export function Switch({ checked, onCheckedChange, ...rest }: SwitchProps) {
  return (
    <RadixSwitch.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-input bg-neutral-soft transition-base data-[state=checked]:border-control data-[state=checked]:bg-control disabled:opacity-60"
      {...rest}
    >
      <RadixSwitch.Thumb className="block size-[1.125rem] translate-x-0.5 rounded-full bg-surface shadow-glass transition-base data-[state=checked]:translate-x-[1.3rem]" />
    </RadixSwitch.Root>
  )
}

export interface RadioCardOption {
  readonly value: string
  readonly label: string
  readonly description?: string
  readonly icon?: ReactNode
}

export interface RadioCardsProps {
  readonly value: string
  readonly onValueChange: (value: string) => void
  readonly options: readonly RadioCardOption[]
  readonly 'aria-label'?: string
  readonly 'aria-labelledby'?: string
  readonly className?: string
}

/** Radio buttons drawn as selectable cards: better for 2–4 meaningful choices than a select. */
export function RadioCards({ value, onValueChange, options, className, ...aria }: RadioCardsProps) {
  return (
    <RadioGroup.Root value={value} onValueChange={onValueChange} className={cn('grid gap-3 sm:grid-cols-3', className)} {...aria}>
      {options.map((option) => (
        <RadioGroup.Item
          key={option.value}
          value={option.value}
          className={cn(
            'group flex items-start gap-3 rounded-lg border border-input bg-surface-input p-3.5 text-left transition-base',
            'hover:border-fg-muted data-[state=checked]:border-control data-[state=checked]:bg-surface-selected data-[state=checked]:shadow-[0_0_0_3px_var(--primary-soft)]',
          )}
        >
          {option.icon !== undefined && (
            <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary-soft text-primary-soft-fg [&_svg]:size-[1.1rem]" aria-hidden>
              {option.icon}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block text-base font-semibold text-fg">{option.label}</span>
            {option.description !== undefined && <span className="mt-0.5 block text-xs text-fg-muted">{option.description}</span>}
          </span>
          <span className="mt-0.5 grid size-[1.125rem] shrink-0 place-items-center rounded-full border border-input group-data-[state=checked]:border-control" aria-hidden>
            <RadioGroup.Indicator className="size-2.5 rounded-full bg-control" />
          </span>
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  )
}
