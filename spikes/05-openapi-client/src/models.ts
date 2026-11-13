/**
 * The sample models. In a real Strutvane app these come from `app/models/*.model.ts`
 * (`defineModel` + `field.*`); here they are written directly with Zod + `field()` metadata,
 * which is exactly what `defineModel` would compile down to.
 *
 * @module
 */
import { z } from 'zod'
import { field } from './field.ts'
import { defineResource } from './resource.ts'

export const INVOICE_STATUSES = ['draft', 'sent', 'paid', 'void'] as const

export const Customer = defineResource(
  { name: 'Customer', path: 'customers', label: 'Customer', pluralLabel: 'Customers', titleField: 'name' },
  {
    name: field(z.string().min(1).max(200), {
      label: 'Name',
      filterOperators: ['eq', 'contains', 'startsWith'],
      sortable: true,
      searchable: true,
    }),
    email: field(z.email(), { label: 'Email', filterOperators: ['eq'] }),
    region: field(z.string().min(2).max(2).nullable(), {
      label: 'Region',
      filterOperators: ['eq', 'in', 'isNull', 'isNotNull'],
    }),
  },
)

export const Invoice = defineResource(
  { name: 'Invoice', path: 'invoices', label: 'Invoice', pluralLabel: 'Invoices', titleField: 'number' },
  {
    number: field(z.string().min(1).max(32), {
      label: 'Number',
      filterOperators: ['eq', 'startsWith'],
      sortable: true,
      searchable: true,
    }),
    customerId: field(z.uuid(), { label: 'Customer', filterOperators: ['eq', 'in'], widget: 'relation-picker' }),
    amount: field(z.number().min(0).max(1_000_000_000), {
      label: 'Amount',
      filterOperators: ['eq', 'gt', 'gte', 'lt', 'lte', 'between'],
      sortable: true,
      widget: 'money',
    }),
    status: field(z.enum(INVOICE_STATUSES), {
      label: 'Status',
      filterOperators: ['eq', 'ne', 'in', 'nin'],
      sortable: true,
      widget: 'select',
    }),
    dueDate: field(z.iso.date(), { label: 'Due date', filterOperators: ['eq', 'gte', 'lte', 'between'], sortable: true }),
    notes: field(z.string().max(2000).optional(), { label: 'Notes', widget: 'textarea', help: 'Internal only' }),
  },
)
