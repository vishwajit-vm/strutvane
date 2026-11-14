/**
 * Select: Radix Select with a glass dropdown. Keyboard, typeahead and screen-reader behaviour come
 * from Radix; this file only styles it.
 *
 * @example
 *   <Select value={status} onValueChange={setStatus} options={[{ value: 'paid', label: 'Paid' }]} aria-label="Status" />
 */
import { IconCheck, IconSelector } from '@tabler/icons-react'
import { Select as RadixSelect } from 'radix-ui'
import { cn } from '../../lib/cn.ts'
import { controlClass } from './input.tsx'

export interface SelectOption {
  readonly value: string
  readonly label: string
  readonly description?: string
}

export interface SelectProps {
  readonly value: string
  readonly onValueChange: (value: string) => void
  readonly options: readonly SelectOption[]
  readonly placeholder?: string
  readonly id?: string
  readonly 'aria-label'?: string
  readonly 'aria-describedby'?: string
  readonly 'aria-invalid'?: true
  readonly size?: 'sm' | 'md'
  readonly className?: string
}

export function Select({ value, onValueChange, options, placeholder = 'Select…', size = 'md', className, ...aria }: SelectProps) {
  return (
    <RadixSelect.Root value={value} onValueChange={onValueChange}>
      <RadixSelect.Trigger
        {...aria}
        className={cn(controlClass, 'flex items-center justify-between gap-2 text-left', size === 'sm' ? 'h-8 px-2.5 text-sm' : 'h-10 px-3', className)}
      >
        <RadixSelect.Value placeholder={placeholder} />
        <RadixSelect.Icon className="text-fg-muted">
          <IconSelector className="size-4" aria-hidden />
        </RadixSelect.Icon>
      </RadixSelect.Trigger>
      <RadixSelect.Portal>
        <RadixSelect.Content
          position="popper"
          sideOffset={6}
          className="glass-overlay animate-glass-in z-(--z-dropdown) max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width) overflow-hidden rounded-lg p-1.5"
        >
          <RadixSelect.Viewport>
            {options.map((option) => (
              <RadixSelect.Item
                key={option.value}
                value={option.value}
                className="relative flex cursor-default select-none items-center gap-2 rounded-sm py-2 pr-8 pl-2.5 text-base text-fg outline-none data-highlighted:bg-primary-soft data-highlighted:text-primary-soft-fg"
              >
                <div className="min-w-0">
                  <RadixSelect.ItemText>{option.label}</RadixSelect.ItemText>
                  {option.description !== undefined && <p className="text-xs text-fg-muted">{option.description}</p>}
                </div>
                <RadixSelect.ItemIndicator className="absolute right-2.5">
                  <IconCheck className="size-4" aria-hidden />
                </RadixSelect.ItemIndicator>
              </RadixSelect.Item>
            ))}
          </RadixSelect.Viewport>
        </RadixSelect.Content>
      </RadixSelect.Portal>
    </RadixSelect.Root>
  )
}
