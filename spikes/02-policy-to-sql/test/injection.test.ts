/**
 * SQL injection: values are always parameters, and field paths from untrusted filters (e.g. a UI sending a
 * QueryFilter AST) are validated against the schema. Identifiers are never taken from input.
 */
import type { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { type Filter, value } from '../src/ast.js'
import { PolicyTypeError } from '../src/bind.js'
import { SchemaError } from '../src/schema.js'
import { compileToSql } from '../src/sql.js'
import { createDb, invoiceSchema, load, queryIds } from './fixtures.js'

const PAYLOADS = [
  "' OR '1'='1",
  "x'; DROP TABLE invoices; --",
  "\\'; DELETE FROM customers; --",
  '$1',
  '"; SELECT pg_sleep(5); --',
  "') OR TRUE --",
  '%',
  '_',
  "''",
]

let db: PGlite
beforeAll(async () => {
  db = await createDb()
  await load(db, [{ id: 1, region: 'EU', tier: null }], [
    { id: 1, owner_id: 'alice', amount: 1, status: 'paid', archived: false, customer_id: 1 },
    { id: 2, owner_id: PAYLOADS[0] as string, amount: 2, status: '%', archived: false, customer_id: null },
  ])
})
afterAll(async () => {
  await db.close()
})

describe('values are parameters, never SQL text', () => {
  for (const p of PAYLOADS) {
    it(`payload ${JSON.stringify(p)}`, async () => {
      const filters: Filter[] = [
        { op: 'eq', field: { path: ['ownerId'] }, value: value(p) },
        { op: 'contains', field: { path: ['status'] }, value: value(p) },
        { op: 'in', field: { path: ['customer', 'region'] }, values: [value(p), value('EU')] },
        { op: 'ne', field: { path: ['ownerId'] }, value: value(p) },
      ]
      for (const f of filters) {
        const { sql, params } = compileToSql(f, invoiceSchema)
        expect(params).toContain(p)
        if (p.length > 2) expect(sql).not.toContain(p) // the payload text never appears in the SQL
        await queryIds(db, f) // executes without error
      }
      // tables are intact and unchanged
      const counts = await db.query<{ i: number; c: number }>(
        'SELECT (SELECT count(*)::int FROM invoices) AS i, (SELECT count(*)::int FROM customers) AS c',
      )
      expect(counts.rows[0]).toEqual({ i: 2, c: 1 })
    })
  }

  it('an exact-match payload matches only the row that literally contains it', async () => {
    expect(await queryIds(db, { op: 'eq', field: { path: ['ownerId'] }, value: value(PAYLOADS[0] as string) })).toEqual([2])
  })
})

describe('untrusted ASTs cannot inject identifiers or smuggle bad values', () => {
  it('rejects unknown fields', () => {
    expect(() => compileToSql({ op: 'eq', field: { path: ['password_hash'] }, value: value('x') }, invoiceSchema)).toThrow(SchemaError)
  })
  it('rejects identifier-injection attempts in paths', () => {
    expect(() =>
      compileToSql({ op: 'isNull', field: { path: ['amount" OR 1=1 --'] }, value: true }, invoiceSchema),
    ).toThrow(SchemaError)
  })
  it('rejects paths deeper than one relation', () => {
    const f = { op: 'isNull', field: { path: ['customer', 'region', 'x'] }, value: true } as unknown as Filter
    expect(() => compileToSql(f, invoiceSchema)).toThrow(SchemaError)
  })
  it('rejects type-mismatched values (e.g. a string where an integer is expected)', () => {
    expect(() => compileToSql({ op: 'eq', field: { path: ['amount'] }, value: value('1 OR 1=1') }, invoiceSchema)).toThrow(PolicyTypeError)
  })
  it('rejects ordering on text (collation-dependent) and contains on non-text', () => {
    expect(() => compileToSql({ op: 'gt', field: { path: ['status'] }, value: value('a') }, invoiceSchema)).toThrow(PolicyTypeError)
    expect(() => compileToSql({ op: 'contains', field: { path: ['amount'] }, value: value(1) }, invoiceSchema)).toThrow(PolicyTypeError)
  })
  it('rejects NUL characters (Postgres text cannot hold them; JS can)', () => {
    expect(() => compileToSql({ op: 'eq', field: { path: ['status'] }, value: value('a\u0000b') }, invoiceSchema)).toThrow(PolicyTypeError)
  })
})
