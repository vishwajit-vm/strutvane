// @vitest-environment jsdom
/**
 * Create/edit forms (widgets by type, slug preview, client checks, server 422 issues, relation
 * select) and the detail page (fields, relation links, hasMany tabs, slug URLs).
 */
import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { metadata as generatedMetadata } from '../../example/.strutvane/ui.gen.ts'
import { commentsResource, stringField, withResource } from '../fixtures.ts'
import { lastListQuery, renderApp } from './render-app.tsx'

async function openNewPost() {
  const app = renderApp({ path: '/posts/new' })
  await screen.findByRole('heading', { name: 'New post' })
  return app
}

describe('create form', () => {
  it('picks a widget per field type, from the metadata and the owned form settings', async () => {
    await openNewPost()
    expect(screen.getByRole('textbox', { name: /^Title/ })).toHaveAttribute('type', 'text')
    expect(screen.getByRole('textbox', { name: 'Content' }).tagName).toBe('TEXTAREA')
    expect(screen.getByRole('textbox', { name: 'Price' })).toHaveAttribute('inputmode', 'decimal')
    expect(screen.getByRole('combobox', { name: 'Status' })).toHaveValue('draft')
    expect(within(screen.getByRole('combobox', { name: 'Status' })).getAllByRole('option').map((option) => option.textContent)).toEqual(['draft', 'published'])
    expect(screen.getByRole('combobox', { name: /^Author/ })).toHaveAttribute('aria-autocomplete', 'list')
    expect(screen.getByRole('switch', { name: 'Featured' })).toHaveAttribute('aria-checked', 'false')
    expect(screen.getByLabelText('Published on')).toHaveAttribute('type', 'date')
    expect(screen.getByRole('combobox', { name: 'Category' })).toBeInTheDocument()
    // The owned file says form: auto({ except: ['meta'], order: ['title', 'status'] }).
    expect(screen.queryByLabelText('Meta')).toBeNull()
    const labels = [...document.querySelectorAll('form [data-field]')].map((element) => element.getAttribute('data-field'))
    expect(labels.slice(0, 2)).toEqual(['title', 'status'])
  })

  it('keeps the slug in step with the title until the slug is edited, with a URL preview', async () => {
    const app = await openNewPost()
    const slug = screen.getByRole('textbox', { name: 'Slug' })
    await app.user.type(screen.getByRole('textbox', { name: /^Title/ }), 'Héllo, World!')
    expect(slug).toHaveValue('hello-world')
    expect(slug).toHaveAccessibleDescription(/URL: \/posts\/hello-world/)
    await app.user.clear(slug)
    await app.user.type(slug, 'my-own')
    await app.user.type(screen.getByRole('textbox', { name: /^Title/ }), ' again')
    expect(slug).toHaveValue('my-own')
  })

  it('checks required fields before sending, marks them invalid and focuses the first one', async () => {
    const app = await openNewPost()
    await app.user.click(screen.getByRole('button', { name: 'Create post' }))
    const title = screen.getByRole('textbox', { name: /^Title/ })
    expect(title).toHaveFocus()
    expect(title).toHaveAttribute('aria-invalid', 'true')
    expect(title).toHaveAccessibleDescription('Title is required. 0 of 200 characters')
    expect(screen.getByText('Author is required.')).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('2 fields need attention')
    expect(app.requests.some((request) => request.method === 'POST')).toBe(false)
  })

  it('creates a post with the async relation select and lands on its slug URL', async () => {
    const app = await openNewPost()
    await app.user.type(screen.getByRole('textbox', { name: /^Title/ }), 'Launch day')
    await app.user.type(screen.getByRole('combobox', { name: /^Author/ }), 'ben')
    await app.user.keyboard('{ArrowDown}')
    await screen.findByRole('option', { name: 'Ben Okafor' })
    await app.user.keyboard('{Enter}')
    expect(screen.getByRole('combobox', { name: /^Author/ })).toHaveValue('Ben Okafor')
    const price = screen.getByRole('textbox', { name: 'Price' })
    expect(price).toHaveValue('0.00') // the column default, as the API would return it
    await app.user.clear(price)
    await app.user.type(price, '12.')
    expect(screen.getByRole('textbox', { name: 'Price' })).toHaveValue('12.') // the decimal point survives typing
    await app.user.type(screen.getByRole('textbox', { name: 'Price' }), '5')
    await app.user.click(screen.getByRole('switch', { name: 'Featured' }))
    await app.user.click(screen.getByRole('button', { name: 'Create post' }))

    expect(await screen.findByRole('heading', { name: 'Launch day' })).toBeInTheDocument()
    expect(app.history.location.pathname).toBe('/posts/launch-day')
    const post = app.requests.find((request) => request.method === 'POST')
    // An untouched slug is left to the server, which de-duplicates it.
    expect(post?.body).toEqual({ title: 'Launch day', status: 'draft', price: '12.5', author_id: 2, featured: true })
  })

  it("shows the server's 422 issues on the right fields", async () => {
    const app = renderApp({ path: '/categories/new' })
    await screen.findByRole('heading', { name: 'New category' })
    await app.user.type(screen.getByRole('textbox', { name: /^Name/ }), 'Engineering again')
    const slug = screen.getByRole('textbox', { name: 'Slug' })
    await app.user.clear(slug)
    await app.user.type(slug, 'engineering')
    await app.user.click(screen.getByRole('button', { name: 'Create category' }))
    await waitFor(() => expect(slug).toHaveAccessibleDescription(/Slug "engineering" is already taken./))
    expect(slug).toHaveFocus()
    expect(slug).toHaveAttribute('aria-invalid', 'true')
  })
})

