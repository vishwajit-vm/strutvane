# The Strutvane ORM: design (Eloquent for TypeScript)

- **Date:** 2026-11-14
- **Status:** research and design. It feeds an ADR that supersedes ADR-0004 ("Drizzle behind an internal data adapter").
- **Evidence:** spike 11 (`spikes/11-orm-prototype/`) has 184 tests on **real MySQL 8.4**, PostgreSQL (PGlite) and SQLite.
- **Inputs:**
  - `docs/18-v2-blueprint.md` §4;
  - spike 10 (migration-first schema);
  - ADR-0007, ADR-0008 and ADR-0017;
  - the 2026-11-14 security review (F-04, F-05, F-08, F-10, F-14);
  - `spikes/SHARED-DESIGN.md`.
- **Decisions this follows** (project lead, 2026-11-14):
  - Strutvane gets **its own ORM**, equivalent to Eloquent;
  - **MySQL 8.4+ is the default** database, with PostgreSQL and SQLite as choices;
  - npm only;
  - MVC with Laravel's layout;
  - the ORM ships inside `@strutvane/framework` (revised repository decision: the framework absorbs core, contracts, cli and devkit).

> **Summary.**
> - Models are active-record classes in `app/models`, written `class Post extends Model('posts', { fillable, hidden, casts }) { … }`. Their columns come from spike 10's generated `TableRegistry`, so the model never repeats them.
> - Strutvane **owns** the query builder and one small *grammar* per dialect, copying Laravel's Builder → Grammar → Connection split. Kysely and Drizzle are not runtime dependencies.
> - Tenancy is a global scope with **one SQL-tree check** before every statement. That check is the guarantee on MySQL and SQLite; PostgreSQL adds RLS on top.

---

## 1. What Eloquent is, and what we take from it

Read 2026-11-14 at laravel.com/docs/13.x: `eloquent`, `eloquent-relationships`, `eloquent-collections`, `eloquent-mutators`, `eloquent-resources`, `eloquent-factories`, `queries`, `pagination`, `database` (transactions), `events`.

| Eloquent feature (Laravel 13) | What it does | Strutvane |
|---|---|---|
| Model conventions: table, `$primaryKey`, `HasUuids` (UUIDv7 by default in 13.x), `HasUlids`, `$timestamps`, `$connection`. **13.x adds PHP attributes** (`#[Table]`, `#[Fillable]`, `#[Hidden]`, `#[Scope]`, `#[ScopedBy]`, `#[Connection]`, `#[Refreshes]`) | per-model configuration | `Model('table', options)` is the TypeScript twin of the attributes. The table is explicit (that is what types the class). Keys, timestamps and soft deletes are **detected from the migration** (`t.id()`/`t.uuid('id')`, `t.timestamps()`, `t.softDeletes()`), so there is nothing to configure |
| Strictness: `preventLazyLoading`, `preventSilentlyDiscardingAttributes`, `preventAccessingMissingAttributes` | development guards | **On by default.** Lazy loading of a list member throws `LazyLoadingError`. Unknown or non-fillable input throws `MassAssignmentError`. A missing attribute is a compile error |
| Retrieving: `all`, `find`, `where`, `first(OrFail)`, `chunk(ById)`, `lazy(ById)`, `cursor`, aggregates, `firstOrCreate`, `updateOrCreate`, `upsert` | queries | same names. `chunkById`/`lazy` become an async iterator (`for await (const post of Post.query().cursor())`). `upsert` requires a conflict target that includes the tenant column (F-05) |
| Inserting and updating: `save`, `create`, `update`, dirty tracking (`isDirty`, `getDirty`, `wasChanged`) | writes | same; updates write dirty columns only |
| Mass assignment: `$fillable` / `$guarded` / `#[Unguarded]` | input safety | **only `fillable`, explicit, required for `create()`** (a missing one is a compile error). No `guarded`, no unguarded mode. Sensitive-looking names need `allowSensitive` (F-10) |
| Soft deletes: `delete`, `restore`, `forceDelete`, `withTrashed`, `onlyTrashed`, pruning | lifecycle | same. Enabled by the `deleted_at` column. Pruning is designed as a scheduled command |
| Scopes: global (`ScopedBy`, closures), local (`#[Scope]`), `withoutGlobalScope(s)`, pending attributes | reusable filters | `static globalScopes` and `static scopes` objects (`satisfies Scopes<'posts'>`); local scopes become typed builder methods (`Post.query().published()`) |
| Events and observers: `creating`, `created`, `updating`, `saved`, `deleting`, `restored`, …, `withoutEvents`, `saveQuietly` | hooks | designed (§6.7): a typed `static events` plus `observe(Post, PostObserver)`, dispatched through the framework's event bus |
| Relationships: one-to-one/many, many-to-many with pivot (`withPivot`, `withTimestamps`, `using`), has-one/many-through, polymorphic (`morphTo`, `morphMany`, `morphToMany`, an enforced morph map), `ofMany`, `withDefault`, `chaperone` | relations | belongsTo, hasMany and belongsToMany are built. hasOne, hasManyThrough, morph and `ofMany` are designed on the same contract (§6.4). The morph map is **mandatory** (class names never go into the database) |
| Eager loading: `with`, nested, constrained, `load`, `loadMissing`, `withCount/Sum/Avg/Exists`, `has`, `whereHas`, `whereRelation`, automatic eager loading (12.x) | no N+1 | `with` (paths are typed up to 3 levels), constrained `with({ rel: q => … })`, `withCount`, `whereHas`. `load` on one model; `loadMany(list, …)` for lists |
| Collections (`Collection` methods, `keyBy`, `groupBy`, `modelKeys`…) | results | **plain arrays**, plus a few typed helpers (`keyBy`, `pluck`, `modelKeys`). ES2024 already has `Object.groupBy`/`Map.groupBy`, and arrays keep every TypeScript and React integration working |
| Mutators and casts: `Attribute::make(get:, set:)`, `$casts`/`casts()` (date, json, AsCollection, enum, encrypted, custom `CastsAttributes`), `$appends` | values | built-in casts from the column kind, plus model casts (`json<T>(validate?)`, `cast({ get, set })`, `encrypted()` designed). Accessors are TypeScript getters; appended values belong in API resources |
| Serialization: `toArray`, `toJson`, `$hidden`, `$visible`, `makeVisible`, date format | output | `toJSON()` with `hidden` reflected **in the type**: ISO dates, nested relations and counts |
| API resources: `JsonResource`, `ResourceCollection`, `whenLoaded`, `when`, pagination meta | output shaping | `defineResource(Post, (post, { whenLoaded }) => ({ … }))`, designed (§6.8) |
| Factories: `HasFactory`, `definition()`, states, `count`, `for`, `has`, sequences, `recycle`, `make` | test data | `defineFactory` plus `Post.factory().count(10).for(user, 'author').create()` (§7) |
| Query builder: `where*` family, `when`, `orderBy`, `groupBy/having`, joins, unions, `lockForUpdate`, raw expressions with bindings, `toSql`, `dd` | SQL | the typed subset is built (§5). joins, `groupBy`, `having`, locks and `when` are designed. Raw SQL only through the `sql` tag |
| Pagination: `paginate` (with total), `simplePaginate`, `cursorPaginate` | pages | `paginate` (with total) and `cursorPaginate` (opaque, sort-bound, validated cursors) are built. `simplePaginate` is trivial |
| Transactions: `DB::transaction(fn, attempts)`, nested savepoints, `afterCommit` | atomicity | `transaction(fn)` with savepoints through AsyncLocalStorage (built); retry on deadlock and `afterCommit` are designed |

