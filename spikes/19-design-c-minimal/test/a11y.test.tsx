// @vitest-environment jsdom
/**
 * axe-core: 0 violations on the dashboard, the invoice list and the invoice form (plus their most
 * interactive states), in both themes.
 *
 * jsdom has no layout, so `color-contrast` cannot run here; contrast is proven from the token
 * file instead (`contrast.test.ts`) and was spot-checked in a real browser (README).
 */
import { screen } from '@testing-library/react'
import axe from 'axe-core'
import { describe, expect, it } from 'vitest'
import { renderAt } from './render.tsx'

/** Run axe on the whole document; returns "rule: element" lines, empty when clean. */
async function violations(): Promise<string[]> {
  const result = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } })
  return result.violations.flatMap((violation) => violation.nodes.map((node) => `${violation.id}: ${node.html.slice(0, 140)}`))
}

describe.each(['light', 'dark'] as const)('axe in the %s theme', (theme) => {
  it('dashboard', async () => {
    renderAt('/', theme)
    await screen.findByRole('heading', { level: 1, name: 'Good morning, Maya' })
    expect(await violations()).toEqual([])
  })

  it('invoice list', async () => {
    renderAt('/invoices', theme)
    await screen.findByRole('row', { name: /INV-2278/ })
    expect(await violations()).toEqual([])
  })

  it('invoice form', async () => {
    renderAt('/invoices/new', theme)
    await screen.findByRole('heading', { level: 1, name: 'New invoice' })
    expect(await violations()).toEqual([])
  })
})

describe('axe on interactive states', () => {
  it('list with the filters popover open and a row selected', async () => {
    const { user } = renderAt('/invoices?status=open')
    await screen.findByRole('row', { name: /INV-2278/ })
    await user.click(screen.getByRole('checkbox', { name: 'Select INV-2278' }))
    await user.click(screen.getByRole('button', { name: /Filters/ }))
    await screen.findByRole('dialog', { name: 'Filters' })
    expect(screen.getByRole('toolbar', { name: 'Bulk actions' })).toBeInTheDocument()
    expect(await violations()).toEqual([])
  })

  it('form after a failed submit (inline errors and the summary)', async () => {
    const { user } = renderAt('/invoices/new')
    await user.click(await screen.findByRole('button', { name: 'Create invoice' }))
    await screen.findByText('Choose the customer to bill.')
    expect(await violations()).toEqual([])
  })

  it('command palette open', async () => {
    const { user } = renderAt('/')
    await screen.findByRole('heading', { level: 1, name: 'Good morning, Maya' })
    await user.keyboard('{Control>}k{/Control}')
    await screen.findByRole('dialog', { name: 'Command palette' })
    expect(await violations()).toEqual([])
  })

  it('sign-in', async () => {
    renderAt('/sign-in')
    await screen.findByRole('heading', { level: 1, name: 'Sign in to Strutvane' })
    expect(await violations()).toEqual([])
  })
})
