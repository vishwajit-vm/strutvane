/**
 * The richer form inputs: CurrencyInput, TagsInput, FileDropZone and RelationSelect (an async,
 * searchable combobox). Each takes the `ControlProps` from <Field> so labels, hints and errors
 * stay wired for screen readers.
 */
import { IconCheck, IconFile, IconLoader2, IconSelector, IconX } from '@tabler/icons-react'
import { Popover as RadixPopover } from 'radix-ui'
import { useEffect, useId, useRef, useState, type DragEvent, type KeyboardEvent } from 'react'
import { UploadArt } from '../../../components/illustrations.tsx'
import { Avatar } from '../../../components/ui/avatar.tsx'
import type { ControlProps } from '../../../components/ui/field.tsx'
import { controlClass, Input } from '../../../components/ui/input.tsx'
import type { Customer } from '../../../data/invoices.ts'
import { cn } from '../../../lib/cn.ts'
import { formatBytes } from '../../../lib/format.ts'

// ── Currency ──────────────────────────────────────────────────────────────

/**
 * Money input: a "$" prefix and currency suffix, decimal keyboard on phones, and a value that is
 * normalised to two decimals when the field loses focus (typing "12." is never interrupted).
 *
 * @example <CurrencyInput {...control} value={price} onValueChange={setPrice} />
 */
export function CurrencyInput({ value, onValueChange, currency = 'USD', className, ...control }: ControlProps & { value: string; onValueChange: (value: string) => void; currency?: string; className?: string }) {
  return (
    <div className={cn('relative', className)}>
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-base text-fg-muted" aria-hidden>
        $
      </span>
      <Input
        {...control}
        inputMode="decimal"
        value={value}
        onChange={(event) => onValueChange(event.target.value.replace(/[^\d.,]/g, ''))}
        onBlur={() => {
          const number = Number(value.replace(/,/g, ''))
          if (value !== '' && Number.isFinite(number)) onValueChange(number.toFixed(2))
        }}
        className="pr-14 pl-7 text-right tabular"
      />
      <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs font-semibold text-fg-muted">{currency}</span>
    </div>
  )
}

// ── Tags ──────────────────────────────────────────────────────────────────

/**
 * Free-form tags: Enter or comma adds, Backspace on an empty input removes the last one,
 * duplicates are ignored. Suggestions show as quick-add buttons.
 */