**What we deliberately change from Laravel**, with the reason for each:

1. **No implicit lazy loading.** It can't exist in JavaScript: a property access can't await. Before `with('author')`, `post.author` is the relation method, so `post.author.email` is a compile error. N+1 needs an explicit `await post.load(…)`, and a list member refuses that by default.
2. **`!=` and `whereNotIn` are NULL-safe** (rows with NULL match), the same as JavaScript `!==` and the same as ADR-0008 policies. Plain SQL `<>` silently drops NULL rows.
3. **Columns keep their migration names** (`created_at`, `author_id`), as in Laravel. There is no camelCase mapping layer, so SQL, JSON, types, `resources.json` and logs all use one name. The blueprint example `orderBy('createdAt')` should read `orderBy('created_at')`.
4. **Explicit `fillable` only**, and slug collisions get a random suffix: both come from the security review.

## 2. The TypeScript ORMs we compared

npm versions were checked with `npm view` on 2026-11-14. The characterisations come from their documentation and our own use; anything we did not re-check is marked *(unverified)*.

| Library (latest on 2026-11-14) | Model style | Typing source | Eloquent-like? | Take / avoid |
|---|---|---|---|---|
| **Lucid** (AdonisJS) 22.4.2 | active record, `class Post extends BaseModel`, `@column()` decorators | decorators plus declared class fields | **closest in API**: relations, `preload`, scopes, hooks, factories, `serialize`, soft deletes via a package | Take the API vocabulary (`preload` ≈ `with`, `related('x').query()`). Avoid decorators (project rule) and columns declared twice (in the model *and* the migration). Built on Knex *(unverified for v22)* |
| **Prisma** 8.0.0-rc.33 | data mapper, generated client from `schema.prisma` | codegen | no (no model classes, no scopes) | Take generated types from one source of truth (ours is the migration) and `include` typing. Avoid a separate schema language and engine binary history; v8 is still an RC |
| **Drizzle** 0.45.4 (1.0 betas on dist-tags) | schema-as-code tables plus a SQL-like builder; relational queries API | inferred from the table definitions | no | Take inference without codegen. Avoid the schema living in TS table objects (ours lives in migrations), and drizzle-kit prompts (spike 01, ADR-0009). Still 0.x |
| **Kysely** 0.29.9 | typed SQL builder, not an ORM | a `Database` interface | no | Take its operation-node AST and dialect-adapter split as design references. Avoid its immutable, generics-heavy builder as our public API (§3) |
| **TypeORM** 1.1.3 | active record *or* data mapper, decorators, `reflect-metadata` | decorators and reflection | partly (active-record mode) | Avoid: decorators and reflection are forbidden here; the relation typing is weak (`Post.author` is just `User`, whether loaded or not) |
| **MikroORM** 7.2.9 | data mapper, unit of work, identity map | decorators or `defineEntity` | no (unit of work, not active record) | Take `defineEntity`-style typing without decorators. Avoid a unit of work / identity map as the default: too much magic for a Laravel-style DX |
| **Objection.js** 4.4.3 | active record on Knex, `static relationMappings`, `withGraphFetched` | hand-written class fields | fairly (models, relations, eager graphs) | Take static relation maps as the safe alternative for request-driven includes (§6.4). Avoid Knex underneath (weak types) |
| **Sequelize** 6.37.8 | active record, `Model.init` or decorators | weak (`InferAttributes` helpers) | partly | Avoid: weak types, and v7 has been "alpha" for years *(unverified status)* |
| **Bookshelf** 1.2.0 (last publish 2022-06-13) | Backbone-style active record on Knex | none | historically | Avoid: unmaintained |

