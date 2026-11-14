/**
 * Pure rules with no rendering: auto() resolution, sidebar ordering, URL and wire formats, page
 * windows, form value conversion and the slug rule.
 */
import { describe, expect, it } from 'vitest'
import { filterKey, nextSort, toQueryString, withFilter } from '../../src/app/api/list-params.ts'
import { buildBody, initialValues, validateValues } from '../../src/app/resource/form-values.ts'
import { pageWindow } from '../../src/app/resource/Pagination.tsx'
import { validateListSearch } from '../../src/app/route-search.ts'
import { auto } from '../../src/shared/define-ui.ts'
import { defaultColumns } from '../../src/shared/defaults.ts'
import { guessIcon } from '../../src/shared/icons.ts'
import { buildNavigation } from '../../src/shared/navigation.ts'
import { resolveResourceUi } from '../../src/shared/resolve-ui.ts'
import { slugify } from '../../src/shared/slug.ts'
import { blogToday } from '../generator/helpers.ts'

const metadata = blogToday()
function resource(table: string) {
  const found = metadata.resources.find((candidate) => candidate.table === table)
  if (found === undefined) throw new Error(`test setup: no ${table}`)
  return found
}

describe('auto() resolution', () => {
  it('puts the title first, skips the id, long text and JSON', () => {
    expect(defaultColumns(resource('posts')).map((field) => field.name)).toEqual(['title', 'slug', 'price', 'status', 'author_id', 'featured', 'published_on', 'created_at', 'subtitle', 'category_id'])
  })

  it('applies except and order, and reports names that do not exist', () => {
    const ui = resolveResourceUi(resource('posts'), { columns: auto({ except: ['slug'], order: ['status', 'title'] }), form: ['title', 'gone'] })
    expect(ui.columns.slice(0, 3).map((field) => field.name)).toEqual(['status', 'title', 'price'])
    expect(ui.columns.map((field) => field.name)).not.toContain('slug')
    expect(ui.formFields.map((field) => field.name)).toEqual(['title'])
    expect(ui.unknownFields).toEqual(['gone'])
  })

  it('uses the slug as the route key when there is one', () => {
    expect(resolveResourceUi(resource('posts'), undefined).routeKey).toBe('slug')
    expect(resolveResourceUi(resource('tags'), undefined).routeKey).toBe('id')
  })
})

describe('sidebar', () => {
  it('orders ungrouped first, groups A to Z, sort numbers then labels; skips hidden and forbidden', () => {
    const resolved = [
      resolveResourceUi(resource('tags'), { navigation: { group: 'Content' } }),
      resolveResourceUi(resource('posts'), { navigation: { group: 'Content', sort: 1 } }),
      resolveResourceUi(resource('categories'), { navigation: { group: 'Content', hidden: true } }),
      resolveResourceUi(resource('users'), undefined),
    ]
    expect(buildNavigation(resolved, () => true).map((group) => [group.heading, group.entries.map((entry) => entry.label)])).toEqual([
      [undefined, ['Users']],
      ['Content', ['Posts', 'Tags']],
    ])
    expect(buildNavigation(resolved, (name) => name !== 'users').map((group) => group.heading)).toEqual(['Content'])
  })

  it('merges package pages (spike 12 app.navigation.items) under the same rules and permissions', () => {
    const resolved = [resolveResourceUi(resource('posts'), { navigation: { group: 'Content' } })]
    const logs = { name: 'logs', label: 'Logs', path: '/_strutvane/logs', icon: 'chart-bar', group: 'System', permission: 'logs.view' } as const
    expect(buildNavigation(resolved, () => true, [logs]).map((group) => [group.heading, group.entries.map((entry) => entry.path)])).toEqual([
      ['Content', ['/posts']],
      ['System', ['/_strutvane/logs']],
    ])
    expect(buildNavigation(resolved, (key) => key !== 'logs.view', [logs]).map((group) => group.heading)).toEqual(['Content'])
  })

  it('guesses icons from table names', () => {
    expect([guessIcon('invoice_lines'), guessIcon('users'), guessIcon('widgets')]).toEqual(['receipt', 'users', 'table'])
  })
})

describe('list wire format (spike 10)', () => {
  it('builds filter[field][op], sort, search and trashed parameters', () => {
    const filters = withFilter(withFilter({}, filterKey('status', 'in'), 'draft,published'), filterKey('price', 'gte'), '10')
    const query = new URLSearchParams(toQueryString({ page: 2, perPage: 25, search: ' hi ', sort: '-price', filters, trashed: 'only' }))
    expect(Object.fromEntries(query)).toEqual({ page: '2', perPage: '25', sort: '-price', search: 'hi', 'filter[price][gte]': '10', 'filter[status][in]': 'draft,published', 'filter[trashed]': 'only' })
    expect(withFilter(filters, 'price.gte', '')).toEqual({ 'status.in': 'draft,published' })
  })

  it('cycles column sort: ascending, descending, back to the default', () => {
    expect(nextSort('-created_at', 'title', '-created_at')).toBe('title')
    expect(nextSort('title', 'title', '-created_at')).toBe('-title')
    expect(nextSort('-title', 'title', '-created_at')).toBe('-created_at')
    expect(nextSort('-created_at', 'created_at', '-created_at')).toBe('created_at')
  })

  it('drops malformed URL state instead of trusting it', () => {
    expect(validateListSearch({ page: '0', perPage: 30, sort: 'a; drop', filter: { 'bad key': 'x', 'status.in': 'draft' }, trashed: 'all' })).toEqual({ filter: { 'status.in': 'draft' } })
  })

  it('shows page numbers around the current page with gaps', () => {
    expect(pageWindow(1, 1)).toEqual([1])
    expect(pageWindow(1, 3)).toEqual([1, 2, 3])
    expect(pageWindow(6, 12)).toEqual([1, 'gap', 5, 6, 7, 'gap', 12])
    expect(pageWindow(3, 12)).toEqual([1, 2, 3, 4, 'gap', 12])
  })
})

describe('form values', () => {
  const fields = resolveResourceUi(resource('posts'), undefined).formFields

  it('starts from column defaults and keeps decimals as text', () => {
    const values = initialValues(fields, undefined)
    expect(values).toMatchObject({ title: '', status: 'draft', price: '0.00', featured: false, author_id: null, meta: '' })
  })

  it('checks required, length, decimal scale and JSON like the server does', () => {
    const values = { ...initialValues(fields, undefined), title: 'x'.repeat(201), price: '1.234', meta: '{oops' }
    expect(validateValues(fields, values, 'create')).toEqual({
      title: 'Title can be at most 200 characters.',
      price: 'Price can have at most 2 digits after the decimal point.',
      author_id: 'Author is required.',
      meta: 'Meta must be valid JSON, for example {"key": "value"}.',
    })
  })

  it('sends only changed fields on edit, with emptied nullable fields as null', () => {
    const row = { title: 'Hi', subtitle: 'Old', price: '1.00', author_id: 1, featured: false, status: 'draft', meta: { a: 1 } }
    const initial = initialValues(fields, row)
    expect(buildBody(fields, { ...initial, subtitle: '', meta: '{"a": 2}' }, 'edit', initial)).toEqual({ subtitle: null, meta: { a: 2 } })
  })
})

describe('slug rule (same as spike 10)', () => {
  it('drops accents and punctuation, and gives up on non-Latin text', () => {
    expect(slugify('Héllo, Wörld!  Launch day')).toBe('hello-world-launch-day')
    expect(slugify('日本')).toBe('')
  })
})
