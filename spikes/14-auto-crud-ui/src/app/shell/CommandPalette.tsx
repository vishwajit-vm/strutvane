/**
 * `<CommandPalette>`: Ctrl/Cmd+K global search over screens and records (design doc §4.9, §5).
 *
 * Spike 10 has no `/search` endpoint, so records are found with each resource's own list search
 * (`?search=term&perPage=5`), in parallel, only for resources the user may list. The server's
 * search and scope rules therefore apply unchanged. A real `/search` endpoint can replace the
 * fan-out without changing this component's behaviour.
 *
 * Keyboard: type to search, Up/Down to move, Enter to open, Escape to close (focus returns to the
 * search button).
 *
 * @module
 */
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { useId, useMemo, useState, type KeyboardEvent, type ReactElement } from 'react'
import type { ResolvedResourceUi } from '../../shared/resolve-ui.ts'
import { useSession } from '../auth/session.tsx'
import { Dialog } from '../components/ui/dialog.tsx'
import { recordRouteKey, recordTitle } from '../data/queries.ts'
import { ResourceIcon } from '../icons.tsx'
import { cn } from '../lib/cn.ts'
import { useDebouncedValue } from '../lib/hooks.ts'
import { useApi, useRegistry } from '../registry.tsx'

/** Wait this long after the last key before searching records. */
const SEARCH_DEBOUNCE_MS = 250
/** Records are searched from this many characters; one letter matches almost everything. */
const MIN_RECORD_SEARCH = 2
const RESULTS_PER_RESOURCE = 5
/** Bound the fan-out: at most this many resources are searched per keystroke. */
const MAX_SEARCHED_RESOURCES = 10

/** One selectable result: a screen, or a record. */
interface PaletteOption {
  readonly id: string
  readonly label: string
  readonly hint: string
  readonly resource: ResolvedResourceUi
  /** `undefined` for "open the list screen". */
  readonly recordKey: string | undefined
}

/**
 * Props of {@link CommandPalette}.
 *
 * @example
 * const props: CommandPaletteProps = { open: true, onClose: () => setOpen(false) }
 */
export interface CommandPaletteProps {
  readonly open: boolean
  readonly onClose: () => void
}

/**
 * The global search dialog.
 *
 * @example
 * <CommandPalette open={open} onClose={() => setOpen(false)} />
 */
export function CommandPalette({ open, onClose }: CommandPaletteProps): ReactElement | null {
  const titleId = useId()
  return (
    <Dialog open={open} onClose={onClose} labelledBy={titleId} className="p-0">
      <h2 id={titleId} className="sr-only">
        Search
      </h2>
      <PaletteBody onClose={onClose} />
    </Dialog>
  )
}

function PaletteBody({ onClose }: { readonly onClose: () => void }): ReactElement {
  const navigate = useNavigate()
  const listboxId = useId()
  const [text, setText] = useState('')
  const [active, setActive] = useState(0)
  const options = usePaletteOptions(text)

  const choose = (option: PaletteOption | undefined): void => {
    if (option === undefined) return
    onClose()
    const resource = option.resource.metadata.route
    if (option.recordKey === undefined) void navigate({ to: '/$resource', params: { resource } })
    else void navigate({ to: '/$resource/$key', params: { resource, key: option.recordKey } })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      // Wrap around, so the last option is one key away from the first.
      setActive((current) => (options.length === 0 ? 0 : (current + step + options.length) % options.length))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      choose(options[active])
    }
  }

  const activeOption = options[active]
  return (
    <div>
      <input
        role="combobox"
        aria-expanded="true"
        aria-controls={listboxId}
        aria-autocomplete="list"
        aria-activedescendant={activeOption?.id}
        aria-label="Search screens and records"
        placeholder="Search screens and records…"
        className="h-12 w-full border-b bg-transparent px-4 text-sm outline-none"
        value={text}
        onChange={(event) => {
          setText(event.target.value)
          setActive(0)
        }}
        onKeyDown={onKeyDown}
      />
      <ul id={listboxId} role="listbox" aria-label="Results" className="max-h-80 overflow-y-auto p-2">
        {options.length === 0 && (
          <li role="presentation" className="px-2 py-6 text-center text-sm text-muted-foreground">
            {text.trim().length < MIN_RECORD_SEARCH ? 'Type to search screens and records.' : `Nothing matches "${text.trim()}".`}
          </li>
        )}
        {options.map((option, index) => (
          <li
            key={option.id}
            id={option.id}
            role="option"
            aria-selected={index === active}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => choose(option)}
            onMouseMove={() => setActive(index)}
            className={cn('flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm', index === active && 'bg-accent text-accent-foreground')}
          >
            <ResourceIcon name={option.resource.navigation.icon} />
            <span className="flex-1 truncate">{option.label}</span>
            <span className="text-xs text-muted-foreground">{option.hint}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Screens matching the text, then records from every listable resource. */
function usePaletteOptions(text: string): PaletteOption[] {
  const api = useApi()
  const { resources } = useRegistry()
  const { can } = useSession()
  const term = useDebouncedValue(text.trim(), SEARCH_DEBOUNCE_MS)
  const searchable = useMemo(() => resources.filter((resource) => can('viewAny', resource.name)).slice(0, MAX_SEARCHED_RESOURCES), [resources, can])

  const records = useQuery({
    queryKey: ['global-search', term, searchable.map((resource) => resource.name)],
    enabled: term.length >= MIN_RECORD_SEARCH,
    queryFn: async () => {
      // allSettled: one failing resource must not hide the others' results.
      const settled = await Promise.allSettled(
        searchable.map(async (resource) => {
          const page = await api.list(resource.metadata, { page: 1, perPage: RESULTS_PER_RESOURCE, search: term, sort: resource.defaultSort, filters: {}, trashed: 'without' })
          return page.data.map((row) => ({ resource, row }))
        }),
      )
      return settled.flatMap((result) => (result.status === 'fulfilled' ? result.value : []))
    },
  })

  return useMemo(() => {
    const lower = text.trim().toLowerCase()
    const screens: PaletteOption[] = searchable
      .filter((resource) => lower === '' || resource.label.plural.toLowerCase().includes(lower))
      .map((resource) => ({ id: `palette-screen-${resource.name}`, label: resource.label.plural, hint: 'Screen', resource, recordKey: undefined }))
    const found: PaletteOption[] =
      term.length < MIN_RECORD_SEARCH
        ? []
        : (records.data ?? []).map(({ resource, row }) => {
            const key = recordRouteKey(resource, row)
            return { id: `palette-record-${resource.name}-${key}`, label: recordTitle(resource, row), hint: resource.label.singular, resource, recordKey: key }
          })
    return [...screens, ...found]
  }, [text, term, searchable, records.data])
}