**Conclusion of the comparison.**
- Lucid proves an Eloquent-like API works in TypeScript, but it pays for that with decorators and double declarations.
- Prisma and Drizzle prove generated or inferred types beat hand-written ones.
- Nobody combines "columns from migrations" with "Eloquent API" and "no decorators": that is the gap Strutvane fills.

## 3. Build or reuse: the SQL layer

| Option | Types | Maintenance | Dialects | Performance | Bundle / supply chain | Fit with tenancy and policies |
|---|---|---|---|---|---|---|
| **A. Own builder + grammars (chosen)** | our own types, designed for the model API (spike 11: wrong column, value, relation or hidden field are all compile errors) | ~1.5k lines for the core in the spike. Grammars are small (§5.2) | MySQL, PostgreSQL, SQLite in the spike; MSSQL possible later | +25–50 µs/op unoptimised (spike benchmark) | zero runtime deps beyond the drivers | **direct**: the AST is ours, so the tenant check walks it, scopes are removable by name, and policy fragments compose as nodes |
| B. Kysely as the low-level builder | Kysely's `DB` types would still need mapping to model types. Two type systems to keep in sync, and heavy generics on top of our own (compile cost) | an external 0.x dependency (0.29.9); a breaking 0.x minor means our upgrade work | MySQL, PostgreSQL, SQLite, MSSQL built in; PGlite and libSQL via community dialects | similar | small, zero deps | **indirect**: we would wrap Kysely's immutable builder in a mutable Eloquent builder and still need our own AST for scopes, the tenant check and `withCount`/`whereHas` rewriting. That is almost all the work of A, plus an adapter |
| C. Drizzle (ADR-0004 today) | inferred from Drizzle table objects; we would have to generate those from migrations as well | 0.x, with 1.0 still in beta; drizzle-kit prompts (ADR-0009) | MySQL, PostgreSQL, SQLite | good | medium | weak: a relational query API that is not Eloquent's, and the internal types leak |
| D. Knex | weak | old and stable | wide | ok | medium, with deps | as B, with worse types |

**Recommendation: A.** The reasons, in order:

1. **The security model needs the AST.** F-05's single choke point (every tenant table reference must carry `tenant = ?` as a top-level AND) must inspect the query before it becomes SQL. With our own AST that is ~100 lines (`tenant-scope.ts`). On top of Kysely it means walking Kysely's internal operation nodes, which are not a stable public contract.
2. **Laravel's architecture is exactly A** (Query Builder → Grammar → Processor → Connection). Copying it keeps the docs and mental model 1:1.
3. **The types are model-shaped, not SQL-shaped.** `where(col, value)` on `TableRegistry` types is simpler and cheaper for the compiler than Kysely's selection-tracking generics, and we need our own types anyway for relations, scopes and JSON.
4. **Small dialect surface.** The ORM emits a narrow, predictable subset of SQL (§5.2). The spike's grammars are 15–20 lines each.
5. **Supply chain.** It is MIT, one less 0.x dependency, and the drivers (`mysql2`, `pg`, `node:sqlite`, PGlite) stay optional peers.

**What we take from Kysely without depending on it:** its node-based AST, the split between compiler and adapter, and its `sql` template-tag ergonomics.

**Escape hatch:** an optional `@strutvane/kysely` add-on can expose a Kysely instance on the same connection for complex reporting SQL. It is not part of the core, and its SQL goes through the same statement guard (§6.6).

**This supersedes ADR-0004.** A new ADR records "own ORM; Drizzle removed; Kysely only as an optional add-on". The migration diffing that ADR-0004 gave to drizzle-kit is now spike 10's own migration replay.

