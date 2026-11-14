// @vitest-environment jsdom
/**
 * The list screen against the mock API (spike 10's contract): page numbers and sizes, search,
 * sort, typed filters, deleted rows, empty/loading/error states, delete with confirmation.
 */
import { screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { lastListQuery, renderApp, waitForTable } from './render-app.tsx'

/** 37 seeded posts, 2 of them in the trash. */
const LIVE_POSTS = 35

function bodyRows(table: HTMLElement): HTMLElement[] {
  return within(table).getAllByRole('row').slice(1)
}

describe('pagination', () => {
  it('shows page numbers, a summary and the owned page size (25)', async () => {
    const app = renderApp({ path: '/posts' })
    const table = await waitForTable('Posts')
    expect(bodyRows(table)).toHaveLength(25)
    expect(screen.getByText(`Showing 1–25 of ${LIVE_POSTS} posts`)).toBeInTheDocument()
    expect(lastListQuery(app.requests, 'posts')).toEqual({ page: '1', perPage: '25', sort: '-created_at' })

    const pagination = screen.getByRole('navigation', { name: 'Pagination' })
    expect(within(pagination).getByRole('button', { name: 'Page 1' })).toHaveAttribute('aria-current', 'page')
    await app.user.click(within(pagination).getByRole('button', { name: 'Page 2' }))
    expect(await screen.findByText(`Showing 26–${LIVE_POSTS} of ${LIVE_POSTS} posts`)).toBeInTheDocument()
    expect(app.history.location.search).toContain('page=2')
    expect(within(pagination).getByRole('button', { name: 'Next page' })).toBeDisabled()
  })

  it('changes the page size (10/25/50/100) and goes back to page 1', async () => {
    const app = renderApp({ path: '/posts?page=2' })
    await waitForTable('Posts')
    await app.user.selectOptions(screen.getByLabelText('Rows per page'), '10')
    expect(await screen.findByText(`Showing 1–10 of ${LIVE_POSTS} posts`)).toBeInTheDocument()
    expect(lastListQuery(app.requests, 'posts')).toMatchObject({ page: '1', perPage: '10' })
    expect(within(screen.getByRole('navigation', { name: 'Pagination' })).getByRole('button', { name: 'Page 4' })).toBeInTheDocument()
  })

  it('ignores a malformed URL instead of failing (page size 7 is not offered)', async () => {
    const app = renderApp({ path: '/posts?perPage=7&page=abc&sort=drop%20table' })
    await waitForTable('Posts')
    expect(lastListQuery(app.requests, 'posts')).toEqual({ page: '1', perPage: '25', sort: '-created_at' })
  })
})

describe('search and sort', () => {
  it('searches after typing stops, and announces the count', async () => {
    const app = renderApp({ path: '/posts' })
    await waitForTable('Posts')
    await app.user.type(screen.getByRole('searchbox', { name: 'Search posts' }), 'pricing')
    await waitFor(() => expect(lastListQuery(app.requests, 'posts')['search']).toBe('pricing'))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('4 posts found'))
    for (const row of bodyRows(screen.getByRole('table', { name: 'Posts' }))) expect(row).toHaveTextContent(/Pricing/)
  })

  it('sorts by a column: ascending first, then descending, with aria-sort', async () => {
    const app = renderApp({ path: '/posts' })
    await waitForTable('Posts')
    const header = (): HTMLElement => screen.getByRole('columnheader', { name: /Title/ })
    expect(header()).toHaveAttribute('aria-sort', 'none')
    await app.user.click(within(header()).getByRole('button'))
    await waitFor(() => expect(header()).toHaveAttribute('aria-sort', 'ascending'))
    expect(lastListQuery(app.requests, 'posts')['sort']).toBe('title')
    await app.user.click(within(header()).getByRole('button'))
    await waitFor(() => expect(header()).toHaveAttribute('aria-sort', 'descending'))
    expect(lastListQuery(app.requests, 'posts')['sort']).toBe('-title')
  })
})

describe('typed filters', () => {
  it('sends filter[field][op] for enum, boolean and number filters', async () => {
    const app = renderApp({ path: '/posts' })
    await waitForTable('Posts')
    await app.user.click(screen.getByRole('button', { name: 'Filters' }))

    await app.user.click(screen.getByRole('checkbox', { name: 'draft' }))
    await waitFor(() => expect(lastListQuery(app.requests, 'posts')['filter[status][in]']).toBe('draft'))
    await app.user.selectOptions(screen.getByLabelText('Featured'), 'true')
    await waitFor(() => expect(lastListQuery(app.requests, 'posts')['filter[featured][eq]']).toBe('true'))
    await app.user.type(screen.getByLabelText('Price min'), '10{Enter}')
    await waitFor(() => expect(lastListQuery(app.requests, 'posts')['filter[price][gte]']).toBe('10'))

    expect(screen.getByRole('button', { name: 'Filters (3)' })).toHaveAttribute('aria-expanded', 'true')
    await waitFor(() => {
      for (const row of bodyRows(screen.getByRole('table', { name: 'Posts' }))) expect(row).toHaveTextContent(/draft/)
    })
  })

  it('filters by a relation with the async select', async () => {
    const app = renderApp({ path: '/posts' })
    await waitForTable('Posts')
    await app.user.click(screen.getByRole('button', { name: 'Filters' }))
    await app.user.type(screen.getByRole('combobox', { name: 'Author' }), 'ben')
    await app.user.click(await screen.findByRole('option', { name: 'Ben Okafor' }))
    await waitFor(() => expect(lastListQuery(app.requests, 'posts')['filter[author_id][eq]']).toBe('2'))
  })
})

