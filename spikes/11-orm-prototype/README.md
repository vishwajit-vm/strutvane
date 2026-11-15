# Spike 11: an Eloquent-style ORM of our own

**Question.** Can Strutvane own an Eloquent-equivalent, active-record ORM (models in `app/models`, a fluent query builder, relations, casts, scopes, soft deletes, slugs, pagination, transactions) that:

- takes its columns from spike 10's migration-generated types, so models never redeclare them;
- is fully typed (a wrong column, value, relation or hidden field is a compile error);
- runs the same on **MySQL 8.4 (the default)**, PostgreSQL and SQLite;
- has no N+1 by default and no SQL injection by construction;
- keeps tenants apart on MySQL and SQLite, where there is no row-level security?

**Answer: yes.** The prototype passes **184 tests**: the behaviour suites run on **real MySQL 8.4** (a throwaway Docker container), PostgreSQL (PGlite) and SQLite (node:sqlite), plus compile-time type tests. The ORM's own overhead is about **25–50 µs per operation** (below). Our recommendation is to **build our own query builder and grammars** in the style of Laravel's Query Builder → Grammar → Connection, and not to wrap Drizzle or Kysely. The reasons are in the design document: `docs/research/2026-11-14-strutvane-orm-design.md`.

The prototype also folds in the 2026-11-14 security review (`docs/research/2026-11-14-v2-security-design-review.md`, findings F-04, F-05, F-08, F-10 and F-14): each rule below has a test.

## Run it

```bash
cd spikes/11-orm-prototype
npm install
npm test            # tsc (type tests) + vitest on MySQL 8.4 (Docker), PGlite and SQLite
npm run bench       # rough ORM overhead vs raw SQL (SQLite, PGlite; set SPIKE11_MYSQL_URL for MySQL)
```

- MySQL runs in a container named `spike11-orm-mysql`. It is bound to `127.0.0.1` on a free port, uses a random root password, and is removed at the end (`test/support/mysql-container.ts`). No Docker file is committed (ADR-0006), and no other container is touched.
- Without Docker, the MySQL suites are **skipped, with the reason in the test title**. Set `SPIKE11_MYSQL=off` to skip them on purpose.
- npm only, with a committed `package-lock.json`. Node 24+.

## What a model looks like

```ts
// app/models/post.ts: no columns here; they come from the migrations (generated types)
export class Post extends Model('posts', {
  fillable: ['title', 'body', 'status', 'published_on', 'meta'],
  casts: { meta: json<PostMeta>() },
}) {
  static readonly scopes = {
    published: (query) => query.where('status', 'published'),
    ofStatus: (query, status: 'draft' | 'published') => query.where('status', status),
  } satisfies Scopes<'posts'>

  author() { return this.belongsTo(User, 'author_id') }
  tags() { return this.belongsToMany(Tag, 'post_tag') }
  get isPublished(): boolean { return this.status === 'published' }
}

const page = await Post.query().published().with('author', 'tags').withCount('tags').orderBy('created_at', 'desc').paginate(25)
page.data[0]?.author?.name      // User | null, fully typed
page.data[0]?.toJSON()          // hidden columns removed, both at runtime and in the type
```

## What is in the prototype

| Area | File(s) | Notes |
|---|---|---|
| Schema bridge | `src/schema/registry.ts`, `snapshot.ts` | `TableRegistry` (generated types, the spike 10 shape) plus the runtime snapshot (`registerSchema`) |
| SQL | `src/sql/fragment.ts`, `ast.ts`, `compile.ts`, `grammar.ts` | Symbolic fragments (text, value or identifier), never string concatenation. One grammar per dialect (MySQL, PostgreSQL, SQLite) |
| Connections | `src/db/*` | A tiny driver contract. `mysql2` (pool, prepared statements, pinned session), PGlite, node:sqlite. Transactions and savepoints through AsyncLocalStorage, a query listener, and a statement guard hook |
| Models | `src/orm/model.ts`, `types.ts` | `Model('table', options)` factory: typed statics and instances, mass assignment, timestamps, soft deletes, UUIDv7 keys, slugs, `toJSON` |
| Query builder | `src/orm/builder.ts` | where/orWhere/whereIn/whereNotIn/whereNull/whereRaw/whereHas, orderBy/limit/offset, with/withCount, scopes, `paginate`, `cursorPaginate`, and the request-driven `search`/`filter`/`sort` |
| Relations | `src/orm/relations.ts` | belongsTo, hasMany, belongsToMany (attach/detach/sync): eager loading, counts and EXISTS subqueries |
| Casts | `src/orm/casts.ts` | Built-in casts per column kind (boolean, date, timestamp, json, enum, decimal, integer, uuid), plus model casts (`json<T>()`, `cast({ get, set })`) |
| Tenancy | `src/orm/tenancy.ts`, `tenant-scope.ts` | AsyncLocalStorage tenant, a configurable tenant column, table classification, and the SQL-tree scope check and raw-SQL guard |

