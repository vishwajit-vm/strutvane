/**
 * Specialised form inputs: `CurrencyInput` and `TagsInput`.
 *
 * Both are thin layers over a native `<input>`, so browser autofill, IME composition and screen
 * readers keep working; the extra behaviour is formatting and chip handling only.
 */
import { X } from 'lucide-react'
import { type KeyboardEvent, useId, useState } from 'react'
import { cn } from '../../lib/cn.ts'
import { type Currency, currencySymbol } from '../../lib/format.ts'
import type { FieldControlProps } from '../ui/field.tsx'
import { controlClasses } from '../ui/input.tsx'

interface CurrencyInputProps {
  /** The raw text the user typed, e.g. `18420.00`; parsing happens on submit, not per keystroke. */
  value: string
  onChange: (value: string) => void
  currency: Currency
  control: FieldControlProps
}

/**
 * Money input: symbol prefix, ISO code suffix, right-aligned monospace digits, and a decimal
 * keypad on phones. On blur the value is normalised to two decimals (`1842` → `1,842.00`) without
 * ever fighting the cursor while typing (the decimal point survives `12.`).
 *
 * @example <CurrencyInput value={amount} onChange={setAmount} currency="EUR" control={control} />
 */
export function CurrencyInput({ value, onChange, currency, control }: CurrencyInputProps) {
  const normalise = () => {
    const number = Number(value.replace(/,/g, ''))
    if (value.trim() === '' || !Number.isFinite(number)) return
    onChange(number.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
  }
  return (
    <div className="relative flex items-center">
      <span aria-hidden className="pointer-events-none absolute left-2.5 text-sm text-fg-subtle">
        {currencySymbol(currency)}
      </span>
      <input
        {...control}
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/[^\d.,]/g, ''))}
        onBlur={normalise}
        className={cn(controlClasses, 'num h-control-md pl-7 pr-12 text-right')}
      />
      <span aria-hidden className="pointer-events-none absolute right-2.5 text-xs font-medium text-fg-subtle">
        {currency}
      </span>
    </div>
  )
}

interface TagsInputProps {
  value: readonly string[]
  onChange: (tags: string[]) => void
  suggestions: readonly string[]
  control: FieldControlProps
  max?: number
}

/**
 * Tags: type and press Enter or comma to add; Backspace on an empty input removes the last tag.
 * Suggestions are offered through a native `<datalist>`, so the list is keyboard and screen-reader
 * accessible for free. Duplicates (case-insensitive) are ignored rather than rejected loudly.
 *
 * @example <TagsInput value={tags} onChange={setTags} suggestions={TAGS} control={control} />
 */
export function TagsInput({ value, onChange, suggestions, control, max = 6 }: TagsInputProps) {
  const [draft, setDraft] = useState('')
  const listId = useId()
  const full = value.length >= max

  const add = (raw: string) => {
    const tag = raw.trim().replace(/,$/, '')
    if (tag === '' || full || value.some((existing) => existing.toLowerCase() === tag.toLowerCase())) return setDraft('')
    onChange([...value, tag])
    setDraft('')
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      add(draft)
    } else if (event.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }

  return (
    <div
      className={cn(
        controlClasses,
        'flex min-h-control-md flex-wrap items-center gap-1 px-1.5 py-1 focus-within:border-accent focus-within:ring-3 focus-within:ring-ring/20',
      )}
    >
      {value.map((tag) => (
        <span key={tag} className="inline-flex h-6 items-center gap-1 rounded-sm border border-border bg-subtle pl-2 pr-0.5 text-xs font-medium text-fg">
          {tag}
          <button
            type="button"
            aria-label={`Remove ${tag}`}
            onClick={() => onChange(value.filter((existing) => existing !== tag))}
            className="inline-flex size-5 cursor-pointer items-center justify-center rounded-xs text-fg-subtle hover:bg-muted hover:text-fg"
          >
            <X aria-hidden className="size-3" />
          </button>
        </span>
      ))}
      <input
        {...control}
        list={listId}
        value={draft}
        disabled={full}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => add(draft)}
        placeholder={full ? `Up to ${max} tags` : value.length === 0 ? 'Add a tag…' : ''}
        className="h-6 min-w-24 flex-1 bg-transparent px-1 text-sm text-fg outline-none placeholder:text-fg-subtle"
      />
      <datalist id={listId}>
        {suggestions
          .filter((suggestion) => !value.includes(suggestion))
          .map((suggestion) => (
            <option key={suggestion} value={suggestion} />
          ))}
      </datalist>
    </div>
  )
}
