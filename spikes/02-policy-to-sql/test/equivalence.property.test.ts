/**
 * THE KEY RESULT: property-based proof that the in-memory path and the SQL path agree.
 *
 * 1. Random filter ASTs (nested and/or/not over every operator, including relation paths and NULLs)
 *    evaluated against random rows: `evaluate(filter, row)` === (row ∈ SELECT … WHERE compile(filter)).
 * 2. The real policy: for random actors × every action × random rows:
 *    `policy.can(actor, action, row)` === (row ∈ SELECT … WHERE compile(policy.filterFor(actor, action))).
 *
 * Generators deliberately bias toward collisions (small value pools) and edge cases: NULLs, empty strings,
 * SQL metacharacters, LIKE wildcards, unicode, dangling foreign keys, and the 10_000 boundary.
 */
import type { PGlite } from '@electric-sql/pglite'
import fc from 'fast-check'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Filter, FieldRef, Operand, Scalar } from '../src/ast.js'
import { type Actor, bindActor } from '../src/bind.js'
import { evaluate } from '../src/evaluate.js'
import {
  ACTIONS,
  createDb,
  type CustomerRow,
  type InvoiceRow,
  invoicePolicy,
  invoiceSchema,
  load,
  queryIds,
  toRecord,
} from './fixtures.js'

export const NUM_RUNS = Number(process.env['PROPERTY_RUNS'] ?? 300)

// ---- value pools -------------------------------------------------------------------------------------
const TEXTS = ['', 'a', 'A', 'paid', 'draft', 'sent', 'ok', 'EU', 'US', 'vip', '%', '_', "x'; DROP TABLE invoices;--", 'ä', '😀', 'pa']
const text = fc.oneof(fc.constant(null), fc.constantFrom(...TEXTS))
const int = fc.oneof(fc.constant(null), fc.constantFrom(-1, 0, 1, 100, 9_999, 10_000, 10_001, 2_147_483_647), fc.integer({ min: -50, max: 20_000 }))
const bool = fc.oneof(fc.constant(null), fc.boolean())

const customersArb = fc.uniqueArray(
  fc.record({ id: fc.integer({ min: 1, max: 6 }), region: text, tier: text }),
  { selector: (c) => c.id, maxLength: 5 },
)
const invoicesArb = fc.uniqueArray(
  fc.record({
    id: fc.integer({ min: 1, max: 1_000 }),
    owner_id: fc.oneof(fc.constant(null), fc.constantFrom('alice', 'bob', 'carol', '')),
    amount: int,
    status: text,
    archived: bool,
    customer_id: fc.oneof(fc.constant(null), fc.integer({ min: 1, max: 8 })), // 7, 8 are always dangling
  }),
  { selector: (i) => i.id, minLength: 1, maxLength: 12 },
)

// ---- random filter ASTs ------------------------------------------------------------------------------
type Kind = 'text' | 'int4' | 'bool'
const FIELDS: Array<{ path: FieldRef['path']; kind: Kind }> = [
  { path: ['ownerId'], kind: 'text' },
  { path: ['status'], kind: 'text' },
  { path: ['amount'], kind: 'int4' },
  { path: ['archived'], kind: 'bool' },
  { path: ['customerId'], kind: 'int4' },
  { path: ['customer', 'region'], kind: 'text' },
  { path: ['customer', 'tier'], kind: 'text' },
]
const valueFor = (k: Kind): fc.Arbitrary<Scalar> => (k === 'text' ? text : k === 'int4' ? int : bool)
const operandFor = (k: Kind): fc.Arbitrary<Operand> =>
  k === 'text'
    ? fc.oneof(
        valueFor(k).map((v) => ({ kind: 'value' as const, value: v })),
        fc.constant({ kind: 'actor' as const, path: ['attrs', 'region'] }),
        fc.constant({ kind: 'actor' as const, path: ['id'] }),
      )
    : k === 'int4'
      ? fc.oneof(valueFor(k).map((v) => ({ kind: 'value' as const, value: v })), fc.constant({ kind: 'actor' as const, path: ['attrs', 'limit'] }))
      : valueFor(k).map((v) => ({ kind: 'value' as const, value: v }))

