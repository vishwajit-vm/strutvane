/**
 * The richer form widgets: `<RelationSelect>` (async search for a related record), `<TagsInput>`
 * and `<FileDropZone>` (drag and drop with previews).
 *
 * @module
 */
import { IconFile, IconFileTypePdf, IconLoader2, IconPhoto, IconSearch, IconSelector, IconTrash, IconUpload, IconX } from '@tabler/icons-react'
import { Command } from 'cmdk'
import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent, type ReactElement } from 'react'
import type { Customer } from '../data/people.ts'
import { cn } from '../lib/cn.ts'
import { PersonCell } from './data-display.tsx'
import { Button } from './ui/button.tsx'
import { controlClasses } from './ui/input.tsx'
import { Popover, PopoverContent, PopoverTrigger } from './ui/menu.tsx'
import { Avatar } from './ui/misc.tsx'

/** Props of {@link RelationSelect}. */
export interface RelationSelectProps {
  readonly id: string
  readonly value: Customer | null
  readonly onChange: (value: Customer | null) => void
  /** Async search; called (debounced) as the user types. */
  readonly search: (term: string) => Promise<readonly Customer[]>
  readonly placeholder?: string
  readonly 'aria-invalid'?: true
  readonly 'aria-describedby'?: string
}

/**
 * Pick a related record by searching the server. Shows a spinner while loading, "no results"
 * with the search term, and the chosen record as an avatar cell with a clear button.
 *
 * Failure handled: a slow earlier response can never overwrite a newer one (request counter).
 *
 * @example
 * <RelationSelect id="customer" value={customer} onChange={setCustomer} search={searchCustomers} />
 */
