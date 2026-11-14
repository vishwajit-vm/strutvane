/**
 * Build the sidebar from resolved resources: one entry per resource the user may list, grouped
 * and ordered by the rules of design doc §4.9.
 *
 * Pure and framework-free so the ordering rules are tested without rendering anything.
 *
 * @module
 */
import type { IconName } from './icons.ts'
import type { ResolvedResourceUi } from './resolve-ui.ts'

/**
 * One sidebar link.
 *
 * @example
 * const entry: NavigationEntry = { name: 'posts', label: 'Posts', icon: 'file-text', path: '/posts' }
 */
export interface NavigationEntry {
  readonly name: string
  readonly label: string
  readonly icon: IconName
  readonly path: string
}

/**
 * A sidebar section. `heading` is `undefined` for the ungrouped entries at the top.
 *
 * @example
 * const group: NavigationGroup = { heading: 'Content', entries: [] }
 */
export interface NavigationGroup {
  readonly heading: string | undefined
  readonly entries: readonly NavigationEntry[]
}

/**
 * A sidebar entry contributed by a package, not a table: the logs viewer, a settings page, a
 * billing portal. Packages declare these in the app's navigation registry (spike 12:
 * `app.navigation.items`); the UI merges them with the resource entries under the same rules.
 *
 * @example
 * const logs: NavigationPage = { name: 'logs', label: 'Logs', path: '/_strutvane/logs', icon: 'chart-bar', group: 'System', permission: 'logs.view' }
 */
export interface NavigationPage {
  readonly name: string
  readonly label: string
  readonly path: string
  readonly icon: IconName
  readonly group?: string
  readonly sort?: number
  /** Checked with the same callback as resources; deny-by-default like everything else. */
  readonly permission: string
}

/** Resources and pages, flattened to what ordering needs. */
interface Candidate extends NavigationEntry {
  readonly group: string | undefined
  readonly sort: number | undefined
}

/**
 * Group and order sidebar entries.
 *
 * Rules, in order:
 * 1. Skip resources whose entry is hidden, and anything the user may not see (`viewAny` for a
 *    resource, the page's `permission` for a package page): an entry that only leads to "access
 *    denied" is worse than no entry.
 * 2. Ungrouped entries first, then groups alphabetically.
 * 3. Inside a section: `sort` ascending (unset sorts last), then label A to Z. Alphabetical, not
 *    migration order, so a new table never reshuffles the menu.
 *
 * @example
 * buildNavigation(resources, (name) => name !== 'users')
 * // [{ heading: undefined, entries: [Categories, Posts, Tags] }]
 */
export function buildNavigation(resources: readonly ResolvedResourceUi[], canSee: (resourceOrPermission: string) => boolean, pages: readonly NavigationPage[] = []): NavigationGroup[] {
  const candidates: Candidate[] = [
    ...resources
      .filter((resource) => !resource.navigation.hidden && canSee(resource.name))
      .map((resource) => ({ name: resource.name, label: resource.label.plural, icon: resource.navigation.icon, path: `/${resource.metadata.route}`, group: resource.navigation.group, sort: resource.navigation.sort })),
    ...pages.filter((page) => canSee(page.permission)).map((page) => ({ name: page.name, label: page.label, icon: page.icon, path: page.path, group: page.group, sort: page.sort })),
  ]
  const named = [...new Set(candidates.flatMap((candidate) => (candidate.group === undefined ? [] : [candidate.group])))].sort((a, b) => a.localeCompare(b))
  // Ungrouped first, added by hand: `Array.prototype.sort` always moves `undefined` to the end
  // without asking the comparator, so it cannot be sorted into first place (found by a test).
  const hasUngrouped = candidates.some((candidate) => candidate.group === undefined)
  const headings: (string | undefined)[] = hasUngrouped ? [undefined, ...named] : named
  return headings.map((heading) => ({
    heading,
    entries: candidates
      .filter((candidate) => candidate.group === heading)
      .sort(compareEntries)
      .map(({ name, label, icon, path }) => ({ name, label, icon, path })),
  }))
}

function compareEntries(a: Candidate, b: Candidate): number {
  // An unset sort number behaves like "after every numbered entry".
  const sortA = a.sort ?? Number.POSITIVE_INFINITY
  const sortB = b.sort ?? Number.POSITIVE_INFINITY
  if (sortA !== sortB) return sortA < sortB ? -1 : 1
  return a.label.localeCompare(b.label)
}
