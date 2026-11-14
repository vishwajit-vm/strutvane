import { auto, defineResourceUi } from '#strutvane/ui'

/**
 * How tags look in the admin UI. This file is yours: `ui:sync` wrote it once,
 * when the `tags` table first appeared, and never touches it again.
 *
 * `auto()` follows the schema: a column added by a later migration shows up by itself.
 * Replace it with a list (`columns: ['title', 'status']`) to take full control; from then on
 * `ui:sync` only reports new columns. Field names are type-checked against the schema.
 *
 * What auto() resolves to today:
 * - columns: name, position
 * - form:    name, position
 * - filters: name, position
 */
export default defineResourceUi('tags', {
  // Developer edit: an explicit list. ui:sync never rewrites it; it reports new columns instead.
  columns: ['name', 'position'],
  form: auto(),
  filters: auto(),
  navigation: { icon: 'tag', group: 'Content' },
  pageSize: 10,
})
