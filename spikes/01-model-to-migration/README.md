# Spike 01: Model DSL → Drizzle → programmatic migrations

| | |
|---|---|
| **Phase** | 0 (foundations) |
| **Date** | 2026-11-13 |
| **Status** | Complete. 23/23 tests pass on real engines (PGlite Postgres and libSQL SQLite). |
| **Versions** | drizzle-orm 0.45.4, drizzle-kit 0.31.11, @electric-sql/pglite 0.5.16, @libsql/client 0.18.0, TypeScript 6.0.3, vitest 5.1.0, Node 24.21, pnpm 12.18.0 |

## Question

Can a Strutvane model DSL be compiled into Drizzle table definitions for **both Postgres and SQLite**? And can a **programmatic** schema diff produce correct SQL migrations without shelling out to an interactive CLI? The diff must cover:

- (a) create table
- (b) add column
- (c) a rename that must be **asked, not guessed**
- (d) a destructive change that must be **detected and flagged**

The DSL from the spike question:

```ts
defineModel('Invoice', {
  number:   field.string().unique(),
  amount:   field.decimal(12, 2),
  status:   field.enum(['draft', 'paid']).default('draft'),
  customer: field.belongsTo('Customer'),
}, { timestamps: true, softDeletes: true, tenant: true })
```

## Answer: yes, with one important caveat

- **Compilation works for both dialects** from a single, plain-data `ModelDefinition`.
- **The diff works, but not with drizzle-kit's public API alone.**
  - In drizzle-kit **0.31.11**, `generateMigration(prev, cur)` falls back to an **interactive terminal prompt** whenever a diff contains both a removed and an added table, or both a removed and an added column in the same table. Without a TTY it rejects with `Interactive prompts require a TTY terminal`; with a TTY it blocks on stdin.
  - The rename resolvers are internal and can't be injected.
