/**
 * `<NativeSelect>`: a styled native `<select>`.
 *
 * Why native and not a custom listbox: for short, fixed lists (enums, page sizes, Yes/No) the
 * native control is already accessible, keyboard friendly and works well on phones.
 *
 * @module
 */
import type { ReactElement, Ref, SelectHTMLAttributes } from 'react'
import { cn } from '../../lib/cn.ts'

/**
 * Props of {@link NativeSelect}.
 *
 * @example
 * const props: NativeSelectProps = { id: 'status', value: 'draft' }
 */
export interface NativeSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  readonly ref?: Ref<HTMLSelectElement>
}

/**
 * A native select with the app's look.
 *
 * @example
 * <NativeSelect id="status" value={status} onChange={(event) => setStatus(event.target.value)}>
 *   <option value="draft">Draft</option>
 * </NativeSelect>
 */
export function NativeSelect({ className, ref, ...props }: NativeSelectProps): ReactElement {
  return (
    <select
      ref={ref}
      className={cn(
        'h-10 w-full rounded-md border border-input bg-card px-3 text-base focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 aria-[invalid=true]:border-destructive',
        className,
      )}
      {...props}
    />
  )
}
