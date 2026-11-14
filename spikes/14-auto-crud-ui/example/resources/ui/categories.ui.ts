import { auto, defineResourceUi } from '#strutvane/ui'

/**
 * How categories look in the admin UI. This file is yours: `ui:sync` wrote it once,
 * when the `categories` table first appeared, and never touches it again.
 *
 * `auto()` follows the schema: a column added by a later migration shows up by itself.
 * Replace it with a list (`columns: ['title', 'status']`) to take full control; from then on
 * `ui:sync` only reports new columns. Field names are type-checked against the schema.
 *
 * What auto() resolves to today:
 * - columns: name, slug, created_at
 * - form:    name, slug
 * - filters: name, slug, created_at
 */
export default defineResourceUi('categories', {
  columns: auto(),
  form: auto(),
  filters: auto(),
  navigation: { icon: 'folder', group: 'Content', sort: 2 },
})
