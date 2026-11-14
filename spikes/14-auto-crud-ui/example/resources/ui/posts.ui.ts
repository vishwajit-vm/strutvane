import { auto, defineResourceUi } from '#strutvane/ui'

/**
 * How posts look in the admin UI. This file is yours: `ui:sync` wrote it once,
 * when the `posts` table first appeared, and never touches it again.
 *
 * `auto()` follows the schema: a column added by a later migration shows up by itself.
 * Replace it with a list (`columns: ['title', 'status']`) to take full control; from then on
 * `ui:sync` only reports new columns. Field names are type-checked against the schema.
 *
 * What auto() resolves to today:
 * - columns: title, slug, price, status, author_id, featured, published_on, created_at, subtitle, category_id
 * - form:    title, slug, content, price, status, author_id, featured, published_on, meta, subtitle, category_id
 * - filters: title, slug, price, status, author_id, featured, published_on, created_at, subtitle, category_id
 */
export default defineResourceUi('posts', {
  columns: auto(),
  // Developer edit: `meta` is internal JSON, keep it off the form; title and status first.
  form: auto({ except: ['meta'], order: ['title', 'status'] }),
  filters: auto(),
  navigation: { icon: 'file-text', group: 'Content', sort: 1 },
  defaultSort: '-created_at',
})