export function TagsInput({ value, onChange, suggestions = [], ...control }: ControlProps & { value: readonly string[]; onChange: (tags: readonly string[]) => void; suggestions?: readonly string[] }) {
  const [draft, setDraft] = useState('')
  const add = (raw: string): void => {
    const tag = raw.trim().replace(/,$/, '')
    if (tag !== '' && !value.some((existing) => existing.toLowerCase() === tag.toLowerCase())) onChange([...value, tag])
    setDraft('')
  }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault()
      add(draft)
    } else if (event.key === 'Backspace' && draft === '' && value.length > 0) {
      onChange(value.slice(0, -1))
    }
  }
  const unused = suggestions.filter((tag) => !value.includes(tag))
  return (
    <div>
      <div className={cn(controlClass, 'flex min-h-10 flex-wrap items-center gap-1.5 px-2 py-1.5 focus-within:border-ring focus-within:shadow-[0_0_0_4px_var(--primary-soft)]')}>
        {value.map((tag) => (
          <span key={tag} className="inline-flex h-6 items-center gap-1 rounded-full bg-primary-soft pr-1 pl-2.5 text-xs font-semibold text-primary-soft-fg">
            {tag}
            <button type="button" onClick={() => onChange(value.filter((t) => t !== tag))} aria-label={`Remove tag ${tag}`} className="grid size-4.5 place-items-center rounded-full hover:bg-glass-hover">
              <IconX className="size-3" aria-hidden />
            </button>
          </span>
        ))}
        <input
          {...control}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => draft !== '' && add(draft)}
          placeholder={value.length === 0 ? 'Add a tag and press Enter' : ''}
          className="h-7 min-w-24 flex-1 bg-transparent px-1 text-base text-fg outline-none placeholder:text-fg-muted"
        />
      </div>
      {unused.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-fg-muted">Suggested:</span>
          {unused.map((tag) => (
            <button key={tag} type="button" onClick={() => add(tag)} className="h-6 rounded-full border border-dashed border-input px-2 text-xs font-medium text-fg-muted hover:border-control hover:text-primary-text">
              + {tag}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── File drop zone ────────────────────────────────────────────────────────

export interface PickedFile {
  readonly id: string
  readonly name: string
  readonly size: number
  readonly type: string
  /** Object URL for image previews (revoked when removed or unmounted). */
  readonly preview: string | null
}

const ACCEPT = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
const MAX_BYTES = 10 * 1024 * 1024

/**
 * Drag files in or click to browse. Validates type and size BEFORE accepting (fail closed, with a
 * message naming the file), previews images, and cleans up object URLs.
 */
export function FileDropZone({ files, onChange, ...control }: ControlProps & { files: readonly PickedFile[]; onChange: (files: readonly PickedFile[]) => void }) {
  const [dragging, setDragging] = useState(false)
  const [rejected, setRejected] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const filesRef = useRef(files)
  useEffect(() => {
    filesRef.current = files
  }, [files])
  // Revoke every preview URL when the form goes away (no leaked blobs).
  useEffect(() => () => filesRef.current.forEach((file) => file.preview !== null && URL.revokeObjectURL(file.preview)), [])

  const accept = (list: FileList | null): void => {
    if (list === null) return
    const accepted: PickedFile[] = []
    const problems: string[] = []
    for (const file of Array.from(list)) {
      if (!ACCEPT.includes(file.type)) problems.push(`${file.name} isn’t a PDF or image`)
      else if (file.size > MAX_BYTES) problems.push(`${file.name} is over 10 MB`)
      else accepted.push({ id: `${file.name}-${String(file.size)}-${String(file.lastModified)}`, name: file.name, size: file.size, type: file.type, preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : null })
    }
    setRejected(problems.length > 0 ? `${problems.join('; ')}.` : null)
    if (accepted.length > 0) onChange([...files, ...accepted.filter((file) => !files.some((existing) => existing.id === file.id))])
  }
  const removeFile = (file: PickedFile): void => {
    if (file.preview !== null) URL.revokeObjectURL(file.preview)
    onChange(files.filter((candidate) => candidate.id !== file.id))
  }
  const onDrop = (event: DragEvent): void => {
    event.preventDefault()
    setDragging(false)
    accept(event.dataTransfer.files)
  }

  return (
    <div>
      <div
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex flex-col items-center rounded-lg border-2 border-dashed px-6 py-7 text-center transition-base',
          dragging ? 'border-control bg-surface-selected' : 'border-input bg-surface-input hover:border-fg-muted',
        )}
      >
        <UploadArt className="h-12" />
        <p className="mt-3 text-base text-fg">
          <span className="font-semibold">Drop files here</span> or{' '}
          <button type="button" onClick={() => inputRef.current?.click()} className="font-semibold text-primary-text underline-offset-2 hover:underline">
            browse
          </button>
        </p>
        <p className="mt-1 text-xs text-fg-muted">PDF, PNG, JPG or WebP · up to 10 MB each</p>
        <input {...control} ref={inputRef} type="file" multiple accept={ACCEPT.join(',')} className="sr-only" onChange={(event) => accept(event.target.files)} />
      </div>
      {rejected !== null && (
        <p role="alert" className="mt-2 text-xs font-medium text-danger">
          Not added: {rejected}
        </p>
      )}
      {files.length > 0 && (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2" aria-label="Attached files">
          {files.map((file) => (
            <li key={file.id} className="flex items-center gap-3 rounded-md border border-border bg-surface p-2 pr-2.5">
              {file.preview !== null ? (
                <img src={file.preview} alt="" className="size-11 rounded-sm object-cover" />
              ) : (
                <span className="grid size-11 place-items-center rounded-sm bg-danger-soft text-danger" aria-hidden>
                  <IconFile className="size-5" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-fg">{file.name}</p>
                <p className="text-xs text-fg-muted">{formatBytes(file.size)}</p>
              </div>
              <button type="button" onClick={() => removeFile(file)} aria-label={`Remove ${file.name}`} className="grid size-7 place-items-center rounded-sm text-fg-muted hover:bg-danger-soft hover:text-danger">
                <IconX className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// ── Async relation select ─────────────────────────────────────────────────

/**
 * Pick a related record (here: a customer) from a server search. Typing debounces a simulated
 * request (with a spinner), ↑/↓ move, Enter picks, Escape closes. The trigger shows the selection.
 */
export function RelationSelect({
  value,
  onChange,
  search,
  ...control
}: ControlProps & { value: Customer | null; onChange: (customer: Customer | null) => void; search: (term: string) => Promise<readonly Customer[]> }) {
  const [open, setOpen] = useState(false)
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<readonly Customer[]>([])
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(0)
  const listId = useId()

  useEffect(() => {
    if (!open) return undefined
    let cancelled = false
    setLoading(true)
    const timer = window.setTimeout(() => {
      void search(term).then((found) => {
        // Ignore stale responses when the user typed again meanwhile.
        if (cancelled) return
        setResults(found)
        setActive(0)
        setLoading(false)
      })
    }, 180)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [open, term, search])

  const pick = (customer: Customer): void => {
    onChange(customer)
    setOpen(false)
    setTerm('')
  }
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((index) => (index + step + results.length) % Math.max(1, results.length))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const chosen = results[active]
      if (chosen !== undefined) pick(chosen)
    }
  }
  const activeResult = results[active]

  return (
    <RadixPopover.Root open={open} onOpenChange={setOpen}>
      <RadixPopover.Trigger asChild>
        <button type="button" role="combobox" {...control} aria-expanded={open} aria-haspopup="listbox" className={cn(controlClass, 'flex h-10 items-center gap-2.5 px-3 text-left')}>
          {value === null ? (
            <span className="flex-1 text-fg-muted">Search customers…</span>
          ) : (
            <>
              <Avatar name={value.name} shape="square" size="xs" />
              <span className="flex-1 truncate">{value.name}</span>
            </>
          )}
          <IconSelector className="size-4 shrink-0 text-fg-muted" aria-hidden />
        </button>
      </RadixPopover.Trigger>
      <RadixPopover.Portal>
        <RadixPopover.Content
          align="start"
          sideOffset={6}
          className="glass-overlay animate-glass-in z-(--z-dropdown) w-(--radix-popover-trigger-width) min-w-72 overflow-hidden rounded-lg"
        >
          <div className="flex items-center gap-2 border-b border-border px-3">
            <input
              autoFocus
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-autocomplete="list"
              aria-label="Search customers"
              aria-activedescendant={activeResult !== undefined ? `${listId}-${activeResult.id}` : undefined}
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Type a name or city…"
              className="h-11 min-w-0 flex-1 bg-transparent text-base text-fg outline-none placeholder:text-fg-muted"
            />
            {loading && <IconLoader2 className="size-4 animate-spin text-fg-muted" aria-label="Loading" />}
          </div>
          <div id={listId} role="listbox" aria-label="Customers" aria-busy={loading} className="scroll-thin max-h-64 overflow-y-auto p-1.5">
            {!loading && results.length === 0 && <p className="px-3 py-6 text-center text-sm text-fg-muted">No customers match “{term}”.</p>}
            {results.map((customer, index) => {
              const selected = value?.id === customer.id
              return (
                <div
                  key={customer.id}
                  id={`${listId}-${customer.id}`}
                  role="option"
                  aria-selected={selected}
                  onMouseMove={() => setActive(index)}
                  onClick={() => pick(customer)}
                  className={cn('flex cursor-pointer items-center gap-2.5 rounded-sm px-2.5 py-2', index === active && 'bg-primary-soft')}
                >
                  <Avatar name={customer.name} shape="square" size="xs" />
                  <div className="min-w-0 flex-1">
                    <p className={cn('truncate text-base font-medium', index === active ? 'text-primary-soft-fg' : 'text-fg')}>{customer.name}</p>
                    <p className="truncate text-xs text-fg-muted">
                      {customer.city} · {customer.industry}
                    </p>
                  </div>
                  {selected && <IconCheck className="size-4 text-primary-text" aria-hidden />}
                </div>
              )
            })}
          </div>
        </RadixPopover.Content>
      </RadixPopover.Portal>
    </RadixPopover.Root>
  )
}
