/**
 * A small multi-tenant database with hand-checked numbers, created identically on SQLite
 * (`node:sqlite`) and PostgreSQL (PGlite), plus a handler wired to it.
 *
 * The rows are chosen to sit on the edges that break date bucketing: the last millisecond of a
 * month, midnight UTC on the 1st, a Sunday night and the Monday after, NULL dates and amounts, a
 * soft-deleted row, and tenant B with huge amounts so any leak is obvious in a sum.
 */
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { parseAppMetadata, type AppMetadata } from '../../src/shared/metadata.ts'
import { resolveCharts, type ResolvedResourceCharts } from '../../src/shared/resolve.ts'
import type { AggregateExecutor } from '../../src/server/execute.ts'
import { pgliteExecutor, sqliteExecutor } from '../../src/server/executors.ts'
import { createAggregateHandler, type AggregateHandlerOptions } from '../../src/server/handler.ts'
import { runWithTenant, type Actor, type ChartsPolicy } from '../../src/server/scope.ts'

export const TENANT_A = '01900000-0000-7000-8000-00000000000a'
export const TENANT_B = '01900000-0000-7000-8000-00000000000b'
/** "Now" for every test: Saturday 2026-11-14, noon UTC. */
export const NOW = new Date('2026-11-14T12:00:00.000Z')

// Resolved from the working directory (vitest runs in the spike root): under jsdom, import.meta.url
// is not a file: URL.
export const metadata: AppMetadata = parseAppMetadata(JSON.parse(readFileSync(join(process.cwd(), 'example/.strutvane/resources.json'), 'utf8')))

/** Resolved charts with the employees resource marked sensitive (k = 5), as its owned file does. */
export const charts: Map<string, ResolvedResourceCharts> = resolveCharts(metadata, [{ resource: 'employees', config: { privacy: { minGroupSize: 5 } } }])

/** An admin may see everything of their tenant. */
export const admin: Actor = { id: '1', roles: ['admin'] }

/** Policies: admins see all rows; an account manager only sees customer 1's invoices. */
export const policies: Record<string, ChartsPolicy> = {
  invoices: {
    viewAny: (actor) => actor !== null && (actor.roles.includes('admin') || actor.roles.includes('account-manager')),
    scope: (actor) => (actor.roles.includes('admin') ? [] : [{ field: 'customer_id', value: ['1'] }]),
  },
  customers: { viewAny: (actor) => actor?.roles.includes('admin') === true },
  employees: { viewAny: (actor) => actor?.roles.includes('admin') === true },
  users: { viewAny: (actor) => actor?.roles.includes('admin') === true },
  tags: { viewAny: () => true },
}

interface InvoiceRow {
  readonly id: number
  readonly tenant: string
  readonly customer: number
  readonly status: string
  readonly total: string
  readonly tax: string | null
  readonly paid: boolean
  readonly issuedOn: string | null
  readonly createdAt: string
  readonly deletedAt?: string
}

