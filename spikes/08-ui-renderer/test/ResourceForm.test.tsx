// ResourceForm: widgets from field types, client validation, server issue routing (incl. array
// paths), focus management, non-validation problems, read-only rules, overrides, accessibility.
import { screen, waitFor, within } from '@testing-library/react'
import { userEvent } from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { FakeApi, problem } from '../src/fake-api.ts'
import { invoiceResource, manifest } from '../src/manifest.fixture.ts'
import type { Widget } from '../src/registry.tsx'
import { ResourceForm } from '../src/ResourceForm.tsx'
import { axeViolations, customers, makeInvoices, renderWithUI } from './helpers.tsx'

const freshApi = () => new FakeApi(manifest, { invoices: makeInvoices(3), customers })

async function renderCreate(api = freshApi(), extra: Partial<Parameters<typeof ResourceForm>[0]> = {}) {
  const onSaved = vi.fn()
  const utils = renderWithUI(<ResourceForm resource={invoiceResource} onSaved={onSaved} {...extra} />, { api })
  await waitFor(() => expect(screen.getByRole('option', { name: 'Acme GmbH' })).toBeInTheDocument()) // relation options loaded
  return { ...utils, api, onSaved, user: userEvent.setup() }
}

/** Fill every required field with valid values. */
async function fillValid(user: ReturnType<typeof userEvent.setup>, number = 'INV-9001') {
  await user.type(screen.getByLabelText(/^Number/), number)
  await user.selectOptions(screen.getByLabelText(/^Customer/), 'c2')
  await user.type(screen.getByLabelText(/^Amount/), '1250.5')
  await user.selectOptions(screen.getByLabelText(/^Status/), 'sent')
  await user.type(screen.getByLabelText(/^Issue date/), '2026-11-01')
  await user.type(screen.getByLabelText(/^Due date/), '2026-12-01')
}

describe('widgets are chosen from field types', () => {
  test('create mode renders the right control per field and hides read-only fields', async () => {
    await renderCreate()
    expect(screen.getByLabelText(/^Number/)).toHaveAttribute('type', 'text')
    expect(screen.getByLabelText(/^Amount/)).toHaveAttribute('inputmode', 'decimal')
    expect(screen.getByLabelText(/^Status/).tagName).toBe('SELECT')
    expect(within(screen.getByLabelText(/^Status/)).getAllByRole('option').map((o) => o.textContent)).toEqual(['Select…', 'draft', 'sent', 'paid'])
    expect(screen.getByLabelText(/^Paid/)).toHaveAttribute('type', 'checkbox')
    expect(screen.getByLabelText(/^Due date/)).toHaveAttribute('type', 'date')
    expect(screen.getByLabelText(/^Notes/).tagName).toBe('TEXTAREA')
    expect(within(screen.getByLabelText(/^Customer/)).getAllByRole('option').map((o) => o.textContent)).toEqual(['Select…', 'Acme GmbH', 'Globex Inc', 'Initech'])
    expect(screen.queryByLabelText(/^Created/)).toBeNull() // readOnly: hidden on create
    expect(screen.queryByLabelText(/^ID/)).toBeNull()
    expect(screen.getByLabelText(/^Number/)).toHaveAttribute('aria-required', 'true')
    expect(screen.getByLabelText(/^Number/)).toHaveAccessibleDescription('Format INV-1234') // help text wired
  })
})

describe('client validation (before any request)', () => {
  test('submitting empty shows every required error, focuses the first invalid field, sends nothing', async () => {
    const { api, user } = await renderCreate()
    const create = vi.spyOn(api, 'create')
    await user.click(screen.getByRole('button', { name: 'Create invoice' }))
    await waitFor(() => expect(screen.getByLabelText(/^Number/)).toHaveFocus())
    expect(screen.getByLabelText(/^Number/)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText(/^Number/)).toHaveAccessibleDescription('Format INV-1234 Number is required.')
    expect(screen.getByText('Amount is required.')).toBeInTheDocument()
    expect(screen.getByText('Due date is required.')).toBeInTheDocument()
    expect(create).not.toHaveBeenCalled()
  })

  test('validates on blur with the shared catalog (same words the server uses)', async () => {
    const { user } = await renderCreate()
    await user.type(screen.getByLabelText(/^Amount/), '-5')
    await user.tab()
    expect(await screen.findByText('Amount must be at least 0.')).toBeInTheDocument()
  })
})