## Evidence

| Suite | What it proves (on each of MySQL, PostgreSQL, SQLite) |
|---|---|
| `model.test.ts` | create and update (dirty columns only), DB defaults read back (with a re-select on MySQL, which has no RETURNING), casts round-trip, enum and length rules enforced the same everywhere, mass assignment (unknown, guarded, system and `__proto__` keys), soft deletes, slugs (accents, `%`/`_` literal, sequential `-2`/`-3` with a retry that moves on after a conflict, unique per tenant), time-ordered UUIDv7, hidden fields |
| `query-builder.test.ts` | every condition method, grouping, NULL-safe `!=`, local and global scopes (OR can't escape), search/filter/sort with hostile names and values, `sql` tag only, offset and cursor pagination (every row exactly once with ties; tampered and mismatched cursors refused) |
| `relations.test.ts` | **6 posts + authors = 2 queries** (the N+1 version is 7), users → posts → tags = 3 queries, constrained eager loading, `withCount` in the same query, `whereHas` as EXISTS, relation scopes respected, relation queries and `create`, idempotent attach/sync, `with('delete')` refused, lazy loading refused for list members |
| `tenancy.test.ts` | attack-style: tenant A against B's rows through list, find, slug, count, paginate, cursor, search, filter, child tables, eager loading, counts, whereHas, OR tricks, smuggled `tenant_id`, saving B's model, composite foreign keys and cascades, pivot attach, a planted unscoped join, raw SQL, the audited bypass, the `team_id` configuration, unscopable tables, 200 interleaved requests. On PostgreSQL also RLS as the second layer |
| `transactions.test.ts` | commit, rollback, nested savepoints, isolation between concurrent callers, parallel savepoints refused, slug retries inside a transaction, and one tenant per transaction (PostgreSQL) |
| `dialects.test.ts` | typed binds refuse `'1abc'`, `0`, objects and lists **before any SQL is sent**; exact matching of identifier-like values; UTC round-trip. MySQL evidence: no `RETURNING`, `'1abc' = 1` is true on the raw server, the pinned strict `sql_mode` and UTC, truncation is an error, `ai_ci` folds case and accents, and `LIMIT ?` works in prepared statements |
| `types.test.ts` (compiled by `tsc`) | wrong column, value, enum, operator target, key type or sort column are errors; non-fillable and `tenant_id` are errors; models without `fillable` can't `create()`; results, casts, scopes, relations (nested), counts and constrained loads are typed; `toJSON()` has no hidden keys, dates are strings, relations nest |

## Benchmark (rough; one Windows laptop, Node 24.21, median of 5 × 2,000 ops)

| engine | operation | raw SQL (µs/op) | ORM (µs/op) | ORM overhead |
|---|---|---|---|---|
| sqlite (node:sqlite, in memory) | select by id | 5.1 | 33.9 | +28.9 µs |
| sqlite (node:sqlite, in memory) | insert one row | 3.1 | 26.2 | +23.1 µs |
| postgres (PGlite) | select by id | 124.0 | 174.2 | +50.3 µs |
| postgres (PGlite) | insert one row | 138.2 | 255.9 | +117.7 µs |

"Raw SQL" is a prepared statement on the same driver session. The ORM adds 25–50 µs per read: schema lookups, casts, compiling, the tenant check and hydration. An insert does more on top of that: `create()` fills and checks the input, applies casts, sets timestamps, and hydrates the row from RETURNING.

Next to a networked MySQL round trip (typically a few hundred µs) that is about 10%. Next to in-memory SQLite it looks large, because the database does almost nothing. MySQL wasn't measured in this run. `SPIKE11_MYSQL_URL=… npm run bench` measures it.

**Not optimised yet:** caching compiled SQL per query shape, and precomputing cast plans per model, are the obvious next steps.

## MariaDB (added 2026-11-15)

MariaDB is a first-class engine (`DB_CONNECTION=mariadb`; XAMPP ships it). The behaviour suites run on a throwaway **MariaDB 11.4** container (`spike11-orm-mariadb`, same rules as the MySQL one; `SPIKE11_MARIADB=off` skips it) next to MySQL 8.4, PGlite and SQLite. It uses the same `mysql2` driver with its own grammar, `mariadbGrammar`, a MySQL grammar with overrides:

| | MySQL 8.4 | MariaDB 11.4 (checked) | ORM |
|---|---|---|---|
| `INSERT … RETURNING` | no | yes (10.5+) | one statement per insert instead of insert + re-select |
| `UPDATE … RETURNING` | no | **no** (syntax error) | re-select, as on MySQL |
| JSON | native type; mysql2 parses it | alias of `LONGTEXT` + `JSON_VALID` check; mysql2 parses it on 11.x, not on 10.4 | the driver asks for JSON as text (`jsonStrings`) and the cast parses it once, on every server |
| Binary collation | `utf8mb4_0900_bin` (NO PAD) | `utf8mb4_bin` is PAD SPACE: `'resume ' = 'resume'` | session and identifier columns use `utf8mb4_nopad_bin` |
| Default collation | `utf8mb4_0900_ai_ci` | `utf8mb4_uca1400_ai_ci` (folds case and accents) | identifier-like columns are binary, as on MySQL |
| `'1abc' = 1` | true | true | typed binds, as on MySQL |

**Version detection.** `detectMysqlServer(version)` reads `VERSION()` (`8.4.13` → MySQL; `11.4.13-MariaDB-…` → MariaDB with RETURNING; `10.4.32-MariaDB` or `5.5.5-10.4.32-MariaDB` → MariaDB without RETURNING). `connectMysqlFamily(options)` runs it once at boot and builds the right driver, so an XAMPP machine with `DB_CONNECTION=mysql` still gets the MariaDB grammar. MariaDB 10.4 itself was not run here (the RETURNING switch for it is unit-tested only).

## Findings (what the spike taught us)

1. **`Model('posts', options)` (a function returning a typed class) is the only decorator-free way to get typed column properties.** A generic class can't add properties named by a type parameter. Options that change types (`fillable`, `hidden`, `casts`) must therefore be in the call; behaviour (relations, scopes, accessors) goes in the class body. This mirrors Laravel 13's `#[Table]`, `#[Fillable]` and `#[Hidden]` attributes.
2. **Relation types become circular** when the type of `load()` and `toJSON()` depends on "the model's relations". The fix is to skip the built-in method names when looking for relations (`ModelMethodName` in `types.ts`). The product must keep that list in sync with `ModelBase`, and a type test catches drift.
3. **Global scopes must parenthesise the developer's conditions.** Otherwise `where(a).orWhere(b)` plus a tenant scope becomes `a OR b AND tenant = ?` and leaks. This is now tested on all engines, and the SQL-tree check refuses any tenant condition that isn't a top-level AND.
4. **A transaction bug found by a test.** With `Promise.all([transaction(a), transaction(b)])` inside an outer transaction, b's failure rolled the outer transaction back while a was still running. a's remaining INSERT then ran in **autocommit mode, after the ROLLBACK, on a connection already handed back**: the row survived (PGlite). The fix has two parts. The transaction is marked as ended *before* COMMIT or ROLLBACK, and any statement on an ended transaction throws. Parallel savepoints on one connection are refused.
5. **MySQL 8.4 has no `RETURNING`** (checked against the server). Writes use the insert id, then re-select by key and tenant: one extra round trip per write. MySQL also needs `` ` `` quoting, `NOT (a <=> b)` for NULL-safe `!=`, `LIMIT 18446744073709551615` before a bare OFFSET, `() VALUES ()` for all-default rows, errno 1062 for unique violations, and alias names that aren't reserved words (`INSENSITIVE` broke a test).
6. **MySQL type coercion is real.** On the server, `'1abc' = 1` and `'abc' = 0` are true, so binds are type-checked against the column kind **before** SQL runs: digits-only strings are accepted for integers (URL ids), and objects and lists never reach the driver. A mutator such as `value.trim()` crashed with a TypeError on `{"email": 0}`. Model casts are now wrapped, so that becomes a clean `CastError`.
7. **MySQL collations.** `utf8mb4_0900_ai_ci` folds case and accents (`'résumé' = 'resume'`, checked). Identifier-like columns (email, slug, uuid, enum, tokens) use `utf8mb4_0900_bin` in the DDL, and emails are normalised by a model cast on write *and* on lookup. The driver pins a strict `sql_mode` (truncation is an error, checked), UTC and utf8mb4 on every new connection.
8. **The engines disagree in small ways the ORM must flatten.** SQLite ignores `VARCHAR(200)` (the cast enforces it), SQLite and MySQL return booleans as 0/1, and SQLite returns decimals as floats (formatted to the column's scale). PGlite returns `DATE` as a JS Date at UTC midnight and BIGINT as a number. mysql2 returns `DATE` as local midnight unless `dateStrings` is set.
9. **Resolving `with('name')` calls a model method (Laravel does too).** A naive implementation turns `?include=delete` into a delete. Resolution is therefore limited to plain synchronous methods defined on the app's own model class, run on a **blank** instance, and the result must be a relation. For request-driven includes, the product should validate names against `resources.json` (built statically) first.
10. **Prototype pollution through mass assignment is blocked by design:** `Object.entries` sees a JSON body's own `__proto__` key and refuses it as an unknown column. The test also showed that merging bodies with `Object.assign` *sets the prototype* instead. Controllers must never merge request bodies that way.
11. **Slug collisions (F-14, decision #49).** A collision gets the lowest free `-2`, `-3` (decided 2026-11-15: friendly and predictable). The lookup is limited to the tenant, so the number reflects only the tenant's own rows; a retry after a unique-index conflict marks the tried slug as taken and moves on.

## Security rules implemented (from the 2026-11-14 review)

| Finding | Rule in the ORM | Tests |
|---|---|---|
| F-04 | One canonical tenant column (`configureOrm({ tenancy: { column } })`, `tenant_id` or `team_id`). Every table is scoped, `global` (snapshot flag) or **unscopable, and then refused** | `tenancy.test.ts` "tenant column is configuration", child-table reads |
| F-05 | One choke point: every tenant table in FROM/JOIN/subquery/EXISTS/UPDATE/DELETE/INSERT must carry `<alias>.<col> = <active tenant>` as a top-level AND, or `TenantScopeMissingError`. Raw SQL naming tenant tables is refused in a tenant context unless wrapped in `unsafeRaw(reason, …)`. `unsafeWithoutTenancy(reason)` replaces `withoutTenancy()`, and both report to `onUnsafeTenancy`. Pivot `attach`/`sync` verify ids with a scoped query in the same transaction. Composite `(tenant_id, x)` foreign keys and tenant-prefixed unique keys are in the fixture DDL | planted unscoped join, raw SQL, bypass audit, pivot attach, composite FK and cascade, labels unique per tenant |
| F-08 | Typed binds; binary collations for identifier-like columns; email normalised on lookup; strict `sql_mode`, UTC and utf8mb4 pinned per connection; server-side prepared statements (`execute`) | `dialects.test.ts` |
| F-10 | `create()`/`fill()` accept only an explicit `fillable` (a missing `fillable` is a compile error plus a runtime refusal). Sensitive-looking names (`is_*`, `*_at`, `*_by`, `role`, `plan`, `user_id`, `owner_id`) also need `allowSensitive`. The tenant column is never fillable | `model.test.ts`, `types.test.ts` |
| F-14 | Tenant-scoped slug lookups; sequential suffixes per decision #49 | `model.test.ts` |

## Not built (designed in the doc, not proven here)

- hasOne, hasManyThrough, polymorphic relations, and `withSum`/`withExists`;
- events and observers, optimistic locking, chunk/cursor streaming, upsert (rule: the conflict target must include the tenant column), bulk update and delete;
- API resources, factories and seeders, ULID keys, multiple named connections;
- the ADR-0008 policy compiler as a scope (on MySQL it needs `<=>` and `COLLATE utf8mb4_bin`).

## Open risks

- **Type cost at scale.** The relation, path and JSON types are recursive. They compile instantly for 8 tables, but nobody has measured 200 models. The product needs a compile-time budget test.
- **The raw-SQL guard is heuristic.** It looks for tenant table names as identifiers or words. It can produce false positives (a column with the same name as a tenant table), and it can't see through views. Views over tenant tables must be marked as tenant objects.
- **AsyncLocalStorage capture.** A promise memoised in one request and reused in another keeps the first tenant. The ORM can't prevent that; caches must be keyed by tenant (and the testing kit should include the 1,000-request interleaving test from the review).
- **MySQL relies on the app layer plus DDL rules.** Composite foreign keys, tenant-prefixed uniques and binary collations must be emitted by spike 10's recorder: this spike only put them in its own test DDL.
- **Global mutable state** (the default connection and ORM config) is fine for an app but forces test files to run sequentially. The product's testing kit needs per-worker connections.
- **Overhead** is acceptable but unoptimised (see the benchmark).
