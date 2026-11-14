// @vitest-environment jsdom
/**
 * The app shell: sidebar from the generated registry (grouped, ordered, permission-aware), a new
 * table appearing after migrate, sign-in stub, Ctrl/Cmd+K global search, dark mode.
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { metadata } from '../../example/.strutvane/ui.gen.ts'
import { commentsResource, withResource } from '../fixtures.ts'
import { renderApp } from './render-app.tsx'

function sidebar(): HTMLElement {
  return screen.getByRole('navigation', { name: 'Main' })
}

describe('sidebar', () => {
  it('has one entry per resource: plural labels, groups, explicit order, then A to Z', async () => {
    renderApp({ path: '/' })
    await screen.findByRole('heading', { name: 'Dashboard' })
    const nav = sidebar()
    const links = within(nav).getAllByRole('link').map((link) => link.textContent)
    // "Access" (Users) before "Content"; inside Content: Posts (sort 1), Categories (sort 2), Tags.
    expect(links).toEqual(['Dashboard', 'Users', 'Posts', 'Categories', 'Tags'])
    expect(within(nav).getByRole('heading', { name: 'Content' })).toBeInTheDocument()
    // Icons are decorative: the link text alone names each entry.
    for (const svg of nav.querySelectorAll('svg')) expect(svg).toHaveAttribute('aria-hidden', 'true')
  })

  it('hides entries the user may not list, and the screen says "nothing here"', async () => {
    renderApp({ path: '/users', role: 'editor' })
    expect(await screen.findByRole('heading', { name: 'Nothing here' })).toBeInTheDocument()
    expect(within(sidebar()).queryByRole('link', { name: 'Users' })).toBeNull()
    expect(within(sidebar()).getByRole('link', { name: 'Posts' })).toBeInTheDocument()
  })

  it('shows a table added by a later migrate, with default screens and no file edits', async () => {
    const app = renderApp({ path: '/', metadata: withResource(metadata, commentsResource()) })
    app.mock.table('comments')?.insertRaw({ body: 'First!' })
    await screen.findByRole('heading', { name: 'Dashboard' })
    await app.user.click(within(sidebar()).getByRole('link', { name: 'Comments' }))
    expect(await screen.findByRole('heading', { name: 'Comments' })).toBeInTheDocument()
    expect(await screen.findByRole('cell', { name: 'First!' })).toBeInTheDocument()
  })

  it('marks the current page with aria-current', async () => {
    renderApp({ path: '/posts' })
    await screen.findByRole('heading', { name: 'Posts' })
    expect(within(sidebar()).getByRole('link', { name: 'Posts' })).toHaveAttribute('aria-current', 'page')
  })
})

describe('sign-in stub', () => {
  it('sends signed-out visitors to sign-in, checks the email, and signs in with a role', async () => {
    const app = renderApp({ path: '/posts', role: null })
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()

    await app.user.click(screen.getByRole('button', { name: 'Sign in' }))
    const email = screen.getByLabelText('Email')
    expect(email).toHaveAttribute('aria-invalid', 'true')
    expect(email).toHaveFocus()
    expect(email).toHaveAccessibleDescription('Enter an email address like name@example.com.')

    await app.user.type(email, 'ben@example.com')
    await app.user.selectOptions(screen.getByLabelText('Demo role'), 'editor')
    await app.user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    expect(within(sidebar()).queryByRole('link', { name: 'Users' })).toBeNull()
  })

  it('signs out from the top bar', async () => {
    const app = renderApp({ path: '/' })
    await app.user.click(await screen.findByRole('button', { name: 'Sign out' }))
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })
})

describe('global search (Ctrl/Cmd+K)', () => {
  it('opens with Ctrl+K, finds records, opens one with the keyboard, and returns focus on Escape', async () => {
    const app = renderApp({ path: '/' })
    await screen.findByRole('heading', { name: 'Dashboard' })
    const searchButton = screen.getByRole('button', { name: /Search/ })
    searchButton.focus()

    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    const input = await screen.findByRole('combobox', { name: 'Search screens and records' })
    expect(input).toHaveFocus()
    await app.user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(searchButton).toHaveFocus()

    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    await app.user.type(await screen.findByRole('combobox', { name: 'Search screens and records' }), 'billing')
    const record = await screen.findByRole('option', { name: /Billing: notes/ })
    // Screens come first; move down to the record and open it with Enter.
    while (record.getAttribute('aria-selected') !== 'true') await app.user.keyboard('{ArrowDown}')
    await app.user.keyboard('{Enter}')
    expect(await screen.findByRole('heading', { name: 'Billing: notes' })).toBeInTheDocument()
    expect(app.history.location.pathname).toBe('/posts/billing-notes')
  })

  it('does not search resources the user may not list', async () => {
    const app = renderApp({ path: '/', role: 'editor' })
    await screen.findByRole('heading', { name: 'Dashboard' })
    await app.user.click(screen.getByRole('button', { name: /Search/ }))
    await app.user.type(screen.getByRole('combobox', { name: 'Search screens and records' }), 'asha')
    await screen.findByText(/Nothing matches/)
    expect(app.requests.some((request) => request.url.pathname === '/api/users')).toBe(false)
  })
})

describe('theme', () => {
  it('switches to dark and back, and remembers the choice', async () => {
    const app = renderApp({ path: '/' })
    await screen.findByRole('heading', { name: 'Dashboard' })
    const dark = screen.getByRole('button', { name: 'Dark theme' })
    await app.user.click(dark)
    expect(document.documentElement).toHaveClass('dark')
    expect(dark).toHaveAttribute('aria-pressed', 'true')
    expect(window.localStorage.getItem('strutvane.theme')).toBe('dark')

    await app.user.click(screen.getByRole('button', { name: 'Light theme' }))
    expect(document.documentElement).not.toHaveClass('dark')
  })

  it('still works when storage is blocked (private windows throw)', async () => {
    const original = Object.getOwnPropertyDescriptor(window, 'localStorage')
    Object.defineProperty(window, 'localStorage', { configurable: true, get: () => { throw new Error('blocked') } })
    try {
      const app = renderApp({ path: '/' })
      await screen.findByRole('heading', { name: 'Dashboard' })
      await act(() => app.user.click(screen.getByRole('button', { name: 'Dark theme' })))
      expect(document.documentElement).toHaveClass('dark')
    } finally {
      if (original !== undefined) Object.defineProperty(window, 'localStorage', original)
    }
  })
})

describe('responsive layout', () => {
  it('offers a menu button for small screens that opens and closes the sidebar drawer', async () => {
    const app = renderApp({ path: '/' })
    await app.user.click(await screen.findByRole('button', { name: 'Open menu' }))
    const close = screen.getByRole('button', { name: 'Close menu' })
    expect(close.closest('aside')).toHaveClass('translate-x-0')
    await app.user.click(close)
    expect(close.closest('aside')).toHaveClass('-translate-x-full')
  })
})