export function RelationSelect({ id, value, onChange, search, placeholder = 'Search…', ...aria }: RelationSelectProps): ReactElement {
  const [open, setOpen] = useState(false)
  const [term, setTerm] = useState('')
  const [results, setResults] = useState<readonly Customer[]>([])
  const [loading, setLoading] = useState(false)
  const request = useRef(0)

  useEffect(() => {
    if (!open) return
    const ticket = ++request.current
    setLoading(true)
    const timer = setTimeout(() => {
      void search(term).then((found) => {
        if (ticket !== request.current) return
        setResults(found)
        setLoading(false)
      })
    }, 200)
    return () => clearTimeout(timer)
  }, [term, open, search])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="relative">
        <PopoverTrigger asChild>
          <button id={id} type="button" aria-haspopup="dialog" {...aria} className={cn(controlClasses, 'flex h-11 cursor-pointer items-center gap-2 px-3 text-left', value !== null && 'pr-16')}>
            {value === null ? (
              <span className="flex-1 truncate text-muted-foreground">{placeholder}</span>
            ) : (
              <span className="min-w-0 flex-1">
                <PersonCell name={value.name} secondary={value.email} tone={value.tone} size="sm" />
              </span>
            )}
            <IconSelector aria-hidden className="ml-auto size-4 shrink-0 text-muted-foreground" />
          </button>
        </PopoverTrigger>
        {value === null ? null : (
          <Button variant="ghost" size="icon-sm" onClick={() => onChange(null)} aria-label={`Clear ${value.name}`} className="absolute right-8 top-1.5 size-8 text-muted-foreground">
            <IconX />
          </Button>
        )}
      </div>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0">
        <Command shouldFilter={false} label="Search customers">
          <div className="flex items-center gap-2 border-b border-border px-3">
            <IconSearch aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            <Command.Input value={term} onValueChange={setTerm} placeholder="Type a name, contact or email" className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
            {loading ? <IconLoader2 aria-label="Loading" className="size-4 shrink-0 animate-spin text-muted-foreground" /> : null}
          </div>
          <Command.List className="scrollbar-thin max-h-72 overflow-y-auto p-1.5">
            {!loading && results.length === 0 ? <Command.Empty className="px-3 py-6 text-center text-sm text-muted-foreground">No customers match “{term}”.</Command.Empty> : null}
            {results.map((customer) => (
              <Command.Item
                key={customer.id}
                value={customer.id}
                onSelect={() => {
                  onChange(customer)
                  setOpen(false)
                }}
                className="flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 outline-none data-[selected=true]:bg-subtle"
              >
                <Avatar name={customer.name} tone={customer.tone} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{customer.name}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {customer.contact} · {customer.country}
                  </span>
                </span>
              </Command.Item>
            ))}
          </Command.List>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/**
 * Free-form tags: Enter or comma adds, Backspace on an empty input removes the last, duplicates
 * are ignored, and each chip has its own remove button.
 *
 * @example
 * <TagsInput id="tags" value={tags} onChange={setTags} suggestions={['Q4', 'Renewal']} />
 */
export function TagsInput({ id, value, onChange, suggestions = [], max = 8 }: { readonly id: string; readonly value: readonly string[]; readonly onChange: (tags: readonly string[]) => void; readonly suggestions?: readonly string[]; readonly max?: number }): ReactElement {
  const [draft, setDraft] = useState('')
  const add = (raw: string): void => {
    const tag = raw.trim().replace(/,$/, '')
    if (tag === '' || value.length >= max || value.some((item) => item.toLowerCase() === tag.toLowerCase())) return
    onChange([...value, tag])
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
    <div className="flex flex-col gap-2">
      <div className={cn(controlClasses, 'flex min-h-9.5 flex-wrap items-center gap-1.5 px-2 py-1.5 focus-within:border-primary focus-within:ring-3 focus-within:ring-ring/25')}>
        {value.map((tag) => (
          <span key={tag} className="inline-flex h-6.5 items-center gap-1 rounded-sm bg-primary-soft pl-2 pr-0.5 text-xs font-semibold text-primary-soft-foreground">
            {tag}
            <button type="button" onClick={() => onChange(value.filter((item) => item !== tag))} aria-label={`Remove tag ${tag}`} className="grid size-5 cursor-pointer place-items-center rounded-sm hover:bg-primary/15">
              <IconX aria-hidden className="size-3" />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => add(draft)}
          placeholder={value.length === 0 ? 'Add a tag and press Enter' : ''}
          aria-describedby={`${id}-hint`}
          className="h-6.5 min-w-28 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      {unused.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          Suggested:
          {unused.map((tag) => (
            <button key={tag} type="button" onClick={() => add(tag)} className="cursor-pointer rounded-sm border border-dashed border-border px-1.5 py-0.5 font-medium text-foreground hover:border-primary hover:text-primary-soft-foreground">
              + {tag}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

interface PickedFile {
  readonly id: string
  readonly name: string
  readonly size: number
  readonly type: string
  /** Object URL for image previews (revoked on removal and unmount). */
  readonly preview: string | null
}

const formatSize = (bytes: number): string => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`)

/**
 * Drag-and-drop (or click to browse) file picker with image thumbnails, type icons, sizes and a
 * remove button. Rejects files over `maxBytes` with a visible message instead of silently.
 *
 * @example
 * <FileDropZone id="files" accept="image/*,.pdf" maxBytes={10 * 1024 * 1024} />
 */
export function FileDropZone({ id, accept, maxBytes, initial = [] }: { readonly id: string; readonly accept: string; readonly maxBytes: number; readonly initial?: readonly { readonly name: string; readonly size: number; readonly type: string }[] }): ReactElement {
  const [files, setFiles] = useState<readonly PickedFile[]>(() => initial.map((file, index) => ({ ...file, id: `initial-${index}`, preview: null })))
  const [dragging, setDragging] = useState(false)
  const [rejected, setRejected] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const urls = useRef<string[]>([])

  // Object URLs hold the file in memory until revoked: free them all when the form unmounts.
  useEffect(() => () => urls.current.forEach((url) => URL.revokeObjectURL(url)), [])

  const addFiles = (list: FileList | null): void => {
    if (list === null) return
    const accepted: PickedFile[] = []
    const tooBig: string[] = []
    for (const file of Array.from(list)) {
      if (file.size > maxBytes) {
        tooBig.push(file.name)
        continue
      }
      const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : null
      if (preview !== null) urls.current.push(preview)
      accepted.push({ id: `${file.name}-${file.size}-${file.lastModified}`, name: file.name, size: file.size, type: file.type, preview })
    }
    setRejected(tooBig.length === 0 ? null : `${tooBig.join(', ')} ${tooBig.length === 1 ? 'is' : 'are'} larger than ${formatSize(maxBytes)}.`)
    setFiles((current) => [...current, ...accepted.filter((file) => !current.some((existing) => existing.id === file.id))])
  }

  const remove = (file: PickedFile): void => {
    if (file.preview !== null) URL.revokeObjectURL(file.preview)
    setFiles((current) => current.filter((item) => item.id !== file.id))
  }

  const onDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    setDragging(false)
    addFiles(event.dataTransfer.files)
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-9 text-center transition-colors',
          dragging ? 'border-primary bg-primary-soft/50' : 'border-border bg-muted/40 hover:border-muted-foreground',
        )}
      >
        <span aria-hidden className="grid size-12 place-items-center rounded-full bg-card text-primary-soft-foreground shadow-sm ring-1 ring-border">
          <IconUpload className="size-5.5" />
        </span>
        <div>
          <p className="text-sm font-semibold text-foreground">Drop files here, or browse</p>
          <p className="mt-0.5 text-xs text-muted-foreground">PDF, PNG or JPG, up to {formatSize(maxBytes)} each</p>
        </div>
        <Button variant="soft" size="sm" onClick={() => input.current?.click()}>
          Browse files
        </Button>
        <input ref={input} id={id} type="file" multiple accept={accept} aria-label="Attach files" className="sr-only" tabIndex={-1} onChange={(event) => addFiles(event.target.files)} />
      </div>
      {rejected === null ? null : (
        <p role="alert" className="text-xs font-medium text-danger">
          {rejected}
        </p>
      )}
      {files.length === 0 ? null : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {files.map((file) => {
            const TypeIcon = file.type === 'application/pdf' ? IconFileTypePdf : file.type.startsWith('image/') ? IconPhoto : IconFile
            return (
              <li key={file.id} className="flex items-center gap-3 rounded-lg border border-border bg-card p-2.5 shadow-xs">
                {file.preview === null ? (
                  <span aria-hidden className={cn('grid size-11 shrink-0 place-items-center rounded-md', file.type === 'application/pdf' ? 'bg-danger-soft text-danger' : 'bg-info-soft text-info')}>
                    <TypeIcon className="size-5.5" />
                  </span>
                ) : (
                  <img src={file.preview} alt="" className="size-11 shrink-0 rounded-md object-cover" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{formatSize(file.size)} · Uploaded</p>
                </div>
                <Button variant="ghost" size="icon-sm" onClick={() => remove(file)} aria-label={`Remove ${file.name}`} className="text-muted-foreground hover:text-danger">
                  <IconTrash />
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
