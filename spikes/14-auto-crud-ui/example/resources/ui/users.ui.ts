import { auto, defineResourceUi } from '#strutvane/ui'

/**
 * How users look in the admin UI. This file is yours: `ui:sync` wrote it once,
 * when the `users` table first appeared, and never touches it again.
 *
 * `auto()` follows the schema: a column added by a later migration shows up by itself.
 * Replace it with a list (`columns: ['title', 'status']`) to take full control; from then on
 * `ui:sync` only reports new columns. Field names are type-checked against the schema.
 *
 * What auto() resolves to today:
 * - columns: name, email, created_at
 * - form:    name, email
 * - filters: name, email, created_at
 */
export default defineResourceUi('users', {
  columns: auto(),
  form: auto(),
  filters: auto(),
  navigation: { icon: 'users', group: 'Access' },
})
