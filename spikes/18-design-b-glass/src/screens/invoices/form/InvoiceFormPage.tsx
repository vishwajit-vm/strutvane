/**
 * Create / edit invoice: sectioned cards in a two-column grid, a sticky summary on wide screens,
 * inline errors, and a sticky glass action bar at the bottom.
 *
 * Every input type the admin needs appears here: text, textarea with counter, currency, select,
 * async relation select, date, switch, radio cards, file drop zone with previews, and tags.
 * `?validate=1` opens the form with validation already run (for reviewing the error states).
 */
import { IconBolt, IconCalendarDue, IconClockHour4, IconDeviceFloppy, IconPlus, IconSend, IconTrash } from '@tabler/icons-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { PageHeader } from '../../../components/PageHeader.tsx'
import { Avatar } from '../../../components/ui/avatar.tsx'
import { Button } from '../../../components/ui/button.tsx'
import { Card, CardBody, CardHeader } from '../../../components/ui/card.tsx'
import { Field } from '../../../components/ui/field.tsx'
import { Input, Textarea } from '../../../components/ui/input.tsx'
import { Select } from '../../../components/ui/select.tsx'
import { RadioCards, Switch } from '../../../components/ui/toggles.tsx'
import { useToast } from '../../../components/ui/toast.tsx'
import { findInvoice } from '../../../data/invoices.ts'
import { cn } from '../../../lib/cn.ts'
import { formatMoney } from '../../../lib/format.ts'
import { NotFoundPage } from '../../NotFoundPage.tsx'
import { emptyInvoice, hasErrors, newLine, NOTES_LIMIT, searchCustomers, totals, validateInvoice, valuesFromInvoice, type InvoiceErrors, type InvoiceValues, type LineDraft } from './form-model.ts'
import { CurrencyInput, FileDropZone, RelationSelect, TagsInput } from './inputs.tsx'

export function InvoiceFormPage() {
  const { id } = useParams()
  const invoice = id === undefined ? undefined : findInvoice(id)
  if (id !== undefined && invoice === undefined) return <NotFoundPage />
  return <InvoiceForm key={id ?? 'new'} initial={invoice === undefined ? emptyInvoice() : valuesFromInvoice(invoice)} editingId={invoice?.id ?? null} />
}

