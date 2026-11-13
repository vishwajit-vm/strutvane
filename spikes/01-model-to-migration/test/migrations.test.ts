import { generateDrizzleJson, generateMigration } from 'drizzle-kit/api'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { compilePg, names } from '../src/compile.js'
import {
  DestructiveChangeError,
  planMigration,
  RenameResolutionRequiredError,
  type Dialect,
  type RenameCandidate,
  type RenameResolver,
} from '../src/diff.js'
import { defineModel, field, type ModelDefinition } from '../src/dsl.js'
import { createEngine, type Engine } from './engines.js'
import { customer, ids, invoice, invoiceFields, now, tenantOptions } from './fixtures.js'

const engines: Engine[] = []
afterEach(async () => {
  await Promise.all(engines.splice(0).map((e) => e.close()))
})

async function freshEngine(dialect: Dialect): Promise<Engine> {
  const e = await createEngine(dialect)
  engines.push(e)
  return e
}

/** Plans + applies `previous -> next` and returns the plan. */
async function migrate(e: Engine, previous: ModelDefinition[], next: ModelDefinition[], extra: { resolveRename?: RenameResolver; allowDestructive?: boolean } = {}) {
  const plan = await planMigration({ dialect: e.dialect, previous, next, ...extra })
  await e.apply(plan.statements)
  return plan
}

async function seedV1(e: Engine): Promise<void> {
  await e.exec(`insert into customers (id, tenant_id, name, created_at, updated_at) values ('${ids.customer}', '${ids.tenant}', 'Acme', '${now}', '${now}')`)
  await e.exec(
    `insert into invoices (id, tenant_id, number, amount, status, customer_id, notes, created_at, updated_at)
     values ('${ids.invoice}', '${ids.tenant}', 'INV-1', '1200.50', 'draft', '${ids.customer}', 'hello', '${now}', '${now}')`,
  )
}

const V1 = (): ModelDefinition[] => [customer(), invoice()]

