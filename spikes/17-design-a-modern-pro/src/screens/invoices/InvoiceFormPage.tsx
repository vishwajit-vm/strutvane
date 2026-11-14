/**
 * Create / edit invoice: sectioned cards with a two-column field grid on the left, a sticky live
 * summary on the right (≥1280px), and a sticky bottom action bar (Cancel · Save and add another ·
 * Save). Every input type of the design system appears here.
 *
 * Validation runs on submit, then live as the user fixes fields; the first invalid field gets
 * focus and every message says how to fix the problem.
 */
import { IconBolt, IconCalendarDue, IconCreditCard, IconDeviceFloppy, IconReceipt2 } from '@tabler/icons-react'
import { useState, type FormEvent, type ReactElement, type ReactNode } from 'react'
import { PersonCell } from '../../components/data-display.tsx'
import { FileDropZone, RelationSelect, TagsInput } from '../../components/form-widgets.tsx'
import { PageHeader } from '../../components/page-header.tsx'
import { Button } from '../../components/ui/button.tsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.tsx'
import { Switch } from '../../components/ui/checkbox.tsx'
import { Field, fieldAria } from '../../components/ui/field.tsx'
import { Input, InputGroup, Textarea } from '../../components/ui/input.tsx'
import { IconChip } from '../../components/ui/misc.tsx'
import { RadioCards } from '../../components/ui/radio-cards.tsx'
import { Select } from '../../components/ui/select.tsx'
import { toast } from '../../components/ui/toast.tsx'
import { findInvoice, invoices } from '../../data/invoices.ts'
import { searchCustomers, team, type Customer } from '../../data/people.ts'
import { formatMoney, TODAY, toDateInput } from '../../lib/format.ts'
import { Link, navigate } from '../../lib/router.tsx'

interface FormValues {
  customer: Customer | null
  number: string
  issued: string
  due: string
  currency: string
  terms: string
  amount: string
  taxRate: string
  owner: string
  description: string
  tags: readonly string[]
  reminders: boolean
  partial: boolean
  cards: boolean
}

type Errors = Partial<Record<'customer' | 'amount' | 'due' | 'description' | 'taxRate', string>>

const DESCRIPTION_LIMIT = 500

/** All validation rules in one place, each message says how to fix it. */
export function validateInvoice(values: FormValues): Errors {
  const errors: Errors = {}
  if (values.customer === null) errors.customer = 'Choose who this invoice is for.'
  const amount = Number(values.amount.replaceAll(',', ''))
  if (values.amount.trim() === '') errors.amount = 'Enter the amount to bill.'
  else if (!Number.isFinite(amount) || amount <= 0) errors.amount = 'Enter an amount greater than 0, e.g. 1250.00.'
  if (values.due < values.issued) errors.due = 'The due date can’t be before the issue date.'
  const tax = Number(values.taxRate)
  if (values.taxRate !== '' && (!Number.isFinite(tax) || tax < 0 || tax > 100)) errors.taxRate = 'Use a rate between 0 and 100.'
  if (values.description.length > DESCRIPTION_LIMIT) errors.description = `Keep it under ${DESCRIPTION_LIMIT} characters.`
  return errors
}

function initialValues(invoiceId: string | undefined): FormValues {
  const invoice = invoiceId === undefined ? undefined : findInvoice(invoiceId)
  const nextNumber = `INV-${1001 + invoices.length}`
  return {
    customer: invoice?.customer ?? null,
    number: invoice?.id ?? nextNumber,
    issued: toDateInput(invoice?.issuedAt ?? TODAY),
    due: toDateInput(invoice?.dueAt ?? new Date(TODAY.getTime() + 30 * 86_400_000)),
    currency: 'USD',
    terms: 'net30',
    amount: invoice === undefined ? '' : invoice.amount.toFixed(2),
    taxRate: '20',
    owner: invoice?.owner.id ?? 'usr_01',
    description: invoice === undefined ? '' : invoice.items.map((item) => item.description).join('\n'),
    tags: invoice?.tags ?? [],
    reminders: true,
    partial: invoice?.status === 'partial',
    cards: true,
  }
}

function Section({ title, description, icon, children }: { readonly title: string; readonly description: string; readonly icon: ReactNode; readonly children: ReactNode }): ReactElement {
  return (
    <Card>
      <CardHeader className="justify-start gap-3">
        <IconChip icon={icon} />
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="grid gap-x-5 gap-y-5 border-t border-border pt-5 sm:grid-cols-2 sm:pt-6">{children}</CardContent>
    </Card>
  )
}

function SwitchRow({ id, title, description, checked, onChange }: { readonly id: string; readonly title: string; readonly description: string; readonly checked: boolean; readonly onChange: (value: boolean) => void }): ReactElement {
  return (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-4 sm:col-span-2">
      <div>
        <label htmlFor={id} className="text-sm font-semibold text-foreground">
          {title}
        </label>
        <p id={`${id}-desc`} className="mt-0.5 text-label text-muted-foreground">
          {description}
        </p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} aria-describedby={`${id}-desc`} />
    </div>
  )
}

