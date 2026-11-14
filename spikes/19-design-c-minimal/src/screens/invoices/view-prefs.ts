/**
 * Per-browser list preferences: density and visible columns. These are personal comfort settings
 * (not part of a shareable view), so they live in localStorage rather than the URL.
 */
import { useState } from 'react'
import { readPreference, writePreference } from '../../lib/storage.ts'

export type Density = 'compact' | 'default' | 'comfortable'

/** Row height per density, from the `--row-*` tokens (32, 40 and 48 px in Crisp). */
export const ROW_HEIGHT: Record<Density, string> = { compact: 'h-row-compact', default: 'h-row-default', comfortable: 'h-row-comfortable' }

export type ColumnId = 'customer' | 'status' | 'issuedAt' | 'dueAt' | 'owner' | 'tags' | 'amount'

export const COLUMNS: readonly { id: ColumnId; label: string }[] = [
  { id: 'customer', label: 'Customer' },
  { id: 'status', label: 'Status' },
  { id: 'issuedAt', label: 'Issued' },
  { id: 'dueAt', label: 'Due' },
  { id: 'owner', label: 'Owner' },
  { id: 'tags', label: 'Tags' },
  { id: 'amount', label: 'Amount' },
]

const DEFAULT_COLUMNS: readonly ColumnId[] = ['customer', 'status', 'issuedAt', 'dueAt', 'owner', 'amount']

const KEY = 'strutvane.design-c.invoices'

interface Prefs {
  density: Density
  columns: readonly ColumnId[]
}

function load(): Prefs {
  try {
    const raw = readPreference(KEY)
    if (raw === null) return { density: 'default', columns: DEFAULT_COLUMNS }
    const parsed = JSON.parse(raw) as Partial<Record<keyof Prefs, unknown>>
    const density = parsed.density === 'compact' || parsed.density === 'comfortable' ? parsed.density : 'default'
    const columns = Array.isArray(parsed.columns) ? COLUMNS.map((column) => column.id).filter((id) => (parsed.columns as unknown[]).includes(id)) : DEFAULT_COLUMNS
    return { density, columns }
  } catch {
    // Corrupt JSON from an older version: start fresh rather than break the list.
    return { density: 'default', columns: DEFAULT_COLUMNS }
  }
}

/** Density and columns, remembered across visits. */
export function useViewPrefs() {
  const [prefs, setPrefs] = useState<Prefs>(load)
  const update = (next: Prefs) => {
    setPrefs(next)
    writePreference(KEY, JSON.stringify(next))
  }
  return {
    density: prefs.density,
    columns: prefs.columns,
    setDensity: (density: Density) => update({ ...prefs, density }),
    toggleColumn: (id: ColumnId) => update({ ...prefs, columns: prefs.columns.includes(id) ? prefs.columns.filter((column) => column !== id) : COLUMNS.map((c) => c.id).filter((c) => c === id || prefs.columns.includes(c)) }),
  }
}