describe.each<Dialect>(['postgres', 'sqlite'])('%s', (dialect) => {
  // ─────────────────────────────── (a) create table ───────────────────────────────
  describe('(a) create table', () => {
    it('creates both tables with the expected columns, constraints and indexes', async () => {
      const e = await freshEngine(dialect)
      const plan = await migrate(e, [], V1())
      expect(plan.destructive).toEqual([])
      expect(plan.renames).toEqual([])
      expect(await e.tables()).toEqual(['customers', 'invoices'])

      const cols = await e.columns('invoices')
      expect(Object.keys(cols).sort()).toEqual(
        ['amount', 'created_at', 'customer_id', 'deleted_at', 'id', 'notes', 'number', 'status', 'tenant_id', 'updated_at'].sort(),
      )
      expect(cols.number?.nullable).toBe(false)
      expect(cols.notes?.nullable).toBe(true)
      expect(cols.deleted_at?.nullable).toBe(true)
      expect(cols.status?.default).toContain('draft')
      if (dialect === 'postgres') {
        expect(cols.number?.type).toBe('varchar(255)')
        expect(cols.amount?.type).toBe('numeric(12,2)')
        expect(cols.customer_id?.type).toBe('uuid')
        expect(cols.created_at?.type).toBe('timestamp with time zone')
      } else {
        expect(cols.amount?.type).toBe('text') // exact decimals, see README
      }

      expect(await e.indexes('invoices')).toEqual(
        expect.arrayContaining([names.unique('invoices', 'number'), names.index('invoices', 'customer_id'), names.tenantIndex('invoices')]),
      )
    })

    it('enforces the enum CHECK, the per-tenant unique index and the foreign key', async () => {
      const e = await freshEngine(dialect)
      await migrate(e, [], V1())
      await seedV1(e)
      // enum check
      await expect(
        e.exec(`insert into invoices (id, tenant_id, number, amount, status, customer_id, created_at, updated_at)
                values ('00000000-0000-7000-8000-0000000000a2', '${ids.tenant}', 'INV-2', '1', 'bogus', '${ids.customer}', '${now}', '${now}')`),
      ).rejects.toThrow()
      // unique per tenant: same number, same tenant -> rejected
      await expect(
        e.exec(`insert into invoices (id, tenant_id, number, amount, customer_id, created_at, updated_at)
                values ('00000000-0000-7000-8000-0000000000a3', '${ids.tenant}', 'INV-1', '1', '${ids.customer}', '${now}', '${now}')`),
      ).rejects.toThrow()
      // ...but allowed for another tenant
      await e.exec(`insert into invoices (id, tenant_id, number, amount, customer_id, created_at, updated_at)
                    values ('00000000-0000-7000-8000-0000000000a4', '00000000-0000-7000-8000-000000000002', 'INV-1', '1', '${ids.customer}', '${now}', '${now}')`)
      // foreign key
      await expect(
        e.exec(`insert into invoices (id, tenant_id, number, amount, customer_id, created_at, updated_at)
                values ('00000000-0000-7000-8000-0000000000a5', '${ids.tenant}', 'INV-9', '1', '00000000-0000-7000-8000-00000000dead', '${now}', '${now}')`),
      ).rejects.toThrow()
    })

    it('is idempotent: planning the same models twice yields no statements', async () => {
      const plan = await planMigration({ dialect, previous: V1(), next: V1() })
      expect(plan.statements).toEqual([])
    })
  })

  // ─────────────────────────────── (b) add column ───────────────────────────────
  describe('(b) add column', () => {
    it('adds an optional column without touching existing rows', async () => {
      const e = await freshEngine(dialect)
      await migrate(e, [], V1())
      await seedV1(e)
      const v2 = [customer(), invoice({ ...invoiceFields(), dueDate: field.date().optional() })]
      const plan = await migrate(e, V1(), v2)
      expect(plan.statements.join('\n')).toMatch(/ADD (COLUMN )?[`"]?due_date/i)
      expect((await e.columns('invoices')).due_date?.nullable).toBe(true)
      const rows = await e.rows<{ number: string; notes: string }>(`select number, notes from invoices`)
      expect(rows).toEqual([{ number: 'INV-1', notes: 'hello' }])
    })
  })

  // ─────────────────────────────── (c) renames are asked, never guessed ───────────────────────────────
  describe('(c) renames', () => {
    const renamedV2 = (): ModelDefinition[] => {
      const { notes: _drop, ...rest } = invoiceFields()
      return [customer(), invoice({ ...rest, memo: field.text().optional() })]
    }

    it('refuses to guess: without a resolver, a possible rename is an error that lists the candidate', async () => {
      const err = await planMigration({ dialect, previous: V1(), next: renamedV2() }).catch((x: unknown) => x)
      expect(err).toBeInstanceOf(RenameResolutionRequiredError)
      expect((err as RenameResolutionRequiredError).candidates).toEqual([
        { kind: 'column', model: 'Invoice', table: 'invoices', fromField: 'notes', toField: 'memo', fromColumn: 'notes', toColumn: 'memo' },
      ])
    })

    it('asks the resolver exactly once; "rename" keeps the data', async () => {
      const e = await freshEngine(dialect)
      await migrate(e, [], V1())
      await seedV1(e)
      const resolver = vi.fn<RenameResolver>(() => 'rename')
      const plan = await migrate(e, V1(), renamedV2(), { resolveRename: resolver })

      expect(resolver).toHaveBeenCalledTimes(1)
      expect(resolver.mock.calls[0]?.[0]).toMatchObject({ kind: 'column', table: 'invoices', fromColumn: 'notes', toColumn: 'memo' })
      expect(plan.statements).toContain('ALTER TABLE "invoices" RENAME COLUMN "notes" TO "memo";')
      expect(plan.destructive).toEqual([])
      expect(await e.rows(`select memo from invoices`)).toEqual([{ memo: 'hello' }])
      // and the database now matches the next models exactly: re-planning yields nothing
      expect((await planMigration({ dialect, previous: renamedV2(), next: renamedV2() })).statements).toEqual([])
    })

    it('"separate" means drop + create, which is destructive and therefore blocked by default', async () => {
      const resolveRename: RenameResolver = () => 'separate'
      const err = await planMigration({ dialect, previous: V1(), next: renamedV2(), resolveRename }).catch((x: unknown) => x)
      expect(err).toBeInstanceOf(DestructiveChangeError)
      expect((err as DestructiveChangeError).changes).toEqual([
        expect.objectContaining({ kind: 'dropColumn', table: 'invoices', column: 'notes', risk: 'data-loss' }),
      ])

      const e = await freshEngine(dialect)
      await migrate(e, [], V1())
      await seedV1(e)
      await migrate(e, V1(), renamedV2(), { resolveRename, allowDestructive: true })
      const cols = await e.columns('invoices')
      expect(cols.notes).toBeUndefined()
      expect(cols.memo?.nullable).toBe(true)
      expect(await e.rows(`select memo from invoices`)).toEqual([{ memo: null }])
    })

    it('renames a table (model rename) keeping data, foreign keys and re-deriving index names', async () => {
      const e = await freshEngine(dialect)
      await migrate(e, [], V1())
      await seedV1(e)
      const v2 = [customer('Client'), invoice(invoiceFields('Client'))]
      const asked: RenameCandidate[] = []
      const plan = await migrate(e, V1(), v2, {
        resolveRename: (c) => {
          asked.push(c)
          return 'rename'
        },
      })
      expect(asked).toEqual([{ kind: 'table', fromModel: 'Customer', toModel: 'Client', fromTable: 'customers', toTable: 'clients' }])
      expect(plan.statements[0]).toBe('ALTER TABLE "customers" RENAME TO "clients";')
      expect(await e.tables()).toEqual(['clients', 'invoices'])
      expect(await e.rows(`select name from clients`)).toEqual([{ name: 'Acme' }])
      expect(await e.indexes('clients')).toContain(names.tenantIndex('clients'))
      expect(await e.indexes('clients')).not.toContain(names.tenantIndex('customers'))
      // FK still enforced against the renamed table
      await expect(
        e.exec(`insert into invoices (id, tenant_id, number, amount, customer_id, created_at, updated_at)
                values ('00000000-0000-7000-8000-0000000000a6', '${ids.tenant}', 'INV-7', '1', '00000000-0000-7000-8000-00000000dead', '${now}', '${now}')`),
      ).rejects.toThrow()
      expect((await planMigration({ dialect, previous: v2, next: v2 })).statements).toEqual([])
    })
  })

  // ─────────────────────────────── (d) destructive changes are detected ───────────────────────────────
  describe('(d) destructive changes', () => {
    it('blocks dropping a column unless allowDestructive is set, then applies it', async () => {
      const { notes: _n, ...rest } = invoiceFields()
      const v2 = [customer(), invoice(rest)]
      await expect(planMigration({ dialect, previous: V1(), next: v2 })).rejects.toBeInstanceOf(DestructiveChangeError)

      const e = await freshEngine(dialect)
      await migrate(e, [], V1())
      await seedV1(e)
      const plan = await migrate(e, V1(), v2, { allowDestructive: true })
      expect(plan.destructive).toEqual([expect.objectContaining({ kind: 'dropColumn', column: 'notes' })])
      expect((await e.columns('invoices')).notes).toBeUndefined()
      expect(await e.rows(`select number from invoices`)).toEqual([{ number: 'INV-1' }])
    })

    it('classifies narrowing, enum value removal, required-without-default and table drops', async () => {
      const v2 = [
        invoice(
          {
            number: field.string(20).unique(), // narrowed 255 -> 20
            amount: field.decimal(12, 2),
            status: field.enum(['draft']).default('draft'), // 'paid' removed
            notes: field.text(), // optional -> required, no default
            reference: field.string(), // new required column, no default
          },
          { ...tenantOptions },
        ),
      ] // Customer removed (and therefore invoice.customer too)
      const err = await planMigration({ dialect, previous: V1(), next: v2 }).catch((x: unknown) => x)
      expect(err).toBeInstanceOf(DestructiveChangeError)
      const kinds = (err as DestructiveChangeError).changes.map((c) => `${c.kind}:${c.table}${c.column ? `.${c.column}` : ''}`)
      expect(kinds.sort()).toEqual(
        [
          'dropTable:customers',
          'dropColumn:invoices.customer_id',
          'narrowType:invoices.number',
          'removeEnumValues:invoices.status',
          'makeRequired:invoices.notes',
          'addRequiredWithoutDefault:invoices.reference',
        ].sort(),
      )
    })
  })
})

// ─────────────────────────────── evidence about drizzle-kit itself ───────────────────────────────
describe('drizzle-kit 0.31.11 public API (evidence)', () => {
  it.skipIf(Boolean(process.stdin.isTTY))('generateMigration() cannot resolve a rename without an interactive TTY', async () => {
    const { notes: _n, ...rest } = invoiceFields()
    const prev = generateDrizzleJson(compilePg(V1()))
    const next = generateDrizzleJson(compilePg([customer(), invoice({ ...rest, memo: field.text().optional() })]))
    await expect(generateMigration(prev, next)).rejects.toThrow(/TTY/)
  })

  it('handles pure additions without prompting', async () => {
    const prev = generateDrizzleJson(compilePg(V1()))
    const next = generateDrizzleJson(compilePg([customer(), invoice({ ...invoiceFields(), extra: field.integer().optional() })]))
    const sql = await generateMigration(prev, next)
    expect(sql.join('\n')).toContain('"extra" integer')
  })
})

describe('DSL guards', () => {
  it('rejects invalid definitions early with clear errors', () => {
    expect(() => defineModel('invoice', {})).toThrow(/PascalCase/)
    expect(() => defineModel('Invoice', { id: field.string() })).toThrow(/reserved/)
    expect(() => field.enum([])).toThrow(/at least one/)
    expect(() => field.enum(['a', 'a'])).toThrow(/unique/)
    expect(() => field.enum(['a']).default('b')).toThrow(/not one of/)
    expect(() => field.decimal(2, 5)).toThrow(RangeError)
    expect(() => compilePg([invoice()])).toThrow(/unknown model "Customer"/)
  })
})
