/**
 * Create / edit invoice: a settings-style form. Each section has its title and a one-line "why"
 * on the left and the fields on the right, separated by hairlines, so a long form reads as a calm
 * sequence of small decisions.
 *
 * Every input type is represented: text, textarea (with a character counter), currency, select,
 * async relation select, date, switch, radio cards, file drop zone and tags. Errors appear inline
 * and in a summary at the top whose entries jump to the field; the first invalid field is focused.
 * The save bar sticks to the bottom of the panel and tells you whether anything is unsaved.
 */
import { LoaderCircle, Repeat, Timer, Zap, CalendarClock, CircleAlert } from 'lucide-react'
import { type FormEvent, useMemo, useRef, useState } from 'react'
import { CurrencyInput, TagsInput } from '../../components/form/inputs.tsx'
import { FileDrop } from '../../components/form/file-drop.tsx'
import { RelationSelect } from '../../components/form/relation-select.tsx'
import { InvoiceStatusBadge } from '../../components/invoice-bits.tsx'
import { PageHeader } from '../../components/page-header.tsx'
import { Section, SwitchRow } from '../../components/section.tsx'
import { Button } from '../../components/ui/button.tsx'
import { RadioCards, Select } from '../../components/ui/controls.tsx'
import { Field } from '../../components/ui/field.tsx'
import { Input, Textarea } from '../../components/ui/input.tsx'
import { useToast } from '../../components/ui/toast.tsx'
import { invoiceById, type PaymentTerms, TAGS } from '../../data/invoices.ts'
import { cn } from '../../lib/cn.ts'
import type { Currency } from '../../lib/format.ts'
import { useRouter } from '../../lib/router.tsx'
import { NotFound } from '../NotFound.tsx'
import {
  addDays,
  emptyValues,
  FIELD_LABELS,
  FIELD_ORDER,
  type InvoiceFormErrors,
  type InvoiceFormValues,
  NOTES_LIMIT,
  TERMS_DAYS,
  validateInvoice,
  valuesFrom,
} from './form-model.ts'

const TERM_OPTIONS = [
  { value: 'due', title: 'Due on receipt', description: 'For one-off work and small amounts.', icon: <Zap aria-hidden /> },
  { value: 'net15', title: 'Net 15', description: 'Payment within 15 days of issue.', icon: <Timer aria-hidden /> },
  { value: 'net30', title: 'Net 30', description: 'The standard for most B2B customers.', icon: <CalendarClock aria-hidden /> },
  { value: 'net60', title: 'Net 60', description: 'Enterprise procurement cycles.', icon: <Repeat aria-hidden /> },
] as const

const CURRENCIES = [
  { value: 'EUR', label: 'Euro', hint: 'EUR' },
  { value: 'USD', label: 'US dollar', hint: 'USD' },
  { value: 'GBP', label: 'Pound sterling', hint: 'GBP' },
] as const

export function InvoiceForm({ id }: { id?: string }) {
  const existing = id === undefined ? undefined : invoiceById(id)
  if (id !== undefined && existing === undefined) return <NotFound />
  return <InvoiceFormScreen key={id ?? 'new'} initial={existing === undefined ? emptyValues() : valuesFrom(existing)} existingId={existing?.id} existingStatus={existing?.status} />
}

interface ScreenProps {
  initial: InvoiceFormValues
  existingId: string | undefined
  existingStatus: Parameters<typeof InvoiceStatusBadge>[0]['status'] | undefined
}

