/**
 * Demo data for `npm run dev`: one tenant's invoices, customers and employees over the last 13
 * months, deterministic (a seeded generator), so screenshots are reproducible. A second tenant
 * exists only to show that its numbers never appear.
 *
 * @module
 */
import type { DatabaseSync } from 'node:sqlite'

/** The tenant the demo signs in as. */
export const DEMO_TENANT = '01900000-0000-7000-8000-0000000000d1'
const OTHER_TENANT = '01900000-0000-7000-8000-0000000000d2'

/** Customer names by id, also used as the demo's relation-label resolver. */
export const CUSTOMER_NAMES: Readonly<Record<string, string>> = Object.fromEntries(
  ['Acme Ltd', 'Globex', 'Initech', 'Umbrella Co', 'Hooli', 'Vandelay', 'Stark Supply', 'Wayne Freight', 'Soylent', 'Tyrell', 'Cyberdyne', 'Monarch', 'Oscorp', 'Wonka', 'Gringotts', 'Aperture', 'Black Mesa', 'Duff', 'Nakatomi', 'Pied Piper'].map((name, index) => [String(index + 1), name]),
)

/** A tiny deterministic generator (LCG), so every run draws the same demo. */
function random(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648
    return state / 2_147_483_648
  }
}

/**
 * Create the demo tables (SQLite, ISO text timestamps like spike 11) and fill them.
 *
 * @example
 * seedDemo(new DatabaseSync(':memory:'), new Date())
 */
export function seedDemo(database: DatabaseSync, now: Date): void {
  database.exec(`
    CREATE TABLE users (id integer primary key, name text, email text, password text, created_at text, updated_at text);
    CREATE TABLE customers (id integer primary key, tenant_id text not null, name text, country text, tier text, api_key text, created_at text, updated_at text);
    CREATE TABLE invoices (id integer primary key, tenant_id text not null, number text, customer_id integer, status text, total numeric, tax numeric, paid integer, issued_on text, created_at text, updated_at text, deleted_at text);
    CREATE TABLE employees (id integer primary key, tenant_id text not null, name text, department text, salary numeric, remote integer, hired_on text, created_at text, updated_at text);
    CREATE TABLE tags (id integer primary key, name text, position integer);
  `)
  const next = random(7)
  const pick = <T>(list: readonly T[]): T => list[Math.floor(next() * list.length)] as T
  const daysAgo = (days: number): Date => new Date(now.getTime() - days * 86_400_000 - Math.floor(next() * 86_400_000))
  const insert = (sql: string, values: readonly (string | number | null)[]): void => {
    database.prepare(sql).run(...values)
  }

  for (let id = 1; id <= 20; id += 1) {
    insert('INSERT INTO users VALUES (?, ?, ?, ?, ?, NULL)', [id, `User ${id}`, `user${id}@example.com`, 'hash', daysAgo(Math.floor(next() * 390)).toISOString()])
  }
  for (const [id, name] of Object.entries(CUSTOMER_NAMES)) {
    insert('INSERT INTO customers VALUES (?, ?, ?, ?, ?, ?, ?, NULL)', [Number(id), DEMO_TENANT, name, pick(['IN', 'US', 'DE', 'GB', 'FR', 'JP', 'BR']), pick(['free', 'pro', 'pro', 'enterprise']), `sk_live_${id}`, daysAgo(Math.floor(next() * 390)).toISOString()])
  }
  // Invoices grow over the year (more recent days get more), with a few big customers.
  for (let id = 1; id <= 900; id += 1) {
    const age = Math.floor(390 * Math.sqrt(next()))
    const created = daysAgo(390 - age)
    const customer = next() < 0.35 ? pick([1, 2, 3]) : 1 + Math.floor(next() * 20)
    const status = pick(['draft', 'sent', 'sent', 'paid', 'paid', 'paid', 'paid', 'void'])
    const total = Math.round((80 + next() * 2_400) * 100) / 100
    insert('INSERT INTO invoices VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)', [
      id,
      DEMO_TENANT,
      `INV-${String(id).padStart(4, '0')}`,
      customer,
      status,
      total,
      Math.round(total * 0.18 * 100) / 100,
      status === 'paid' ? 1 : 0,
      created.toISOString().slice(0, 10),
      created.toISOString(),
      id % 97 === 0 ? created.toISOString() : null,
    ])
  }
  const departments: readonly (readonly [string, number, number])[] = [
    ['engineering', 24, 110_000],
    ['sales', 14, 70_000],
    ['support', 9, 45_000],
    ['finance', 6, 80_000],
    ['legal', 2, 140_000], // a small team: its numbers are suppressed (k = 5)
  ]
  let employee = 1
  for (const [department, count, base] of departments) {
    for (let index = 0; index < count; index += 1) {
      const hired = daysAgo(Math.floor(next() * 380))
      insert('INSERT INTO employees VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL)', [employee, DEMO_TENANT, `Person ${employee}`, department, Math.round(base * (0.8 + next() * 0.5)), next() < 0.4 ? 1 : 0, hired.toISOString().slice(0, 10), hired.toISOString()])
      employee += 1
    }
  }
  // The other tenant: huge numbers that must never show up in the demo.
  for (let id = 5_000; id < 5_050; id += 1) {
    insert('INSERT INTO invoices VALUES (?, ?, ?, 1, ?, 999999, 0, 1, ?, ?, NULL, NULL)', [id, OTHER_TENANT, `X-${id}`, 'paid', now.toISOString().slice(0, 10), now.toISOString()])
  }
}
