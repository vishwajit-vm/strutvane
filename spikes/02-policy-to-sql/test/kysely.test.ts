/**
 * The policy fragment composes with a real query builder: Kysely renumbers our parameters correctly when
 * they are mixed with the caller's own parameterized clauses, and the result runs on Postgres.
 */
import type { PGlite } from '@electric-sql/pglite'
import { DummyDriver, Kysely, PostgresAdapter, PostgresIntrospector, PostgresQueryCompiler } from 'kysely'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Actor } from '../src/bind.js'
import { policyWhere } from '../src/kysely.js'
import { createDb, invoicePolicy, invoiceSchema, load } from './fixtures.js'

interface DB {
  invoices: { id: number; owner_id: string | null; amount: number | null; status: string | null; archived: boolean | null; customer_id: number | null }
}

const kysely = new Kysely<DB>({
  dialect: {
    createAdapter: () => new PostgresAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new PostgresIntrospector(db),
    createQueryCompiler: () => new PostgresQueryCompiler(),
  },
})

let db: PGlite
beforeAll(async () => {
  db = await createDb()
  await load(db, [{ id: 10, region: 'EU', tier: null }], [
    { id: 1, owner_id: 'alice', amount: 500, status: 'sent', archived: false, customer_id: 10 },
    { id: 2, owner_id: 'alice', amount: 50, status: 'sent', archived: false, customer_id: null },
    { id: 3, owner_id: 'bob', amount: 900, status: 'sent', archived: false, customer_id: 10 },
  ])
})
afterAll(async () => {
  await db.close()
})

describe('Kysely integration', () => {
  it('composes with other parameterized clauses and runs', async () => {
    const actor: Actor = { id: 'alice', roles: [], attrs: {} }
    const q = kysely
      .selectFrom('invoices as t')
      .select('t.id')
      .where('t.amount', '>', 100) // caller's own parameter comes first
      .where(policyWhere(invoicePolicy.filterFor(actor, 'read'), invoiceSchema, { alias: 't' }))
      .orderBy('t.id')
      .compile()

    expect(q.sql).toContain('$1')
    expect(q.sql).toMatch(/\$2::(text|bool)/) // policy params numbered after the caller's
    const res = await db.query<{ id: number }>(q.sql, q.parameters as unknown[])
    expect(res.rows.map((r) => r.id)).toEqual([1])
  })
})
