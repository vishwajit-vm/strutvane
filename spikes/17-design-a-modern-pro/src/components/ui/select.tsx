/**
 * `<Select>`: a styled Radix Select (keyboard, typeahead, screen-reader semantics included) whose
 * trigger looks exactly like `<Input>`.
 *
 * @example
 * <Select value={currency} onValueChange={setCurrency} id="currency" options={[{ value: 'USD', label: 'US dollar' }]} />
 */
import { IconCheck, IconChevronDown } from '@tabler/icons-react'
import { Select as SelectPrimitive } from 'radix-ui'
import type { ReactElement, ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'
import { controlClasses } from './input.tsx'

/** One choice. `hint` is shown muted on the right (e.g. a currency code). */
export interface SelectOption {
  readonly value: string
  readonly label: string
  readonly hint?: string
  readonly icon?: ReactNode
}

/** Props of {@link Select}. */
export interface SelectProps {
  readonly id?: string
  readonly value: string
  readonly onValueChange: (value: string) => void
  readonly options: readonly SelectOption[]
  readonly placeholder?: string
  readonly className?: string
  readonly size?: 'sm' | 'md'
  /** Accessible name when no `<label htmlFor>` points at the trigger. */
  readonly 'aria-label'?: string
  readonly 'aria-invalid'?: true
  readonly 'aria-describedby'?: string
}

export function Select({ id, value, onValueChange, options, placeholder, className, size = 'md', ...aria }: SelectProps): ReactElement {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange}>
      <SelectPrimitive.Trigger
        id={id}
        {...aria}
        className={cn(
          controlClasses,
          'flex cursor-pointer items-center justify-between gap-2 px-3 text-left data-placeholder:text-muted-foreground',
          size === 'md' ? 'h-9.5' : 'h-8 text-label',
          className,
        )}
      >
        <SelectPrimitive.Value {...(placeholder === undefined ? {} : { placeholder })} />
        <SelectPrimitive.Icon>
          <IconChevronDown aria-hidden className="size-4 text-muted-foreground" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          className="z-50 max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width) overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-lg animate-pop-in"
        >
          <SelectPrimitive.Viewport className="p-1.5">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                className="relative flex cursor-pointer select-none items-center gap-2.5 rounded-md py-2 pl-2.5 pr-8 text-sm outline-none data-highlighted:bg-subtle data-[state=checked]:font-semibold data-[state=checked]:text-primary-soft-foreground"
              >
                {option.icon}
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                {option.hint === undefined ? null : <span className="ml-auto text-xs text-muted-foreground">{option.hint}</span>}
                <SelectPrimitive.ItemIndicator className="absolute right-2.5">
                  <IconCheck aria-hidden className="size-4" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}