function InvoiceForm({ initial, editingId }: { initial: InvoiceValues; editingId: string | null }) {
  const navigate = useNavigate()
  const toast = useToast()
  const [params] = useSearchParams()
  const [values, setValues] = useState(initial)
  const [errors, setErrors] = useState<InvoiceErrors>(() => (params.get('validate') === '1' ? validateInvoice(initial) : {}))
  const [dirty, setDirty] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const sum = totals(values)
  const isEdit = editingId !== null

  const set = <K extends keyof InvoiceValues>(key: K, value: InvoiceValues[K]): void => {
    setValues((current) => ({ ...current, [key]: value }))
    setDirty(true)
  }
  const setLine = (key: string, patch: Partial<LineDraft>): void =>
    set(
      'lines',
      values.lines.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    )

  // Re-validate live once errors are showing, so fixed fields clear immediately.
  useEffect(() => {
    if (hasErrors(errors)) setErrors(validateInvoice(values))
    // Only react to value changes; reading `errors` here must not re-trigger the effect.
  }, [values])

  const submit = (intent: 'draft' | 'send'): void => {
    const next = validateInvoice(values)
    flushSync(() => setErrors(next))
    if (hasErrors(next)) {
      formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
      toast({ title: 'Check the highlighted fields', description: 'A few details need fixing before saving.', tone: 'danger' })
      return
    }
    toast({
      title: intent === 'send' ? `${values.number} sent` : `${values.number} saved as draft`,
      description: intent === 'send' ? `${values.customer?.name ?? 'The customer'} will receive it by e-mail.` : 'You can keep editing it any time.',
    })
    setDirty(false)
    void navigate(editingId !== null ? `/invoices/${editingId}` : '/invoices')
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Invoices', to: '/invoices' }, { label: isEdit ? values.number : 'New invoice' }]}
        back={isEdit ? `/invoices/${editingId}` : '/invoices'}
        title={isEdit ? `Edit ${values.number}` : 'New invoice'}
        description={isEdit ? 'Changes are tracked in the invoice’s activity log.' : 'Fill in the details. You can save a draft at any point.'}
      />
      <form
        ref={formRef}
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          submit('send')
        }}
        className="grid items-start gap-5 xl:grid-cols-12"
      >
        <div className="flex min-w-0 flex-col gap-5 xl:col-span-8">
          <Section title="Customer & dates" description="Who pays, and when.">
            <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
              <Field label="Customer" required error={errors.customer} hint="Search by name, city or industry." className="sm:col-span-2">
                {(control) => <RelationSelect {...control} value={values.customer} onChange={(customer) => set('customer', customer)} search={searchCustomers} />}
              </Field>
              <Field label="Invoice number" hint="Numbers continue automatically.">
                {(control) => <Input {...control} value={values.number} onChange={(event) => set('number', event.target.value)} className="font-mono" />}
              </Field>
              <Field label="PO / reference" aside="Optional">
                {(control) => <Input {...control} value={values.reference} placeholder="e.g. PO-48213" onChange={(event) => set('reference', event.target.value)} />}
              </Field>
              <Field label="Issue date" required error={errors.issuedAt}>
                {(control) => <Input {...control} type="date" value={values.issuedAt} onChange={(event) => set('issuedAt', event.target.value)} />}
              </Field>
              <Field label="Due date" required error={errors.dueAt}>
                {(control) => <Input {...control} type="date" value={values.dueAt} onChange={(event) => set('dueAt', event.target.value)} />}
              </Field>
            </div>
            <div className="mt-5">
              <p id="terms-label" className="mb-2 text-sm font-semibold text-fg">
                Payment terms
              </p>
              <RadioCards
                aria-labelledby="terms-label"
                value={values.terms}
                onValueChange={(terms) => set('terms', terms)}
                options={[
                  { value: 'receipt', label: 'On receipt', description: 'Due immediately', icon: <IconBolt /> },
                  { value: 'net15', label: 'Net 15', description: 'Due in 15 days', icon: <IconClockHour4 /> },
                  { value: 'net30', label: 'Net 30', description: 'Due in 30 days', icon: <IconCalendarDue /> },
                ]}
              />
            </div>
          </Section>

          <Section title="Line items" description="What you are charging for." error={errors.lines}>
            <LineItems lines={values.lines} errors={errors.lineErrors ?? {}} onChange={setLine} onRemove={(key) => set('lines', values.lines.filter((line) => line.key !== key))} />
            <Button variant="soft" size="sm" className="mt-4" onClick={() => set('lines', [...values.lines, newLine()])}>
              <IconPlus aria-hidden /> Add line
            </Button>
          </Section>

          <Section title="Notes & attachments" description="Shown to the customer on the invoice.">
            <div className="grid gap-y-4">
              <Field label="Notes" error={errors.notes} aside={<span className={cn('tabular', values.notes.length > NOTES_LIMIT && 'font-semibold text-danger')}>{values.notes.length} / {NOTES_LIMIT}</span>}>
                {(control) => <Textarea {...control} value={values.notes} placeholder="Payment instructions, thank-you note…" onChange={(event) => set('notes', event.target.value)} />}
              </Field>
              <Field label="Attachments" hint="Timesheets, purchase orders or receipts.">
                {(control) => <FileDropZone {...control} files={values.files} onChange={(files) => set('files', files)} />}
              </Field>
              <Field label="Tags" hint="Used for filters and reports.">
                {(control) => <TagsInput {...control} value={values.tags} onChange={(tags) => set('tags', tags)} suggestions={['Q4', 'Renewal', 'Priority', 'Net 30']} />}
              </Field>
            </div>
          </Section>
        </div>

        <aside className="flex min-w-0 flex-col gap-5 xl:sticky xl:top-[calc(var(--topbar-height)+var(--chrome-gap)*2+1rem)] xl:col-span-4" aria-label="Summary and settings">
          <Card>
            <CardHeader title="Summary" />
            <CardBody>
              {values.customer !== null ? (
                <div className="mb-4 flex items-center gap-3 rounded-md border border-glass-border bg-glass-hover p-3">
                  <Avatar name={values.customer.name} shape="square" />
                  <div className="min-w-0">
                    <p className="truncate text-base font-semibold text-fg">{values.customer.name}</p>
                    <p className="truncate text-xs text-fg-muted">{values.customer.email}</p>
                  </div>
                </div>
              ) : (
                <p className="mb-4 rounded-md border border-dashed border-input p-3 text-sm text-fg-muted">No customer chosen yet.</p>
              )}
              <dl className="space-y-2 text-base">
                <Row label="Subtotal" value={formatMoney(sum.subtotal)} />
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-fg-muted">Tax</dt>
                  <dd>
                    <Select
                      aria-label="Tax rate"
                      size="sm"
                      className="w-28"
                      value={values.taxRate}
                      onValueChange={(rate) => set('taxRate', rate)}
                      options={[
                        { value: '0', label: 'No tax' },
                        { value: '8', label: '8% sales' },
                        { value: '20', label: '20% VAT' },
                      ]}
                    />
                  </dd>
                </div>
                <Row label="Tax amount" value={formatMoney(sum.tax)} />
              </dl>
              <div className="mt-4 flex items-baseline justify-between border-t border-border pt-4">
                <span className="text-base font-semibold text-fg">Total</span>
                <span className="text-2xl font-bold tracking-tight text-fg tabular">{formatMoney(sum.total)}</span>
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Settings" />
            <CardBody className="flex flex-col gap-4">
              <SwitchRow id="reminders" label="Automatic reminders" description="E-mail the customer 3 days before and after the due date." checked={values.reminders} onChange={(on) => set('reminders', on)} />
              <SwitchRow id="partial" label="Allow partial payments" description="Let the customer pay in instalments." checked={values.partialPayments} onChange={(on) => set('partialPayments', on)} />
            </CardBody>
          </Card>
        </aside>

        {/* Sticky glass action bar: always reachable, never covers the last field (pb on the page). */}
        <div className="glass-chrome sticky bottom-(--chrome-gap) z-(--z-sticky) flex items-center gap-2 rounded-2xl px-3 py-3 sm:px-4 xl:col-span-12">
          <p className="mr-auto hidden items-center gap-2 text-sm text-fg-muted sm:flex" aria-live="polite">
            <span className={cn('size-2 rounded-full', dirty ? 'bg-warning' : 'bg-success')} aria-hidden />
            {dirty ? 'Unsaved changes' : isEdit ? 'All changes saved' : 'Not saved yet'}
          </p>
          <Button variant="ghost" asChild className="max-sm:hidden">
            <Link to={isEdit ? `/invoices/${editingId}` : '/invoices'}>Cancel</Link>
          </Button>
          <Button variant="secondary" className="max-sm:flex-1" onClick={() => submit('draft')}>
            <IconDeviceFloppy aria-hidden /> Save draft
          </Button>
          <Button type="submit" className="max-sm:flex-1">
            <IconSend aria-hidden /> {isEdit ? 'Save & send' : 'Create & send'}
          </Button>
        </div>
      </form>
    </>
  )
}