## 4. Models

### 4.1 Class-based through a typed factory (decided)

```ts
// app/models/post.ts
import { json, Model, type Scopes } from '@strutvane/framework'

export class Post extends Model('posts', {
  fillable: ['title', 'body', 'status', 'published_on', 'meta'], // written by make:migration (F-10)
  hidden: [],
  casts: { meta: json<PostMeta>(PostMetaSchema.parse) },
}) {
  static readonly scopes = {
    published: (q) => q.where('status', 'published'),
    ofStatus: (q, status: PostStatus) => q.where('status', status),
  } satisfies Scopes<'posts'>

  author() { return this.belongsTo(User, 'author_id') }
  tags() { return this.belongsToMany(Tag, 'post_tag') }
  get isPublished() { return this.status === 'published' }
}
```

- **Why a function call and not `extends Model<'posts'>`.** A generic class can't give its instances properties named by a type parameter (`post.title: string`). A function that returns a class whose constructor type already has those properties can, and plain `extends` keeps everything else Laravel-like: methods, getters, statics, `instanceof`.
- **Why not `defineModel({...})` objects.** Relations, accessors and scopes are naturally methods, and MVC readers expect classes.
- **No decorators, no reflection** (project rule). Laravel 13's own move to `#[Table]` attributes maps directly onto the options object.
- **Options that change types live in the call** (`fillable`, `hidden`, `casts`). Behaviour lives in the class body (relations, `scopes`, `globalScopes`, accessors, `events`).
- **Columns are never declared in the model.** They come from spike 10's generated `.strutvane/types/models.d.ts`, which augments `TableRegistry` with `{ row, insert, update, json }` per table. A renamed or dropped column becomes a compile error everywhere after `node strut migrate`.
- **Runtime schema.** The ORM also needs facts that types can't carry into JavaScript: column kinds for casts, slug sources, composite unique indexes, the `global` flag and the tenant column. Generated code calls `registerSchema(snapshot)` at boot with the replayed `TableState` (request to spike 10: emit `.strutvane/schema.json`).
- **Built-in method names never clash with columns.** At boot the ORM refuses a column named like a model method (`save`, `delete`, …), with a "rename the column" message.

### 4.2 Keys

- `t.id()`: auto-increment, read back via RETURNING (PostgreSQL, SQLite) or the insert id (MySQL).
- `t.uuid('id')`: **UUIDv7** generated by the ORM, monotonic within a millisecond. This is Laravel 13's default too.
- `t.ulid('id')`: designed the same way.
- The primary key never changes on save (`PRIMARY_KEY_CHANGED`).

### 4.3 Casts, accessors, mutators

