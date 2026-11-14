/**
 * `<Checkbox>` (Radix) and `<Switch>` (Radix): the two boolean controls.
 *
 * Use a checkbox inside lists and tables (selection, preference matrices) and a switch for a
 * setting that takes effect on its own ("Send reminders automatically").
 *
 * @example
 * <Checkbox checked={selected} onCheckedChange={(value) => setSelected(value === true)} aria-label="Select INV-1042" />
 * <Switch id="reminders" checked={on} onCheckedChange={setOn} />
 */
import { IconCheck, IconMinus } from '@tabler/icons-react'
import { Checkbox as CheckboxPrimitive, Switch as SwitchPrimitive } from 'radix-ui'
import type { ComponentProps, ReactElement } from 'react'
import { cn } from '../../lib/cn.ts'

export function Checkbox({ className, ...props }: ComponentProps<typeof CheckboxPrimitive.Root>): ReactElement {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'peer grid size-4.5 shrink-0 cursor-pointer place-items-center rounded-[0.3rem] border border-input bg-card shadow-xs outline-none transition-colors',
        'hover:border-primary focus-visible:ring-3 focus-visible:ring-ring/25',
        'data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
        'data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="group grid place-items-center">
        <IconCheck aria-hidden stroke={3} className="size-3.5 group-data-[state=indeterminate]:hidden" />
        <IconMinus aria-hidden stroke={3} className="hidden size-3.5 group-data-[state=indeterminate]:block" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export function Switch({ className, ...props }: ComponentProps<typeof SwitchPrimitive.Root>): ReactElement {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn(
        'inline-flex h-5.5 w-10 shrink-0 cursor-pointer items-center rounded-full border border-transparent p-0.5 outline-none transition-colors',
        'bg-input data-[state=checked]:bg-primary focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb className="block size-4.5 rounded-full bg-card shadow-sm transition-transform duration-150 data-[state=checked]:translate-x-4.5" />
    </SwitchPrimitive.Root>
  )
}