function InvoiceFormScreen({ initial, existingId, existingStatus }: ScreenProps) {
  const { navigate } = useRouter()
  const toast = useToast()
  const [values, setValues] = useState(initial)
  const [errors, setErrors] = useState<InvoiceFormErrors>({})
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const form = useRef<HTMLFormElement>(null)
  const editing = existingId !== undefined
  const dirty = useMemo(() => JSON.stringify(values) !== JSON.stringify(initial), [values, initial])

  /** Update one field; after a failed submit, re-validate live so errors clear as they are fixed. */
  const set = <K extends keyof InvoiceFormValues>(key: K, value: InvoiceFormValues[K]) => {
    setValues((current) => {
      const next = { ...current, [key]: value }
      if (submitted) setErrors(validateInvoice(next))
      return next
    })
  }

  const focusField = (key: keyof InvoiceFormValues) => {
    const target = form.current?.querySelector<HTMLElement>(`[data-field="${key}"] :is(input, button, textarea, [role="combobox"])`)
    target?.focus()
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setSubmitted(true)
    const found = validateInvoice(values)
    setErrors(found)
    const first = FIELD_ORDER.find((key) => found[key] !== undefined)
    if (first !== undefined) {
      focusField(first)
      return
    }
    setSaving(true)
    window.setTimeout(() => {
      toast({ title: editing ? 'Changes saved' : 'Invoice created', description: `${values.number} for ${values.customer?.name ?? ''} is ready to send.` })
      navigate(`/invoices/${existingId ?? 'inv-2264'}`)
    }, 600)
  }

  const errorKeys = FIELD_ORDER.filter((key) => errors[key] !== undefined)
  const title = editing ? `Edit ${initial.number}` : 'New invoice'

  return (
    <form ref={form} noValidate onSubmit={submit} className="flex min-h-full flex-col">
      <div className="mx-auto w-full max-w-[960px] flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        <PageHeader
          breadcrumbs={[{ label: 'Invoices', to: '/invoices' }, ...(editing ? [{ label: initial.number, to: `/invoices/${existingId}` }] : []), { label: editing ? 'Edit' : 'New' }]}
          back={editing ? `/invoices/${existingId}` : '/invoices'}
          title={title}
          meta={existingStatus !== undefined ? <InvoiceStatusBadge status={existingStatus} /> : <InvoiceStatusBadge status="draft" />}
          description={editing ? 'Changes are tracked in the invoice’s activity log.' : 'Fill in the essentials; everything else has a sensible default.'}
        />

        {errorKeys.length > 0 && (
          <div role="alert" className="mt-6 flex gap-3 rounded-lg border border-danger/30 bg-danger-subtle p-3">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-danger-text" />
            <div className="text-sm">
              <p className="font-medium text-fg">
                Fix {errorKeys.length === 1 ? '1 field' : `${errorKeys.length} fields`} to {editing ? 'save' : 'create the invoice'}
              </p>
              <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                {errorKeys.map((key) => (
                  <li key={key}>
                    <button type="button" onClick={() => focusField(key)} className="cursor-pointer text-danger-text underline underline-offset-2 hover:no-underline">
                      {FIELD_LABELS[key] ?? key}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <div className="mt-6">
          <Section title="Customer" description="Who is billed. The billing e-mail is filled in from the customer and can be changed per invoice.">
            <div data-field="customer">
              <Field label="Customer" error={errors.customer}>
                {(control) => (
                  <RelationSelect
                    control={control}
                    value={values.customer}
                    onChange={(customer) => {
                      set('customer', customer)
                      set('email', customer.email)
                    }}
                  />
                )}
              </Field>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <div data-field="email">
                <Field label="Billing e-mail" error={errors.email}>
                  {(control) => <Input {...control} type="email" autoComplete="off" value={values.email} onChange={(event) => set('email', event.target.value)} />}
                </Field>
              </div>
              <div data-field="reference">
                <Field label="PO / reference" optional description="Printed on the invoice; many customers require it.">
                  {(control) => <Input {...control} value={values.reference} placeholder="PO-00000" onChange={(event) => set('reference', event.target.value)} />}
                </Field>
              </div>
            </div>
          </Section>

          <Section title="Invoice details" description="Number, dates and amount. Changing the payment terms below moves the due date for you.">
            <div className="grid gap-5 sm:grid-cols-2">
              <div data-field="number">
                <Field label="Invoice number" error={errors.number}>
                  {(control) => <Input {...control} className="num" value={values.number} onChange={(event) => set('number', event.target.value.toUpperCase())} />}
                </Field>
              </div>
              <div data-field="currency">
                <Field label="Currency">
                  {(control) => (
                    <Select value={values.currency} onValueChange={(value) => set('currency', value as Currency)} options={CURRENCIES} triggerProps={{ id: control.id }} />
                  )}
                </Field>
              </div>
              <div data-field="issuedAt">
                <Field label="Issue date" error={errors.issuedAt}>
                  {(control) => (
                    <Input
                      {...control}
                      type="date"
                      className="num"
                      value={values.issuedAt}
                      onChange={(event) => {
                        set('issuedAt', event.target.value)
                        set('dueAt', addDays(event.target.value, TERMS_DAYS[values.terms]))
                      }}
                    />
                  )}
                </Field>
              </div>
              <div data-field="dueAt">
                <Field label="Due date" error={errors.dueAt}>
                  {(control) => <Input {...control} type="date" className="num" value={values.dueAt} onChange={(event) => set('dueAt', event.target.value)} />}
                </Field>
              </div>
            </div>
            <div data-field="amount" className="sm:max-w-[calc(50%-10px)]">
              <Field label="Amount" description="Total including VAT." error={errors.amount}>
                {(control) => <CurrencyInput control={control} value={values.amount} currency={values.currency} onChange={(value) => set('amount', value)} />}
              </Field>
            </div>
          </Section>

          <Section title="Payment terms" description="How long the customer has to pay. Shown on the invoice and used for reminders.">
            <div data-field="terms">
              <RadioCards
                aria-label="Payment terms"
                value={values.terms}
                onValueChange={(value) => {
                  const terms = value as PaymentTerms
                  set('terms', terms)
                  set('dueAt', addDays(values.issuedAt, TERMS_DAYS[terms]))
                }}
                options={TERM_OPTIONS}
              />
            </div>
          </Section>

          <Section title="Notes & tags" description="Notes are printed on the invoice. Tags are internal and help you build saved views.">
            <div data-field="notes">
              <Field label="Notes to customer" optional error={errors.notes}>
                {(control) => (
                  <div className="relative">
                    <Textarea {...control} value={values.notes} placeholder="Thank you for your business." onChange={(event) => set('notes', event.target.value)} className="pb-6" />
                    <span className={cn('num pointer-events-none absolute bottom-1.5 right-2.5 text-2xs', values.notes.length > NOTES_LIMIT ? 'text-danger-text' : 'text-fg-subtle')} aria-hidden>
                      {values.notes.length}/{NOTES_LIMIT}
                    </span>
                  </div>
                )}
              </Field>
            </div>
            <div data-field="tags">
              <Field label="Tags" optional description="Press Enter or comma to add. Backspace removes the last tag.">
                {(control) => <TagsInput control={control} value={values.tags} onChange={(tags) => set('tags', tags)} suggestions={TAGS} />}
              </Field>
            </div>
          </Section>

          <Section title="Attachments" description="Purchase orders, timesheets or a signed SOW. Customers can download them from the invoice page.">
            <FileDrop
              accept={['application/pdf', 'image/png', 'image/jpeg']}
              maxBytes={10 * 1024 * 1024}
              initial={editing ? [{ name: 'Halcyon-PO-88213.pdf', size: 402_112, type: 'application/pdf' }] : []}
            />
          </Section>

          <Section title="Automation" description="What Strutvane does for you after the invoice is issued.">
            <SwitchRow id="auto-send" title="Send on issue date" description="E-mail the invoice to the billing address automatically." checked={values.autoSend} onChange={(value) => set('autoSend', value)} />
            <SwitchRow id="reminders" title="Payment reminders" description="3 days before and 1, 7 and 14 days after the due date." checked={values.reminders} onChange={(value) => set('reminders', value)} />
            <SwitchRow id="partial" title="Allow partial payments" description="Customers can pay in instalments from the payment page." checked={values.partial} onChange={(value) => set('partial', value)} />
          </Section>
        </div>
      </div>

      <div className="sticky bottom-0 z-20 border-t border-border bg-surface/90 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[960px] items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <p className="flex min-w-0 flex-1 items-center gap-2 text-sm text-fg-muted" aria-live="polite">
            <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', dirty ? 'bg-warning' : 'bg-success')} />
            <span className="truncate">{dirty ? 'Unsaved changes' : editing ? 'All changes saved' : 'Draft, not saved yet'}</span>
          </p>
          <Button
            disabled={!dirty || saving}
            onClick={() => {
              setValues(initial)
              setErrors({})
              setSubmitted(false)
            }}
          >
            Discard
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving && <LoaderCircle aria-hidden className="animate-spin" />}
            {editing ? 'Save changes' : 'Create invoice'}
          </Button>
        </div>
      </div>
    </form>
  )
}
