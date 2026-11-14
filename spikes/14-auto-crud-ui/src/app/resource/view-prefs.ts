/**
 * Per-viewer list preferences: which columns are hidden and the row density.
 *
 * Why localStorage and not the URL: these are personal conveniences ("I never need the slug
 * column"), not part of what a shared link means. Filters, sort and page stay in the URL. Storage
 * can throw (private windows), so every access is guarded and the defaults always work.
 *
 * @module
 */
import { useState } from 'react'

/**
 * Row density: comfortable (52 px rows) or compact (36 px rows).
 *
 * @example
 * const density: Density = 'compact'
 */
export type Density = 'comfortable' | 'compact'

/**
 * Stored preferences for one resource's list.
 *
 * @example
 * const prefs: ViewPrefs = { hidden: ['slug'], density: 'compact' }
 */
export interface ViewPrefs {
  readonly hidden: readonly string[]
  readonly density: Density
}

const DEFAULT_PREFS: ViewPrefs = { hidden: [], density: 'comfortable' }

/** Storage key per resource. */
export function viewPrefsKey(resource: string): string {
  return `strutvane.view.${resource}`
}

function read(resource: string): ViewPrefs {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(viewPrefsKey(resource)) ?? 'null')
    if (typeof value !== 'object' || value === null) return DEFAULT_PREFS
    const hidden = 'hidden' in value && Array.isArray(value.hidden) ? value.hidden.filter((name: unknown): name is string => typeof name === 'string') : []
    const density = 'density' in value && value.density === 'compact' ? 'compact' : 'comfortable'
    return { hidden, density }
  } catch {
    return DEFAULT_PREFS
  }
}

function write(resource: string, prefs: ViewPrefs): void {
  try {
    window.localStorage.setItem(viewPrefsKey(resource), JSON.stringify(prefs))
  } catch {
    // Storage blocked: the preference applies for this visit only.
  }
}

/**
 * Read and change one resource's list preferences.
 *
 * @example
 * const { prefs, toggleColumn, setDensity } = useViewPrefs('posts')
 */
export function useViewPrefs(resource: string): { readonly prefs: ViewPrefs; readonly toggleColumn: (name: string) => void; readonly setDensity: (density: Density) => void } {
  const [prefs, setPrefs] = useState<ViewPrefs>(() => read(resource))
  const update = (next: ViewPrefs): void => {
    setPrefs(next)
    write(resource, next)
  }
  return {
    prefs,
    toggleColumn: (name) => update({ ...prefs, hidden: prefs.hidden.includes(name) ? prefs.hidden.filter((hidden) => hidden !== name) : [...prefs.hidden, name] }),
    setDensity: (density) => update({ ...prefs, density }),
  }
}
