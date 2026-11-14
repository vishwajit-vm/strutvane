/**
 * Date bucketing per engine. SQLite and PostgreSQL run for real; MySQL's SQL text is pinned here
 * (running it needs Docker; spike 11 has the container helper and proved the session settings).
 */
import { PGlite } from '@electric-sql/pglite'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import type { DateInterval } from '../../src/shared/aggregate-contract.ts'
import { addBuckets, bucketKeys, ceilToBucket, countBuckets, parseUtcDate, startOfBucket } from '../../src/shared/dates.ts'
import type { AggregatePlan } from '../../src/server/plan.ts'
import { bucketExpression, quoteIdentifier, renderAggregate, toParam, UnsafeIdentifierError } from '../../src/server/sql.ts'
import { TENANT_A } from './fixture.ts'

/** Instants around every kind of boundary, and the bucket keys a correct engine must give them. */
const instants = [
  '2026-09-30T23:59:59.999Z', // last millisecond of a month
  '2026-10-01T00:00:00.000Z', // first instant of a month
  '2026-11-08T23:59:59.000Z', // Sunday night
  '2026-11-09T00:00:00.000Z', // Monday 00:00
  '2024-02-29T12:00:00.000Z', // leap day
  '2026-01-01T00:30:00.000Z', // New Year (a Thursday; its ISO week starts in December)
  '2027-01-03T23:00:00.000Z', // a Sunday in the first days of a year
]

/** The keys computed in JavaScript (UTC), the reference every engine is compared with. */
function expected(interval: DateInterval): string[] {
  return instants.map((instant) => startOfBucket(new Date(instant), interval).toISOString().slice(0, 10))
}

describe('JavaScript calendar math (the reference)', () => {
  it('weeks start on Monday; months on the 1st; all in UTC', () => {
    expect(expected('week')).toEqual(['2026-09-28', '2026-09-28', '2026-11-02', '2026-11-09', '2024-02-26', '2025-12-29', '2026-12-28'])
    expect(expected('month')).toEqual(['2026-09-01', '2026-10-01', '2026-11-01', '2026-11-01', '2024-02-01', '2026-01-01', '2027-01-01'])
  })

  it('parses only strict UTC dates in supported years', () => {
    expect(parseUtcDate('2026-11-14')?.toISOString()).toBe('2026-11-14T00:00:00.000Z')
    expect(parseUtcDate('2026-11-14T09:30:00Z')?.toISOString()).toBe('2026-11-14T09:30:00.000Z')
    for (const bad of ['2026-02-30', '2026-13-01', '2026-11-14T09:30:00+02:00', '2026-11-14 09:30', '1', '0001-01-01', '9999-12-31', '']) {
      expect(parseUtcDate(bad), bad).toBeUndefined()
    }
  })

  it('aligns, steps and counts buckets (counting stops past the limit)', () => {
    expect(ceilToBucket(new Date('2026-11-14T10:00:00Z'), 'day').toISOString()).toBe('2026-11-15T00:00:00.000Z')
    expect(ceilToBucket(new Date('2026-11-01T00:00:00Z'), 'month').toISOString()).toBe('2026-11-01T00:00:00.000Z')
    expect(addBuckets(new Date('2026-12-01T00:00:00Z'), 'month', -12).toISOString()).toBe('2025-12-01T00:00:00.000Z')
    expect(bucketKeys(new Date('2026-11-01T00:00:00Z'), new Date('2026-11-04T00:00:00Z'), 'day')).toEqual(['2026-11-01', '2026-11-02', '2026-11-03'])
    expect(countBuckets(new Date('1900-01-01T00:00:00Z'), new Date('9000-01-01T00:00:00Z'), 'day', 400)).toBe(401)
  })
})

describe('SQLite buckets match the reference', () => {
  const database = new DatabaseSync(':memory:')
  const intervals: DateInterval[] = ['day', 'week', 'month']
  it.each(intervals)('%s', (interval) => {
    const expression = bucketExpression({ name: 'created_at', kind: 'timestamp' }, interval, 'sqlite').replace('t."created_at"', '?')
    const keys = instants.map((instant) => (database.prepare(`SELECT ${expression} AS k`).get(instant) as { k: string }).k)
    expect(keys).toEqual(expected(interval))
  })
})

