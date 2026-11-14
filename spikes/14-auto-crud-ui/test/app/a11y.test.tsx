// @vitest-environment jsdom
/**
 * axe-core on every generated screen (sign-in, dashboard, list with filters open, create, edit,
 * detail with a relation tab, the delete dialog, the search palette), plus the skip link.
 *
 * jsdom has no layout, so `color-contrast` is checked in a real browser instead (the README's
 * manual check); every other axe rule runs here.
 */
import { screen, waitFor } from '@testing-library/react'
import axe from 'axe-core'
import { describe, expect, it } from 'vitest'
import { renderApp, waitForTable } from './render-app.tsx'

/** Run axe on the whole document and return "rule: element" lines, empty when clean. */
async function violations(): Promise<string[]> {
  const result = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } })
  return result.violations.flatMap((violation) => violation.nodes.map((node) => `${violation.id}: ${node.html.slice(0, 120)}`))
}

describe('axe: no violations on any generated screen', () => {
  it('sign-in', async () => {
    renderApp({ path: '/sign-in', role: null })
    await screen.findByRole('heading', { name: 'Sign in' })
    expect(await violations()).toEqual([])
  })

  it('dashboard with the welcome checklist', async () => {
    renderApp({ path: '/' })
    await screen.findByRole('heading', { name: 'Welcome! Your admin is ready.' })
    expect(await violations()).toEqual([])
  })

  it('list with filters open', async () => {
    const app = renderApp({ path: '/posts' })
    await waitForTable('Posts')
    await app.user.click(screen.getByRole('button', { name: 'Filters' }))
    expect(await violations()).toEqual([])
  })

  it('empty list', async () => {
    renderApp({ path: '/tags', seed: false })
    await screen.findByText('No tags yet')
    expect(await violations()).toEqual([])
  })

  it('create form with errors shown', async () => {
    const app = renderApp({ path: '/posts/new' })
    await screen.findByRole('heading', { name: 'New post' })
    await app.user.click(screen.getByRole('button', { name: 'Create post' }))
    await screen.findByText('Title is required.')
    expect(await violations()).toEqual([])
  })

  it('edit form', async () => {
    renderApp({ path: '/posts/shipping-notes/edit' })
    await screen.findByRole('heading', { name: 'Edit Shipping: notes' })
    expect(await violations()).toEqual([])
  })

  it('detail page with a relation tab open', async () => {
    renderApp({ path: '/users/1?tab=posts' })
    await screen.findByRole('table', { name: 'Posts' })
    expect(await violations()).toEqual([])
  })

  it('delete confirmation dialog', async () => {
    const app = renderApp({ path: '/posts/shipping-notes' })
    await screen.findByRole('heading', { name: 'Shipping: notes' })
    await app.user.click(screen.getByRole('button', { name: 'Delete' }))
    await screen.findByRole('alertdialog')
    expect(await violations()).toEqual([])
  })

  it('search palette with results', async () => {
    const app = renderApp({ path: '/' })
    await screen.findByRole('heading', { name: 'Dashboard' })
    await app.user.click(screen.getByRole('button', { name: /Search/ }))
    await app.user.type(screen.getByRole('combobox', { name: 'Search screens and records' }), 'billing')
    await screen.findByRole('option', { name: /Billing: notes/ })
    expect(await violations()).toEqual([])
  })
})

describe('keyboard basics', () => {
  it('the first Tab reaches "Skip to content", which targets the main region', async () => {
    const app = renderApp({ path: '/posts' })
    await waitForTable('Posts')
    await app.user.tab()
    const skip = screen.getByRole('link', { name: 'Skip to content' })
    expect(skip).toHaveFocus()
    expect(skip).toHaveAttribute('href', '#main')
    expect(document.getElementById('main')?.tagName).toBe('MAIN')
  })

  it('every form control has a label (by name lookup, the way a screen reader finds it)', async () => {
    renderApp({ path: '/posts/new' })
    await screen.findByRole('heading', { name: 'New post' })
    await waitFor(() => {
      for (const control of document.querySelectorAll('form input, form select, form textarea, form [role="switch"]')) {
        expect(control.id).not.toBe('')
        expect(document.querySelector(`label[for="${CSS.escape(control.id)}"]`)).not.toBeNull()
      }
    })
  })
})