describe('states', () => {
  it('says "no match" with a clear button when filters hide everything', async () => {
    const app = renderApp({ path: '/posts?search=zzzz' })
    expect(await screen.findByText('No posts match your search or filters')).toBeInTheDocument()
    await app.user.click(screen.getByRole('button', { name: 'Clear search and filters' }))
    await waitForTable('Posts')
    expect(screen.getByRole('searchbox', { name: 'Search posts' })).toHaveValue('')
  })

  it('invites the first record when the table is empty', async () => {
    renderApp({ path: '/tags', seed: false })
    expect(await screen.findByText('No tags yet')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Create tag' })).toHaveAttribute('href', '/tags/new')
  })

  it('shows skeleton rows while the first page loads', async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    renderApp({ path: '/posts', transport: (mock) => async (request) => (await gate, mock.handle(request)) })
    expect(await screen.findByRole('region', { name: 'Loading posts' })).toHaveAttribute('aria-busy', 'true')
    release()
    await waitForTable('Posts')
  })

  it('shows a friendly error with Retry, and recovers', async () => {
    let failing = true
    const app = renderApp({ path: '/posts', transport: (mock) => async (request) => (failing ? new Response('<html>Bad gateway</html>', { status: 502 }) : mock.handle(request)) })
    expect(await screen.findByText('Could not load posts')).toBeInTheDocument()
    expect(screen.getByText(/The server had a problem/)).toBeInTheDocument()
    failing = false
    await app.user.click(screen.getByRole('button', { name: 'Retry' }))
    await waitForTable('Posts')
  })
})

describe('deleted rows and delete', () => {
  it('shows only deleted rows on request, marked "Deleted", and restores one', async () => {
    const app = renderApp({ path: '/posts' })
    await waitForTable('Posts')
    await app.user.selectOptions(screen.getByLabelText('Deleted records'), 'only')
    await waitFor(() => expect(lastListQuery(app.requests, 'posts')['filter[trashed]']).toBe('only'))
    await waitFor(() => expect(bodyRows(screen.getByRole('table', { name: 'Posts' }))).toHaveLength(2))
    expect(screen.getAllByText('Deleted')).toHaveLength(2)

    await app.user.click(screen.getByRole('button', { name: 'Restore Roadmap: notes' }))
    await waitFor(() => expect(bodyRows(screen.getByRole('table', { name: 'Posts' }))).toHaveLength(1))
  })

  it('asks before deleting: Cancel has focus, Escape closes and returns focus, Delete removes', async () => {
    const app = renderApp({ path: '/posts' })
    await waitForTable('Posts')
    const trigger = screen.getByRole('button', { name: 'Delete Shipping: notes' })
    await app.user.click(trigger)
    const dialog = screen.getByRole('alertdialog', { name: 'Delete this post?' })
    expect(dialog).toHaveAccessibleDescription('“Shipping: notes” moves to the trash. You can restore it later.')
    expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus()
    await app.user.keyboard('{Escape}')
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(trigger).toHaveFocus()

    await app.user.click(trigger)
    await app.user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete post' }))
    await waitFor(() => expect(screen.queryByRole('link', { name: 'Shipping: notes' })).toBeNull())
    expect(await screen.findByText('“Shipping: notes” moved to the trash.')).toBeInTheDocument()
    expect(app.requests.some((request) => request.method === 'DELETE' && request.url.pathname === '/api/posts/1')).toBe(true)
  })

  it('hides write actions from a read-only role', async () => {
    renderApp({ path: '/posts', role: 'viewer' })
    await waitForTable('Posts')
    expect(screen.queryByRole('link', { name: 'New post' })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Delete / })).toBeNull()
    expect(screen.getAllByRole('link', { name: /^View / }).length).toBeGreaterThan(0)
  })
})

describe('owned settings', () => {
  it('uses an explicit column list exactly (tags: name, position)', async () => {
    renderApp({ path: '/tags' })
    const table = await waitForTable('Tags')
    const headers = within(table).getAllByRole('columnheader').map((header) => header.textContent)
    expect(headers).toEqual(['Name', 'Position', 'Actions'])
  })

  it('offers no export or bulk actions unless the owned file opts in (security review F-15)', async () => {
    const app = renderApp({ path: '/posts' })
    await waitForTable('Posts')
    expect(screen.queryByRole('button', { name: /export/i })).toBeNull()
    expect(screen.queryAllByRole('checkbox', { name: /select/i })).toHaveLength(0)
    for (const resource of app.registry.resources) expect(resource.actions).toEqual({ export: false, bulk: false })
  })
})
