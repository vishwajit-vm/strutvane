/**
 * `<Input>` and `<Textarea>`: shadcn text controls. The invalid look comes from `aria-invalid`,
 * so styling and accessibility can never disagree.
 *
 * @module
 */
import type { InputHTMLAttributes, ReactElement, Ref, TextareaHTMLAttributes } from 'react'
import { cn } from '../../lib/cn.ts'

const CONTROL =
  'w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-destructive'

/**
 * Props of {@link Input}.
 *
 * @example
 * const props: InputProps = { id: 'title', value: 'Hello' }
 */
export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  readonly ref?: Ref<HTMLInputElement>
}

/**
 * A single-line input.
 *
 * @example
 * <Input id="title" value={title} onChange={(event) => setTitle(event.target.value)} />
 */
export function Input({ className, ref, ...props }: InputProps): ReactElement {
  return <input ref={ref} className={cn(CONTROL, 'h-9', className)} {...props} />
}

/**
 * Props of {@link Textarea}.
 *
 * @example
 * const props: TextareaProps = { id: 'content', rows: 6 }
 */
export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  readonly ref?: Ref<HTMLTextAreaElement>
}

/**
 * A multi-line input.
 *
 * @example
 * <Textarea id="content" rows={6} />
 */
export function Textarea({ className, ref, ...props }: TextareaProps): ReactElement {
  return <textarea ref={ref} className={cn(CONTROL, 'min-h-24', className)} {...props} />
}
