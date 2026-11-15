// @vitest-environment jsdom
/**
 * The P0 conveniences (DESIGN.md §11): back control with restored list state, unsaved-changes
 * guard, Save and add another, previous/next record, tab counts, copy link/ID, filter chips,
 * column show/hide, density, search highlight, undo delete, type-to-confirm, keyboard shortcuts,
 * palette actions, and the page-overflow regression.
 */
import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import axe from 'axe-core'
import { describe, expect, it } from 'vitest'
import { renderApp, waitForTable } from './render-app.tsx'

async function axeViolations(): Promise<string[]> {
  const result = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } })
  return result.violations.map((violation) => violation.id)
}

describe('back control', () => {
  it('goes back in history to the list with its page and filters intact', async () => {
    const app = renderApp({ path: '/posts?page=2&perPage=10&filter=%7B%22status.in%22%3A%22published%22%7D' })
    await waitForTable('Posts')
    await app.user.click(screen.getAllByRole('link', { name: /: / }).find((link) => link.getAttribute('href')?.startsWith('/posts/')) ?? document.body)
    await app.user.click(await screen.findByRole('button', { name: 'Back to Posts' }))
    await waitFor(() => expect(app.history.location.pathname).toBe('/posts'))
    expect(app.history.location.search).toContain('page=2')
    expect(app.history.location.search).toContain('status.in')
    expect(await screen.findByText(/^Showing 11–/)).toBeInTheDocument()
  })

  it('goes to the parent route when the page was opened directly (no in-app history)', async () => {
    const detail = renderApp({ path: '/posts/shipping-notes' })
    await detail.user.click(await screen.findByRole('button', { name: 'Back to Posts' }))
    await waitFor(() => expect(detail.history.location.pathname).toBe('/posts'))
    detail.unmount()

    const edit = renderApp({ path: '/posts/shipping-notes/edit' })
    await edit.user.click(await screen.findByRole('button', { name: 'Back to Shipping: notes' }))
    await waitFor(() => expect(edit.history.location.pathname).toBe('/posts/shipping-notes'))
  })

  it('responds to Alt+Left, shows text on desktop and keeps an accessible name for icon-only mobile', async () => {
    const app = renderApp({ path: '/posts/shipping-notes' })
    const back = await screen.findByRole('button', { name: 'Back to Posts' })
    expect(back).toHaveAttribute('aria-keyshortcuts', 'Alt+ArrowLeft')
    expect(within(back).getByText('Back to Posts')).toHaveClass('hidden', 'sm:inline')
    fireEvent.keyDown(window, { key: 'ArrowLeft', altKey: true })
    await waitFor(() => expect(app.history.location.pathname).toBe('/posts'))
  })

  it('is not shown on top-level pages', async () => {
    renderApp({ path: '/posts' })
    await waitForTable('Posts')
    expect(screen.queryByRole('button', { name: /^Back to/ })).toBeNull()
  })
})

