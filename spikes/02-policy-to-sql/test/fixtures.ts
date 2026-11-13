import { PGlite } from '@electric-sql/pglite'
import { and, type Filter, not, or } from '../src/ast.js'
import { definePolicy } from '../src/policy.js'
import type { ModelSchema } from '../src/schema.js'
import { compileToSql } from '../src/sql.js'

/** TypeScript shape of an invoice as seen by policies (customer is a to-one relation). */
export type Invoice = {
  id: number
  ownerId: string | null
  amount: number | null
  status: string | null
  archived: boolean | null
  customerId: number | null
  customer: { region: string | null; tier: string | null } | null
}

export type ActorAttrs = { region: string; limit: number }

export const invoiceSchema: ModelSchema = {
  table: 'invoices',
  columns: {
    id: { column: 'id', type: 'int4' },
    ownerId: { column: 'owner_id', type: 'text' },
    amount: { column: 'amount', type: 'int4' },
    status: { column: 'status', type: 'text' },
    archived: { column: 'archived', type: 'bool' },
    customerId: { column: 'customer_id', type: 'int4' },
  },
  relations: {
    customer: {
      table: 'customers',
      foreignKey: 'customer_id',
      targetKey: 'id',
      columns: {
        region: { column: 'region', type: 'text' },
        tier: { column: 'tier', type: 'text' },
      },
    },
  },
}

/** A policy exercising every rule shape: role-only, condition-only, role+condition, actor refs, relations, deny. */
export const invoicePolicy = definePolicy<Invoice, ActorAttrs>('invoice', invoiceSchema, ({ allow, deny }) => {
  allow('read', { role: ['accountant', 'manager'] })
  allow('read', { when: ({ actor, row }) => row.ownerId.eq(actor.id) })
  allow('read', { role: 'regional', when: ({ actor, row }) => row.customer.region.eq(actor.attrs.region) })
  deny('read', { when: ({ row }) => row.archived.eq(true) })

  allow('approve', { role: 'manager', when: ({ row }) => and(row.amount.lte(10_000), row.status.in(['sent', 'draft'])) })
  allow('approve', { role: 'director' })
  deny('approve', { when: ({ actor, row }) => row.amount.gt(actor.attrs.limit) })

  allow('delete', { role: 'admin' })
  deny('delete', { when: ({ row }) => row.status.eq('paid') })

  allow('update', { when: ({ actor, row }) => and(row.ownerId.eq(actor.id), not(row.status.in(['paid', 'void']))) })
  deny('update', { role: 'auditor' })

  allow('export', {
    role: 'manager',
    when: ({ row }) => or(row.customer.tier.isNull(), row.customer.tier.ne('vip'), row.status.contains('ok')),
  })
})

export const ACTIONS = ['read', 'approve', 'delete', 'update', 'export', 'nonexistent'] as const

export interface CustomerRow {
  id: number
  region: string | null
  tier: string | null
}
export interface InvoiceRow {
  id: number
  owner_id: string | null
  amount: number | null
  status: string | null
  archived: boolean | null
  customer_id: number | null
}

/** In-process Postgres (PGlite). No foreign key on purpose: dangling customer_id = "no related row". */
export async function createDb(): Promise<PGlite> {
  const db = new PGlite()
  await db.exec(`
    CREATE TABLE customers (id int4 PRIMARY KEY, region text, tier text);
    CREATE TABLE invoices (
      id int4 PRIMARY KEY, owner_id text, amount int4, status text, archived bool, customer_id int4
    );
  `)
  return db
}

export async function load(db: PGlite, customers: readonly CustomerRow[], invoices: readonly InvoiceRow[]) {
  await db.transaction(async (tx) => {
    await tx.exec('TRUNCATE invoices, customers')
    for (const c of customers) {
      await tx.query('INSERT INTO customers (id, region, tier) VALUES ($1, $2, $3)', [c.id, c.region, c.tier])
    }
    for (const i of invoices) {
      await tx.query(
        'INSERT INTO invoices (id, owner_id, amount, status, archived, customer_id) VALUES ($1, $2, $3, $4, $5, $6)',
        [i.id, i.owner_id, i.amount, i.status, i.archived, i.customer_id],
      )
    }
  })
}

/** Run a filter as a list query and return matching ids (sorted). */
export async function queryIds(db: PGlite, filter: Filter): Promise<number[]> {
  const { sql, params } = compileToSql(filter, invoiceSchema, { alias: 't' })
  const res = await db.query<{ id: number }>(`SELECT t.id FROM invoices AS t WHERE ${sql} ORDER BY t.id`, params)
  return res.rows.map((r) => r.id)
}

/** Build the in-memory record exactly as a single-record loader would (relation resolved or null). */
export function toRecord(i: InvoiceRow, customers: readonly CustomerRow[]): Invoice {
  const c = i.customer_id === null ? undefined : customers.find((x) => x.id === i.customer_id)
  return {
    id: i.id,
    ownerId: i.owner_id,
    amount: i.amount,
    status: i.status,
    archived: i.archived,
    customerId: i.customer_id,
    customer: c ? { region: c.region, tier: c.tier } : null,
  }
}
