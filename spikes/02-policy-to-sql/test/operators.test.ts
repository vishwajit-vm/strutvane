/**
 * Operator-by-operator tests. Each case states the EXPECTED matching ids explicitly, so this file doubles as
 * executable documentation of the NULL semantics, and checks BOTH paths against that expectation.
 */
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { and, type Filter, FALSE, not, or, TRUE, value } from '../src/ast.js'
import { evaluate } from '../src/evaluate.js'
import { createDb, type CustomerRow, type InvoiceRow, invoiceSchema, load, queryIds, toRecord } from './fixtures.js'

const customers: CustomerRow[] = [
  { id: 10, region: 'EU', tier: 'vip' },
  { id: 11, region: null, tier: null },
]
// id: owner, amount, status, archived, customer
const invoices: InvoiceRow[] = [
  { id: 1, owner_id: 'u1', amount: 100, status: 'paid', archived: false, customer_id: 10 },
  { id: 2, owner_id: 'u2', amount: 20_000, status: 'draft', archived: true, customer_id: 11 },
  { id: 3, owner_id: null, amount: null, status: null, archived: null, customer_id: null },
  { id: 4, owner_id: 'u1', amount: 10_000, status: '50%_off', archived: false, customer_id: 99 }, // dangling FK
]

const f = (path: string) => ({ path: path.split('.') as [string] | [string, string] })

let db: PGlite
beforeAll(async () => {
  db = await createDb()
  await load(db, customers, invoices)
})
afterAll(async () => {
  await db.close()
})

function memIds(filter: Filter): number[] {
  return invoices.filter((i) => evaluate(filter, toRecord(i, customers), invoiceSchema)).map((i) => i.id)
}

const cases: Array<[string, Filter, number[]]> = [
  ['true', TRUE, [1, 2, 3, 4]],
  ['false', FALSE, []],
  ['eq text', { op: 'eq', field: f('ownerId'), value: value('u1') }, [1, 4]],
  ['eq null (IS NULL semantics)', { op: 'eq', field: f('ownerId'), value: value(null) }, [3]],
  ['ne text INCLUDES nulls (two-valued)', { op: 'ne', field: f('ownerId'), value: value('u1') }, [2, 3]],
  ['not(eq) == ne', not({ op: 'eq', field: f('ownerId'), value: value('u1') }), [2, 3]],
  ['gt', { op: 'gt', field: f('amount'), value: value(100) }, [2, 4]],
  ['gte', { op: 'gte', field: f('amount'), value: value(10_000) }, [2, 4]],
  ['lt excludes null', { op: 'lt', field: f('amount'), value: value(10_000) }, [1]],
  ['lte', { op: 'lte', field: f('amount'), value: value(10_000) }, [1, 4]],
  ['not(lt) INCLUDES null', not({ op: 'lt', field: f('amount'), value: value(10_000) }), [2, 3, 4]],
  ['gt against null value is false', { op: 'gt', field: f('amount'), value: value(null) }, []],
  ['in', { op: 'in', field: f('status'), values: [value('paid'), value('draft')] }, [1, 2]],
  ['in with null element', { op: 'in', field: f('status'), values: [value('paid'), value(null)] }, [1, 3]],
  ['in empty is false', { op: 'in', field: f('status'), values: [] }, []],
  ['nin INCLUDES nulls', { op: 'nin', field: f('status'), values: [value('paid')] }, [2, 3, 4]],
  ['nin empty is true', { op: 'nin', field: f('status'), values: [] }, [1, 2, 3, 4]],
  ['isNull', { op: 'isNull', field: f('status'), value: true }, [3]],
  ['isNotNull', { op: 'isNull', field: f('status'), value: false }, [1, 2, 4]],
  ['eq bool', { op: 'eq', field: f('archived'), value: value(true) }, [2]],
  ['ne bool includes null', { op: 'ne', field: f('archived'), value: value(true) }, [1, 3, 4]],
  ['contains', { op: 'contains', field: f('status'), value: value('ai') }, [1]],
  ['contains treats % and _ literally (not LIKE)', { op: 'contains', field: f('status'), value: value('%_') }, [4]],
  ['contains % alone matches only literal %', { op: 'contains', field: f('status'), value: value('%') }, [4]],
  ['contains empty string matches any non-null', { op: 'contains', field: f('status'), value: value('') }, [1, 2, 4]],
  ['contains is case-sensitive', { op: 'contains', field: f('status'), value: value('PAID') }, []],
  ['relation eq', { op: 'eq', field: f('customer.region'), value: value('EU') }, [1]],
  ['relation isNull: null column, no customer, dangling FK', { op: 'isNull', field: f('customer.region'), value: true }, [2, 3, 4]],
  ['relation ne includes missing customers', { op: 'ne', field: f('customer.tier'), value: value('vip') }, [2, 3, 4]],
  ['and', and({ op: 'eq', field: f('ownerId'), value: value('u1') }, { op: 'eq', field: f('archived'), value: value(false) }), [1, 4]],
  ['or', or({ op: 'eq', field: f('status'), value: value('paid') }, { op: 'isNull', field: f('amount'), value: true }), [1, 3]],
  ['and() of nothing is true', { op: 'and', args: [] }, [1, 2, 3, 4]],
  ['or() of nothing is false', { op: 'or', args: [] }, []],
  ['not over a NULL-bearing subtree', not(or({ op: 'gt', field: f('amount'), value: value(500) }, { op: 'eq', field: f('status'), value: value('x') })), [1, 3]],
]

describe('operators: in-memory and SQL agree with the documented semantics', () => {
  for (const [name, filter, expected] of cases) {
    it(name, async () => {
      expect(memIds(filter)).toEqual(expected)
      expect(await queryIds(db, filter)).toEqual(expected)
    })
  }
})

describe('the naive SQL a hand-written compiler would emit gets these wrong', () => {
  it('`owner_id <> $1` drops NULL rows that JS considers "not equal" (why we emit IS DISTINCT FROM)', async () => {
    const res = await db.query<{ id: number }>('SELECT id FROM invoices WHERE owner_id <> $1 ORDER BY id', ['u1'])
    expect(res.rows.map((r) => r.id)).toEqual([2]) // JS/two-valued answer is [2, 3]
  })
  it('`NOT (amount < $1)` drops NULL rows (why every leaf is COALESCEd to a boolean)', async () => {
    const res = await db.query<{ id: number }>('SELECT id FROM invoices WHERE NOT (amount < $1) ORDER BY id', [10_000])
    expect(res.rows.map((r) => r.id)).toEqual([2, 4]) // two-valued answer is [2, 3, 4]
  })
  it('`status LIKE %value%` treats user input as wildcards (why contains uses strpos)', async () => {
    const res = await db.query<{ id: number }>("SELECT id FROM invoices WHERE status LIKE '%' || $1 || '%' ORDER BY id", ['_'])
    expect(res.rows.map((r) => r.id)).toEqual([1, 2, 4]) // literal "_" only occurs in invoice 4
  })
})