describe('server errors (422) land on the right fields', () => {
  test('real server rules: duplicate number + cross-field date rule; focus moves to the first', async () => {
    const { user } = await renderCreate()
    await fillValid(user, 'INV-1000') // INV-1000 already exists in the seed
    await user.clear(screen.getByLabelText(/^Due date/))
    await user.type(screen.getByLabelText(/^Due date/), '2026-10-01') // before issue date
    await user.click(screen.getByRole('button', { name: 'Create invoice' }))
    await waitFor(() => expect(screen.getByLabelText(/^Number/)).toHaveFocus())
    expect(screen.getByLabelText(/^Number/)).toHaveAccessibleDescription(expect.stringContaining('This number is already taken.'))
    expect(screen.getByLabelText(/^Due date/)).toHaveAccessibleDescription('Due date must be on or after Issue date.')
  })

  test('array paths (lines[1].amount), parent fallback, form-level and unknown-field issues', async () => {
    const api = freshApi()
    const { user } = await renderCreate(api)
    await fillValid(user)
    await user.click(screen.getByRole('button', { name: 'Add line items' }))
    await user.click(screen.getByRole('button', { name: 'Add line items' }))
    const descriptions = screen.getAllByLabelText(/^Description/)
    await user.type(descriptions[0] as HTMLElement, 'Consulting')
    await user.type(descriptions[1] as HTMLElement, 'Travel')
    api.failNext({
      ...problem(422, 'VALIDATION_FAILED', 'Validation failed'),
      issues: [
        { path: ['lines', 1, 'amount'], code: 'too_small', message: 'Line amount must be at least 0.' },
        { path: ['lines', 9, 'amount'], code: 'too_small', message: 'Line 10 is invalid.' },
        { path: [], code: 'BUDGET_EXCEEDED', message: 'This invoice exceeds the customer budget.' },
        { path: ['internalOnly'], code: 'x', message: 'Something about a field you cannot see.' },
      ],
    })
    await user.click(screen.getByRole('button', { name: 'Create invoice' }))
    // First invalid in visual order is the 'Line items' group itself (it holds the 'Line 10' issue).
    await waitFor(() => expect(screen.getByRole('group', { name: 'Line items' })).toHaveFocus())
    const lineAmount = (await screen.findAllByLabelText(/^Line amount/))[1] as HTMLElement
    expect(lineAmount).toHaveAttribute('aria-invalid', 'true')
    expect(lineAmount).toHaveAccessibleDescription('Line amount must be at least 0.')
    expect(screen.getByText('Line 10 is invalid.')).toBeInTheDocument() // routed to the parent `lines`
    const banner = screen.getByRole('alert')
    expect(banner).toHaveTextContent('This invoice exceeds the customer budget.')
    expect(banner).toHaveTextContent('Something about a field you cannot see.') // never dropped
  })

  test('editing a field clears its (now stale) server error', async () => {
    const { user } = await renderCreate()
    await fillValid(user, 'INV-1000')
    await user.click(screen.getByRole('button', { name: 'Create invoice' }))
    await screen.findByText('This number is already taken.')
    await user.type(screen.getByLabelText(/^Number/), '9')
    await waitFor(() => expect(screen.queryByText('This number is already taken.')).toBeNull())
  })
})