describe('PostgreSQL buckets match the reference in any session time zone', () => {
  const intervals: DateInterval[] = ['day', 'week', 'month']

  it.each(intervals)('%s, with the session in Los Angeles and in Kiritimati (UTC+14)', async (interval) => {
    const database = await PGlite.create()
    try {
      await database.exec('CREATE TABLE t (created_at timestamptz, issued_on date)')
      for (const instant of instants) await database.query('INSERT INTO t VALUES ($1, $2)', [instant, instant.slice(0, 10)])
      for (const zone of ['America/Los_Angeles', 'Pacific/Kiritimati']) {
        await database.exec(`SET TIME ZONE '${zone}'`)
        const timestamp = bucketExpression({ name: 'created_at', kind: 'timestamp' }, interval, 'postgres')
        const date = bucketExpression({ name: 'issued_on', kind: 'date' }, interval, 'postgres')
        const rows = await database.query<{ a: string; b: string }>(`SELECT ${timestamp} AS a, ${date} AS b FROM t`)
        expect(rows.rows.map((row) => row.a), zone).toEqual(expected(interval))
        // The date column holds the UTC calendar day, so its bucket is the day's bucket.
        expect(rows.rows.map((row) => row.b), zone).toEqual(instants.map((instant) => startOfBucket(new Date(instant.slice(0, 10)), interval).toISOString().slice(0, 10)))
      }
    } finally {
      await database.close()
    }
  })

  it('the naive expression (no AT TIME ZONE) puts midnight UTC on Oct 1 into September in Los Angeles', async () => {
    const database = await PGlite.create()
    try {
      await database.exec("SET TIME ZONE 'America/Los_Angeles'")
      const result = await database.query<{ naive: string; ours: string }>(
        `SELECT to_char(date_trunc('month', x), 'YYYY-MM-DD') AS naive, ${bucketExpression({ name: 'x', kind: 'timestamp' }, 'month', 'postgres').replace('t."x"', 'x')} AS ours FROM (SELECT '2026-10-01T00:00:00Z'::timestamptz AS x) s`,
      )
      expect(result.rows[0]).toEqual({ naive: '2026-09-01', ours: '2026-10-01' })
    } finally {
      await database.close()
    }
  })
})