const leaf: fc.Arbitrary<Filter> = fc.constantFrom(...FIELDS).chain(({ path, kind }) => {
  const field = { path }
  const options: fc.Arbitrary<Filter>[] = [
    fc.constantFrom('eq' as const, 'ne' as const).chain((op) => operandFor(kind).map((value) => ({ op, field, value }))),
    fc.constantFrom('in' as const, 'nin' as const).chain((op) => fc.array(operandFor(kind), { maxLength: 3 }).map((values) => ({ op, field, values }))),
    fc.boolean().map((value) => ({ op: 'isNull' as const, field, value })),
  ]
  if (kind === 'int4') {
    options.push(fc.constantFrom('gt' as const, 'gte' as const, 'lt' as const, 'lte' as const).chain((op) => operandFor(kind).map((value) => ({ op, field, value }))))
  }
  if (kind === 'text') options.push(operandFor(kind).map((value) => ({ op: 'contains' as const, field, value })))
  return fc.oneof(...options)
})

const filterArb: fc.Arbitrary<Filter> = fc.letrec<{ node: Filter }>((tie) => ({
  node: fc.oneof(
    { depthSize: 'small', withCrossShrink: true },
    leaf,
    leaf,
    fc.constant<Filter>({ op: 'true' }),
    fc.constant<Filter>({ op: 'false' }),
    tie('node').map((arg): Filter => ({ op: 'not', arg })),
    fc.array(tie('node'), { maxLength: 3 }).map((args): Filter => ({ op: 'and', args })),
    fc.array(tie('node'), { maxLength: 3 }).map((args): Filter => ({ op: 'or', args })),
  ),
})).node

const actorArb: fc.Arbitrary<Actor> = fc.record({
  id: fc.constantFrom('alice', 'bob', 'carol', ''),
  roles: fc.subarray(['accountant', 'manager', 'regional', 'director', 'admin', 'auditor']),
  // Attributes are always present (possibly null): a missing attribute throws by design (tested separately).
  attrs: fc.record({
    region: fc.oneof(fc.constant(null), fc.constantFrom('EU', 'US', '', '%')),
    limit: fc.oneof(fc.constant(null), fc.constantFrom(0, 500, 1_000, 10_000)),
  }),
})

// ---- harness -----------------------------------------------------------------------------------------
let db: PGlite
let comparisons = 0
beforeAll(async () => {
  db = await createDb()
})
afterAll(async () => {
  await db.close()
  // Surface the evidence size in the test output.
  console.log(`[equivalence] property runs per test: ${NUM_RUNS}; row-level comparisons: ${comparisons}`)
})

function memIds(filter: Filter, invoices: InvoiceRow[], customers: CustomerRow[]): number[] {
  return invoices
    .filter((i) => evaluate(filter, toRecord(i, customers), invoiceSchema))
    .map((i) => i.id)
    .sort((a, b) => a - b)
}

describe('in-memory evaluation ≡ SQL compilation', () => {
  it('random filter ASTs (all operators, NULLs, relations, actor refs)', async () => {
    await fc.assert(
      fc.asyncProperty(customersArb, invoicesArb, filterArb, actorArb, async (customers, invoices, raw, actor) => {
        await load(db, customers, invoices)
        const filter = bindActor(raw, actor)
        const expected = memIds(filter, invoices, customers)
        const actual = await queryIds(db, filter)
        comparisons += invoices.length
        expect(actual).toEqual(expected)
      }),
      { numRuns: NUM_RUNS },
    )
  })

  it('the real policy: can(actor, action, row) === row ∈ list(filterFor(actor, action))', async () => {
    await fc.assert(
      fc.asyncProperty(customersArb, invoicesArb, actorArb, async (customers, invoices, actor) => {
        await load(db, customers, invoices)
        for (const action of ACTIONS) {
          const expected = invoices
            .filter((i) => invoicePolicy.can(actor, action, toRecord(i, customers)))
            .map((i) => i.id)
            .sort((a, b) => a - b)
          const actual = await queryIds(db, invoicePolicy.filterFor(actor, action))
          comparisons += invoices.length
          expect(actual).toEqual(expected)
        }
      }),
      { numRuns: NUM_RUNS },
    )
  })
})