/** Tenant A: 7 live invoices around boundaries, 1 deleted, 8 small June ones for the top N. */
const invoices: readonly InvoiceRow[] = [
  { id: 1, tenant: TENANT_A, customer: 1, status: 'paid', total: '100.10', tax: '10.01', paid: true, issuedOn: '2026-09-30', createdAt: '2026-09-30T23:59:59.999Z' },
  { id: 2, tenant: TENANT_A, customer: 1, status: 'paid', total: '200.20', tax: null, paid: true, issuedOn: '2026-10-01', createdAt: '2026-10-01T00:00:00.000Z' },
  { id: 3, tenant: TENANT_A, customer: 2, status: 'sent', total: '50.05', tax: '5.00', paid: false, issuedOn: '2026-10-15', createdAt: '2026-10-15T12:00:00.000Z' },
  { id: 4, tenant: TENANT_A, customer: 2, status: 'draft', total: '0.10', tax: null, paid: false, issuedOn: null, createdAt: '2026-11-01T00:00:00.000Z' },
  { id: 5, tenant: TENANT_A, customer: 3, status: 'draft', total: '0.20', tax: null, paid: false, issuedOn: null, createdAt: '2026-11-09T00:00:00.000Z' },
  { id: 6, tenant: TENANT_A, customer: 3, status: 'void', total: '999.99', tax: null, paid: false, issuedOn: '2026-11-08', createdAt: '2026-11-08T23:59:59.000Z' },
  { id: 7, tenant: TENANT_A, customer: 1, status: 'paid', total: '300.00', tax: '30.00', paid: true, issuedOn: '2026-11-14', createdAt: '2026-11-14T08:00:00.000Z' },
  { id: 8, tenant: TENANT_A, customer: 4, status: 'sent', total: '70.00', tax: '7.00', paid: false, issuedOn: '2026-11-14', createdAt: '2026-11-14T09:00:00.000Z', deletedAt: '2026-11-14T10:00:00.000Z' },
  ...Array.from({ length: 8 }, (_, index): InvoiceRow => ({ id: 9 + index, tenant: TENANT_A, customer: 5 + index, status: 'paid', total: '10.00', tax: '1.00', paid: true, issuedOn: '2026-06-15', createdAt: '2026-06-15T10:00:00.000Z' })),
  // Tenant B: big numbers on the same days, so a leak would be impossible to miss.
  ...Array.from({ length: 5 }, (_, index): InvoiceRow => ({ id: 101 + index, tenant: TENANT_B, customer: 101, status: 'paid', total: '1000000.00', tax: '1.00', paid: true, issuedOn: '2026-11-10', createdAt: '2026-11-10T10:00:00.000Z' })),
]

/** Employees of tenant A: engineering 6 (3 remote), sales 5, support 2 (1 remote), finance 1. */
const employees: readonly (readonly [string, string, number, boolean])[] = [
  ...Array.from({ length: 6 }, (_, index) => [TENANT_A, 'engineering', 100_000 + index * 1_000, index < 3] as const),
  ...Array.from({ length: 5 }, (_, index) => [TENANT_A, 'sales', 60_000 + index * 1_000, false] as const),
  [TENANT_A, 'support', 40_000, true],
  [TENANT_A, 'support', 42_000, false],
  [TENANT_A, 'finance', 250_000, false],
  ...Array.from({ length: 3 }, () => [TENANT_B, 'legal', 1_000_000, false] as const),
]

/** DDL for one dialect. Types follow spike 10/11 (ISO text timestamps on SQLite). */
function schema(dialect: 'sqlite' | 'postgres'): string {
  const uuid = dialect === 'postgres' ? 'uuid' : 'text'
  const ts = dialect === 'postgres' ? 'timestamptz' : 'text'
  const bool = dialect === 'postgres' ? 'boolean' : 'integer'
  const money = 'numeric(12,2)'
  return `
    CREATE TABLE users (id integer primary key, name text not null, email text not null, password text, created_at ${ts}, updated_at ${ts});
    CREATE TABLE customers (id integer primary key, tenant_id ${uuid} not null, name text not null, country text not null, tier text not null, api_key text, created_at ${ts}, updated_at ${ts});
    CREATE TABLE invoices (id integer primary key, tenant_id ${uuid} not null, number text not null, customer_id integer not null, status text not null, total ${money} not null, tax ${money}, paid ${bool} not null, issued_on date, created_at ${ts}, updated_at ${ts}, deleted_at ${ts});
    CREATE TABLE employees (id integer primary key, tenant_id ${uuid} not null, name text not null, department text not null, salary ${money} not null, remote ${bool} not null, hired_on date, created_at ${ts}, updated_at ${ts});
    CREATE TABLE tags (id integer primary key, name text not null, position integer not null);
  `
}