describe('422 issue shapes (CONSISTENCY #69, #118)', () => {
  it('reads issues[].path first (RFC-0003), falls back to field, and never drops one silently', async () => {
    const issues = [
      { path: ['title'], code: 'too_long', message: 'Title is too long.' }, // RFC-0003: path only
      { path: ['slug'], field: 'ignored', code: 'taken', message: 'That slug is taken.' }, // path wins
      { field: 'price', code: 'invalid', message: 'Price must be a number.' }, // spike 10: field only
      { path: ['lines', 2, 'amount'], code: 'required', message: 'Line 3 needs an amount.' }, // not on this form
    ]
    const app = renderApp({
      path: '/posts/new',
      transport: (mock) => async (request) =>
        request.method === 'POST'
          ? new Response(JSON.stringify({ type: 'about:blank', title: 'Invalid', status: 422, code: 'validation_failed', issues }), { status: 422, headers: { 'content-type': 'application/problem+json' } })
          : mock.handle(request),
    })
    await screen.findByRole('heading', { name: 'New post' })
    await app.user.type(screen.getByRole('textbox', { name: /^Title/ }), 'Too long')
    await app.user.type(screen.getByRole('combobox', { name: /^Author/ }), 'ben')
    await app.user.keyboard('{ArrowDown}')
    await screen.findByRole('option', { name: 'Ben Okafor' })
    await app.user.keyboard('{Enter}')
    await app.user.click(screen.getByRole('button', { name: 'Create post' }))
    await waitFor(() => expect(screen.getByRole('textbox', { name: /^Title/ })).toHaveAccessibleDescription(/Title is too long./))
    expect(screen.getByRole('textbox', { name: 'Slug' })).toHaveAccessibleDescription(/That slug is taken./)
    expect(screen.getByRole('textbox', { name: 'Price' })).toHaveAccessibleDescription(/Price must be a number./)
    expect(screen.getByRole('alert')).toHaveTextContent('Line 3 needs an amount.')
  })
})

describe('edit form', () => {
  it('sends only the fields that changed', async () => {
    const app = renderApp({ path: '/posts/shipping-notes/edit' })
    await screen.findByRole('heading', { name: 'Edit Shipping: notes' })
    expect(screen.getByRole('textbox', { name: 'Slug' })).toHaveAccessibleDescription(/Changing the slug breaks links/)
    await app.user.selectOptions(screen.getByRole('combobox', { name: 'Status' }), 'published')
    await app.user.click(screen.getByRole('button', { name: 'Save changes' }))
    await screen.findByRole('heading', { name: 'Shipping: notes' })
    const patch = app.requests.find((request) => request.method === 'PATCH')
    expect(patch?.url.pathname).toBe('/api/posts/1')
    expect(patch?.body).toEqual({ status: 'published' })
  })
})