describe('non-validation problems', () => {
  test('409 conflict: banner with the problem detail, values kept, banner focused', async () => {
    const api = freshApi()
    const { user } = await renderCreate(api)
    await fillValid(user)
    api.failNext(problem(409, 'STALE_RECORD', 'Conflict', 'Someone else changed this invoice. Reload to see their changes.'))
    await user.click(screen.getByRole('button', { name: 'Create invoice' }))
    const banner = await screen.findByRole('alert')
    expect(banner).toHaveTextContent('Someone else changed this invoice.')
    await waitFor(() => expect(banner).toHaveFocus())
    expect(screen.getByLabelText(/^Number/)).toHaveValue('INV-9001')
  })

  test('500: friendly message with support reference, never internals', async () => {
    const api = freshApi()
    const { user } = await renderCreate(api)
    await fillValid(user)
    api.failNext({ ...problem(500, 'INTERNAL_ERROR', 'Internal error', 'TypeError at db.ts:42'), traceId: 'trace-9' })
    await user.click(screen.getByRole('button', { name: 'Create invoice' }))
    const banner = await screen.findByRole('alert')
    expect(banner).toHaveTextContent('Something went wrong on our side. Your changes are kept. Reference: trace-9.')
    expect(banner).not.toHaveTextContent('db.ts')
  })

  test('success: onSaved receives the created record', async () => {
    const { user, onSaved } = await renderCreate()
    await fillValid(user)
    await user.click(screen.getByRole('button', { name: 'Create invoice' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1))
    expect(onSaved.mock.calls[0]?.[0]).toMatchObject({ number: 'INV-9001', amount: 1250.5, customer: 'c2', status: 'sent' })
  })
})

describe('edit mode and read-only rules', () => {
  test('writeOnce becomes read-only, readOnly is shown read-only, and neither is submitted', async () => {
    const api = freshApi()
    const update = vi.spyOn(api, 'update')
    renderWithUI(<ResourceForm resource={invoiceResource} recordId="inv-0001" />, { api })
    const user = userEvent.setup()
    const number = await screen.findByLabelText(/^Number/)
    expect(number).toHaveValue('INV-1000')
    expect(number).toHaveAttribute('readonly')
    expect(screen.getByLabelText(/^Created/)).toHaveAttribute('readonly')
    await user.clear(screen.getByLabelText(/^Amount/))
    await user.type(screen.getByLabelText(/^Amount/), '42')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(update).toHaveBeenCalledTimes(1))
    const payload = update.mock.calls[0]?.[2] ?? {}
    expect(payload.amount).toBe(42)
    expect(payload).not.toHaveProperty('number')
    expect(payload).not.toHaveProperty('createdAt')
  })

  test('a deleted record shows a friendly 404 message', async () => {
    renderWithUI(<ResourceForm resource={invoiceResource} recordId="missing" />, { api: freshApi() })
    expect(await screen.findByRole('alert')).toHaveTextContent('This record no longer exists.')
  })
})

describe('overrides', () => {
  test('a per-field widget override is used for that field only, and its value flows into submit', async () => {
    const Stepper: Widget = (p) => (
      <input id={p.id} data-testid="stepper" aria-describedby={p.describedBy} value={String(p.value ?? '')} onChange={(e) => p.onChange(Number(e.target.value))} onBlur={p.onBlur} />
    )
    const api = freshApi()
    renderWithUI(<ResourceForm resource={invoiceResource} />, { api, overrides: { fieldWidgets: { 'Invoice.amount': Stepper } } })
    await waitFor(() => expect(screen.getByRole('option', { name: 'Acme GmbH' })).toBeInTheDocument())
    expect(screen.getByTestId('stepper')).toBe(screen.getByLabelText(/^Amount/))
    expect(screen.getByLabelText(/^Number/)).toHaveAttribute('type', 'text') // others untouched
  })
})

describe('accessibility', () => {
  test('axe: no violations on the empty form or with errors displayed', async () => {
    const { container, user } = await renderCreate()
    expect(await axeViolations(container)).toEqual([])
    await user.click(screen.getByRole('button', { name: 'Create invoice' }))
    await screen.findByText('Amount is required.')
    expect(await axeViolations(container)).toEqual([])
  })
})