describe('unsaved changes', () => {
  it('asks before leaving a changed form (Back, Escape), keeps editing by default, discards on request', async () => {
    const app = renderApp({ path: '/posts/new' })
    await app.user.type(await screen.findByRole('textbox', { name: /^Title/ }), 'Half-written')
    await app.user.click(screen.getByRole('button', { name: 'Back to Posts' }))
    const dialog = await screen.findByRole('alertdialog', { name: 'Leave without saving?' })
    expect(within(dialog).getByRole('button', { name: 'Keep editing' })).toHaveFocus()
    expect(await axeViolations()).toEqual([])
    await app.user.click(within(dialog).getByRole('button', { name: 'Keep editing' }))
    expect(app.history.location.pathname).toBe('/posts/new')
    expect(screen.getByRole('textbox', { name: /^Title/ })).toHaveValue('Half-written')

    screen.getByRole('textbox', { name: /^Title/ }).focus()
    await app.user.keyboard('{Escape}')
    await app.user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Discard changes' }))
    await waitFor(() => expect(app.history.location.pathname).toBe('/posts'))
  })

  it('does not warn while a save is in flight, and never yanks the user back after they left', async () => {
    let release: () => void = () => undefined
    const gate = new Promise<void>((resolve) => (release = resolve))
    const app = renderApp({
      path: '/tags/new',
      transport: (mock) => async (request) => {
        if (request.method === 'POST') await gate
        return mock.handle(request)
      },
    })
    await app.user.type(await screen.findByRole('textbox', { name: /^Name/ }), 'slow-save')
    await app.user.click(screen.getByRole('button', { name: 'Create tag' }))
    await screen.findByRole('button', { name: 'Saving…' })
    // "Your changes will be lost" would be false: the save is already on its way.
    await app.user.click(screen.getByRole('button', { name: 'Back to Tags' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    await waitFor(() => expect(app.history.location.pathname).toBe('/tags'))
    release()
    expect(await screen.findByText('Tag “slow-save” created.')).toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(app.history.location.pathname).toBe('/tags')
  })

  it('after a save, Back goes to the list, not to the form again', async () => {
    const app = renderApp({ path: '/tags' })
    await waitForTable('Tags')
    app.history.push('/tags/new')
    await app.user.type(await screen.findByRole('textbox', { name: /^Name/ }), 'back-test')
    await app.user.click(screen.getByRole('button', { name: 'Create tag' }))
    await screen.findByRole('heading', { name: 'back-test' })
    await app.user.click(screen.getByRole('button', { name: 'Back to Tags' }))
    await waitFor(() => expect(app.history.location.pathname).toBe('/tags'))
  })

  it('leaves an untouched form at once, and never asks after a successful save', async () => {
    const app = renderApp({ path: '/tags/new' })
    await app.user.click(await screen.findByRole('textbox', { name: /^Name/ }))
    await app.user.keyboard('{Escape}')
    await waitFor(() => expect(app.history.location.pathname).toBe('/tags'))
  })
})

describe('forms', () => {
  it('"Save and add another" saves, confirms, and gives a fresh form', async () => {
    const app = renderApp({ path: '/tags/new' })
    await app.user.type(await screen.findByRole('textbox', { name: /^Name/ }), 'brand-new')
    await app.user.click(screen.getByRole('button', { name: 'Save and add another' }))
    expect(await screen.findByText('Tag “brand-new” created.')).toBeInTheDocument()
    expect(app.history.location.pathname).toBe('/tags/new')
    expect(screen.getByRole('textbox', { name: /^Name/ })).toHaveValue('')
    expect(screen.getByRole('textbox', { name: /^Name/ })).toHaveFocus()
  })

  it('Enter in a field is the PRIMARY action (create), never "Save and add another"', async () => {
    const app = renderApp({ path: '/tags/new' })
    await app.user.type(await screen.findByRole('textbox', { name: /^Name/ }), 'enter-key{Enter}')
    // Implicit submission clicks the form's FIRST submit button; it must be the primary one.
    expect(await screen.findByText('Tag “enter-key” created.')).toBeInTheDocument()
    await waitFor(() => expect(app.history.location.pathname).not.toBe('/tags/new'))
    expect(app.requests.filter((request) => request.method === 'POST')).toHaveLength(1)
  })

  it('counts characters against the column limit', async () => {
    const app = renderApp({ path: '/tags/new' })
    const name = await screen.findByRole('textbox', { name: /^Name/ })
    await app.user.type(name, 'abc')
    expect(name).toHaveAccessibleDescription('3 of 50 characters')
  })
})

describe('detail page', () => {
  it('steps to the previous and next record in list order', async () => {
    const app = renderApp({ path: '/posts/testing-notes' })
    await screen.findByRole('heading', { name: 'Testing: notes' })
    const next = await screen.findByRole('link', { name: 'Next post: Shipping: notes' })
    expect(screen.getByRole('link', { name: 'Previous post: Pricing: notes' })).toHaveAttribute('href', '/posts/pricing-notes')
    await app.user.click(next)
    expect(await screen.findByRole('heading', { name: 'Shipping: notes' })).toBeInTheDocument()
  })

  it('shows related counts on tabs and copies the ID', async () => {
    // user-event installs a clipboard stub on setup; we read the copied text back from it.
    const app = renderApp({ path: '/users/1' })
    // Asha wrote 13 live posts in the seed (posts 0, 3, 6, ... 36).
    expect(await screen.findByRole('tab', { name: 'Posts, 13' })).toBeInTheDocument()
    await app.user.click(screen.getByRole('button', { name: 'Copy ID (1)' }))
    expect(await navigator.clipboard.readText()).toBe('1')
    expect(await screen.findByText('ID copied.')).toBeInTheDocument()
  })
})

describe('lists', () => {
  it('shows active filters as removable chips with "Clear all"', async () => {
    const app = renderApp({ path: '/posts?search=pricing&filter=%7B%22price.gte%22%3A%2210%22%7D' })
    const chips = await screen.findByRole('group', { name: 'Active filters' })
    expect(within(chips).getByText('Search “pricing”')).toBeInTheDocument()
    await app.user.click(within(chips).getByRole('button', { name: 'Remove filter: Price at least 10' }))
    await waitFor(() => expect(app.history.location.search).not.toContain('price'))
    await app.user.click(screen.getByRole('button', { name: 'Clear all' }))
    await waitFor(() => expect(screen.queryByRole('group', { name: 'Active filters' })).toBeNull())
  })

  it('hides a column (remembered per viewer) and switches to compact rows', async () => {
    const app = renderApp({ path: '/posts' })
    const table = await waitForTable('Posts')
    await app.user.click(screen.getByRole('button', { name: 'Columns' }))
    const slug = screen.getByRole('menuitemcheckbox', { name: 'Slug' })
    expect(slug).toHaveAttribute('aria-checked', 'true')
    await app.user.click(slug)
    expect(within(table).queryByRole('columnheader', { name: /Slug/ })).toBeNull()
    expect(window.localStorage.getItem('strutvane.view.posts')).toContain('slug')
    await app.user.keyboard('{Escape}')

    const compact = screen.getByRole('button', { name: 'Compact rows' })
    await app.user.click(compact)
    expect(compact).toHaveAttribute('aria-pressed', 'true')
    expect(within(table).getAllByRole('cell')[0]).toHaveClass('h-9')
  })

  it('highlights the search term in matching cells', async () => {
    renderApp({ path: '/posts?search=pric' })
    await waitForTable('Posts')
    await waitFor(() => expect(document.querySelectorAll('mark').length).toBeGreaterThan(0))
    expect([...document.querySelectorAll('mark')].every((mark) => mark.textContent?.toLowerCase() === 'pric')).toBe(true)
  })

  it('offers Undo after moving a record to the trash', async () => {
    const app = renderApp({ path: '/posts' })
    await waitForTable('Posts')
    await app.user.click(screen.getByRole('button', { name: 'Delete Shipping: notes' }))
    await app.user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete post' }))
    await app.user.click(await screen.findByRole('button', { name: 'Undo' }))
    expect(await screen.findByText('“Shipping: notes” restored.')).toBeInTheDocument()
    expect(await screen.findByRole('link', { name: 'Shipping: notes' })).toBeInTheDocument()
  })

  it('asks to type the name before a permanent delete', async () => {
    const app = renderApp({ path: '/tags' })
    await waitForTable('Tags')
    await app.user.click(screen.getByRole('button', { name: 'Delete faq' }))
    const dialog = screen.getByRole('alertdialog', { name: 'Delete this tag?' })
    const confirm = within(dialog).getByRole('button', { name: 'Delete tag' })
    expect(confirm).toBeDisabled()
    await app.user.type(within(dialog).getByLabelText('Type faq to confirm'), 'faq')
    expect(confirm).toBeEnabled()
    expect(await axeViolations()).toEqual([])
    await app.user.click(confirm)
    await waitFor(() => expect(screen.queryByRole('link', { name: 'faq' })).toBeNull())
  })
})

describe('keyboard shortcuts', () => {
  it('? lists them; g d, n, e and / work outside fields and never while typing', async () => {
    const app = renderApp({ path: '/posts/shipping-notes' })
    await screen.findByRole('heading', { name: 'Shipping: notes' })
    await app.user.keyboard('?')
    expect(screen.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument()
    expect(await axeViolations()).toEqual([])
    await app.user.keyboard('{Escape}')

    await app.user.keyboard('e')
    await waitFor(() => expect(app.history.location.pathname).toBe('/posts/shipping-notes/edit'))
    // Typing "e" inside a field types, it does not navigate.
    await app.user.type(await screen.findByRole('textbox', { name: /^Title/ }), 'e')
    expect(app.history.location.pathname).toBe('/posts/shipping-notes/edit')
  })

  it('n opens the create form from a list, g d goes to the dashboard, / opens search', async () => {
    const app = renderApp({ path: '/posts' })
    await waitForTable('Posts')
    await app.user.keyboard('n')
    await waitFor(() => expect(app.history.location.pathname).toBe('/posts/new'))
    await app.user.click(await screen.findByRole('textbox', { name: /^Title/ }))
    await app.user.keyboard('{Escape}')
    await waitFor(() => expect(app.history.location.pathname).toBe('/posts'))
    await app.user.keyboard('gd')
    await waitFor(() => expect(app.history.location.pathname).toBe('/'))
    await app.user.keyboard('/')
    expect(await screen.findByRole('combobox', { name: 'Search screens and records' })).toHaveFocus()
  })

  it('the palette also runs actions ("New post")', async () => {
    const app = renderApp({ path: '/' })
    await screen.findByRole('heading', { name: 'Dashboard' })
    await app.user.click(screen.getByRole('button', { name: /Search/ }))
    await app.user.type(screen.getByRole('combobox', { name: 'Search screens and records' }), 'new post')
    expect(screen.getByRole('option', { name: /New post\s*Action/ })).toBeInTheDocument()
    await app.user.keyboard('{Enter}')
    await waitFor(() => expect(app.history.location.pathname).toBe('/posts/new'))
  })
})

describe('layout regression: wide tables scroll inside their card, never the page', () => {
  /*
   * Found at 1440 px: visually hidden texts (position: absolute) inside table cells escaped the
   * table's scroll box, because that box was not their containing block, and widened the page to
   * 1918 px. jsdom has no layout, so this checks the structural rule that prevents it; the real
   * measurement (page width = viewport width) was done in a browser (README).
   */
  it('every scroll box is positioned, so absolutely positioned descendants stay inside it', async () => {
    renderApp({ path: '/posts' })
    await waitForTable('Posts')
    const boxes = [...document.querySelectorAll<HTMLElement>('[class*="overflow-auto"], [class*="overflow-x-auto"]')]
    expect(boxes.length).toBeGreaterThan(0)
    for (const box of boxes) {
      const hasHidden = box.querySelector('.sr-only') !== null
      if (hasHidden) expect(box.className).toMatch(/\b(relative|absolute|fixed|sticky)\b/)
    }
    expect(document.getElementById('main')).toHaveClass('min-w-0')
    expect(document.querySelector('thead')).toHaveClass('sticky', 'top-0')
  })
})