describe('detail page', () => {
  it('loads by slug and shows every field, with relations as links', async () => {
    const app = renderApp({ path: '/posts/shipping-notes' })
    expect(await screen.findByRole('heading', { name: 'Shipping: notes' })).toBeInTheDocument()
    expect(app.requests.some((request) => request.url.pathname === '/api/posts/by-slug/shipping-notes')).toBe(true)
    expect(await screen.findByRole('link', { name: 'Asha Rao' })).toHaveAttribute('href', '/users/1')
    expect(screen.getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/posts/shipping-notes/edit')
    expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', { name: 'Posts' })).toBeInTheDocument()
  })

  it('has one tab per hasMany relation, keyboard-navigable, loading the related list on demand', async () => {
    const app = renderApp({ path: '/users/1' })
    await screen.findByRole('heading', { name: 'Asha Rao' })
    const details = screen.getByRole('tab', { name: 'Details' })
    expect(details).toHaveAttribute('aria-selected', 'true')
    // Only the tab's count is fetched up front (no sort); the related list waits for the tab.
    const listed = (): boolean => app.requests.some((request) => request.url.searchParams.get('filter[author_id][eq]') === '1' && request.url.searchParams.has('sort'))
    expect(listed()).toBe(false)

    details.focus()
    await app.user.keyboard('{ArrowRight}')
    const postsTab = screen.getByRole('tab', { name: /^Posts/ })
    await waitFor(() => expect(postsTab).toHaveAttribute('aria-selected', 'true'))
    expect(postsTab).toHaveFocus()
    expect(app.history.location.search).toContain('tab=posts')
    const table = await screen.findByRole('table', { name: 'Posts' })
    expect(within(table).getAllByRole('row').length).toBeGreaterThan(1)
    expect(listed()).toBe(true)
  })

  it('each relation tab keeps its OWN list state (foreign key, sort), never the previous tab\'s', async () => {
    // users hasMany posts (author_id) AND hasMany comments (user_id): two tabs, two foreign keys.
    const comments = commentsResource()
    const userId = { ...stringField('user_id', 'User'), kind: 'integer' as const, cast: 'integer' as const, input: 'number' as const, filterOperators: ['eq', 'in'] as const }
    const withComments = withResource(generatedMetadata, { ...comments, defaultSort: '-id', fields: [...comments.fields, userId] })
    const metadata = {
      ...withComments,
      resources: withComments.resources.map((resource) =>
        resource.table === 'users'
          ? { ...resource, relations: [...resource.relations, { name: 'comments', kind: 'hasMany' as const, resource: 'comments', foreignKey: 'user_id', ownerKey: 'id' }] }
          : resource,
      ),
    }
    const app = renderApp({ path: '/users/1?tab=posts', metadata })
    await screen.findByRole('table', { name: 'Posts' })
    await app.user.click(screen.getByRole('tab', { name: /^Comments/ }))
    await waitFor(() => expect(lastListQuery(app.requests, 'comments')['sort']).toBeDefined())
    const query = lastListQuery(app.requests, 'comments')
    expect(query['filter[user_id][eq]']).toBe('1')
    expect(query['filter[author_id][eq]']).toBeUndefined()
    expect(query['sort']).toBe('-id')
  })

  it('explains a missing record without saying whether it exists elsewhere', async () => {
    renderApp({ path: '/posts/no-such-post' })
    expect(await screen.findByText('Could not load this post')).toBeInTheDocument()
    expect(screen.getByText('No post has slug "no-such-post".')).toBeInTheDocument()
  })

  it('uses the id in URLs for tables without a slug', async () => {
    const app = renderApp({ path: '/tags' })
    // Tags sort newest id first (spike 10's default for tables without timestamps): "faq" is id 12.
    await app.user.click(await screen.findByRole('link', { name: 'faq' }))
    expect(await screen.findByRole('heading', { name: 'faq' })).toBeInTheDocument()
    expect(app.history.location.pathname).toBe('/tags/12')
  })
})
