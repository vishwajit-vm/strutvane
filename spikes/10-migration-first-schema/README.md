# Spike 10: Migration-first schema (Laravel-style migrations → types, metadata, SQL, CRUD)

**Date:** 2026-11-14.

**Environment:** Windows 11, Node v24.21.0 (native type stripping), TypeScript 6.0.3, Vitest 5.1.0, oxc-parser 0.158.0, PGlite 0.5.16 (PostgreSQL in WebAssembly), `node:sqlite` (SQLite 3.53.4), Hono 4.13.18. npm (not pnpm), as asked for this spike.

```bash
cd spikes/10-migration-first-schema
npm install
npm test          # tsc --noEmit (type-level tests) + vitest run
npm run generate  # regenerate fixtures/blog/.strutvane from its migrations
npm run bench     # the timing tables below
```

## Question

Strutvane is being reshaped to follow Laravel's flow (MVC, migrations). The hardest technical question:

> The developer writes **columns in migration files** (Laravel's Schema builder). Can the app still get
> - full TypeScript types for each model,
> - metadata a CRUD API and UI can run on (pagination, search on every field, sorting, filters, slugs, relations, labels, sidebar), and
> - correct SQL for SQLite and PostgreSQL (MySQL noted),
>
> **offline, deterministically, with no running database needed for the types?**

Two ways to derive the schema without a database were compared:
- **(a) Replay.** Import each migration and run its `up()` against an in-memory recorder, in file order.
- **(b) Static analysis.** Read the files with oxc-parser and never run them.

## Answer

**Yes, with approach (a), replay.** It derives an exact schema from realistic migrations (create, alter, rename column, drop column, rename table, foreign keys, `hasColumn` branches, helpers, loops). From that schema the spike generates:
- model types, with correct nullability;
- resource metadata;
- SQL that runs on **both** SQLite and PostgreSQL with **zero drift**, checked at every step up and down;
- a metadata-only CRUD API that returns **byte-identical JSON** on both engines across 108 requests.

**Approach (b) is not viable as the source of truth.** On literal migrations it produces the identical schema. But it can't see constants, loops, helper functions or `if (!schema.hasColumn(…))`, which real Laravel projects use constantly. It also isn't faster at the size that matters: 200 files took 187–365 ms cold, against 252–492 ms for replay. Keep it, at most, as an optional lint.

| | (a) Replay (recommended) | (b) oxc static analysis |
|---|---|---|
| Literal migrations (blog app) | Exact | **Identical** to (a) (`canonicalSchema` equal) |
| Constants, loops, helpers, `if`, `hasColumn` | Exact (it's just code) | **Refused** with `file:line:col` diagnostics (4 in the dynamic fixture) |
| Meaning of each call | The real Blueprint | The same Blueprint: the extracted call script is replayed on it, so the two can never disagree on semantics |
| Runs user code | **Yes**: top-level code of migration files runs during `sv types` | No |
| Cold, 7 files (process wall) | 65–97 ms | 73–143 ms (oxc load: 30–58 ms) |
| Cold, 200 files (process wall) | 252–492 ms | 187–365 ms |
| Warm, 200 files (watch mode) | 10–18 ms re-replay (+ re-import changed files only) | 88–165 ms (re-reads and re-parses every file) |
| Complexity | ~200 lines (recorder + fold) | +330 lines of AST reading, and grows with every builder method |

## Evidence

**Tests:** `npm test` exits 0. That covers `tsc --noEmit` (all type-level tests) plus Vitest: **11 files, 248 tests, all passing**. Every database test runs on **both real engines**: SQLite via `node:sqlite`, PostgreSQL via PGlite. No mocks.

| Test file | Tests | What it proves |
|---|---|---|
| `recorder.test.ts` | 41 | Blueprint and fold: Laravel naming of indexes; `constrained()` guesses `category_id` → `categories`; self-references; `hasTable` / `hasColumn` answer from recorded history; renames follow indexes, slug sources and foreign keys in other tables; dropping a column drops its indexes. **31 mistakes are refused offline with a stable code and a hint**: unsafe identifiers, 64-char names (PostgreSQL truncation), required column added later without a default (SQLite always rejects it), dropping a slug's source or a referenced column, duplicate index names (global in both engines), and more. The input state is never mutated. |
| `replay.test.ts` | 10 | The blog fixture replays to the exact final schema. **Every `down()` is a true inverse**, checked step by step. A forgetful `down()` is detected. Loops, helpers and `if` replay fine. Errors name the migration file. Badly named files are refused, not skipped. Order is code-unit, not OS order. **Watch mode:** Node caches modules forever, so `fresh: true` cache-busts by mtime and size (verified in plain Node). |
| `static.test.ts` | 10 | (b) equals (a) on the blog app. On the dynamic app it reports the constant (12:23), the loop (14:7), the helper (16:7) and the `if` (6:5) instead of guessing. It handles arrow functions, `as` / `satisfies`, template literals and negative numbers. It refuses non-whitelisted methods (for example `t.toActions()`), computed calls and variables. |
| `types.test.ts` | 10 | **Compile-time** (`expectTypeOf` plus `@ts-expect-error`, checked by `tsc`). Builder misuse fails to compile: an enum default off its list, an empty enum, a boolean defaulting to text, `constrained()` on an integer, `.from()` on a non-slug, a JSON default, `cascadeOnDelete` on a string. The generated types are exact: `content: string \| null`, `price: string`, `status: 'draft' \| 'published'`, `created_at: Date \| null`, `meta: JsonValue \| null`. Renamed and dropped columns are gone. `UserJson` has no `password`. `NewPost` requires exactly `title` and `author_id`. `Model('posts')` types `post.title`, relations and accessors. `Model('post')`, `belongsTo('users', 'writer_id')` and a bad scope value all fail. **Mutation-checked:** weakening one assertion or removing one directive makes `tsc` fail. |
| `generation.test.ts` | 6 | The committed `fixtures/blog/.strutvane/**` (types, `resources.json`, six SQL files) is **byte-identical** to fresh output. Two runs give the same bytes, LF only, with no machine paths. Writes only touch changed files. The CLI runs in plain Node, and a broken migration prints a friendly error and exits 1. **Real `tsc`:** a new migration that drops `subtitle` and renames `content` compiles while the types are stale. Once regenerated, it fails with `TS2339 Property 'subtitle' does not exist on type 'Post'`. |
| `metadata.test.ts` | 8 | Labels, model and route names, title field, slug source, soft deletes and default sort. `belongsTo` / `hasMany`, with disambiguation for two keys to one parent. Sidebar is alphabetical, and overrides are applied. Required and fillable fields match `NewPost`. Search mode, filters, inputs and limits come from each type. Secrets are hidden everywhere. |
| `ddl.test.ts` | 17 | Per-engine types (decimal, enum, boolean), literal escaping, placeholders and comments. MySQL foreign keys are separate constraints. Before dropping a column, SQLite drops the indexes on it, and **rebuilds the table** if it is a foreign key. **SQLite refuses a rebuild that could cascade into child tables.** Schema dumps put parents first. A foreign key cycle gets a helpful error. |
| `database.test.ts` | 18 | ×2 engines. Migrate shows **no drift** (introspected database equals recorder state). **One batch per migration, then roll back batch by batch: no drift at any of 14 checkpoints**, ending in an empty database. Rows survive renames and the SQLite rebuild. Enum CHECK, cascade and set-null are enforced. The schema dump matches migrate. **A migration failing half-way leaves nothing behind** (transactional DDL). Hand-made changes are reported in plain words. A missing migration file stops `migrate`. Placeholder regression test. |
| `crud.test.ts` | 103 | ×2 engines. Create fills the slug, defaults and timestamps. Slugs get `-2`, `-3`. Validation is derived from the columns, and **every issue is reported at once**. Secrets can't be written or read. Invalid JSON, a non-object body and a 70 KB body (413) are handled. Get by id and by slug, with clear 404s. Pagination meta. Search is case-insensitive across all text fields, with an exact match on numbers, and `%` / `_` are literal. Multi-field sort with NULLs last. 12 filter shapes. 14 malformed or hostile queries are refused with 422. SQL in a search term is inert. PATCH keeps the slug and bumps `updated_at`. Soft delete, hard delete, constraint race → 409. **Final test: both engines' 108-request transcripts are identical.** |
| `naming.test.ts` | 22 | Inflection, table → model and labels, `make:migration` name → intent and stub, slugify |
| `perf.test.ts` | 3 | Budgets for 200 migrations: cold `sv types` in a fresh process under 1 s, warm replay under 50 ms, full generation under 150 ms (minimum asserted, median under 2× the budget) |

**Planted bug:** reverting the SQLite placeholder fix (see Finding 1) makes 4 tests fail, and only on SQLite.

### Timings (`npm run bench`, two runs on a shared laptop; ranges are run 1 – run 2)

Cold means a fresh `node` process per measurement (what `sv types` costs). The median of 5 is reported, after one discarded warm-up.

| App | Approach | Load tooling | Read/import files | Replay | Total in-process | Process wall (incl. Node boot) |
|---|---|---|---|---|---|---|
| blog (7 files) | (a) replay | 17–26 ms | 7–12 ms | 2–3 ms | 26–40 ms | **65–97 ms** |
| blog (7 files) | (b) oxc static | 30–59 ms | 3–6 ms | 2–4 ms | 35–68 ms | 73–143 ms |
| synthetic (200 files, 100 tables) | (a) replay | 17–32 ms | 177–354 ms | 23–40 ms | 216–429 ms | **252–492 ms** |
| synthetic (200 files, 100 tables) | (b) oxc static | 31–57 ms | 97–207 ms | 20–34 ms | 149–299 ms | 187–365 ms |

| Warm / other | Time |
|---|---|
| (a) re-replay 200 already-imported migrations | 10–18 ms |
| (b) static analysis of 200 files (read, parse, extract) | 88–165 ms |
| Generate everything for 100 tables (types, metadata, six SQL files) | 36–52 ms |
| `sv types` on the blog app, end to end (`npm run generate`) | 16 ms in-process |
| SQLite: open and run all 7 blog migrations | 2.6–4.6 ms |
| PGlite: boot / run all 7 blog migrations | **1.2–1.8 s** / 19–32 ms |
| `tsc --noEmit` on the small "sync" project (in `generation.test.ts`) | about 0.45 s per run |

**Where cold time goes:** importing migration files costs about 0.9–1.8 ms per file. That's Node type stripping, module linking and Windows antivirus on open, the same I/O effect spike 04 measured. The replay itself is about 0.1 ms per migration. Static analysis reads files faster (no module graph), but pays 30–58 ms to load oxc.

## Design

```
database/migrations/*.ts ──discover (code-unit order)──► import (a) ─┐
                                                         oxc read (b)┤  call script replayed on the same Blueprint
                                                                     ▼
                         recordOperations(up, stateBefore) ── SchemaOperation[] (plain data)
                                                                     │
                            applyOperations (validates, fails closed)▼
                                                   SchemaState (tables → columns, indexes, FKs)
         ┌───────────────────────┬───────────────────────────┬──────┴─────────────────────┐
  generateModelTypes     generateMetadata             compileOperations(before, ops)    createSchemaSql
  .strutvane/types/      .strutvane/resources.json    per migration, per engine         schema dump
  models.d.ts                     │                          │                                 │
  (TableRegistry aug.)            ▼                          ▼                                 ▼
  Model('posts') typed     createCrudApp (Hono)       migrate / rollback (batches,     introspect + schemaDrift
                                                      transactional)
```

**The key design choice:** migrations call a `schema` *parameter*, never a global. So `up()` is a pure function of its input, and the same recorded operations drive the state (types and metadata) **and** the SQL that runs. They can't drift apart.

| Module | Job |
|---|---|
| `src/schema/columns.ts` | Plain-data schema vocabulary (`ColumnDef`, `TableState`, …) |
| `src/schema/blueprint.ts` | `t.*` builder; narrow builder types make misuse a compile error |
| `src/schema/migration.ts` | `migration()`, the recording `schema` (with offline `hasTable` / `hasColumn`) |
| `src/schema/apply.ts` | Fold operations into state; every mistake becomes a friendly `SchemaError` |
| `src/schema/replay.ts` | Approach (a): discover, import (optionally fresh), replay, reversibility check |
| `src/schema/static.ts` | Approach (b): oxc reader producing a whitelisted call script |
| `src/generate/{types,metadata,semantics,artifacts}.ts` | `.d.ts`, `resources.json`, shared fillable/required rules, deterministic writes |
| `src/sql/{dialect,ddl}.ts` | Quoting, literals, numbered placeholders; DDL per engine (SQLite rebuild, MySQL constraints) |
| `src/db/{sqlite,pglite,migrator,introspect}.ts` | Engines, Laravel-style batches and rollback, drift check |
| `src/crud/*` | Problem+json, value coercion, list-query parsing, repository (SQL), Hono app |
| `src/model.ts` | `Model('posts')` MVC base with `TableRegistry` augmentation |

## What it looks like for an app developer (Laravel parity)

**1. `sv make:migration create_posts_table`** writes `database/migrations/2026_11_14_093000_create_posts_table.ts` from the name, exactly like Laravel's stubs (`naming.ts`):

| Name | Inferred | Stub |
|---|---|---|
| `create_posts_table` | create `posts` | `schema.create('posts', (t) => { t.id(); t.timestamps() })` + `dropIfExists` |
| `add_subtitle_to_posts_table`, `remove_x_from_posts_table` | alter `posts` | `schema.table('posts', …)` in up and down |
| anything else (`rename_labels_to_tags`, `backfill_slugs`) | blank | empty `up` / `down` |

**2. The migration** (`fixtures/blog/database/migrations/2026_01_02_000000_create_posts_table.ts`):

```ts
import { migration } from '#strutvane/schema' // product: '@strutvane/framework/schema'

export default migration({
  up(schema) {
    schema.create('posts', (t) => {
      t.id()
      t.string('title', 200)
      t.slug('slug').from('title')
      t.text('body').nullable()
      t.decimal('price', 12, 2).default(0)
      t.enum('status', ['draft', 'published']).default('draft')
      t.foreignId('author_id').constrained('users').cascadeOnDelete()
      t.boolean('featured').default(false)
      t.timestamps()
      t.softDeletes()
    })
  },
  down(schema) {
    schema.dropIfExists('posts')
  },
})
```

**3. The model (MVC):** behaviour only, no columns. Columns come from the generated types through declaration merging, so the framework never imports app code:

```ts
import { Model, type Scopes } from '#strutvane/model'

export class Post extends Model('posts') {
  static readonly scopes = { published: { status: 'published' } } satisfies Scopes<'posts'>
  author() { return this.belongsTo('users', 'author_id') }      // 'writer_id' would not compile
  get isPublished(): boolean { return this.status === 'published' } // accessor; `status` is typed
}
```

Eloquent's `$casts` aren't needed. The cast of every column comes from its type (`resources.json` → `cast`). Only exceptions would be overridden.

**4. Generated `.strutvane/types/models.d.ts` (excerpt):**

```ts
export interface Post { id: number; title: string; slug: string; content: string | null; price: string
  status: "draft" | "published"; author_id: number; featured: boolean; created_at: Date | null; … }
export interface NewPost { title: string; slug?: string; price?: number | string; author_id: number; … }
export type PostPatch = Partial<NewPost>
export interface PostJson { …; created_at: string | null }   // what the API returns
declare module "#strutvane/model" { interface TableRegistry extends Tables {} }
```

**5. How it stays in sync:**
- `sv migrate` = run pending migrations (each in a transaction), then regenerate types and metadata, then run the drift check.
- `sv types` regenerates offline (no database), and `sv dev` watches `database/migrations`, re-importing changed files with `fresh: true`.
- The `generation.test.ts` sync test shows why regenerating is part of migrate: stale types still compile, and fresh ones turn every use of a dropped or renamed column into a `tsc` error.

**6. The API, with no per-model code:**

```
GET /api/posts?page=2&perPage=20&search=hello&sort=-price,title&filter[status][in]=draft,published&filter[price][gte]=10&filter[subtitle][null]=false
GET /api/posts/1            GET /api/posts/by-slug/hello-world
POST /api/posts             PATCH /api/posts/1            DELETE /api/posts/1   (soft delete)
→ { data: [...], meta: { page, perPage, total, lastPage, from, to } }   errors: RFC 9457 problem+json with issues[]
```

## Findings

1. **Positional `?` placeholders are a silent SQLite-only bug class.** A uniqueness check built its `WHERE` clause tail-first, and a soft delete reused one placeholder for two columns. Both bound the wrong values on SQLite. They passed on PostgreSQL, whose numbered `$n` hides the mistake.
   - **How it was found:** the engine-agreement test, which compares 108-request transcripts across the two engines.
   - **Fix:** numbered `?NNN` placeholders for SQLite.
   - **Regression:** a test for the whole class, plus a planted-bug check (4 SQLite-only failures).
   - **MySQL:** it has no numbered form, so a MySQL driver must build SQL strictly left to right *(unverified)*.
2. **SQLite can't `DROP COLUMN` a foreign key column, or an indexed one.**
   - **Fix:** the compiler drops the covering indexes first, and rebuilds the table for foreign keys (create temp, copy, drop, rename, recreate indexes). That's how rolling back `add_category_to_posts_table` works, and the rows survive.
   - **Fail closed:** if another table references the one being rebuilt, the rebuild is refused, because `DROP TABLE` could fire `ON DELETE CASCADE`.
   - **Not done:** the full 12-step procedure, with `foreign_keys=OFF` outside the transaction.
3. **The engines disagree on NULL ordering.** PostgreSQL sorts NULLs last when ascending; SQLite sorts them first. Without an explicit `NULLS LAST` (SQLite 3.30+), the same page shows different rows. The API always emits `NULLS LAST` plus an `id` tie-breaker.
4. **Exact decimals don't exist in SQLite.** `NUMERIC` holds about 15 significant digits as REAL, so `12.50` reads back as `12.5`. The API re-fixes the scale (`'12.50'`) on output, so the JSON matches PostgreSQL. Larger values would lose digits on SQLite; Laravel has the same limit. TypeScript types decimals as `string`, as Laravel casts them.
5. **MySQL silently ignores inline `REFERENCES`.** Its foreign keys are emitted as named `CONSTRAINT … FOREIGN KEY`, and they must be dropped before their column. Other MySQL differences, all generated but *(unverified)* with no engine here:
   - native `ENUM`
   - `TINYINT(1)` booleans
   - `BIGINT UNSIGNED` keys
   - `DATETIME(3)` holding UTC (not `TIMESTAMP(3)`, which ends in 2038 and converts through the session time zone)
   - `RENAME TABLE`
   - `DROP INDEX … ON table`
   - backslash escaping in literals
   - `RENAME COLUMN` needs 8.0+, and CHECK is enforced from 8.0.16
   - **DDL is not transactional**, so Finding 9's "fails cleanly" guarantee does not hold on MySQL. A failed migration leaves a half-applied schema; Laravel has the same problem.
6. **Replay executes user code, which conflicts with ADR-0010's "Parse, never execute."** It's the same code `migrate` runs anyway, but `sv types` and `sv dev` would now run migration top-level code with no database present.
   - **Mitigations:** the schema is a parameter (no global database handle exists to misuse), migrations get a lint rule against top-level side effects, and a clear doc rule.
   - **Decision needed:** this needs an explicit ADR carve-out rather than a silent exception.
7. **Approach (b) fails on code real projects write.** In the dynamic fixture: a `const SKU_LENGTH`, a `for` over locales, a shared `addAuditColumns(t)` helper, and Laravel's defensive `if (!schema.hasColumn(…))`. Supporting them means writing an interpreter, which is approach (a) done badly.
8. **`hasTable` / `hasColumn` work offline under replay.** They're answered from the recorded history at that exact point, so defensive migrations produce the same operations the database would see.
9. **Transactional DDL makes failure clean on both tested engines.** A migration whose second statement fails (a unique index over duplicate rows) leaves no new column and no migrations-table row, and the schema matches the previous state exactly.
10. **Stale types compile.** Until `sv types` runs, code using a dropped column still type-checks (proven with real `tsc`). So `migrate` must regenerate, and `sv doctor` / CI should check that the committed `.strutvane` matches a fresh generation, as the golden test here does.
11. **Watch mode needs cache-busting.** Node's ESM cache never forgets a module. Re-importing with `?v=<mtime>-<size>` works in plain Node, but leaks one module instance per edit. That's acceptable for `sv dev`, but a long-running dev server should restart its replay worker periodically *(unverified at scale)*.
12. **Smaller details, each with a test:**
    - Re-adding a column in `down()` appends it, so schemas are compared ignoring column order (both engines do the same).
    - Index names survive table renames (`labels_name_unique` on `tags`), as in Laravel.
    - Soft-deleted rows keep their slug reserved (`hello-world-4`), because the unique index covers them.
    - PostgreSQL types an untyped parameter as `text` (`SELECT $1` returns `'2'`).
    - A field sent with an invalid value was first reported twice (invalid *and* required); now it gets one precise issue.
13. **PGlite takes 1.2–1.8 s to boot** (WebAssembly compile). That's fine for tests and offline tooling, but types must never depend on it. They don't: the database is only for `migrate`.

## Limits & risks (not verified here)

- **Raw SQL in migrations** (Laravel's `DB::statement`) is invisible to the recorder. A `schema.sql(…)` escape hatch would be recorded as opaque, and the post-migrate drift check is the only guard (tested: a hand-made column and index are reported). Data-only migrations would need a separate `schema.data(async (db) => …)` hook that replay skips.
- **Not modelled:** `->change()` (alter a column type; SQLite needs a rebuild), composite foreign keys, CHECK constraints beyond enums, partial or expression indexes, views, defaults like `useCurrent()`, JSON defaults, `unsigned`, `uuid` primary keys.
- **MySQL is generated but never executed.**
- **Engine coverage:** PGlite stands in for a real PostgreSQL server; pooling and concurrency weren't tested.
- **Only Windows was measured,** and the timings are from a shared laptop.
- **The slug race** (two concurrent creates with the same title) is covered by the unique index and mapped to 409, but there's no retry; the 409 mapping itself is tested.
- **Ids above 2^53 are refused** rather than handled; JavaScript numbers can't hold them.
- **The inflector is deliberately small.** Wrong guesses are fixed with label overrides.

## Recommendation

1. **Make migrations the schema source of truth, derived by replay (a).** This **changes canonical decision D4** ("the model file `defineModel()` is the source of truth"), so it needs a superseding ADR and a `blueprint-sync` pass. It also needs **an explicit exception to ADR-0010's "parse, never execute"** for `database/migrations/**` only, and every other convention keeps oxc static analysis.
2. **Keep the shape that made this work:**
   - migrations receive `schema` as a parameter;
   - the recorder emits plain-data operations;
   - one fold validates them, fails closed, and gives friendly codes and hints;
   - the **same** operations drive both the generated state and the SQL;
   - generation is deterministic (golden-file friendly);
   - `migrate` = transactional per migration, then regenerate, then the drift check.
3. **Generate four shapes per table** (`Post`, `NewPost`, `PostPatch`, `PostJson`) plus a `TableRegistry` augmentation, so `class Post extends Model('posts')` is the whole model file. Put presentation (labels, sidebar, hidden fields) in resource config, never in migrations.
4. **Ship the engine-portability rules as framework code, with these regression tests:**
   - numbered placeholders
   - `NULLS LAST` plus an id tie-breaker
   - decimal scale on output
   - SQLite drop-index-first and the guarded table rebuild
   - MySQL named foreign key constraints
5. **Do not ship approach (b)** as a schema source. If wanted, use it as an optional `sv lint:migrations --strict` that flags non-literal migrations, for teams that want "no code runs during `sv types`".
6. **Next spikes:**
   - `->change()` with an SQLite rebuild;
   - the raw-SQL and data-migration escape hatches;
   - MySQL 8 in Docker (local only, ADR-0006) running this same suite;
   - watch-mode memory over 1,000 edits.

## Suggested ADR

> **ADR-00XX: Migrations are the schema source of truth; types and metadata come from offline replay**
>
> **Context:** Strutvane is adopting Laravel's flow, where developers write columns in migrations. Spike 10 showed:
> - replaying `up()` against an in-memory recorder derives an exact schema offline (252–492 ms cold for 200 migrations, 10–18 ms warm);
> - static analysis can't read constants, loops, helpers or `hasColumn` branches;
> - the same recorded operations compile to SQL with zero drift on SQLite and PostgreSQL.
>
> **Decision:**
> - Supersede D4: `database/migrations/*.ts` is the schema source of truth.
> - `sv types` replays migrations (executing them, as an explicit exception to ADR-0010 for this folder) and emits `models.d.ts`, `resources.json` and per-engine SQL deterministically.
> - `sv migrate` runs each migration transactionally, regenerates, then checks drift.
> - Model files hold behaviour only (`extends Model('table')`).
>
> **Consequences:**
> - Migration top-level code runs during type generation, so a lint rule is needed.
> - Raw SQL needs an explicit escape hatch.
> - MySQL lacks transactional DDL.