function Section({ title, description, error, children }: { title: string; description: string; error?: string | undefined; children: ReactNode }) {
  return (
    <Card material="solid">
      <CardHeader title={title} description={description} />
      <CardBody>
        {error !== undefined && (
          <p role="alert" className="mb-3 text-sm font-medium text-danger">
            {error}
          </p>
        )}
        {children}
      </CardBody>
    </Card>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-fg-muted">{label}</dt>
      <dd className="font-medium text-fg tabular">{value}</dd>
    </div>
  )
}

function SwitchRow({ id, label, description, checked, onChange }: { id: string; label: string; description: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <label htmlFor={id} className="text-base font-semibold text-fg">
          {label}
        </label>
        <p id={`${id}-description`} className="mt-0.5 text-xs text-fg-muted">
          {description}
        </p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} aria-describedby={`${id}-description`} />
    </div>
  )
}

function LineItems({ lines, errors, onChange, onRemove }: { lines: readonly LineDraft[]; errors: Readonly<Record<string, Partial<Record<'description' | 'quantity' | 'unitPrice', string>>>>; onChange: (key: string, patch: Partial<LineDraft>) => void; onRemove: (key: string) => void }) {
  return (
    <ol className="flex flex-col gap-3">
      {lines.map((line, index) => {
        const lineErrors = errors[line.key] ?? {}
        const amount = Number(line.quantity) * Number(line.unitPrice.replace(/,/g, ''))
        return (
          <li key={line.key} className="grid gap-3 rounded-lg border border-border bg-surface-muted p-3 sm:grid-cols-[minmax(0,1fr)_5.5rem_9rem_auto] sm:items-start">
            <Field label={`Item ${index + 1}`} error={lineErrors.description}>
              {(control) => <Input {...control} value={line.description} placeholder="e.g. Implementation package" onChange={(event) => onChange(line.key, { description: event.target.value })} />}
            </Field>
            <Field label="Qty" error={lineErrors.quantity}>
              {(control) => <Input {...control} inputMode="numeric" value={line.quantity} onChange={(event) => onChange(line.key, { quantity: event.target.value.replace(/[^\d.]/g, '') })} className="text-right tabular" />}
            </Field>
            <Field label="Unit price" error={lineErrors.unitPrice}>
              {(control) => <CurrencyInput {...control} value={line.unitPrice} onValueChange={(unitPrice) => onChange(line.key, { unitPrice })} />}
            </Field>
            <div className="flex items-center justify-between gap-2 sm:flex-col sm:items-end sm:pt-7">
              <span className="text-base font-semibold text-fg tabular">{Number.isFinite(amount) ? formatMoney(amount) : '—'}</span>
              <Button variant="ghost" size="icon-sm" aria-label={`Remove item ${index + 1}`} disabled={lines.length === 1} onClick={() => onRemove(line.key)} className="hover:bg-danger-soft hover:text-danger">
                <IconTrash aria-hidden />
              </Button>
            </div>
          </li>
        )
      })}
    </ol>
  )
}