export function InvoiceFormPage({ invoiceId }: { readonly invoiceId?: string }): ReactElement {
  const editing = invoiceId !== undefined
  const [values, setValues] = useState<FormValues>(() => initialValues(invoiceId))
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const errors = submitted ? validateInvoice(values) : {}
  const set = <K extends keyof FormValues>(key: K, value: FormValues[K]): void => setValues((current) => ({ ...current, [key]: value }))

  const amount = Number(values.amount.replaceAll(',', '')) || 0
  const tax = (amount * (Number(values.taxRate) || 0)) / 100

  const save = (event: FormEvent | null, another: boolean): void => {
    event?.preventDefault()
    setSubmitted(true)
    const found = validateInvoice(values)
    const firstInvalid = Object.keys(found)[0]
    if (firstInvalid !== undefined) {
      document.getElementById(firstInvalid)?.focus()
      toast({ tone: 'danger', title: 'Check the highlighted fields', description: `${Object.keys(found).length} field${Object.keys(found).length === 1 ? ' needs' : 's need'} attention before saving.` })
      return
    }
    setSaving(true)
    setTimeout(() => {
      setSaving(false)
      toast({ tone: 'success', title: editing ? `${values.number} updated` : `${values.number} created`, description: another ? 'Ready for the next one.' : 'The customer will get it by email.' })
      if (another) {
        setValues(initialValues(undefined))
        setSubmitted(false)
      } else navigate(editing ? `/invoices/${values.number}` : '/invoices')
    }, 500)
  }

  return (
    <form noValidate onSubmit={(event) => save(event, false)}>
      <PageHeader
        breadcrumbs={[{ label: 'Billing' }, { label: 'Invoices', to: '/invoices' }, { label: editing ? `Edit ${values.number}` : 'New invoice' }]}
        back={editing ? `/invoices/${invoiceId}` : '/invoices'}
        title={editing ? `Edit ${values.number}` : 'Create invoice'}
        description={editing ? 'Changes are emailed to the customer only if you resend.' : 'Fill in the details; you can save a draft at any time.'}
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Section title="Customer & dates" description="Who pays, and when" icon={<IconCalendarDue />}>
            <Field id="customer" label="Customer" required error={errors.customer} className="sm:col-span-2" hint="Search by company, contact or email.">
              <RelationSelect id="customer" value={values.customer} onChange={(customer) => set('customer', customer)} search={(term) => searchCustomers(term)} placeholder="Search customers…" {...fieldAria('customer', errors.customer, true)} />
            </Field>
            <Field id="number" label="Invoice number" hint="Generated automatically.">
              <Input id="number" value={values.number} readOnly className="bg-muted" {...fieldAria('number', undefined, true)} />
            </Field>
            <Field id="owner" label="Owner">
              <Select id="owner" value={values.owner} onValueChange={(value) => set('owner', value)} options={team.filter((member) => member.status === 'active').map((member) => ({ value: member.id, label: member.name, hint: member.role }))} />
            </Field>
            <Field id="issued" label="Issue date" required>
              <Input id="issued" type="date" value={values.issued} onChange={(event) => set('issued', event.target.value)} />
            </Field>
            <Field id="due" label="Due date" required error={errors.due}>
              <Input id="due" type="date" value={values.due} onChange={(event) => set('due', event.target.value)} {...fieldAria('due', errors.due)} />
            </Field>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <span id="terms-label" className="text-label font-semibold text-foreground">
                Payment terms
              </span>
              <RadioCards
                aria-labelledby="terms-label"
                value={values.terms}
                onValueChange={(value) => set('terms', value)}
                options={[
                  { value: 'receipt', title: 'On receipt', description: 'Due as soon as it’s sent', icon: <IconBolt /> },
                  { value: 'net14', title: 'Net 14', description: 'Due 14 days after issue', icon: <IconCalendarDue /> },
                  { value: 'net30', title: 'Net 30', description: 'Standard for B2B', icon: <IconReceipt2 /> },
                ]}
              />
            </div>
          </Section>

          <Section title="Amount & details" description="What you’re billing for" icon={<IconReceipt2 />}>
            <Field id="amount" label="Amount" required error={errors.amount}>
              <InputGroup start="$" end={<span className="pr-1 text-xs font-semibold">{values.currency}</span>}>
                <Input id="amount" inputMode="decimal" placeholder="0.00" value={values.amount} onChange={(event) => set('amount', event.target.value.replace(/[^\d.,]/g, ''))} className="tabular" {...fieldAria('amount', errors.amount)} />
              </InputGroup>
            </Field>
            <Field id="currency" label="Currency">
              <Select
                id="currency"
                value={values.currency}
                onValueChange={(value) => set('currency', value)}
                options={[
                  { value: 'USD', label: 'US dollar', hint: 'USD' },
                  { value: 'EUR', label: 'Euro', hint: 'EUR' },
                  { value: 'GBP', label: 'British pound', hint: 'GBP' },
                  { value: 'DKK', label: 'Danish krone', hint: 'DKK' },
                ]}
              />
            </Field>
            <Field id="taxRate" label="Tax rate" error={errors.taxRate} hint="VAT or sales tax, in percent.">
              <InputGroup end={<span className="pr-1 text-sm">%</span>}>
                <Input id="taxRate" type="number" min={0} max={100} step={0.5} value={values.taxRate} onChange={(event) => set('taxRate', event.target.value)} className="tabular" {...fieldAria('taxRate', errors.taxRate, true)} />
              </InputGroup>
            </Field>
            <Field id="tags" label="Tags" hint="Press Enter to add. Up to 8.">
              <TagsInput id="tags" value={values.tags} onChange={(tags) => set('tags', tags)} suggestions={['Q4', 'Renewal', 'Enterprise']} />
            </Field>
            <Field id="description" label="Description" error={errors.description} className="sm:col-span-2" hint={`${values.description.length} / ${DESCRIPTION_LIMIT} characters. Shown on the invoice.`}>
              <Textarea id="description" rows={4} value={values.description} onChange={(event) => set('description', event.target.value)} placeholder="e.g. Platform subscription, Growth plan, November 2026" {...fieldAria('description', errors.description, true)} />
            </Field>
          </Section>

          <Section title="Payment options" description="How the customer can pay" icon={<IconCreditCard />}>
            <SwitchRow id="reminders" title="Send automatic reminders" description="3 days before the due date, on the day, and weekly after." checked={values.reminders} onChange={(value) => set('reminders', value)} />
            <SwitchRow id="partial" title="Allow partial payments" description="The customer can pay in instalments; the balance stays open." checked={values.partial} onChange={(value) => set('partial', value)} />
            <SwitchRow id="cards" title="Accept card payments" description="Adds a secure “Pay now” button. A 1.4% card fee applies." checked={values.cards} onChange={(value) => set('cards', value)} />
          </Section>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Attachments</CardTitle>
                <CardDescription>Contracts, purchase orders or timesheets sent with the invoice</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <FileDropZone id="files" accept="image/*,.pdf" maxBytes={10 * 1024 * 1024} initial={editing ? [{ name: 'purchase-order-7731.pdf', size: 248_000, type: 'application/pdf' }] : []} />
            </CardContent>
          </Card>
        </div>

        <aside className="xl:sticky xl:top-24 xl:self-start">
          <Card>
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {values.customer === null ? (
                <p className="rounded-lg border border-dashed border-border p-4 text-center text-label text-muted-foreground">No customer selected yet</p>
              ) : (
                <div className="rounded-lg bg-muted/70 p-3">
                  <PersonCell name={values.customer.name} secondary={values.customer.contact} tone={values.customer.tone} />
                </div>
              )}
              <dl className="flex flex-col gap-2.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd className="font-semibold tabular">{formatMoney(amount)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Tax ({Number(values.taxRate) || 0}%)</dt>
                  <dd className="font-semibold tabular">{formatMoney(tax)}</dd>
                </div>
                <div className="mt-1 flex items-baseline justify-between border-t border-dashed border-border pt-3.5">
                  <dt className="font-semibold">Total</dt>
                  <dd className="text-2xl font-bold tracking-tight text-foreground tabular">{formatMoney(amount + tax)}</dd>
                </div>
              </dl>
              <p className="rounded-lg bg-info-soft px-3 py-2 text-label text-info">Due {values.due === '' ? '—' : new Date(`${values.due}T00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
            </CardContent>
          </Card>
        </aside>
      </div>

      <div className="sticky bottom-0 z-20 -mx-4 mt-6 border-t border-border bg-topbar px-4 py-3 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex items-center justify-end gap-2">
          <p className="mr-auto hidden text-label text-muted-foreground md:block">{submitted && Object.keys(errors).length > 0 ? `${Object.keys(errors).length} field(s) need attention` : 'All changes are kept until you leave this page.'}</p>
          {/* Phones: Cancel is dropped (the back button does the same) so the bar stays one row. */}
          <Button asChild variant="ghost" className="max-sm:hidden">
            <Link to={editing ? `/invoices/${invoiceId}` : '/invoices'}>Cancel</Link>
          </Button>
          <Button variant="outline" onClick={() => save(null, true)} disabled={saving} className="max-sm:flex-1">
            <span className="sm:hidden">Save + new</span>
            <span className="max-sm:hidden">Save and add another</span>
          </Button>
          <Button type="submit" variant="primary" disabled={saving} className="max-sm:flex-1">
            <IconDeviceFloppy /> {saving ? 'Saving…' : editing ? 'Save changes' : 'Save invoice'}
          </Button>
        </div>
      </div>
    </form>
  )
}