- **Built-in casts by column kind:**
  - boolean (`0/1` ↔ `true/false`);
  - timestamp (`Date`, UTC; `DATETIME(3)` as UTC on MySQL);
  - date (`'YYYY-MM-DD'`);
  - json;
  - decimal (exact string at the column's scale; never a float);
  - integer (safe range, else an error asking for a bigint cast);
  - enum (validated);
  - uuid (validated, lower-cased);
  - string length (enforced, because SQLite ignores `VARCHAR(n)`).
- **Model casts** declared in options:
  - `json<T>(validate?)` types a JSON column, and validates it with any parse function (Zod/Valibot);
  - `cast({ get, set })` is a mutator/accessor pair;
  - `encrypted()` and `asEnum(TsEnum)` are designed.
  - `set` errors become `CastError` (422), never TypeErrors.
- **Accessors** are TypeScript getters. They are not serialised: computed fields go in API resources (explicit beats `$appends`).
- **Model casts also apply to bound values.** `where('email', ' ADA@X ')` finds the row stored as `ada@x`.

### 4.4 Mass assignment (F-10)

- `create(input)` and `fill(input)` accept **only the explicit `fillable` list**.
- **Unknown keys** throw, with a "did you mean". **System columns** throw (`id`, timestamps, `deleted_at`, the tenant column). So do non-fillable columns. This includes the own `__proto__` key that `JSON.parse` produces.
- **Sensitive-looking names** (`is_*`, `*_at`, `*_by`, `role`, `plan`, `permissions`, `user_id`, `owner_id`) need a second acknowledgement in `allowSensitive`.
- **The type of `create()`** is `Pick<insert type, fillable>`. Without `fillable` it is a readable compile error.
- **Trusted code** (seeders, your own services) uses `forceCreate()` / `forceFill()`: any real column, still never system columns.
- **Columns added by a later migration** stay read-only through `create()` until someone lists them (F-10).
- **Ownership foreign keys** (`author_id`) are set through the relation (`user.posts().create(...)`) or from the actor, not from input.

### 4.5 Timestamps, soft deletes, slugs

- **Timestamps:** `created_at`/`updated_at` are maintained when both exist. Updates write dirty columns plus `updated_at`. `touch()` and `withoutTimestamps()` are designed.
- **Soft deletes:** active when `deleted_at` exists.
  - `delete()` sets it; `forceDelete()` removes the row; `restore()` clears it.
  - `withTrashed()`/`onlyTrashed()` change the query.
  - Relation loads, counts and `whereHas` respect the related model's soft deletes.
- **Slugs** (`t.slug('slug').from('title')`) are generated on create:
  - ASCII, accents stripped, `%` and `_` treated as literal characters, room left for a suffix;
  - unique within the column's unique-index scope **and always within the tenant**;
  - a collision gets a random 4-character suffix (`launch-k3f9`, F-14);
  - a race is retried inside a savepoint, so an outer transaction survives;
  - slugs stay stable on update by default (URLs don't change).

### 4.6 Serialization and API resources

- `toJSON()` returns columns minus `hidden`, ISO dates, nested loaded relations (with their own `hidden` applied), and `*_count` values.
- The **type** `JsonOf<Model>` matches it exactly: `user.toJSON()` has no `password` key at compile time.
- API resources (§6.8) are the recommended shape for anything public.

## 5. The query builder

### 5.1 API (built in the spike; typed by table)

```ts
Post.query()
  .where('status', 'published')               // '=' default; value typed by the column
  .where('view_count', '>=', 10)
  .where((q) => q.where('a', 1).orWhere('b', 2)) // grouped, parenthesised
  .whereIn('id', ids).whereNotIn(...).whereNull('body').whereNotNull(...)
  .whereHas('tags', (q) => q.where('name', 'news'))   // EXISTS, typed by the related model
  .whereRaw(sql`length(${sql.id('title')}) > ${10}`) // only the sql tag; strings are refused
  .with('author', 'tags').with({ comments: (q) => q.latest() })
  .withCount('tags')
  .published()                                 // local scope
  .orderBy('created_at', 'desc').limit(20).offset(40)
  .get() | first() | firstOrFail() | find(id) | count() | exists()
  .paginate(25, page)       // { data, total, perPage, currentPage, lastPage }
  .cursorPaginate(25, cursor) // { data, perPage, nextCursor }
```

- **Mutable, like Laravel's builder.** It is cheap, and `clone()` branches a query.
- **Request-driven methods take strings**, because they come from the request: `search(term, cols)`, `filter(col, op, value)` and `sort('-created_at,title')`. Each name is checked against the snapshot, and the controller also checks it against `resources.json` allow-lists. Operators are the `filterOperators` vocabulary from `resources.json`. `contains` and `startsWith` are literal (no LIKE wildcards) and case-insensitive (`lower()` on both sides).
- **Designed next:**
  - `join`/`leftJoin` (typed by alias), `select`/`addSelect`, `groupBy`/`having`, `distinct`;
  - `when(cond, fn)`, `lockForUpdate`/`sharedLock`, `increment`/`decrement`;
  - bulk `update`/`delete` (scoped, F-05);
  - `chunkById`/`cursor` (an async iterator on keyset pages), `simplePaginate`, `pluck`/`value`, aggregates (`sum`, `avg`, `min`, `max`).

### 5.2 Grammars (dialect differences)

| | MySQL 8.4 (default) | PostgreSQL | SQLite |
|---|---|---|---|
| quoting | `` `x` `` | `"x"` | `"x"` |
| placeholders | `?` (server-side prepared via `execute`) | `$n` | `?` |
| NULL-safe `!=` | `NOT (a <=> b)` | `a IS DISTINCT FROM b` | `a IS NOT b` |
| RETURNING | **none** (checked on 8.4): insert id + re-select | yes | yes (3.35+) |
| OFFSET without LIMIT | `LIMIT 18446744073709551615` | fine | `LIMIT -1` |
| empty insert | `() VALUES ()` | `DEFAULT VALUES` | `DEFAULT VALUES` |
| literal substring | `LOCATE(n, h)` | `strpos(h, CAST(? AS text))` | `instr(h, n)` |
| booleans | `TINYINT(1)` → 0/1 | boolean | 0/1 |
| timestamps | `DATETIME(3)`, UTC by session pin | `timestamptz(3)` | ISO text |
| JSON | `JSON` (mysql2 parses) | `jsonb` (parsed) | text |
| unique violation | errno 1062 | SQLSTATE 23505 | message text |
| upsert (designed) | `ON DUPLICATE KEY UPDATE` (the key must include the tenant column) | `ON CONFLICT (…) DO UPDATE` | `ON CONFLICT` |
| transactional DDL | **no** (DDL auto-commits: the migrator must report per operation) | yes | yes |
| savepoints | yes | yes | yes |
| case sensitivity | collation-dependent: binary for identifier columns (F-08) | case-sensitive | case-sensitive (BINARY) |

**MySQL session, pinned by the driver on every new connection (F-08):** `sql_mode = STRICT_ALL_TABLES, NO_ZERO_IN_DATE, NO_ZERO_DATE, ERROR_FOR_DIVISION_BY_ZERO, NO_ENGINE_SUBSTITUTION, ONLY_FULL_GROUP_BY, NO_BACKSLASH_ESCAPES`, `time_zone = '+00:00'`, `NAMES utf8mb4`. With mysql2: `timezone: 'Z'`, `dateStrings: ['DATE']`, `supportBigNumbers`, exact decimals.

**SQLite driver:** `node:sqlite` by default (built into Node 24+, no native build). libSQL is for remote/Turso, and better-sqlite3 can be added as an optional faster driver. **PGlite** is for fast PostgreSQL tests. Production PostgreSQL uses `pg` with the framework's existing ADR-0007 rules (`pgDatabase`: transaction-local tenant, broken connections destroyed).

### 5.3 Safety by construction

- **SQL text only ever comes from the compiler or the `sql` template tag.** Fragments are lists of `text | value | identifier` parts. Values become placeholders, and identifiers are validated, then quoted per dialect. The tag refuses anything that isn't a real template object, and there is no `sql.raw(string)`.
- **Identifiers from requests** (`sort`, `filter`, `search`) are checked against the schema snapshot, so they are never just pattern-checked. Directions and operators come from closed lists.
- **Typed binds (F-08).** Values are checked against the column kind before SQL. On MySQL, `'1abc' = 1` is true on the server (checked). Objects and arrays never reach a driver.

## 6. Relations, scopes, lifecycle

### 6.1 Relations as methods

```ts
author() { return this.belongsTo(User, 'author_id') }
```

- Calling `post.author()` returns a query (`await post.author().first()`, `user.posts().where(...).get()`, `user.posts().create({...})` sets the foreign key).
- `with('author')` turns the property into data (`post.author: User | null`, `user.posts: Post[]`), the same as `$post->author`, and typed.

### 6.2 Eager loading without N+1

- **One query per relation level**, with `WHERE fk IN (…)` chunked at 1,000 keys (PostgreSQL allows 65,535 parameters, SQLite 32,766).
- **Proved by counting queries:**
  - 6 posts with authors take 2 queries (7 the naive way);
  - users → posts → tags take 3.
- **Constrained loads** run the callback on the related builder.
- **`withCount`** is a correlated `(SELECT COUNT(*) …)` in the same query.
- **`whereHas`** is `EXISTS (…)`.
- All of them apply the related model's global scopes: tenant, soft deletes, its own.

### 6.3 Lazy-loading policy

- There is no implicit lazy loading (it is impossible in JavaScript).
- `model.load(...)` on a model that came from a multi-row result throws `LazyLoadingError` while `preventLazyLoading` is on (default: everywhere except production).
- `loadMany(list, ...)` is the bulk form.
- **Designed:** a dev-mode detector for the "same query shape more than 5 times per request" pattern (Beyond-Laravel request).

### 6.4 Remaining relation types (designed on the same contract)

Every relation implements `eagerLoad(parents, name, constrain)` and `subquery(parentAlias, alias, constrain, 'count' | 'exists')`.

- **hasOne:** hasMany with `LIMIT`-free matching that takes the first per parent. `ofMany('created_at', 'max')` becomes a correlated subquery on the key.
- **hasManyThrough:** one join through the intermediate table. **Both** tables are tenant-checked by the SQL-tree check.
- **Polymorphic** (`morphTo`, `morphMany`, `morphToMany`):
  - a **mandatory morph map** (`morphMap({ post: Post, video: Video })`), since a class name must never be stored;
  - `morphTo` eager loading groups by type and runs one query per type.
- **Pivot extras:** `withPivot(...)`, pivot timestamps and pivot models.
  - Pivots between tenant tables carry the tenant column, which the ORM scopes and stamps (built).
  - `attach`/`sync` verify ids with a scoped query in the same transaction (built, F-05).
- **Relation resolution safety:**
  - names resolve only to plain synchronous methods defined on the app's own class, run on a blank instance, whose result must be a relation;
  - `include=` from requests must be validated against `resources.json` (which spike 10 builds statically) **before** `with()`;
  - an optional `static relations = { … }` map (Objection-style) remains the fallback if method calls ever prove too risky.

### 6.5 Scopes

- Local scopes are `static scopes = {...} satisfies Scopes<'posts'>` and become typed builder methods (`published()`, `ofStatus('draft')`). Their names can't shadow builder methods (checked at boot).
- Global scopes are `static globalScopes`. They are applied at execution, after the developer's conditions are **wrapped in parentheses**, and removed with `withoutGlobalScope('name')`.
- **Policy row filters (ADR-0008/0017) are scopes too.**
  - `Post.query().authorizedFor(actor, 'view')` appends the auth compiler's bound, NULL-safe fragment as a group node.
  - The auth compiler gains a MySQL renderer: `<=>`, `COALESCE(…, FALSE)`, and `COLLATE utf8mb4_bin` for text, so SQL and in-memory evaluation stay equivalent.
  - The ADR-0008 property suite must run on MySQL (F-08).

### 6.6 Tenancy (F-04, F-05; ADR-0007)

| Layer | MySQL / SQLite | PostgreSQL |
|---|---|---|
| global tenant scope (ORM) | **the guarantee** | first layer |
| SQL-tree check before rendering | the guarantee | first layer |
| composite `(tenant, x)` FKs, tenant-prefixed uniques (recorder) | DB-enforced | DB-enforced |
| RLS (`set_config('app.tenant_id', …, true)` per transaction, RESTRICTIVE policy) | not available | second layer (built: every tenant statement runs in a tenant transaction) |

- **One canonical tenant column**, from `configureOrm({ tenancy: { column: 'tenant_id' } })` (`team_id` for teams) or `false` for single-tenant apps. It is shared with auth, the RLS migrations and spike 10's `t.tenant()`, and recorded in an ADR.
- **Every table is classified:**
  - `scoped` has the column;
  - `global` has `schema.create(name, fn, { global: true })`;
  - `unscopable` has neither, and is **refused** at query time (fail closed).
  - Spike 10 should also refuse to *create* such a table while tenancy is on.
- **The active tenant** comes from AsyncLocalStorage (`runWithTenant(uuid, fn)`, which the HTTP layer wraps around every request). There is no tenant id in app code.
- **The SQL-tree check** walks FROM, JOINs, subqueries in SELECT, and EXISTS (also inside groups), for SELECT, UPDATE, DELETE and INSERT.
  - Each tenant reference needs `<alias>.<col> = <active tenant>` among the **top-level AND conjuncts**. Anything inside an OR doesn't count.
  - A failure is `TenantScopeMissingError`.
  - A planted unscoped join is caught by a test.
- **Writes:**
  - the tenant column is stamped from the context, never fillable, and can't change;
  - updates and deletes are `WHERE id = ? AND tenant = ?`;
  - a model loaded as A and saved as B is "not found".
- **Raw SQL:**
  - in a tenant context, any statement that didn't come out of the check and names a tenant table is refused;
  - `unsafeRaw(reason, sql…)` and `unsafeWithoutTenancy(reason)` are the audited escape hatches (`onUnsafeTenancy`), and a lint rule flags them in request code;
  - on PostgreSQL, RLS still limits a request connection.
- **Designed, not built:**
  - jobs and events capture the tenant at dispatch;
  - caches are keyed by tenant;
  - upsert only with a conflict target that includes the tenant column;
  - bulk update/delete go through the same check;
  - the full isolation suite runs for every generated endpoint on all three engines (F-04 test plan).

### 6.7 Events and observers (designed)

```ts
static events = { creating: (post) => { post.slug ??= … }, deleted: (post) => audit(post) } satisfies ModelEvents<Post>
observe(Post, { created: async (post) => mail(...), updated: … })
```

- Events are dispatched by `save`, `delete` and `restore` with the same names as Laravel, through core's event bus.
- `saveQuietly()` and `withoutEvents(fn)` skip them.
- `after*` events inside a transaction are delivered **after commit** (Laravel's `afterCommit` as the default), so a rolled-back write never sends mail.

### 6.8 API resources (designed)

```ts
export const PostResource = defineResource(Post, (post, { whenLoaded, whenCounted }) => ({
  id: post.id, title: post.title, author: whenLoaded(post, 'author', UserResource), tags: whenCounted(post, 'tags'),
}))
return PostResource.page(await Post.query().with('author').paginate(25)) // { data, meta: { total, … }, links }
```

### 6.9 Transactions, locking, streaming

- **Built:**
  - `transaction(fn)` commits or rolls back, and nested calls are savepoints;
  - concurrent callers are isolated by AsyncLocalStorage;
  - parallel savepoints are refused;
  - **a statement after the transaction ended is refused.** The spike found that, without this, a sibling's late INSERT ran in autocommit after the ROLLBACK.
- **Designed:**
  - `transaction(fn, { attempts: 3 })` retries on deadlock (MySQL 1213, PostgreSQL 40P01 and 40001);
  - optimistic locking via a `lock_version` column (`UPDATE … WHERE id = ? AND lock_version = ?`, zero rows → `StaleModelError` 409);
  - `lockForUpdate()`;
  - `cursor()`/`chunkById()` as async iterators over keyset pages (constant memory, safe with concurrent updates).

## 7. Migrations, factories, seeders

- **Migrations stay spike 10's** (Laravel Schema builder, replayed offline).
  - `node strut migrate` applies them, regenerates types and `schema.json`, and the ORM picks them up at boot.
  - On MySQL, DDL is not transactional, so the migrator must report per operation (Beyond-Laravel request).
  - Migrations run as the owner role; the app uses the runtime role (ADR-0007 rule 4).
- **Factories:**

```ts
// database/factories/post-factory.ts
export default defineFactory(Post, ({ faker, sequence }) => ({
  title: faker.lorem.sentence(), status: 'draft', author_id: () => User.factory(),
}))
await Post.factory().count(10).for(user, 'author').state({ status: 'published' }).create()
await Post.factory().has(Tag.factory().count(2), 'tags').make()   // unsaved
```

  - Keys are typed by `ForceCreateInput`.
  - Writes go through `forceCreate` (trusted code), inside `runWithTenant` for scoped models (`.forTenant(id)`).
  - Defaults are derived from column kinds with a deterministic seed (Beyond-Laravel request).
- **Seeders:** `defineSeeder({ after: ['users'], run })`, tracked once each in a `seeders` table (blueprint §2).

## 8. What to keep from the existing framework data layer

Read 2026-11-14 in `packages/framework/src` and `packages/auth/src/sql`.

| Existing code | Keep? | Where it goes |
|---|---|---|
| `database/types.ts` (`Database` contract), `drivers.ts` (PGlite, libSQL, `pg` with transaction-local tenant and broken-connection destruction), `connect.ts` (config → driver, SSL, statement timeout) | **keep the ideas, merge into the ORM's driver contract.** `pgDatabase`'s ADR-0007 handling is the production PostgreSQL driver; add mysql2 and node:sqlite | `framework/src/database/` |
| `database/sql.ts` (`?` fragments) | replace with the spike's symbolic fragments: no placeholder counting, and literal `?` operators are safe | `framework/src/database/sql/` |
| `query/compile.ts`, `bind.ts`, `evaluate.ts` (ADR-0008 filters, two-valued, ASCII folding) | **keep**, and add a MySQL renderer. They become the policy/filter scope inside the builder | `framework/src/orm/filters/` |
| `query/sort.ts` (keyset cursors with a sort fingerprint, NULLS LAST) | **keep the cursor format** (the spike re-implemented a simpler one); add a MAC on cursors (F-13) | `orm/pagination.ts` |
| `data/values.ts` (canonical decimals, dates, bigint) | **keep**; it becomes the built-in casts | `orm/casts.ts` |
| `data/repository.ts` (tenant scope, in-scope reference checks, post-write policy check, soft deletes) | **keep the security behaviours as ORM features**: reference checks become a `belongsTo` validation step; the post-write `check` becomes a policy scope re-check in the same transaction; the repository API itself retires | `orm/`, `http/resource-controller` |
| `migrations/rls.ts` (RESTRICTIVE policy, `tenancyAudit`) | **keep** for PostgreSQL migrations and `doctor` | spike 10's recorder / `doctor` |
| `migrations/planner.ts` (drizzle-kit) and `schema/compile.ts` (Drizzle tables) | **retire** (spike 10 replaces them) | n/a |
| `model/define-model.ts`, `field.ts` | **retire** (models now come from migrations) | n/a |
| auth `sql/compile.ts` (PostgreSQL policy compiler) | **keep**; add MySQL (`<=>`, `COLLATE utf8mb4_bin`) and SQLite renderers; expose the output as a builder node, not a string | `auth` → `PolicyScope` contract |

## 9. Public surface (what other parts depend on)

Recorded in `spikes/SHARED-DESIGN.md` § Spike 11:

- the model statics and instance API;
- the builder signatures, including `search`/`filter`/`sort` for the ResourceController;
- the error codes → HTTP mapping: `MODEL_NOT_FOUND` 404, `MASS_ASSIGNMENT`/`INVALID_VALUE` 422, `UNKNOWN_COLUMN`/`INVALID_FILTER`/`INVALID_CURSOR`/`INVALID_PAGE_SIZE` 400, `TENANT_REQUIRED` 403, `TENANT_SCOPE_MISSING` 500 (logged as a bug);
- the generated inputs (`TableRegistry`, `schema.json`) and the tenant hook (`runWithTenant`, `configureOrm({ tenancy, onUnsafeTenancy })`).

## 10. Open risks and next steps

1. **Type-check cost with ~200 models** is not yet measured. Add a compile-time budget test (generate 200 tables plus relations, keep `tsc` under a few seconds).
2. **The built-in method list (`ModelMethodName`) must stay in sync** with `ModelBase`, or relation types turn circular. A type test guards it.
3. **The raw-SQL guard is name-based.** Views and functions over tenant tables must be declared as tenant objects. Dynamic table names are impossible through the `sql` tag, but driver-level access (`connection.driver`) must stay internal.
4. **MySQL isolation depends on DDL rules from spike 10:** composite FKs, tenant-prefixed uniques and binary collations. Until the recorder emits them, MySQL tenancy is weaker than the spike's fixture.
5. **AsyncLocalStorage capture** by memoised promises is an app-level hazard. Document it and test it in the testing kit.
6. **Performance:** +25–50 µs/op unoptimised. Cache compiled SQL per query shape, precompute per-model cast plans, and avoid repeated snapshot lookups. Measure on MySQL over TCP.
7. **ADR needed:** "Strutvane owns its ORM (supersedes ADR-0004)", plus the canonical tenant column, plus the MySQL session and collation rules.
