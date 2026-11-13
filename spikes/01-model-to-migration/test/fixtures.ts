import { defineModel, field, type FieldBuilder, type ModelOptions } from '../src/dsl.js'

export const tenantOptions: ModelOptions = { timestamps: true, softDeletes: true, tenant: true }

export const customer = (name = 'Customer') => defineModel(name, { name: field.string(120) }, { tenant: true })

/** The Invoice model from the spike question, plus an optional `notes` field used by the rename tests. */
export const invoiceFields = (customerModel = 'Customer'): Record<string, FieldBuilder> => ({
  number: field.string().unique(),
  amount: field.decimal(12, 2),
  status: field.enum(['draft', 'paid']).default('draft'),
  customer: field.belongsTo(customerModel),
  notes: field.text().optional(),
})

export const invoice = (fields: Record<string, FieldBuilder> = invoiceFields(), options: ModelOptions = tenantOptions) =>
  defineModel('Invoice', fields, options)

/** Deterministic ids for inserts (the framework will generate UUIDv7 in application code). */
export const ids = {
  tenant: '00000000-0000-7000-8000-000000000001',
  customer: '00000000-0000-7000-8000-0000000000c1',
  invoice: '00000000-0000-7000-8000-0000000000a1',
}

export const now = '2026-11-13T12:00:00.000Z'
