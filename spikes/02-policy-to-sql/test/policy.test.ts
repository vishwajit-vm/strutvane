import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Actor } from '../src/bind.js'
import { PolicyTypeError } from '../src/bind.js'
import { FieldNotLoadedError } from '../src/evaluate.js'
import { definePolicy, NotListFilterableError } from '../src/policy.js'
import { compileToSql } from '../src/sql.js'
import {
  createDb,
  type CustomerRow,
  type Invoice,
  type InvoiceRow,
  invoicePolicy,
  invoiceSchema,
  load,
  queryIds,
  toRecord,
} from './fixtures.js'

const customers: CustomerRow[] = [
  { id: 10, region: 'EU', tier: 'vip' },
  { id: 11, region: 'US', tier: null },
]
const invoices: InvoiceRow[] = [
  { id: 1, owner_id: 'alice', amount: 500, status: 'sent', archived: false, customer_id: 10 },
  { id: 2, owner_id: 'bob', amount: 12_000, status: 'sent', archived: false, customer_id: 11 },
  { id: 3, owner_id: 'alice', amount: 900, status: 'paid', archived: true, customer_id: 11 },
  { id: 4, owner_id: null, amount: null, status: null, archived: null, customer_id: null },
]

const actor = (id: string, roles: string[], attrs: Actor['attrs'] = {}): Actor => ({ id, roles, attrs })

let db: PGlite
beforeAll(async () => {
  db = await createDb()
  await load(db, customers, invoices)
})
afterAll(async () => {
  await db.close()
})

/** Assert both paths agree and return the allowed ids. */
async function allowed(a: Actor, action: string): Promise<number[]> {
  const mem = invoices.filter((i) => invoicePolicy.can(a, action, toRecord(i, customers))).map((i) => i.id)
  const sql = await queryIds(db, invoicePolicy.filterFor(a, action))
  expect(sql).toEqual(mem)
  return mem
}

describe('combination semantics', () => {
  it('deny-by-default: an unknown action allows nothing', async () => {
    expect(await allowed(actor('alice', ['admin', 'manager']), 'nonexistent')).toEqual([])
    expect(invoicePolicy.filterFor(actor('x', []), 'nonexistent')).toEqual({ op: 'false' })
  })

  it('owner sees own invoices; deny(archived) overrides the allow', async () => {
    expect(await allowed(actor('alice', []), 'read')).toEqual([1]) // #3 is alice's but archived
  })

  it('role-only allow covers all records, still subject to deny', async () => {
    expect(await allowed(actor('carol', ['accountant']), 'read')).toEqual([1, 2, 4])
  })

  it('role + relation condition with actor attribute', async () => {
    expect(await allowed(actor('dave', ['regional'], { region: 'US' }), 'read')).toEqual([2])
  })

  it('SECURITY: a null actor attribute never matches, not even records whose field is NULL', async () => {
    // Invoice #4 has no customer, so customer.region is NULL. A naive null-safe eq would grant it.
    expect(await allowed(actor('dave', ['regional'], { region: null }), 'read')).toEqual([])
  })

  it('SECURITY: a missing actor attribute throws instead of silently binding to null', () => {
    expect(() => invoicePolicy.filterFor(actor('dave', ['regional']), 'read')).toThrow(PolicyTypeError)
    expect(() => invoicePolicy.can(actor('dave', ['regional']), 'read', toRecord(invoices[3] as InvoiceRow, customers))).toThrow(
      PolicyTypeError,
    )
  })

  it('approve: manager within limit; deny when amount exceeds actor limit', async () => {
    expect(await allowed(actor('m', ['manager'], { limit: 1_000 }), 'approve')).toEqual([1])
    // limit explicitly null → gt(amount, null) is false → no deny; #2 still fails the 10k manager cap
    expect(await allowed(actor('m', ['manager'], { limit: null }), 'approve')).toEqual([1])
    expect(await allowed(actor('d', ['director'], { limit: 1_000 }), 'approve')).toEqual([1, 3, 4])
  })

  it('delete: admin except paid', async () => {
    expect(await allowed(actor('a', ['admin']), 'delete')).toEqual([1, 2, 4])
  })

  it('update: role-only deny beats a condition allow', async () => {
    expect(await allowed(actor('alice', []), 'update')).toEqual([1])
    expect(await allowed(actor('alice', ['auditor']), 'update')).toEqual([])
  })

  it('export: or() across relation null checks, ne and contains', async () => {
    expect(await allowed(actor('m', ['manager']), 'export')).toEqual([2, 3, 4])
  })
})

describe('fail-closed behaviour', () => {
  it('throws if a needed relation was not loaded instead of guessing', () => {
    const rec = { ...toRecord(invoices[0] as InvoiceRow, customers) } as Partial<Invoice>
    delete rec.customer
    expect(() => invoicePolicy.can(actor('d', ['regional'], { region: 'EU' }), 'read', rec)).toThrow(FieldNotLoadedError)
  })

  it('throws on actor attribute of the wrong type, in BOTH paths', () => {
    const bad = actor('m', ['manager'], { limit: 'lots' })
    expect(() => invoicePolicy.filterFor(bad, 'approve') && compileToSql(invoicePolicy.filterFor(bad, 'approve'), invoiceSchema)).toThrow(PolicyTypeError)
    expect(() => invoicePolicy.can(bad, 'approve', toRecord(invoices[0] as InvoiceRow, customers))).toThrow(PolicyTypeError)
  })

  it('escape-hatch check(): works in can(), refuses to compile for lists', () => {
    const p = definePolicy<Invoice>('invoice', invoiceSchema, ({ allow }) => {
      allow('read', { check: ({ record }) => record['id'] === 1 })
    })
    expect(p.can(actor('x', []), 'read', toRecord(invoices[0] as InvoiceRow, customers))).toBe(true)
    expect(p.can(actor('x', []), 'read', toRecord(invoices[1] as InvoiceRow, customers))).toBe(false)
    expect(() => p.filterFor(actor('x', []), 'read')).toThrow(NotListFilterableError)
  })
})
