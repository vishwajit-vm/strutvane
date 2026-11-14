/**
 * `<RelationSelect>`: an async, searchable select for a `belongsTo` field (`author_id` → users),
 * following the ARIA 1.2 combobox pattern.
 *
 * Options come from the related resource's own list endpoint (`?search=&perPage=20`), so the
 * server's search, scope and permissions apply; there is no separate "options" endpoint to keep
 * in sync (design doc §4.6 proposes one later; this works against spike 10 today). The current
 * value's title is fetched by id, so it shows even when it is not on the first page of options.
 *
 * Keyboard: type to search, Down/Up to move, Enter to choose, Escape to close.
 *
 * @module
 */
import { useQuery } from '@tanstack/react-query'
import { IconX } from '@tabler/icons-react'
import { useId, useState, type KeyboardEvent, type ReactElement } from 'react'
import type { ResolvedResourceUi } from '../../../shared/resolve-ui.ts'
import { Input } from '../../components/ui/input.tsx'
import { recordId, recordTitle } from '../../data/queries.ts'
import { cn } from '../../lib/cn.ts'
import { useDebouncedValue } from '../../lib/hooks.ts'
import { useApi } from '../../registry.tsx'

const OPTIONS_PAGE_SIZE = 20
const SEARCH_DEBOUNCE_MS = 250

/**
 * Props of {@link RelationSelect}.
 *
 * @example
 * const props: RelationSelectProps = { id: 'author_id', target: users, value: 1, onChange: setAuthor, clearable: false }
 */
export interface RelationSelectProps {
  readonly id: string
  /** The related resource (`users` for `author_id`). */
  readonly target: ResolvedResourceUi
  readonly value: number | null
  readonly onChange: (value: number | null) => void
  /** Offer "Clear" (for nullable fields and filters). */
  readonly clearable: boolean
  readonly invalid?: boolean
  readonly describedBy?: string | undefined
  /** Accessible name when there is no `<label htmlFor>` (filters use a visible label instead). */
  readonly ariaLabel?: string
}

/**
 * The relation picker.
 *
 * @example
 * <RelationSelect id="author_id" target={users} value={authorId} onChange={setAuthorId} clearable={false} />
 */
export function RelationSelect({ id, target, value, onChange, clearable, invalid = false, describedBy, ariaLabel }: RelationSelectProps): ReactElement {
  const api = useApi()
  const listboxId = useId()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [active, setActive] = useState(0)
  const term = useDebouncedValue(text.trim(), SEARCH_DEBOUNCE_MS)

  const selected = useQuery({
    queryKey: ['record-by-id', target.name, value],
    enabled: value !== null,
    queryFn: () => api.findById(target.metadata, value ?? 0),
  })
  const options = useQuery({
    queryKey: ['options', target.name, term],
    enabled: open,
    queryFn: () => api.list(target.metadata, { page: 1, perPage: OPTIONS_PAGE_SIZE, search: term, sort: target.defaultSort, filters: {}, trashed: 'without' }),
  })
  const rows = options.data?.data ?? []
  const selectedTitle = value === null ? '' : selected.data === undefined ? `#${value}` : recordTitle(target, selected.data)

  const choose = (index: number): void => {
    const row = rows[index]
    const id = row === undefined ? undefined : recordId(target, row)
    if (id === undefined) return
    onChange(id)
    setOpen(false)
    setText('')
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      if (!open) {
        setOpen(true)
        return
      }
      const step = event.key === 'ArrowDown' ? 1 : -1
      setActive((current) => (rows.length === 0 ? 0 : (current + step + rows.length) % rows.length))
    } else if (event.key === 'Enter' && open) {
      // Enter chooses an option instead of submitting the surrounding form.
      event.preventDefault()
      choose(active)
    } else if (event.key === 'Escape' && open) {
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      setText('')
    }
  }

  const activeId = open && rows[active] !== undefined ? `${listboxId}-${active}` : undefined
  return (
    <div className="relative">
      <div className="flex items-center gap-1">
        <Input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={activeId}
          aria-invalid={invalid}
          aria-describedby={describedBy}
          {...(ariaLabel === undefined ? {} : { 'aria-label': ariaLabel })}
          autoComplete="off"
          placeholder={`Search ${target.label.plural.toLowerCase()}…`}
          value={open ? text : selectedTitle}
          // Open on a click, typing or Down arrow, not on focus: focus also arrives from "jump to
          // the first error" after a failed save, and an open list would cover the error text.
          onClick={() => setOpen(true)}
          onBlur={() => {
            setOpen(false)
            setText('')
          }}
          onChange={(event) => {
            setText(event.target.value)
            setActive(0)
            setOpen(true)
          }}
          onKeyDown={onKeyDown}
        />
        {clearable && value !== null && (
          <button type="button" aria-label={`Clear ${target.label.singular.toLowerCase()}`} onClick={() => onChange(null)} className="inline-flex size-8 shrink-0 items-center justify-center rounded-md hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <IconX aria-hidden="true" className="size-4" />
          </button>
        )}
      </div>
      <ul id={listboxId} role="listbox" aria-label={target.label.plural} hidden={!open} className="absolute z-(--z-dropdown) mt-1 max-h-60 w-full overflow-y-auto rounded-lg bg-card p-1 shadow-popover">
        {options.isPending && <li role="presentation" className="px-2 py-1.5 text-sm text-muted-foreground">Loading…</li>}
        {options.isError && <li role="presentation" className="px-2 py-1.5 text-sm text-destructive">Could not load {target.label.plural.toLowerCase()}. Close and try again.</li>}
        {options.isSuccess && rows.length === 0 && <li role="presentation" className="px-2 py-1.5 text-sm text-muted-foreground">No {target.label.plural.toLowerCase()} match “{term}”.</li>}
        {rows.map((row, index) => (
          <li
            key={String(recordId(target, row))}
            id={`${listboxId}-${index}`}
            role="option"
            aria-selected={recordId(target, row) === value}
            // mousedown would blur the input (closing the list) before the click lands.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(index)}
            className={cn('cursor-pointer rounded-md px-3 py-2 text-base', index === active && 'bg-accent text-accent-foreground')}
          >
            {recordTitle(target, row)}
          </li>
        ))}
      </ul>
    </div>
  )
}