describe('MySQL SQL text (pinned; executed against MySQL 8.4 in the product CI)', () => {
  const plan: AggregatePlan = {
    table: 'invoices',
    route: 'invoices',
    metric: 'sum',
    field: { name: 'total', kind: 'decimal', scale: 2 },
    group: { kind: 'date', column: { name: 'created_at', kind: 'timestamp' }, interval: 'week', keys: [] },
    split: { kind: 'category', column: { name: 'paid', kind: 'boolean' }, keys: ['true', 'false'] },
    conditions: [
      { kind: 'compare', column: 'created_at', op: '>=', value: { type: 'timestamp', value: new Date('2026-11-02T00:00:00Z') } },
      { kind: 'distinct', column: 'status', value: { type: 'text', value: 'void' } },
      { kind: 'in', column: 'paid', values: [{ type: 'boolean', value: true }] },
      { kind: 'like', column: 'number', pattern: '%100!%%' },
    ],
    softDeletes: true,
    dateField: 'created_at',
    from: null,
    to: null,
    minGroupSize: null,
  }
  const scope = { conditions: [{ kind: 'tenant', column: 'tenant_id', tenant: TENANT_A } as const], tenant: { column: 'tenant_id', id: TENANT_A } }

  it('uses backticks, ? placeholders, WEEKDAY() for Monday weeks, <=> for NULL-safe !=', () => {
    const { text, params } = renderAggregate(plan, scope, 'mysql')
    expect(text).toBe(
      "SELECT DATE_FORMAT(DATE_SUB(DATE(t.`created_at`), INTERVAL WEEKDAY(t.`created_at`) DAY), '%Y-%m-%d') AS bucket, t.`paid` AS series, COUNT(*) AS row_count, SUM(t.`total`) AS value_sum, COUNT(t.`total`) AS value_count " +
        "FROM `invoices` AS t WHERE t.`tenant_id` = ? AND t.`created_at` >= ? AND NOT (t.`status` <=> ?) AND t.`paid` IN (?) AND t.`number` LIKE ? ESCAPE '!' AND t.`deleted_at` IS NULL " +
        "GROUP BY DATE_FORMAT(DATE_SUB(DATE(t.`created_at`), INTERVAL WEEKDAY(t.`created_at`) DAY), '%Y-%m-%d'), t.`paid`",
    )
    // DATETIME literals have no "Z" (the session time zone is pinned to +00:00); booleans are 1/0.
    expect(params).toEqual([TENANT_A, '2026-11-02 00:00:00.000', 'void', 1, '%100!%%'])
  })

  it('LIKE escapes with "!", which MySQL accepts in every sql_mode (a backslash does not)', () => {
    // Checked on MySQL 8.4.13 (2026-11-15): ESCAPE '\' is a syntax error with the default sql_mode
    // and "Incorrect arguments to ESCAPE" with NO_BACKSLASH_ESCAPES (the mode the ORM pins), so
    // every contains/startsWith filter failed there. '!' means the same on all three engines.
    for (const dialect of ['mysql', 'postgres', 'sqlite'] as const) {
      const { text } = renderAggregate(plan, scope, dialect)
      expect(text).toContain("LIKE ? ESCAPE '!'".replace('?', dialect === 'postgres' ? '$5' : '?'))
      expect(text).not.toContain('\\')
    }
  })

  it('day and month buckets use DATE_FORMAT', () => {
    expect(bucketExpression({ name: 'created_at', kind: 'timestamp' }, 'day', 'mysql')).toBe("DATE_FORMAT(t.`created_at`, '%Y-%m-%d')")
    expect(bucketExpression({ name: 'created_at', kind: 'timestamp' }, 'month', 'mysql')).toBe("DATE_FORMAT(t.`created_at`, '%Y-%m-01')")
  })

  it('PostgreSQL and SQLite render the same plan with their own placeholders and NULL-safe !=', () => {
    expect(renderAggregate(plan, scope, 'postgres').text).toContain('t."status" IS DISTINCT FROM $3')
    expect(renderAggregate(plan, scope, 'sqlite').text).toContain('t."status" IS NOT ?')
    expect(renderAggregate(plan, scope, 'postgres').params[3]).toBe(true)
  })

  it('a top N on PostgreSQL sorts NULL sums last, like the other engines', () => {
    const top: AggregatePlan = { ...plan, split: { kind: 'none' }, conditions: [], group: { kind: 'relation', column: { name: 'customer_id', kind: 'foreignId' }, limit: 5 } }
    expect(renderAggregate(top, scope, 'postgres').text).toContain('ORDER BY SUM(t."total") DESC NULLS LAST, t."customer_id" ASC LIMIT $2')
    expect(renderAggregate(top, scope, 'mysql').text).toContain('ORDER BY SUM(t.`total`) DESC, t.`customer_id` ASC LIMIT ?')
    expect(renderAggregate(top, scope, 'mysql').params).toEqual([TENANT_A, 6])
  })

  it('converts values per engine', () => {
    expect(toParam({ type: 'decimal', value: '10.50' }, 'postgres')).toBe('10.50')
    expect(toParam({ type: 'decimal', value: '10.50' }, 'sqlite')).toBe(10.5)
    expect(toParam({ type: 'timestamp', value: new Date('2026-11-14T09:30:00Z') }, 'sqlite')).toBe('2026-11-14T09:30:00.000Z')
  })

  it('refuses identifiers that are not plain names, even from metadata', () => {
    expect(() => quoteIdentifier('invoices; DROP TABLE users', 'mysql')).toThrow(UnsafeIdentifierError)
    expect(() => quoteIdentifier('Invoices', 'postgres')).toThrow(UnsafeIdentifierError)
  })
})