/** Insert statements with literal values (fixture data only; the code under test binds). */
function seed(dialect: 'sqlite' | 'postgres'): string {
  const bool = (value: boolean): string => (dialect === 'postgres' ? String(value) : value ? '1' : '0')
  const text = (value: string | null | undefined): string => (value === null || value === undefined ? 'NULL' : `'${value}'`)
  const lines = [
    `INSERT INTO users VALUES (1, 'Asha', 'asha@example.com', 'hash', '2026-11-01T00:00:00.000Z', NULL);`,
    ...Array.from({ length: 12 }, (_, index) => `INSERT INTO customers VALUES (${index + 1}, '${TENANT_A}', 'Customer ${index + 1}', '${index % 2 === 0 ? 'IN' : 'DE'}', 'pro', 'sk_live_${index}', '2026-11-0${(index % 9) + 1}T00:00:00.000Z', NULL);`),
    `INSERT INTO customers VALUES (101, '${TENANT_B}', 'Rival', 'US', 'enterprise', 'sk_live_b', '2026-11-10T00:00:00.000Z', NULL);`,
    ...invoices.map(
      (row) =>
        `INSERT INTO invoices VALUES (${row.id}, '${row.tenant}', 'INV-${row.id}', ${row.customer}, '${row.status}', ${row.total}, ${row.tax ?? 'NULL'}, ${bool(row.paid)}, ${text(row.issuedOn)}, '${row.createdAt}', NULL, ${text(row.deletedAt)});`,
    ),
    ...employees.map(([tenant, department, salary, remote], index) => `INSERT INTO employees VALUES (${index + 1}, '${tenant}', 'Person ${index + 1}', '${department}', ${salary}, ${bool(remote)}, '2026-0${(index % 9) + 1}-01', '2026-11-01T00:00:00.000Z', NULL);`),
    `INSERT INTO tags VALUES (1, 'urgent', 1);`,
  ]
  return lines.join('\n')
}

/**
 * A fresh SQLite database with the fixture.
 *
 * @example
 * const { executor, close } = createSqlite()
 */
export function createSqlite(): { readonly executor: AggregateExecutor; readonly database: DatabaseSync; readonly close: () => void } {
  const database = new DatabaseSync(':memory:')
  database.exec(schema('sqlite'))
  database.exec(seed('sqlite'))
  return { executor: sqliteExecutor(database), database, close: () => database.close() }
}

/**
 * A fresh PGlite database with the fixture, row-level security on invoices (ADR-0007: RESTRICTIVE,
 * NULLIF, FORCE, a non-owner role), and an executor that runs as that role.
 *
 * @example
 * const { executor, database } = await createPglite()
 */
export async function createPglite(): Promise<{ readonly executor: AggregateExecutor; readonly database: PGlite; readonly close: () => Promise<void> }> {
  const database = await PGlite.create()
  await database.exec(schema('postgres'))
  await database.exec(seed('postgres'))
  await database.exec(`
    CREATE ROLE strut_app NOLOGIN;
    GRANT SELECT ON ALL TABLES IN SCHEMA public TO strut_app;
    ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
    ALTER TABLE invoices FORCE ROW LEVEL SECURITY;
    CREATE POLICY tenant_isolation ON invoices AS RESTRICTIVE USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
    CREATE POLICY allow_rest ON invoices AS PERMISSIVE USING (true);
  `)
  return { executor: pgliteExecutor(database, { role: 'strut_app' }), database, close: () => database.close() }
}

/**
 * A handler over an executor, plus a `get` helper that runs as a tenant and actor.
 *
 * @example
 * const api = handlerFor(executor)
 * const { status, body } = await api.get('/api/v1/invoices/aggregate?metric=count', { tenant: TENANT_A })
 */
export function handlerFor(executor: AggregateExecutor, overrides: Partial<AggregateHandlerOptions> = {}) {
  const errors: unknown[] = []
  let actor: Actor | null = admin
  const handle = createAggregateHandler({
    charts,
    policies,
    executor,
    tenancy: { column: 'tenant_id' },
    actorOf: () => actor,
    now: () => NOW,
    onError: (error) => errors.push(error),
    ...overrides,
  })
  return {
    errors,
    async get(path: string, options: { readonly tenant?: string; readonly actor?: Actor | null; readonly method?: string } = {}): Promise<{ status: number; body: unknown; headers: Headers }> {
      actor = options.actor === undefined ? admin : options.actor
      const request = new Request(`http://app.test${path}`, { method: options.method ?? 'GET' })
      const response = options.tenant === undefined ? await handle(request) : await runWithTenant(options.tenant, () => handle(request))
      return { status: response.status, body: await response.json(), headers: response.headers }
    },
  }
}
