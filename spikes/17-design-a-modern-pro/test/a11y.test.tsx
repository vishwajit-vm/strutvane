/**
 * axe-core on the three densest screens (dashboard, list, form) in both themes, plus the states
 * that matter (list with rows selected, form after a failed submit). Expect 0 violations.
 *
 * `color-contrast` is off here only because jsdom has no layout or computed colours; contrast is
 * proven separately and exactly by test/contrast.test.ts from the tokens themselves.
 */
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import axe from 'axe-core'
import { describe, expect, it } from 'vitest'
import { renderAt } from './render-app.tsx'

async function violations(): Promise<string[]> {
  const result = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false } } })
  return result.violations.flatMap((violation) => violation.nodes.map((node) => `${violation.id}: ${node.target.join(' ')}`))
}

describe.each(['light', 'dark'] as const)('axe, %s theme', (theme) => {
  it('dashboard has no violations', async () => {
    renderAt('/dashboard', theme)
    await screen.findByRole('heading', { level: 1, name: 'Dashboard' })
    expect(await violations()).toEqual([])
  })

  it('invoice list has no violations, also with rows selected', async () => {
    renderAt('/invoices', theme)
    await screen.findByRole('heading', { level: 1, name: /Invoices/ })
    const user = userEvent.setup()
    for (const box of screen.getAllByRole('checkbox', { name: /^Select INV-/ }).slice(0, 2)) await user.click(box)
    expect(screen.getByRole('region', { name: 'Bulk actions' })).toBeInTheDocument()
    expect(await violations()).toEqual([])
  })

  it('create form has no violations, also showing validation errors', async () => {
    renderAt('/invoices/new', theme)
    await screen.findByRole('heading', { level: 1, name: 'Create invoice' })
    expect(await violations()).toEqual([])
    await userEvent.setup().click(screen.getByRole('button', { name: /Save invoice/ }))
    expect(await screen.findByText('Choose who this invoice is for.')).toBeInTheDocument()
    expect(await violations()).toEqual([])
  })
})