- **Strutvane can still produce correct migrations non-interactively** by resolving renames itself, through an injected callback. It then hands drizzle-kit only diffs that can't trigger a prompt. That is implemented and proven here on real engines for (a)–(d).
- drizzle-kit **1.0.0-rc.5** adds exactly the missing hook: `generateMigration(prev, cur, { hints })` with `rename`/`create`/`confirm_data_loss` hints and a `MissingHintsError`. That would let us delete most of the workaround. *(Inspected from the published package's types and source; not executed in this spike.)*

## Evidence

### Test results

```
 Test Files  1 passed (1)
      Tests  23 passed (23)
   Duration  13.79s
```

After the timeout fix described under "Limits", the suite was run 4 times consecutively, all green.

Each scenario runs against **both** engines. Migrations are *applied* to the engine, then the schema is checked by introspection: `information_schema` and `pg_indexes` on Postgres, `pragma_table_info` and `sqlite_master` on SQLite.

| Area | Test (×2 dialects unless noted) |
|---|---|
| (a) | creates both tables with the expected columns, constraints and indexes |
| (a) | enforces the enum CHECK, the per-tenant unique index and the foreign key (real inserts are rejected/accepted) |
| (a) | is idempotent: planning the same models twice yields **zero** statements |
| (b) | adds an optional column without touching existing rows |
| (c) | refuses to guess: without a resolver, a possible rename is an error that lists the candidate |
| (c) | asks the resolver exactly once; `rename` keeps the data, and re-planning afterwards yields zero statements (no drift) |
| (c) | `separate` means drop + create, which is destructive and therefore blocked by default |
| (c) | renames a table (model rename), keeping data and foreign keys, and re-derives index names |
| (d) | blocks dropping a column unless `allowDestructive` is set, then applies it |
| (d) | classifies narrowing, enum-value removal, optional→required, required-without-default and table drops |
| evidence (PG only) | drizzle-kit `generateMigration()` cannot resolve a rename without a TTY |
| evidence (PG only) | drizzle-kit handles pure additions without prompting |
| guards (once) | the DSL rejects invalid definitions early with clear errors |

### Generated SQL (unedited output)

**Postgres, create:**

```sql
CREATE TABLE "invoices" (
  "id" uuid PRIMARY KEY NOT NULL,
  "tenant_id" uuid NOT NULL,
  "number" varchar(255) NOT NULL,
  "amount" numeric(12, 2) NOT NULL,
  "status" text DEFAULT 'draft' NOT NULL,
  "customer_id" uuid NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone,
  CONSTRAINT "invoices_status_check" CHECK ("status" IN ('draft', 'paid'))
);
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE cascade;
CREATE INDEX "invoices_tenant_id_idx" ON "invoices" USING btree ("tenant_id");
CREATE UNIQUE INDEX "invoices_number_unique" ON "invoices" USING btree ("tenant_id","number");
CREATE INDEX "invoices_customer_id_idx" ON "invoices" USING btree ("customer_id");
```

**Rename (Customer → Client, notes → memo, resolver answered `rename`). Postgres and SQLite produce the same steps:**

```sql
ALTER TABLE "customers" RENAME TO "clients";
ALTER TABLE "invoices" RENAME COLUMN "notes" TO "memo";
DROP INDEX "customers_tenant_id_idx";
CREATE INDEX "clients_tenant_id_idx" ON "clients" USING btree ("tenant_id");
```

## How it works

```
 previous models ─┐                                   ┌─ next models
                  ▼                                   ▼
        ┌─────────────────────────────────────────────────────┐
   1    │ RESOLVE  removed × added tables / same-shape columns  │──► resolveRename(candidate)
        │          → 'rename' | 'separate'   (no callback ⇒   │     (CLI prompt, IDE, CI flag…)
        │          RenameResolutionRequiredError, never guess)│
        ├─────────────────────────────────────────────────────┤
   2    │ CLASSIFY dropTable, dropColumn, changeType,          │──► DestructiveChangeError
        │          narrowType, removeEnumValues, makeRequired, │     unless allowDestructive
        │          addRequiredWithoutDefault, addUnique        │
        ├─────────────────────────────────────────────────────┤
   3    │ RENAME   our own ALTER TABLE … RENAME [COLUMN] …     │
        ├─────────────────────────────────────────────────────┤
   4    │ DIFF A   renamed-previous → intermediate (removals)  │──► drizzle-kit generateMigration
        │ DIFF B   intermediate → next (additions/alterations) │    (each diff checked by
        │          assertPromptFree() before drizzle sees it   │     assertPromptFree)
        └─────────────────────────────────────────────────────┘
                                   ▼
                       ordered SQL statements
```

**Key ideas:**

- **Prompt-free by construction.**
  - `intermediate` is the renamed previous schema minus everything that disappears. Diff A therefore only removes and diff B only adds or alters.
  - drizzle-kit only prompts when one diff both creates and deletes tables, or columns in the same table, which never happens here.
  - `assertPromptFree` checks the invariant and throws an internal error instead of ever reaching a prompt.
- **Constraint names follow renames.**
  - All index, unique, check and FK names are deterministic and come from an injectable `Naming` strategy.
  - The "renamed previous" schema is compiled with a *legacy* naming that maps new identifiers back to the old ones, so it describes the database exactly as it is.
  - The diff then drops and recreates any constraint whose name changed. Re-planning after any migration yields zero statements, which a test proves.
- **Pure planning.** `planMigration` never touches a database. It returns `{ statements, renames, destructive }`, so callers can preview, diff, write files or apply.

## Design decisions made in the spike

| Decision | Why |
|---|---|
| `enum` → `TEXT` + named `CHECK` on both dialects | One portable representation. Avoids Postgres enum *types*, whose renames and drops drizzle-kit also resolves via prompts. |
| `decimal` → `NUMERIC(p,s)` on PG, `TEXT` on SQLite | SQLite's NUMERIC affinity converts to floating point and silently loses precision. |
| App-generated UUID primary keys (UUIDv7), no DB default | Identical behaviour on every engine and Postgres version. PGlite and older PG lack `uuidv7()`. |
| Foreign keys as **named table constraints** | Names are ours and stable, not drizzle's auto-generated ones. |
| `tenant: true` ⇒ `UNIQUE(tenant_id, col)` | Uniqueness in multi-tenant apps is almost always per tenant. Proven by a test where the same number is accepted for a second tenant. |
| SQLite timestamps have no `CURRENT_TIMESTAMP` default | SQLite rejects non-constant defaults in `ALTER TABLE ADD COLUMN`. The framework sets timestamps in code. |
| Rename candidates only for **same-shape** columns (same kind; same target for belongsTo) | Keeps questions meaningful. A rename *and* type change is expressed as rename, then a separate type change. |

## Limits, risks and unverified points

- **Classified but not applied to an engine:** type changes, narrowing, enum-value removal and optional→required are only *classified* in this spike. Their generated SQL, including SQLite's table-recreation path, was not executed against data. *(Unverified; must be covered in Phase 1.)*
- **Dropping a table that others still reference:** dropping a model together with the `belongsTo` fields pointing at it was classified but not applied. Statement ordering for that case is unverified.
- **MySQL:** not tested. drizzle-kit exposes `generateMySQLMigration`, so the same approach should apply *(unverified)*.
- **Postgres identifier length:** names are not yet truncated or hashed at 63 bytes. Very long table/column names would collide or truncate. The real engine needs a deterministic shortening scheme.
- **Rename UX:** the resolver is asked pair by pair, in order. With many simultaneous changes the CLI will want to batch questions. The contract (`RenameCandidate`) already supports that.
- **Dependency on drizzle-kit internals:** we rely only on the public `generateDrizzleJson`/`generateMigration` API. The *behaviour* we work around (prompts) is internal and changes in v1. That's good news (hints), but drizzle-kit stays a 0.x / RC dependency.
- **pnpm 12** blocks dependency build scripts by default. drizzle-kit pulls in `esbuild`, which needs `allowBuilds: { esbuild: true }` (see `pnpm-workspace.yaml`).
- **Test timing:** PGlite boots a full Postgres per test, taking 2–5 s. The vitest default 5 s timeout caused intermittent failures (8.7 s observed), so `vitest.config.ts` sets 60 s budgets. Real CI should share one engine per file or use templates to stay fast.

## Recommendation for `@strutvane/framework`

1. **Keep this public contract and make it ours.** `planMigration({ previous, next, resolveRename, allowDestructive }) → { statements, renames, destructive }`, plus `RenameResolutionRequiredError` and `DestructiveChangeError`. The CLI implements `resolveRename` as an interactive prompt; CI passes answers via flags or a file; tests pass a function. **Drizzle types never appear in it.**
2. **Implement it with the two-stage workaround now** (works on stable drizzle-kit 0.31.x). Keep `assertPromptFree` as a hard guard.
3. **When drizzle-kit 1.0 is GA,** re-implement the internals with `hints`: call `generateMigration`, catch `MissingHintsError`, map each unresolved hint to `resolveRename` or the destructive gate, and retry with hints. The public contract stays the same and the two-stage diff can be deleted. Also re-check MSSQL support, which only exists in the v1 line.
4. **Snapshots:** persist the model definitions (plain JSON) next to each migration file. The "previous models" input then comes from the last snapshot, not from introspection, while `db:pull` introspection stays for brownfield DBs.
5. **Phase 1 test plan additions:**
   - apply every destructive class on data-filled tables, including the SQLite recreate path
   - MySQL 8.4 via Testcontainers
   - identifier-length hashing
   - a randomised "model evolution" property test that asserts re-plan == ∅ after each step

## Suggested ADR

> **ADR-00XX: Migration planner owns rename resolution and destructive-change gating**
>
> **Context.** drizzle-kit 0.31's `generateMigration` resolves possible renames via interactive TTY prompts, which is unusable for a framework, CI and IDE tooling. drizzle-kit 1.0 (RC) adds non-interactive hints but isn't GA.
>
> **Decision.**
> - `@strutvane/framework` exposes its own planner contract: `RenameResolver` callback, `DestructiveChange` classification, `allowDestructive`.
> - It never guesses renames and blocks destructive changes by default.
> - Internally it uses drizzle-kit 0.31 with a prompt-free two-stage diff guarded by an invariant check, and moves to drizzle-kit 1.0 hints when GA without changing the public contract.
>
> **Consequences.**
> - Deterministic, scriptable, testable migrations on every dialect.
> - A small amount of extra code (rename SQL, legacy naming, two-stage diff) that we expect to delete after the drizzle-kit 1.0 upgrade.
> - Drizzle remains an internal detail (consistent with ADR-0004).

## Files

```
src/dsl.ts                 defineModel + field builders -> plain ModelDefinition
src/compile.ts             ModelDefinition -> Drizzle pgTable / sqliteTable (injectable naming)
src/diff.ts                planMigration: resolve -> classify -> rename SQL -> two prompt-free drizzle diffs
test/engines.ts            PGlite + libSQL adapters with schema introspection
test/fixtures.ts           Customer / Invoice models
test/migrations.test.ts    (a)-(d) on both engines + drizzle-kit evidence + DSL guards
vitest.config.ts           timeouts sized for in-process Postgres
pnpm-workspace.yaml        allowBuilds: esbuild (pnpm 12)
```

Run it:

```bash
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm@12.18.0 install
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm@12.18.0 test
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm@12.18.0 typecheck
```
