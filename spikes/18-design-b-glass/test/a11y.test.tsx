// @vitest-environment jsdom
/**
 * axe-core: 0 violations on the dashboard, the list, the form (with inline errors showing) and
 * the other main screens, in both themes.
 *
 * `color-contrast` is disabled here ONLY because jsdom has no layout or painting, so axe cannot
 * measure it; contrast is proven separately, from the tokens, over the worst-case backdrop
 * (test/contrast.test.ts). `region` is off because Radix portals render outside landmarks by
 * design (dialogs and menus are their own landmarks when open).
 */
import { screen } from '@testing-library/react'
import axe from 'axe-core'
import { describe, expect, it } from 'vitest'
import { renderAt } from './render.tsx'

async function violations(): Promise<string[]> {
  const result = await axe.run(document.body, { rules: { 'color-contrast': { enabled: false }, region: { enabled: false } } })
  return result.violations.map((violation) => `${violation.id}: ${violation.help} (${violation.nodes.map((node) => node.target.join(' ')).join(', ')})`)
}

const PAGES: readonly (readonly [name: string, path: string, ready: RegExp])[] = [
  ['dashboard', '/', /^dashboard$/i],
  ['invoice list', '/invoices', /^invoices/i],
  ['invoice form with errors', '/invoices/new?validate=1', /new invoice/i],
  ['invoice detail', '/invoices/1044', /inv-2026-1044/i],
  ['sign in', '/sign-in', /welcome back/i],
  ['team', '/team', /team members/i],
  ['settings: notifications', '/settings/notifications', /account settings/i],
  ['calendar', '/calendar', /calendar/i],
  ['board', '/board', /deals board/i],
]

describe.each(['light', 'dark'] as const)('%s theme', (theme) => {
  it.each(PAGES)('%s has no axe violations', async (_name, path, ready) => {
    renderAt(path, theme)
    await screen.findByRole('heading', { level: 1, name: ready })
    expect(await violations()).toEqual([])
  })
})

describe('states and overlays', () => {
  it('the form really shows inline errors when audited', async () => {
    renderAt('/invoices/new?validate=1')
    expect(await screen.findByText('Choose who this invoice is for.')).toBeInTheDocument()
    const invalid = document.querySelectorAll('[aria-invalid="true"]')
    expect(invalid.length).toBeGreaterThan(1)
    // Every invalid control points at its message.
    for (const control of invalid) expect(control.getAttribute('aria-describedby')).toMatch(/error/)
  })

  it('the open command palette has no violations', async () => {
    const { user } = renderAt('/')
    await screen.findByRole('heading', { level: 1, name: /dashboard/i })
    await user.keyboard('{Control>}k{/Control}')
    expect(await screen.findByRole('combobox', { name: /search pages/i })).toHaveFocus()
    expect(await violations()).toEqual([])
  })

  it('a list with selected rows and the bulk bar has no violations', async () => {
    const { user } = renderAt('/invoices')
    await user.click(await screen.findByRole('checkbox', { name: 'Select all rows on this page' }))
    expect(screen.getByRole('toolbar', { name: 'Bulk actions' })).toBeInTheDocument()
    expect(await violations()).toEqual([])
  })

  it('the skip link is the first tab stop and targets <main>', async () => {
    const { user } = renderAt('/')
    await screen.findByRole('heading', { level: 1, name: /dashboard/i })
    await user.tab()
    expect(document.activeElement).toHaveTextContent('Skip to content')
    expect(document.activeElement).toHaveAttribute('href', '#main')
    expect(document.getElementById('main')?.tagName).toBe('MAIN')
  })
})
