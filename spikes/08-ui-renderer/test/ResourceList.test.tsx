// ResourceList driven like a user would: assert what is shown AND which ListQuery reached the API.
import { screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { invoiceResource, withCapabilities } from '../src/manifest.fixture.ts'
import type { Cell } from '../src/registry.tsx'
import { ResourceList } from '../src/ResourceList.tsx'
import { axeViolations, renderWithUI, seededApi } from './helpers.tsx'

const lastQuery = (api: ReturnType<typeof seededApi>) => api.requests.filter((r) => r.path === 'invoices').at(-1)?.query

async function renderList(props: Partial<Parameters<typeof ResourceList>[0]> = {}, api = seededApi()) {
  const utils = renderWithUI(<ResourceList resource={invoiceResource} onCreate={() => {}} onEdit={() => {}} {...props} />, { api })
  await screen.findByText('Showing 25 invoices')
  return { ...utils, api, user: userEvent.setup() }
}

describe('ResourceList renders from the manifest', () => {
  test('caption, columns in ui.listColumns order, first page of rows, relation labels resolved', async () => {
    await renderList()
    const table = screen.getByRole('table', { name: 'Invoices' })
    const headers = within(table).getAllByRole('columnheader').map((h) => h.textContent?.replace(/[▲▼]/g, '').trim())
    expect(headers).toEqual(['Number', 'Customer', 'Amount', 'Status', 'Due date', 'Paid', 'Actions'])
    expect(within(table).getAllByRole('row')).toHaveLength(26) // header + 25 (default page size)
    await waitFor(() => expect(within(table).getAllByText('Acme GmbH').length).toBeGreaterThan(0)) // belongsTo id → title
    expect(within(table).getAllByText('Yes').length).toBeGreaterThan(0) // boolean cell
  })

  test('only sortable columns are sort buttons, with aria-sort', async () => {
    await renderList()
    expect(screen.getByRole('columnheader', { name: /Amount/ })).toHaveAttribute('aria-sort', 'none')
    expect(screen.getByRole('columnheader', { name: /Customer/ })).not.toHaveAttribute('aria-sort')
    expect(within(screen.getByRole('columnheader', { name: /Customer/ })).queryByRole('button')).toBeNull()
  })
})

describe('ResourceList → ListQuery', () => {
  test('clicking a header sorts server-side: asc, then desc; aria-sort follows', async () => {
    const { api, user } = await renderList()
    await user.click(screen.getByRole('button', { name: /Amount/ }))
    await waitFor(() => expect(lastQuery(api)?.sort).toEqual([{ field: 'amount', direction: 'asc' }]))
    expect(screen.getByRole('columnheader', { name: /Amount/ })).toHaveAttribute('aria-sort', 'ascending')
    await user.click(screen.getByRole('button', { name: /Amount/ }))
    await waitFor(() => expect(lastQuery(api)?.sort).toEqual([{ field: 'amount', direction: 'desc' }]))
    expect(screen.getByRole('columnheader', { name: /Amount/ })).toHaveAttribute('aria-sort', 'descending')
  })

  test('a filter chip becomes a QueryFilter; removing it removes the filter', async () => {
    const { api, user } = await renderList()
    await user.selectOptions(screen.getByLabelText('Filter field'), 'status')
    await user.selectOptions(screen.getByLabelText('Operator'), 'in')
    await user.type(screen.getByLabelText('Value'), 'draft, sent')
    await user.click(screen.getByRole('button', { name: 'Add filter' }))
    await waitFor(() => expect(lastQuery(api)?.filter).toEqual({ op: 'in', field: 'status', values: ['draft', 'sent'] }))
    expect(screen.getByRole('list', { name: 'Active filters' })).toHaveTextContent('Status is any of draft, sent')
    expect(screen.getByText('Showing 20 invoices')).toBeInTheDocument() // 30 seeded, 10 are "paid"

    await user.click(screen.getByRole('button', { name: 'Remove filter: Status is any of draft, sent' }))
    await waitFor(() => expect(lastQuery(api)?.filter).toBeUndefined())
  })

  test('an invalid filter value is refused in the UI and never sent', async () => {
    const { api, user } = await renderList()
    const before = api.requests.length
    await user.selectOptions(screen.getByLabelText('Filter field'), 'amount')
    await user.type(screen.getByLabelText('Value'), 'abc')
    await user.click(screen.getByRole('button', { name: 'Add filter' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter a valid value for Amount.')
    expect(api.requests.length).toBe(before)
  })

  test('search goes to the server', async () => {
    const { api, user } = await renderList()
    await user.type(screen.getByLabelText('Search Invoices'), 'INV-1029')
    await waitFor(() => expect(lastQuery(api)?.search).toBe('INV-1029'))
    await screen.findByText('Showing 1 invoices')
  })

  test('cursor pagination: Next sends the cursor, Previous returns to page 1', async () => {
    const { api, user } = await renderList()
    expect(screen.getByRole('button', { name: 'Previous page' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Next page' }))
    await waitFor(() => expect(lastQuery(api)?.page).toMatchObject({ kind: 'cursor', size: 25, cursor: expect.any(String) }))
    await screen.findByText('Showing 5 invoices')
    expect(screen.getByRole('button', { name: 'Next page' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Previous page' }))
    await waitFor(() => expect(lastQuery(api)?.page).toEqual({ kind: 'cursor', size: 25 }))
  })

  test('list state is reported as a URL search string for the router', async () => {
    const onSearchStringChange = vi.fn()
    const { user } = await renderList({ onSearchStringChange })
    await user.click(screen.getByRole('button', { name: /Due date/ }))
    await waitFor(() => expect(onSearchStringChange).toHaveBeenLastCalledWith('sort=dueDate'))
  })

  test('initial URL state is applied on first load (deep links work)', async () => {
    const api = seededApi()
    renderWithUI(<ResourceList resource={invoiceResource} initialSearch="filter%5Bstatus%5D%5Beq%5D=paid&sort=-amount" />, { api })
    await screen.findByText('Showing 10 invoices')
    expect(lastQuery(api)).toMatchObject({ filter: { op: 'eq', field: 'status', value: 'paid' }, sort: [{ field: 'amount', direction: 'desc' }] })
  })
})

describe('capabilities and overrides', () => {
  test('no create/update capability → no New or Edit buttons', async () => {
    await renderList({ resource: withCapabilities(invoiceResource, { create: false, update: false }) })
    expect(screen.queryByRole('button', { name: /New invoice/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Edit / })).toBeNull()
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).toBeNull()
  })

  test('with capabilities → New and one Edit per row, labelled by the record title', async () => {
    await renderList()
    expect(screen.getByRole('button', { name: 'New invoice' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit INV-1000' })).toBeInTheDocument()
  })

  test('a per-column cell override replaces only that column, without forking the renderer', async () => {
    const MoneyCell: Cell = ({ value }) => <span data-testid="money">€{String(value)}</span>
    renderWithUI(<ResourceList resource={invoiceResource} />, { overrides: { fieldCells: { 'Invoice.amount': MoneyCell } } })
    await screen.findByText('Showing 25 invoices')
    expect(screen.getAllByTestId('money')).toHaveLength(25)
    expect(screen.getAllByTestId('money')[1]).toHaveTextContent('€37')
  })
})

describe('accessibility', () => {
  test('axe: no violations on the loaded list (color-contrast needs a real browser)', async () => {
    const { container } = await renderList()
    await waitFor(() => expect(screen.getAllByText('Acme GmbH').length).toBeGreaterThan(0))
    expect(await axeViolations(container)).toEqual([])
  })
})
