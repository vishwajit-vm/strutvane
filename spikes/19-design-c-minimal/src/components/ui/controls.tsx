/**
 * Choice controls on Radix: `Checkbox`, `Switch`, `Select`, `Segmented` (toggle group) and
 * `RadioCards`. Each one is keyboard operable out of the box (Space, arrows, typeahead) and uses
 * the accent only for the "on" state, so a settings page full of controls stays quiet.
 *
 * @example
 * <Switch id={id} checked={on} onCheckedChange={setOn} />
 * <Select value={currency} onValueChange={setCurrency} options={[{ value: 'EUR', label: 'Euro' }]} />
 */
import { Check, ChevronDown, Minus } from 'lucide-react'
import { Checkbox as CheckboxPrimitive, RadioGroup, Select as SelectPrimitive, Switch as SwitchPrimitive, ToggleGroup } from 'radix-ui'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'
import { controlClasses } from './input.tsx'
import { floatingClasses } from './menu.tsx'

/** A 16 px checkbox; `checked="indeterminate"` shows a dash (used by "select all"). */
export function Checkbox({ className, ...props }: ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        'peer inline-flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-xs border border-input bg-surface shadow-xs',
        'transition-colors duration-100 hover:border-fg-subtle',
        'data-[state=checked]:border-accent data-[state=checked]:bg-accent data-[state=checked]:text-accent-fg',
        'data-[state=indeterminate]:border-accent data-[state=indeterminate]:bg-accent data-[state=indeterminate]:text-accent-fg',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center">
        {props.checked === 'indeterminate' ? <Minus aria-hidden className="size-3" strokeWidth={3} /> : <Check aria-hidden className="size-3" strokeWidth={3} />}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

/** On/off for settings that apply immediately. 32×18 px track, the thumb slides 14 px. */
export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>) {
  return (
    <SwitchPrimitive.Root
      className={cn(
        'inline-flex h-[18px] w-8 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-border-strong p-px',
        'transition-colors duration-150 data-[state=checked]:bg-accent disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-3.5 rounded-full bg-surface shadow-sm transition-transform duration-150 ease-out data-[state=checked]:translate-x-3.5" />
    </SwitchPrimitive.Root>
  )
}

export interface SelectOption {
  value: string
  label: string
  /** Optional secondary text on the right of the option, e.g. a currency symbol. */
  hint?: string
}

interface SelectProps extends Omit<ComponentProps<typeof SelectPrimitive.Root>, 'children'> {
  options: readonly SelectOption[]
  placeholder?: string
  /** Props for the trigger button: `id`, `aria-*` from `Field`, `className`. */
  triggerProps?: ComponentProps<typeof SelectPrimitive.Trigger>
}

/** A styled single select. Use for 3–15 known options; use the relation combobox for server data. */
export function Select({ options, placeholder = 'Select…', triggerProps, ...props }: SelectProps) {
  const { className: triggerClassName, ...restTrigger } = triggerProps ?? {}
  return (
    <SelectPrimitive.Root {...props}>
      <SelectPrimitive.Trigger
        className={cn(controlClasses, 'flex h-control-md cursor-pointer items-center justify-between gap-2 px-2.5 text-left data-[placeholder]:text-fg-subtle', triggerClassName)}
        {...restTrigger}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon>
          <ChevronDown aria-hidden className="size-4 text-fg-subtle" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content position="popper" sideOffset={6} className={cn(floatingClasses, 'max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden p-1')}>
          <SelectPrimitive.Viewport>
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                className="relative flex h-control-md cursor-pointer select-none items-center gap-2 rounded-md pl-7 pr-2 text-sm text-fg outline-none data-[highlighted]:bg-subtle"
              >
                <SelectPrimitive.ItemIndicator className="absolute left-2 flex items-center">
                  <Check aria-hidden className="size-4 text-accent-text" />
                </SelectPrimitive.ItemIndicator>
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                {option.hint !== undefined && <span className="ml-auto text-xs text-fg-subtle">{option.hint}</span>}
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}

interface SegmentedProps<T extends string> {
  value: T
  onValueChange: (value: T) => void
  items: readonly { value: T; label: string; icon?: ReactNode; iconOnly?: boolean }[]
  'aria-label': string
  className?: string
}

/**
 * A segmented control (view switch, date range). Exactly one segment is always on: clicking the
 * active one does nothing instead of leaving the group empty.
 */
export function Segmented<T extends string>({ value, onValueChange, items, className, ...aria }: SegmentedProps<T>) {
  return (
    <ToggleGroup.Root
      type="single"
      value={value}
      onValueChange={(next) => {
        const match = items.find((item) => item.value === next)
        if (match !== undefined) onValueChange(match.value)
      }}
      className={cn('inline-flex h-control-md shrink-0 items-center gap-0.5 rounded-md border border-border bg-subtle p-0.5', className)}
      {...aria}
    >
      {items.map((item) => (
        <ToggleGroup.Item
          key={item.value}
          value={item.value}
          aria-label={item.iconOnly === true ? item.label : undefined}
          className={cn(
            'inline-flex h-full cursor-pointer items-center justify-center gap-1.5 rounded-sm px-2 text-xs font-medium text-fg-muted transition-colors duration-100',
            'hover:text-fg data-[state=on]:bg-surface data-[state=on]:text-fg data-[state=on]:shadow-xs [&_svg]:size-3.5',
          )}
        >
          {item.icon}
          {item.iconOnly === true ? null : item.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  )
}

export interface RadioCardOption {
  value: string
  title: string
  description: string
  icon?: ReactNode
}

interface RadioCardsProps extends Omit<ComponentProps<typeof RadioGroup.Root>, 'children'> {
  options: readonly RadioCardOption[]
}

/** Radio choices with a title and one line of explanation, for decisions that deserve context. */
export function RadioCards({ options, className, ...props }: RadioCardsProps) {
  return (
    <RadioGroup.Root className={cn('grid gap-2 sm:grid-cols-2', className)} {...props}>
      {options.map((option) => (
        <RadioGroup.Item
          key={option.value}
          value={option.value}
          className={cn(
            'group flex cursor-pointer items-start gap-3 rounded-lg border border-border bg-surface p-3 text-left transition-[border-color,background-color,box-shadow] duration-150',
            'hover:border-border-strong data-[state=checked]:border-accent data-[state=checked]:bg-accent-subtle/40 data-[state=checked]:ring-1 data-[state=checked]:ring-accent',
          )}
        >
          {option.icon !== undefined && <span className="mt-0.5 text-fg-subtle group-data-[state=checked]:text-accent-text [&_svg]:size-4">{option.icon}</span>}
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-fg">{option.title}</span>
            <span className="mt-0.5 block text-xs text-fg-muted">{option.description}</span>
          </span>
          <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border border-input bg-surface group-data-[state=checked]:border-accent">
            <RadioGroup.Indicator className="size-2 rounded-full bg-accent" />
          </span>
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  )
}
