# Auto admin UI and high-level API: research and design proposal (2026-11-14)

**What this is:** a dated research snapshot plus a design proposal for "run `migrate`, get a CRUD screen and a sidebar entry for every table" and for a "high-level API" next to the five REST actions. It is input for an RFC, not a decision. Nothing here changes D1-D24 or an accepted ADR until an RFC/ADR says so.

**Brief (from the owner, relayed 2026-11-14):** Strutvane is being reshaped to follow Laravel's flow closely (npm only, MVC). After `sv migrate`, if the project has a UI, every table gets list/create/edit/detail screens and a sidebar entry automatically, with search on every field, pagination, sorting, filters, relations and slugs; plus a high-level API beyond plain CRUD.

**Legend** (same as `stack-snapshot-2026-11.md`):

- **[src]**: read from the official docs or source on 2026-11-14 (URL given).
- **[code]**: read from the project's source code on GitHub (`gh api`) on 2026-11-14.
- **[UNVERIFIED]**: prior knowledge or a single secondary source. Re-check before relying on it.

---

## 0. Summary of the proposal

1. **One UI package, three layers.** Keep `@strutvane/ui` (framework-free `core`, React renderer) and add an `installer` subpath that owns `ui:sync`, scaffolds and eject templates. Visual components come from a shadcn-style registry copied into `web/components/ui` (D14). No new npm package.
2. **Generation on `migrate` is "runtime-rendered, config-owned".** Screens are rendered at runtime from the manifest (as today). `sv migrate` triggers `ui:sync`, which (a) regenerates a machine-owned, typed registry (`.strutvane/ui.gen.ts`), and (b) scaffolds **once** a small, developer-owned config file per new table (`web/resources/<resource>.ui.ts`) whose defaults are `auto()`. New columns keep appearing automatically until the developer replaces `auto()` with an explicit list; from then on `ui:sync` reports, never rewrites. Ejected pages (L3) upgrade by ADR-0012 three-way merge.
3. **Default API surface:** the five REST actions + restore + `POST /query` (all exist), plus `GET /:res/options`, `GET /:res/count`, `GET /:res/aggregate`, `GET /:res/export`, `POST /:res/bulk`, nested `GET /:parent/:id/:relation`, global `GET /search`. All permission-gated, policy-scoped, cost-bounded.
4. **Query-parameter standard:** keep ADR-0011 (JSON:API family names): `filter[field][op]=v`, `sort=-a,b`, `page[size]`, `page[number]` or `page[cursor]`, `include=a,b.c`, `fields[type]=a,b`, `search=`. Add the shorthand `filter[field]=v` (= `eq`), `filter[trashed]=with|only`, `page[total]=true`.
5. **Slug standard:** opt-in by column (`slug` column or `field.slug()`), generated from the title field on create, unique per tenant (soft-deleted rows included), `-2`/`-3` suffixes, **stable on update**, editable in the form, route binding by `routeKey: 'slug'` (the Laravel `{post:slug}` / `#[RouteKey('slug')]` idea), ids stay canonical in the API.

The rest of the document is the evidence and the per-topic standards behind these five points.

---

## 1. Prior art (studied 2026-11-14)

### 1.1 Filament (Laravel)

**Version and status.** Filament v5 was released in January 2026; its only change over v4 is Livewire 4 support, and features ship to both v4 and v5 [src: https://laravel-news.com/filament-5, https://filamentphp.com/docs/5.x/upgrade-guide.md]. Docs read: `filamentphp.com/docs/5.x`.

**Resources and generation** [src: https://filamentphp.com/docs/5.x/resources/overview]

- `php artisan make:filament-resource Customer` scaffolds `app/Filament/Resources/Customers/` with `CustomerResource.php`, `Pages/{List,Create,Edit}Customer(s).php`, `Schemas/CustomerForm.php` and `Tables/CustomersTable.php`.
- `--generate` **reads the model's database columns** and writes the form and table from them. `--soft-deletes` adds restore/force-delete/trashed filter; `--view` adds a View page; `--simple` makes one "Manage" page with modals; `--model --migration --factory` scaffold those too.
- The generated files are **ordinary, owned PHP**. There is no regeneration: once generated, new columns must be added by hand. This is the main thing Strutvane should improve on.
- `$recordTitleAttribute` names the record title and enables global search.

**How `--generate` maps columns** [code: `packages/forms/src/Commands/FileGenerators/Concerns/CanGenerateModelForms.php`, `packages/tables/src/Commands/FileGenerators/Concerns/CanGenerateModelTables.php`, `packages/support/src/Commands/Concerns/CanReadModelSchemas.php`, branch `5.x`]

| Column | Form component | Table column |
|---|---|---|
| auto-increment, primary key, `created_at`, `updated_at`, `deleted_at` | skipped | PK skipped; timestamps shown but **toggleable, hidden by default** |
| `boolean` | `Toggle` | `IconColumn->boolean()` |
| `date` / `time` / `datetime`, `timestamp` | `DatePicker` / `TimePicker` / `DateTimePicker` | `TextColumn->date()/time()/dateTime()`, **sortable** |
| `text` | `Textarea` (full width) | **skipped** (as is `json`) |
| name `image`, `image_*`, `*_image*` | `FileUpload->image()` | `ImageColumn` |
| `*_id` with a guessable `belongsTo` relation | `Select->relationship(rel, titleColumn)` | `TextColumn('rel.title')`, **searchable** |
| enum type or enum cast | `Select` with enum options | `TextColumn->badge()` |
| integer/decimal/float/money | `TextInput->numeric()`, default from DB default | `->numeric()` or `->money()` when named `cost`, `price`, `*_cost`, `*_price`; **sortable** |
| string/char | `TextInput`; `->email()` if name contains `email`, `->password()` for `password`, `->tel()` for `phone`/`tel`, `->url()` for `url`, `website`, `*_url` | `TextColumn`, **searchable** (not sortable) |
| columns ending `_token`, containing `password` | (form keeps password) | skipped |
| not nullable | `->required()` | |
| names `id`, `sku`, `uuid` | label upper-cased | label upper-cased; `email` → "Email address" |

- **Relation title guess:** `name`, else `title`, else the primary key.
- Take-aways: Filament's defaults are **"strings searchable, numbers and dates sortable, long text hidden from tables, timestamps hidden but toggleable, FKs become searchable selects"**. Names drive widget choice where the DB type is too coarse.

**Tables** [src: https://filamentphp.com/docs/5.x/tables/columns/overview, https://filamentphp.com/docs/5.x/tables/overview]

- `searchable()` is per column and off by default (the generator turns it on); `searchable(isIndividual: true)` adds a per-column search box. Search terms are **split into words** by default (`splitSearchTerms(false)` to turn off) and treated as **literal text** (`%`, `_` are not wildcards). Debounce 500 ms.
- `sortable()` per column; `defaultSort()`; the primary key is appended as a tiebreaker by default (`defaultKeySort`).
- `toggleable(isToggledHiddenByDefault: true)`: user column manager, persisted in session.
- Pagination: on by default; page-size options 5/10/25/50; `paginated([...,'all'])`; `paginationMode(Simple|Cursor)`; `extremePaginationLinks()`. Per-page choice persisted in session.
- Bulk actions: any bulk action adds row checkboxes; `DeleteBulkAction` built in.

**Filters** [src: https://filamentphp.com/docs/5.x/tables/filters/overview]

- `Filter` (checkbox/toggle), `SelectFilter`, `TernaryFilter` (true/false/blank, for booleans), `TrashedFilter`, plus a query-builder filter with typed constraints, and custom form-based filters.
- Filters are **deferred by default** (an Apply button); active filters show as indicators.
- The docs warn that client-controlled filters must never be the tenant/ownership restriction. Strutvane already enforces this server-side.

**Relations** [src: https://filamentphp.com/docs/5.x/resources/managing-relationships]

- `BelongsTo` → select; `HasMany`, `BelongsToMany`, `MorphMany` → **relation managers**: tables shown as **tabs** next to the edit/view form, lazy-loaded, read-only on View pages by default; `?relation=posts` in the URL.
- `make:filament-relation-manager CategoryResource posts title` with `--attach` (many-to-many), `--associate` (has-many), `--soft-deletes`, `--view`.

**Navigation** [src: https://filamentphp.com/docs/5.x/navigation/overview]

- Items sorted **alphabetically** by default; `$navigationSort` (int, ascending) overrides; `$navigationGroup`; ungrouped items first; groups collapsible; `$navigationIcon` (Heroicons); `getNavigationBadge()` with colour and tooltip; sidebar collapsible to icons; optional top navigation.

**Global search** [src: https://filamentphp.com/docs/5.x/resources/global-search]

- Enabled when a resource has a title attribute; `getGloballySearchableAttributes()` with `relation.column`; 50 results per resource by default; terms split by word; debounce 500 ms; key bindings configurable (e.g. `cmd+k`).

**Soft deletes** [src: https://filamentphp.com/docs/5.x/resources/deleting-records] `TrashedFilter`, `RestoreAction`, `ForceDeleteAction`, bulk variants; policies `restore`/`forceDelete` (+`Any`); route binding must drop the soft-delete scope to open trashed records.

**Multi-tenancy** [src: https://filamentphp.com/docs/5.x/users/tenancy] `->tenant(Team::class, slugAttribute: 'slug')`, tenant in the URL, tenant switcher, automatic global scope on resource queries, with explicit caveats: "tenant scoping is not record authorization", and scoping does not cover other queries. Strutvane's RLS + repository scope (ADR-0007) is stronger.

**Export** [src: https://filamentphp.com/docs/5.x/actions/export] `ExportAction`/`ExportBulkAction` with an exporter class (`make:filament-exporter --generate`), CSV and XLSX, queued in chunks of 100, user picks columns, download via notification. **Exports do not check policies, and formula-injection protection is off by default.** Strutvane should default the other way.

**Theming** [src: https://filamentphp.com/docs/5.x/styling/overview] `->colors(['primary' => Color::Amber])` (OKLCH palettes generated from one colour), dark mode on by default following the OS with a switcher, `make:filament-theme` (Tailwind 4), `fi-*` CSS hook classes, Inter font.

### 1.2 Laravel Nova

Docs read: `nova.laravel.com/docs/v5`. Nova 5 adds tab panels, searchable select filters and Inertia 2 support [src: https://laravel.com/blog/laravel-nova-5-now-available]; release date not confirmed here.

- **Resources** [src: https://nova.laravel.com/docs/v5/resources/the-basics]: `nova:resource Post` writes `app/Nova/Post.php`; resources in `app/Nova` are **auto-registered**; a new resource contains only an ID field (Nova does **not** infer fields). `$group` for the sidebar, `$displayInNavigation`, `$clickAction` (detail by default), `$with` eager loads, polling, `ExportAsCsv` action, pagination style `simple` (default), `load-more` or `links`, **Traffic Cop: 409 when the record changed since it was loaded**.
- **Search** [src: https://nova.laravel.com/docs/v5/search/the-basics]: `$search` columns, **`id` included by default**; plain `LIKE` by default; `SearchableText` uses full-text indexes (MySQL, Postgres); `SearchableRelation('author','name')` or `'author.name'`; `SearchableJson('meta->address->postcode')`; Scout replaces it all.
- **Global search** [src: https://nova.laravel.com/docs/v5/search/global-search]: all resources globally searchable by default; `$title`, `subtitle()`; `/` focuses the search box.
- **Lenses** [src: https://nova.laravel.com/docs/v5/lenses/defining-lenses]: a named, custom-query view of a resource with its own fields, filters, actions. Equivalent for Strutvane: a saved list view or a custom list page (L2).

### 1.3 Backpack for Laravel

[src: https://backpackforlaravel.com/docs/7.x/crud-tutorial] `backpack:crud tag` writes a `TagCrudController` (`setupListOperation`, `setupCreateOperation`, `CRUD::column()`, `CRUD::field()`), a `TagRequest` for validation, a `Route::crud(...)` line and **a sidebar menu item in `menu_items.blade.php`, added automatically**. The generated controller lists columns explicitly. Backpack also has `CRUD::setFromDb()` to infer columns/fields from the table at runtime [UNVERIFIED: not on the page read]. Take-away: the "sidebar entry appears by itself" behaviour the owner wants is exactly what Backpack does, but by **editing an owned file**, which is fragile.

### 1.4 Laravel's own starter kits

[src: https://laravel.com/docs/12.x/starter-kits; Laravel 13 shipped in March 2026: https://laravel.com/docs/13.x/releases.md]

- React (Inertia 2, React 19, TypeScript, Tailwind 4, shadcn/ui), Vue (shadcn-vue), Svelte (Svelte 5, shadcn-svelte), Livewire (Livewire 4, Flux UI). Auth through Fortify; a WorkOS AuthKit variant.
- **All code lives in the app** (`resources/js/{components,hooks,layouts,lib,pages,types}`); "there is no need to update the starter kit itself". shadcn components are added with `npx shadcn@latest add switch` into `components/ui`.
- Layouts: sidebar (default) or header; sidebar variants `sidebar`, `inset`, `floating`, `collapsible="icon"`; auth layouts `simple`, `card`, `split`. Wayfinder generates typed routes at build time.
- Take-away: Laravel's own UI is **owned, copied code with no CRUD generation**. The CRUD/admin layer comes from Filament/Nova/Backpack. Strutvane can offer both in one flow.

### 1.5 JavaScript equivalents

| Tool | How fields and labels are inferred | Notes |
|---|---|---|
| **Refine Inferencer** [src: https://refine.dev/docs/packages/inferencer/] | From **API response data**: relation when the key ends in `id`/`ids` or holds `{id}` objects, confirmed with data-provider calls; nested object title from a key list including `name`, `label`, `title`, `username`, `url`; also detects image, url, email, date, boolean, richtext, number. | Generates code you copy. **"Development only"**, experimental. Filter operators: `eq ne lt gt lte gte in nin contains ncontains startswith endswith between nbetween null nnull` (+ case-sensitive variants) [src: https://refine.dev/docs/core/interface-references/]. |
| **React-Admin guessers** [src: https://marmelab.com/react-admin/ListGuesser.html, https://marmelab.com/react-admin/List.html] | `ListGuesser`/`EditGuesser`/`ShowGuesser` guess from fetched records and log the code to copy. | Not for production. `<List>` default `perPage` is **10**; list params sync to the URL and to localStorage (`storeKey`). |
| **AdminJS** [src: https://docs.adminjs.co/basics/resource] | From the **ORM adapter's metadata** (`BaseProperty`). `listProperties`/`editProperties`/`filterProperties`/`showProperties`, `navigation: { name, icon }`. | Without `sort`, list order is not guaranteed. Runtime engine, little code ownership. |
| **Payload** [src: https://payloadcms.com/docs/configuration/collections] | Config-first (fields declared in code). Labels **derived from the slug**; `useAsTitle` (default: the ID); `defaultColumns`; `group`; `listSearchableFields` (default: ID or `useAsTitle`); `pagination.defaultLimit` **10**; `trash: true` enables soft delete. | Closest to Strutvane's model-first idea, but runtime-rendered and not ejectable. |
| **Strapi 5 Content Manager** [src: https://docs.strapi.io/cms/features/content-manager] | Content types defined in the admin; per-type list settings: enable search/filters/bulk actions, entries per page, default sort (**relations cannot be the default sort**), displayed fields; edit view "entry title" for relations. | Settings stored in the DB, not in code. |
| **Directus** [src: https://directus.com/docs/guides/data-model/fields] | **Introspects an existing database**: supported column types become fields automatically; each field = column + metadata (interface, display). Alias fields for relations without a column. | Proves that DB introspection alone is enough for a usable default UI. |

**Pattern across all of them:** inference (from DB, ORM or data) is used for the *first* draft; the quality of the defaults decides whether people keep them. Tools that generate copy-paste code (Filament, Refine, React-Admin) lose the "new column appears automatically" property; tools that render at runtime (Payload, Directus, AdminJS, Strapi) keep it but lose code ownership. Strutvane's D6/L0-L3 model is the way to get both, which is the core of the proposal in §6.

### 1.6 API conventions

- **JSON:API 1.1** [src: https://jsonapi.org/format/]: `sort=a,-b` (unsupported → 400), `include=a.b` (unsupported → 400), `fields[TYPE]=a,b`; `page[...]` and `filter[...]` **families are reserved but strategy-agnostic**. Implementation-specific parameter names must contain a character outside `a-z` (so a strictly compliant API would spell `search` as `filter[search]` or `searchTerm`). Bulk writes live in the Atomic Operations extension.
- **spatie/laravel-query-builder** [src: https://spatie.be/docs/laravel-query-builder/v6/features/filtering, https://spatie.be/docs/laravel-query-builder/v7/introduction] (v7 is current): `filter[name]=john` (partial `LIKE` by default; `exact`, `beginsWithStrict`, `endsWithStrict`, `operator` incl. `DYNAMIC` like `>3000`, `scope`, `trashed` = `with|only`, `belongsTo`, `callback`), comma = OR; `sort=-name`; `include=posts` (+`postsCount`, `postsExists`); `fields[users]=id,name`; **everything must be allow-listed** (`allowedFilters`, `allowedSorts`, `allowedIncludes`, `allowedFields`); disallowed parameters throw `InvalidFilterQuery`.
- **Laravel pagination** [src: https://laravel.com/docs/13.x/pagination]: `paginate` (offset + total count), `simplePaginate` (no count), `cursorPaginate` (keyset; needs a unique ordering, no page numbers, no NULLs in order columns). JSON shape: `total, per_page, current_page, last_page, from, to, *_page_url, data`. The model's default page size is 15 [UNVERIFIED: `Model::$perPage`].
- **Laravel route model binding** [src: https://laravel.com/docs/13.x/routing]: implicit binding by id; `{post:slug}` for another key; **`#[RouteKey('slug')]` attribute** on the model (Laravel 13) makes it the default; nested `{user}/posts/{post:slug}` is **scoped to the parent automatically**; soft-deleted models excluded unless `->withTrashed()`; missing → 404 (custom with `->missing()`).
- **Laravel Scout database engine** [src: https://laravel.com/docs/13.x/scout]: MySQL/Postgres; `LIKE` on every searchable attribute by default, `#[SearchUsingPrefix]` (`term%`), `#[SearchUsingFullText]` (full-text index); Postgres `tsvector` via `$table->searchable(['title' => 'A', 'body' => 'D'])` (generated column + GIN index, weights A-D); pgvector semantic/hybrid search.
- **spatie/laravel-sluggable** [src: https://github.com/spatie/laravel-sluggable]: `#[Sluggable(from: 'title', to: 'slug')]`; generated on create and update by default; collisions get `-1`, `-2`...; scoped uniqueness and skip rules through `getSlugOptions()`; **self-healing URLs** (`hello-world-5`, stale slug → 308 redirect).

### 1.7 Database search facts

- **Postgres `pg_trgm`** [src: https://www.postgresql.org/docs/current/pgtrgm.html, PG 18.7]: GIN/GiST trigram indexes accelerate `LIKE`, `ILIKE`, `~`, `~*` (and `=`, less efficiently than B-tree). A pattern with no extractable trigram (in practice fewer than 3 characters) degenerates to a full index scan. The extension is **trusted**: any role with `CREATE` on the database can install it. Expression indexes work when the query uses the same expression.
- **Postgres full text**: `tsvector` generated column + GIN (what Scout's `searchable()` does). Word-based, stemming per language config; not substring search.
- **SQLite FTS5 trigram tokenizer** [src: https://www.sqlite.org/fts5.html]: substring matching; `LIKE`/`GLOB` on the FTS table use the index **unless the `LIKE` has an `ESCAPE` clause**; under 3 characters matches nothing in full-text queries; external-content tables need triggers to stay in sync. Available since SQLite 3.34.0 [UNVERIFIED]. On a plain table, `LIKE '%x%'` is always a full scan.
- **MySQL 8.4** [src: https://dev.mysql.com/doc/refman/8.4/en/fulltext-search-ngram.html]: InnoDB `FULLTEXT` (word-based) and the `ngram` parser (default token size 2) for CJK. A leading-wildcard `LIKE` cannot use a B-tree index [UNVERIFIED: general behaviour, not on this page]. MySQL is not implemented in Strutvane yet.

---

## 2. What Strutvane has today (read-only review, 2026-11-14)

Sources: `packages/ui/README.md`, `packages/ui/CLAUDE.md`, `packages/ui/src/**`, `packages/framework/README.md`, `packages/framework/CLAUDE.md`, `packages/contracts/src/{manifest,list-query,query-filter,field-type}.ts`, ADR-0003/0011/0012/0014.

### 2.1 Already in place (and better than most prior art)

- **Manifest** at `/.well-known/strutvane.json`, **filtered per actor**: resource `name`, `path`, `label`, `pluralLabel`, `titleField`, fields (`type`, `label`, `required`, `nullable`, `unique`, `readOnly`, `writeOnce`, `filterOperators`, `sortable`, `searchable`, `enumValues`, `relation`, `widget`, JSON `schema`), `capabilities` (list/view/create/update/delete/restore/export), `softDeletes`, `tenantScoped`, `ui.{icon, group, listColumns}`. This is the Directus/Payload metadata idea, served over HTTP so the UI never imports the framework.
- **List protocol** (ADR-0011): `filter[f][op]=`, `sort=-a`, `page[size]`, `page[cursor]` or offset, `search=`, `include=`, `POST /:res/query` for nested `and/or/not`. Strict allow-lists, 422 listing every problem. Limits: page size ≤ 100, offset depth ≤ 10 000, totals only with `allowTotal`, ≤ 10 includes, 5 s Postgres statement timeout.
- **Security** that Filament leaves to the developer: deny-by-default, RLS + repository tenant scope, 404 for invisible rows, post-write policy checks, in-scope reference checks for `belongsTo`, field-level filter rules, hidden fields never exposed.
- **UI renderer**: `StrutvaneApp` (sign-in, tenant switcher, permission-aware menu grouped by `ui.group`, list/new/detail/edit routes), `ResourceList` (server-side sort/filter/search, URL deep links, virtualization, capability-gated actions, idempotent delete), `ResourceForm` (typed widgets, client validation from the manifest, 422 issue routing, idempotency keys, sends only changed fields), `ResourceDetail` (related lists for `hasMany`), `FilterBar`, `FieldShell` (a11y wired once), widget/cell registries (`Resource.field` → named widget → type → default), message catalogs (RFC-0003), axe tests.

### 2.2 Gaps against the brief

| Gap | Where | Effect |
|---|---|---|
| UI pagination is **cursor-only, Previous/Next** | `core/list-state.ts`, `ResourceList.tsx` | No page numbers, no "page 3 of 12", no total. Admin users expect these (Filament, Laravel `paginate`). |
| Search compiles to **`strpos`/`instr` with `translate()`/`lower()` folding** | `framework/src/query/compile.ts` | Literal and deterministic (good), but **no index can serve it**: every search is a full scan. |
| Nothing is searchable/sortable/filterable unless declared | model DSL | The brief wants search on every field by default. |
| No `slug` behaviour (the `slug` type exists only as a name in `FieldTypeName`) | contracts, framework | No generation, uniqueness, or route binding by slug. |
| No bulk, export, count, aggregate, options, global search endpoints | framework README "What's deferred" | No bulk actions, CSV export, dashboard numbers, cheap relation pickers. |
| `include` exists; sparse fieldsets, relation paths in filters are rejected | framework | Fine for v1; relation search needs a narrower feature (§4.6). |
| Sidebar: groups only; no sort, badge, per-resource hide, icons not rendered | `StrutvaneApp.tsx` `Nav` | Ordering is manifest order. |
| No trashed filter, force delete, row selection, column toggles | `ResourceList.tsx` | Soft deletes are API-only in practice. |
| Hand-written router and injected CSS (`router.tsx`, `app-styles.ts`) | `src/react` | D14 says TanStack Router + Tailwind 4 + shadcn registry. |
| No generation step at all: the UI is 100% runtime | | Nothing for the developer to own or edit (beyond overrides in `web/app.tsx`), and no typed names for overrides. |

---

## 3. Inputs: where the metadata comes from after `migrate`

The brief says "copy Laravel's flow" and "after `migrate` ... for each **table**". Two flows must work, because D4/D5 (model-first, auto-diffed) are still the accepted decisions while the Laravel-style flow (write a migration, then a thin model) is being considered:

1. **Model-first (current D4/D5):** models declare fields; `sv migrate` diffs them into SQL. Metadata is rich (email vs string, enum values, `searchable()`, relations).
2. **Migration-first (Laravel style):** `sv make:model Invoice -m`, edit the migration, `sv migrate`. The database is the truth; the model may be thin.

**Proposal:** the UI generator reads one normalised **schema snapshot** produced after every successful migrate: tables, columns, SQL types, nullability, defaults, primary keys, foreign keys, unique indexes, CHECK-based enums. The model definition (when present) is layered on top and always wins. This is what Filament (`Schema::getColumns`) and Directus do, and it keeps the UI correct in both flows. The framework already writes `database/migrations/snapshot.json` for model-first; migration-first needs an introspection step (`db:pull`, already listed in `09-cli-reference`).

**Which tables get screens by default:**

- **Yes:** every application table that has (or gets) a model and an API resource.
- **No:** framework/system tables (`strutvane_migrations`, locks), package tables (auth identity, sessions, logs; those packages ship their own screens through installer `enhances`), **pure pivot tables** (exactly two FKs plus optional timestamps → shown as a many-to-many on both sides, not as a screen), tables marked `ui: false`, and tables of models marked `hidden`.
- **Tables without a model** (migration-first): `ui:sync` scaffolds a thin model file (owned, written once, `defineModel.fromTable('invoices')`-style) and says so. Scaffolding API surface automatically is safe only because the API is deny-by-default: a new resource is invisible to everyone until a permission grants it (super-admins with `*` see it at once, which is exactly the "appears in the sidebar" behaviour).

---

## 4. Default standards (with reasons)

### 4.1 Column type → form widget, table cell, filter

Rules apply in order: explicit model option > name heuristics > SQL/field type. Name heuristics follow Filament's proven list (§1.1) because developers already expect them.

| Field type (or SQL type + name) | Form widget | Table cell | Default filter | Searchable by default | Sortable by default |
|---|---|---|---|---|---|
| `string` (varchar ≤ 255) | text input | text, truncated with tooltip | text: contains / equals / is empty | **yes** | yes (if ≤ 255) |
| name contains `email` / `email` | email input | `mailto:` link | text | yes | yes |
| `url`, name `url`, `website`, `*_url` | url input | external link (`rel="noopener noreferrer"`) | text | yes | no |
| `phone`, name `phone`, `tel`, `mobile` | tel input | `tel:` link | text | yes | no |
| `slug` | slug input (auto from title, editable) | monospace text | text equals | yes | yes |
| `text` (long) | textarea | **hidden from list**, shown on detail | contains (if searchable) | **no** (opt in; full-text) | no |
| `richText`, `markdown` | editor | hidden from list | none | no (opt in, full-text) | no |
| `integer`, `bigInteger` | number input (keeps typed text) | right-aligned, `Intl.NumberFormat` | range (min/max) + equals | **exact match only** when the term is an integer, for `id`-like and code columns (see §4.2) | **yes** |
| `decimal`, `float`, `percent` | decimal input (locale comma accepted) | right-aligned, fixed scale | range | no | yes |
| `money`, names `price`, `cost`, `amount`, `total`, `*_price`, `*_cost` | money input | currency format | range | no | yes |
| `boolean` (+ names `is_*`, `has_*`) | switch | Yes/No icon with text for screen readers | ternary: Yes / No / Any | no | yes |
| `enum`, CHECK-enum | select (radio group when ≤ 4 values) | badge | multi-select (`in`) | no (filter instead) | yes |
| `set` | multi-select / checkbox group | badges | multi-select | no | no |
| `date` | date picker | locale date | range with presets (today, last 7 days, this month, custom) | no | **yes** |
| `datetime`, `timestamp` | date-time picker (shown in the user's time zone, stored UTC) | relative + absolute on hover | range with presets | no | **yes** |
| `time`, `duration` | time / duration input | formatted | range | no | yes |
| `uuid`, `ulid`, `id` | read-only | short + copy button | equals | **exact** when the term parses as that id | no |
| `json`, `array`, `address`, `geoPoint` | JSON/array editor, repeatable group | hidden from list | none | no | no |
| `belongsTo` / `*_id` with FK | **async searchable select** (§4.6) | related title, linked | multi-select of related records (`in`) + "None" when nullable | via related title only when opted in (§4.6) | no (v1) |
| `hasMany`, `manyToMany` | not on the main form; tab on detail (§4.6); many-to-many: multi-select | count badge on detail | "has any" (v2) | no | no |
| `file`, `image`, names `image`, `*_image*`, `avatar`, `logo` | upload (via `@strutvane/files`) | thumbnail | has file | no | no |
| `password`, `*_token`, `hidden()`, `sensitive()` | password (write-only) / never shown | never | none | **never** | never |
| `created_at`, `updated_at`, `deleted_at` | not on form | **shown but hidden by default** (column toggle) | date range | no | yes (`created_at` is the default sort) |

**Why:** these are the defaults users already get from Filament's generator, with three deliberate changes: long text and JSON are excluded from search and lists (cost, readability), numbers/dates are filtered by range rather than "searched" as text, and secrets are excluded by name *and* by flag.

**Default list columns:** the title field first, then up to 6 more non-hidden, non-long columns in schema order, then `created_at` (hidden by default). This replaces today's "first 6 fields" rule.

**Labels inside the UI** (§4.9) and **required/nullable** come from the schema: `NOT NULL` without default → required; DB default → form default.

### 4.2 Search: what is searchable and how it runs

**Defaults**

- **Searchable by default:** every short text-like column (`string`, `email`, `slug`, `phone`, `url`), plus the title field. UUID/ULID columns are matched only by the exact-id shortcut below, never by substring. Not searchable: long text, rich text, JSON, enums, booleans, numbers, dates, secrets, hidden fields.
- **Exact-id shortcut:** when the whole search term parses as an integer or UUID, the query also matches `id = term` (and other unique integer/code columns). Nova includes `id` by default; doing it only for parseable terms keeps it cheap.
- **Numbers, dates, enums, booleans:** found through **filters**, not the text box. A text box over numbers yields surprising matches (`12` matching `1200.50`) and kills indexes.
- **Term handling:** trim, collapse whitespace, split on spaces (max 5 terms, each ≤ 100 chars), **AND across terms, OR across columns** (Filament's default). Literal matching: `%`, `_`, `\` have no meaning. Case-insensitive for ASCII (the framework's existing, engine-independent rule). Minimum length 1, but the UI only sends after 2 characters or Enter, debounced 300 ms.
- **Opt-outs and opt-ins:** `field.string().searchable(false)`; `field.text().searchable('fulltext')`; resource `search: { columns: [...], mode: 'contains' | 'prefix' }`.
- **Cap:** at most 10 auto-searchable columns per resource (title field and unique columns first); a model with more gets a `sv doctor` note. This bounds the OR fan-out.

**Implementation (per database)**

| Engine | Default predicate | Default index | Opt-in |
|---|---|---|---|
| **Postgres** (tier 1) | `fold(col) LIKE '%' || :term || '%' ESCAPE '\'`, with `fold` = the existing `translate(col, 'A-Z', 'a-z')` and the term folded and escaped in TypeScript | `CREATE EXTENSION IF NOT EXISTS pg_trgm` + one **GIN trigram expression index** per auto-searchable column on `fold(col)`, emitted by the migration planner | `fulltext`: generated `tsvector` column (`'simple'` config by default, so non-English data is not stemmed wrongly) + GIN, queried with `websearch_to_tsquery`, ranked |
| **SQLite / libSQL** (tier 2) | `col LIKE '%' || :term || '%' ESCAPE '\'` (SQLite `LIKE` is ASCII case-insensitive by default, which matches the framework's semantics exactly) | none: full scan, fine for SQLite-sized data | FTS5 `trigram` external-content table + triggers for big tables (note: FTS5 `LIKE` optimisation does not apply with `ESCAPE`, so the FTS path uses `MATCH` with a quoted phrase) |
| **MySQL** (tier 2, not implemented) | `LIKE ... ESCAPE` on a `_bin` or ASCII-folded expression to keep the same semantics | none | `FULLTEXT` (`ngram` for CJK) |

**Why change from `strpos`/`instr`:** `strpos`/`instr` were chosen so `%`/`_` stay literal. Escaped `LIKE ... ESCAPE '\'` keeps exactly that guarantee **and** can use a trigram index on Postgres. `translate()` is immutable, so an expression index on `translate(col, ...)` is legal and matches the query expression; this keeps the SQL ↔ memory equivalence tests (ADR-0008) intact. The `sv doctor` check and a perf test should confirm the index is used (`EXPLAIN`) for terms of 3+ characters; shorter terms fall back to a scan, which is acceptable because they are rare and bounded by the statement timeout. **Spike needed** (half a day): trigram expression index + `LIKE ESCAPE` on PGlite and Postgres 18, 1M rows, plan + latency; and the RLS interaction (the index must still be used under the restrictive tenant policy, which adds `tenant_id = ...`; a composite `btree_gin (tenant_id, fold(col) gin_trgm_ops)` may be better).

**Cost guards (already partly in place):** statement timeout, page size cap, term/column caps above, and the search runs inside the same policy/tenant scope as the list.

### 4.3 Pagination

| Consumer | Default | Why |
|---|---|---|
| **UI lists** | **Offset with page numbers**, page size **25**, options **10 / 25 / 50 / 100**, total count **capped at 10 000** ("10 000+ results"), first/prev/next/last and a page jump | Admin users expect page numbers and totals (Filament, Laravel `paginate`, Nova "links"). The existing `MAX_OFFSET = 10 000` already bounds the deep-offset cost; the cap bounds the count cost. |
| **UI past 10 000 rows** | Ask to narrow with filters; "Next" continues with a cursor | Offset scans degrade; keyset does not. |
| **API (default)** | **Cursor (keyset)**, `page[size]` 25, max 100, `meta.page.nextCursor`, `links.next` | Stable under concurrent inserts, fast at any depth (Laravel's own docs list these advantages). Unchanged from ADR-0011. |
| **API (opt-in)** | `page[number]=3&page[size]=25`, `page[total]=true` (counts only when the resource allows it, capped) | Same as the UI path, for clients that need page numbers. |

**Capped count:** `SELECT count(*) FROM (SELECT 1 FROM t WHERE <scope and filters> LIMIT 10001) s`. The response says whether the total is exact: add `PageInfo.totalExact: boolean` (or Elasticsearch-style `total.relation: 'eq' | 'gte'`) to `@strutvane/contracts` (additive; needs an RFC note). Make `allowTotal` default **true for the capped count** and keep uncapped totals opt-in.

Page size, sort, filters, search, page and visible columns live **in the URL** (deep links, already true) and the per-page choice and column visibility are remembered per user in `localStorage` (with try/catch; Filament uses the session, React-Admin localStorage).

### 4.4 Sorting

- **Default sort:** `-createdAt` when the table has timestamps, else `-id`; the server always appends the primary key as a tiebreaker (already true). Newest first is what B2B users expect from a list of records; Filament's default (primary key ascending) mostly surprises people.
- **Sortable by default:** numbers, money, dates/times, booleans, enums, `slug`, the title field and short strings. Not sortable: long text, JSON, arrays, relations (v1), secrets.
- **Relations:** sorting by a related title (`sort=customer.name`) needs a join and a stable cursor across it; defer to v2, as Strapi does ("relational fields cannot be the default sort").
- **Indexes:** the migration planner adds a B-tree index for the default sort (`(tenant_id, created_at, id)` on tenant tables) and for every foreign key. It does **not** index every sortable column; `sv doctor` reports slow sorts seen in logs (later).
- First click ascending, NULLS LAST, code-point text ordering: unchanged (ADR-0014, framework README).

### 4.5 Filters per type

UI filter controls are typed, not generic chips (the chip builder stays underneath, so every filter still goes through the one `buildFilter`):

| Type | Control | Wire |
|---|---|---|
| boolean | Yes / No / Any | `filter[active][eq]=true` |
| enum | multi-select with counts (from `aggregate`, §5) | `filter[status][in]=draft&filter[status][in]=sent` |
| belongsTo | async multi-select via `options` endpoint, plus "None" when nullable | `filter[customer][in]=…`, `filter[customer][isNull]=true` |
| number / money / decimal | min–max | `filter[amount][between]=10,99.5` or `gte`/`lte` |
| date / datetime | presets + custom range; datetime ranges converted from the user's time zone to UTC | `filter[dueDate][between]=2026-11-01,2026-11-30` |
| string | operator (contains, equals, starts with, is empty) + value | `filter[city][contains]=pune` |
| any nullable | "is empty" / "is not empty" | `isNull` / `isNotNull` |
| soft deletes | Without deleted (default) / With deleted / Only deleted | `filter[trashed]=with|only` (spatie's `trashed` convention) |

- **Default filterable set:** all non-hidden scalar columns with type-appropriate operators; text/JSON/secrets excluded. The visible filter bar shows booleans, enums, belongsTo and dates first (max 4); the rest are under "Add filter".
- **Live, not deferred** for selects and toggles (immediate feedback); text and range inputs apply on blur/Enter. Filament defers everything behind an Apply button; for server-side lists with debounced requests that is unnecessary friction.
- **Saved views** (Nova lenses-lite): later, stored per user; not in v1.

### 4.6 Relations

- **Inference:** a real foreign-key constraint wins; otherwise `<name>_id` / `<name>Id` pointing at an existing table (Filament's heuristic). Relation name = column without `_id`.
- **Title of a record** (used in selects, cells, breadcrumbs, global search): `name` → `title` → `label` → `display_name`/`full_name` → `subject` → `number`/`code`/`reference` → `email` → `slug` → first unique short string → `#id`. Filament stops at `name`/`title`/PK; the longer list fits B2B tables (invoices have `number`, tickets have `subject`).
- **belongsTo in forms:** async searchable select calling `GET /:target/options?search=&page[size]=20` (returns `{ id, title }` only); **preload** all options when the target has ≤ 50 visible rows (one `count` call); shows the current value's title even when it is not on the first page; "Create new …" inline is opt-in (`createOption: true`). Today's picker pages 100 full records; `options` is lighter and also serves the record-batcher for cell labels.
- **belongsTo in tables:** related title, linked to its detail page, labels batched (existing `record-batcher`).
- **hasMany / manyToMany on detail pages:** one **tab per relation** next to the "Details" tab (Filament relation managers): a full `ResourceList` filtered by the foreign key, lazy-loaded on first open, tab in the URL (`?tab=invoices`), "New" pre-fills the parent. Many-to-many tabs get Attach/Detach. Count badges on tabs are opt-in (cost).
- **hasOne:** an inline section on the detail page.
- **Relation search (opt-in):** `search: { relations: ['customer'] }` adds `EXISTS (SELECT 1 FROM customers c WHERE c.id = t.customer_id AND fold(c.name) LIKE …)` using the target's own search columns and **the target's policy scope**, so search cannot reveal rows the actor cannot view. Off by default because it multiplies cost.

### 4.7 Slugs (standard)

| Question | Rule | Why |
|---|---|---|
| Which tables get one | Only tables with a `slug` column (migration-first) or a `field.slug()` (model-first). The UI never adds one by itself; `make:model --slug` and `ui:sync` hints suggest it for tables that have a `name`/`title` and look public-facing. | Slugs are a URL design choice, not a CRUD need; adding columns silently would break the "migration is reviewed" rule (D5). |
| Generated from | `field.slug({ from: 'title' })`; default = the title field (§4.6). Multiple fields allowed (`from: ['firstName', 'lastName']`). | Matches spatie `generateSlugsFrom`. |
| Algorithm | NFKD normalise, drop combining marks, lowercase, runs of non-`[a-z0-9]` → `-`, trim `-`, max 80 chars cut at a `-` boundary. If the result is empty (non-Latin titles), fall back to a short random token (`n-7f3k2q`); `slug({ unicode: true })` keeps `\p{L}\p{N}` instead. Reject reserved words (`new`, `create`, `edit`, `trashed`, `export`, `bulk`, `query`, `options`, `count`, `aggregate`, `search`) and values that look like an id (all digits, UUID, ULID). | Deterministic and URL-safe; the reserved list protects the routes in §5; id-like slugs would make route binding ambiguous. |
| Uniqueness | Unique **per tenant** (`UNIQUE (tenant_id, slug)`, per ADR-0007's per-tenant unique indexes), and soft-deleted rows still count (no partial index), so restoring never collides. Optional `slug({ scope: ['category'] })` for per-parent uniqueness. | Same rule Strutvane already uses for `unique()`. |
| Collisions | Suffix `-2`, `-3`, … (first duplicate is `-2`: "the second post with this title"); found by one `LIKE 'base-%'` lookup inside the scope, then **insert, catch the unique violation, retry with the next suffix (max 5 attempts)**. | The DB constraint is the only race-free check; retries are idempotent because the insert either commits or not. |
| On update | **Stable by default**: the slug does not follow later title edits. `slug({ onUpdate: 'regenerate' })` opts in. Editing the slug by hand is allowed (validated, 422 `unique` on collision). | Cool URIs do not change; spatie regenerates on update by default, which breaks shared links. |
| In the form | On create, the slug follows the title live until the user edits the slug field, then it stops following; on edit, it is a normal input with a warning that links will change. | The common CMS pattern; no surprises. |
| Route binding | `defineResource(Post, { routeKey: 'slug' })` (Laravel 13's `#[RouteKey('slug')]` idea): `GET /api/v1/posts/:key` resolves by slug, inside tenant + policy scope, soft-deleted excluded unless `?filter[trashed]=with`; missing or invisible → 404. There is no second lookup path (such as `/posts/id/:id`): one key per resource keeps `/:key` unambiguous. Writes (`PATCH`/`DELETE`) keep using the id, which the UI always has. Custom routes bind with `c.bind(Post, c.params.post, { by: 'slug' })`; nested `/users/:user/posts/:post` bindings are scoped to the parent automatically, like Laravel. | Mirrors `{post:slug}` without making `/:id` ambiguous. |
| History | v2: optional `slug_history` table and 308 redirects from old slugs (spatie "self-healing"). | Only needed once slugs can change. |
| UI URLs | When a resource has `routeKey: 'slug'`, UI routes use it too (`/posts/hello-world`, `/posts/hello-world/edit`). | Readable, shareable admin links. |

### 4.8 Labels and names from table names

- `invoice_lines` → model `InvoiceLine` → path `invoice-lines` → label **"Invoice line"**, plural **"Invoice lines"** (sentence case, as `naming.ts` already does for fields).
- Pluralisation with an irregulars list (`person/people`, `status/statuses`, `category/categories`, `analysis/analyses`) and uncountables (`equipment`, `information`, `settings`); when a table name is already plural, singularise for the model. A maintained library (e.g. `pluralize`) is fine; Laravel uses Doctrine Inflector [UNVERIFIED].
- Field labels: strip `_id`/`Id` for relations (`customer_id` → "Customer"), strip `is_`/`has_` for booleans (`is_active` → "Active"), acronyms upper-cased (`id`, `uuid`, `sku`, `url`, `api`, `ip`, `vat`, `gst`, `pan`, `iban`; Filament does `id`/`sku`/`uuid`), `email` → "Email address" (Filament), `*_at` → "Created at" style.
- Every label is a catalog key (`resources.invoiceLine.label`, `…pluralLabel`, `resources.invoiceLine.fields.dueDate.label`) whose **default** is the derived text, so i18n is free and no label is hard-coded (RFC-0003).

### 4.9 Sidebar

- **Entries:** every resource the actor can `list` (manifest is already actor-filtered), plus app pages with a `title`. New tables appear after `migrate` with no file edit.
- **Order:** app pages first; then ungrouped resources; then groups. Inside a group: `ui.sort` (integer, ascending) then plural label alphabetically (Filament's default). Group order: `config/ui.ts` `navigation.groups: ['Sales', 'Catalog', …]`, else alphabetical.
- **Groups:** `ui.group` (exists). A default grouping heuristic is **not** applied; guessing groups produces odd menus.
- **Icons:** `ui.icon` with **Lucide** names (shadcn's default icon set). Default: a keyword map on the table name (`user`→`users`, `invoice`→`receipt`, `order`→`shopping-cart`, `product`→`package`, `customer`/`contact`→`contact`, `setting`→`settings`, `report`→`chart-bar`, `file`/`document`→`file-text`, `project`→`folder-kanban`, `task`→`check-square`, `payment`→`credit-card`, `category`/`tag`→`tag`), else `table`. Icons are decorative (`aria-hidden`).
- **Badges:** opt-in (`ui.badge: 'count' | { filter, color }`), fetched lazily through `GET /:res/count` and cached 60 s. Off by default because each badge is a query per page load.
- **Behaviour:** collapsible to icons (state remembered), groups collapsible, `aria-current="page"`, a filter box when there are more than 15 entries, and a **Ctrl/Cmd+K command palette** that searches pages, resources and records (global search, §5).
- **Hide:** `ui.navigation: false` keeps routes but hides the entry (Filament `$shouldRegisterNavigation`, Payload `group: false`).

### 4.10 Soft deletes in the UI

- Trashed filter (Without / With / Only), default Without; trashed rows render muted with a "Deleted" badge and the deletion date.
- Row actions: **Restore** (capability `restore`), **Delete permanently** (new capability `forceDelete`, off by default, and an extra typed confirmation). Delete on a soft-delete resource says "can be restored"; on others, "cannot be undone".
- Bulk Delete / Restore through `POST /:res/bulk` (§5).
- Opening a trashed record works (read-only, with a Restore banner): the API needs `?filter[trashed]=with` on show, like Laravel's `->withTrashed()` and Filament's binding note.

### 4.11 Validation messages

Unchanged principles (RFC-0003, ADR-0014): one catalog shared by client and server, ICU placeholders, `{attribute}` = the field label, messages per field/resource/app override, server 422 issues routed to the deepest rendered field, focus to the first error, drafts kept on 401. New for generated forms: messages for slug collisions, unique violations (`{attribute} is already taken.` with a link to the existing record only when the actor can view it), and bulk results (`3 of 5 deleted; 2 were not allowed`).

### 4.12 Empty, loading and error states

| State | Default |
|---|---|
| Empty, no filters | Icon + "No invoices yet" + **Create invoice** (only with the `create` capability) + one-line description (`ui.description`) |
| Empty with filters/search | "No invoices match your filters" + **Clear filters** |
| First load | Skeleton rows matching the column layout (no layout shift); `aria-busy="true"` on the table |
| Refetch (page, sort, filter) | Keep the previous rows visible and dimmed (TanStack Query `placeholderData: keepPreviousData`), progress bar, polite live-region announcement of the new count |
| Error | Inline banner from the catalog with **Retry**; 5xx shows the support reference (`traceId`); 403/404 shows "not found or no access" (no enumeration) |
| Offline | Banner, actions disabled, form drafts kept |

### 4.13 Dark mode, theming, i18n, accessibility

- **Dark mode:** Light / Dark / System, default **System**, switch in the user menu, stored in `localStorage` (try/catch) and applied before first paint (inline script setting `class="dark"`), as in the Laravel starter kits and Filament. Colours are shadcn CSS variables (`--background`, `--primary`, …) in OKLCH; `config/ui.ts` `theme.primary` generates the scale (Filament's "one colour → palette" idea). The current `--sv-*` variables map onto these during the transition.
- **i18n:** every UI string and label from catalogs (§4.8); `Intl` for numbers, money, dates and relative times; the user's time zone for datetimes; logical CSS properties so RTL works; locale from user preference, then `Accept-Language`.
- **Accessibility (WCAG 2.2 AA, release-blocking, unchanged):** landmarks (`nav`, `main`), skip link, table semantics with `aria-sort`, labelled pagination, live-region counts, focus management on dialogs and after save/delete, 24 px minimum targets, visible focus, colour never the only signal (badges have text), `prefers-reduced-motion`, keyboard shortcuts that do not hijack typing (`/` and Ctrl/Cmd+K only when focus is not in an input). Playwright + axe in a real browser for contrast in both themes (ADR-0014 follow-up).

---

## 5. The high-level API

### 5.1 Query-parameter standard (decision proposal)

Keep ADR-0011 and its JSON:API-family names; they are already implemented on both sides, allow-listed and fuzz-tested. Additions in **bold**:

| Purpose | Parameter | Notes |
|---|---|---|
| Filter | `filter[field][op]=value` (repeat for lists) | ops: `eq ne gt gte lt lte in nin contains startsWith endsWith between isNull isNotNull` |
| Filter shorthand | **`filter[field]=value`** = `eq` | spatie-style convenience; commas are **not** split (values may contain commas) |
| Soft deletes | **`filter[trashed]=with|only`** | spatie convention |
| Complex filters | `POST /:res/query` with a `QueryFilter` body | `and/or/not`, unchanged |
| Search | `search=term` | Kept for compatibility. Strict JSON:API would require a non-`a-z` name; Strutvane is not a JSON:API media-type implementation, so this is noted, not changed. |
| Sort | `sort=-createdAt,number` | unchanged |
| Page | `page[size]`, `page[cursor]` or `page[number]`, **`page[total]=true`** | |
| Include | `include=customer,lines.product` | allow-listed, ≤ 10 |
| Sparse fields | **`fields[invoices]=id,number,amount`** | implement the contract that already exists (`ListQuery.fields`); the `id` is always returned |
| Errors | RFC 9457 + `issues[]` with `parameter` for query problems | unchanged; 422 for disallowed parameters (JSON:API says 400; Strutvane's 422-with-every-issue is more useful and already shipped) |

**Why not adopt JSON:API documents or spatie verbatim:** JSON:API's resource-object envelope (`type`, `id`, `attributes`, `relationships`) doubles payload complexity for every client and the UI; spatie's `filter[name]=a,b` (comma = OR, partial by default) is ambiguous for values with commas and silently makes every string filter a `LIKE`. The ADR-0011 operator form is explicit and already secure.

### 5.2 Endpoints on by default

All routes live under the resource path, are generated for every resource, appear in OpenAPI and in the manifest capabilities, run inside tenant + policy scope, and are deny-by-default.

| Endpoint | Permission | What it does | Limits and safety |
|---|---|---|---|
| `GET /:res` | `list` | List (exists) | page ≤ 100, offset ≤ 10 000 |
| `POST /:res/query` | `list` | Complex list (exists) | same |
| `GET /:res/:key` | `view` | Show (exists) + `include`, `fields`; `:key` is the route key (id or slug) | 404 when invisible |
| `POST /:res`, `PATCH /:res/:id`, `DELETE /:res/:id`, `POST /:res/:id/restore` | `create`/`update`/`delete`/`restore` | exist | idempotency keys |
| **`GET /:res/options?search=&ids=`** | `view` | `{ data: [{ id, title }] }` for pickers and label lookups | ≤ 50 per page, title + id only, `ids` ≤ 100 |
| **`GET /:res/count?filter…`** | `list` | `{ count, exact }` | capped at 10 000 unless `allowTotal: 'exact'` |
| **`GET /:res/aggregate?groupBy=status&count&sum=amount&avg=amount&filter…`** | `list` | `{ data: [{ status: 'draft', count: 12, sum: { amount: '1250.00' } }] }`; `groupBy` on enum, boolean, belongsTo, or `createdAt:day|week|month` | only fields marked `aggregatable` (default: non-sensitive numbers); ≤ 100 groups; decimals as strings; no aggregates over hidden fields |
| **`GET /:res/export?format=csv&<list params>`** | `export` (exists in capabilities) | Streams CSV of the current filters, sort and visible columns (`fields[...]`) | ≤ 10 000 rows synchronously (keyset internally); **formula-injection escaping on by default** (`=`, `+`, `-`, `@`, tab, CR prefixed with `'`), UTF-8 with BOM option for Excel; only serialised (non-hidden) fields; audited. XLSX and async exports after the queue lands. |
| **`POST /:res/bulk`** | per op: `update`/`delete`/`restore` | `{ op: 'delete'|'restore'|'update', ids: [...], changes?: {...} }` | ≤ 100 ids; **each record re-checked** against the policy (record-level `can()` + filter); all-or-nothing by default (`mode: 'partial'` returns per-id results); idempotency key; `issues` paths `ids[3]`. Filter-based "select all 3 214" needs the queue. |
| **`POST /:res/batch`** | `create` | Create up to 100 records in one transaction | per-item 422 issues `items[4].email`; idempotency key |
| **`GET /:parent/:id/:relation`** | `view` on parent + `list` on child | Alias of the child list filtered by the FK; 404 when the parent is invisible | same list protocol |
| **`GET /search?q=&resources=a,b`** | per resource `list` | Global search: `{ data: [{ resource, id, title, subtitle, url }] }` across resources with `globalSearch` (default: resources with a title field) | 5 results per resource, ≤ 10 resources, run in parallel with a total budget (e.g. 1.5 s); each resource uses its own search and scope |
| `POST /:res/:id/actions/:name` | action permission | Custom actions (contract `ActionDescriptor` exists) | later |

**Optimistic concurrency** (Nova's Traffic Cop): `ETag` from `updatedAt` (or a version column) on show; `If-Match` on `PATCH`/`DELETE`; 412/409 on mismatch. The UI already has a 409 path (RFC-0003). Recommend as default-on for resources with timestamps.

**What is deliberately not default:** `PUT` (full replace invites accidental nulling), GraphQL, arbitrary relation-path filters (`customer.region`; needs the narrower EXISTS design of §4.6 first), import (needs queue + preview UX).

### 5.3 Response shapes (unchanged except paging)

- List: `{ data, meta: { page: { size, hasMore, nextCursor?, number?, total?, totalExact? } }, links: { next?, prev? } }`.
- Errors: RFC 9457 `Problem` with `code` and `issues`.

---

## 6. Proposal: packages, generation on `migrate`, customisation

### 6.1 Packages

- **Keep one package, `@strutvane/ui`,** with entry points:
  - `@strutvane/ui/core` (exists): manifest client, list query (+ offset paging), filter builder, validation, issues, problems, messages, registries, HTTP and session clients, **naming/inference rules shared with the generator** (title guess, labels, icon map, widget map), framework-free.
  - `@strutvane/ui/react` (exists): provider, `StrutvaneApp`, lists, forms, detail, filters, widgets, cells.
  - **`@strutvane/ui/installer`** (new, Node-only): the installer protocol entry (`sv add ui`), `ui:sync`, scaffold templates, eject templates, three-way-merge integration with `@strutvane/devkit`.
  - **Component registry** (new, not an npm entry): shadcn-format JSON items (`sidebar`, `data-table`, `filter-bar`, `form-field`, `command-palette`, …) copied into `web/components/ui` by `sv add ui` and `sv eject ui --components` (D14 "shadcn-registry components copied into the app").
- **Why not a separate `@strutvane/admin`:** the renderer, registries, catalogs and manifest client are the admin; splitting would duplicate them or create a product-to-product import (forbidden). One package also keeps the release train simple. Revisit only if a non-admin "public site" renderer appears.

### 6.2 What happens on `sv migrate`

```
sv migrate
  ├─ framework: plan + apply migrations (unchanged)
  ├─ framework: write the schema snapshot (tables, columns, FKs, uniques, enums)
  └─ hook `schema.migrated` (new, in @strutvane/contracts; payload = snapshot diff)
       └─ @strutvane/ui/installer (registered by the ui provider/CLI contribution)
            ui:sync
              1. load snapshot + model definitions + web/resources/*.ui.ts
              2. for each NEW eligible table (§3):
                   - scaffold app/models/<name>.model.ts if missing   (owned, written once)
                   - scaffold web/resources/<resource>.ui.ts           (owned, written once)
              3. regenerate .strutvane/ui.gen.ts                       (machine-owned, every time)
              4. report: new screens, new columns not shown in explicit lists,
                 columns referenced but dropped, ejected pages that may need a merge
```

- **Connection type:** a core **hook** is one of the six allowed connections; the framework never imports the UI. `schema.migrated` (name to be fixed in the RFC) must be added to `docs/17-integration-map.md` in the same PR. In `sv dev`, Vite HMR reloads the generated registry, so the new sidebar entry shows up without a restart.
- **API-only projects** (preset `api`, no `web/`): the hook has no UI listener; nothing is generated. The manifest still carries `ui` hints for a separate UI repo.
- **Idempotent and safe:** `ui:sync` never overwrites an owned file, writes atomically (temp file + rename), and can be re-run (`sv ui:sync`) at any time; `--dry-run` prints the plan. Failures in `ui:sync` never roll back the migration; they are reported with the exact command to re-run.

### 6.3 The three kinds of UI files

| File | Owner | Written | Content | On the next migrate |
|---|---|---|---|---|
| `.strutvane/ui.gen.ts` | machine | every `migrate`, `dev`, `build` | Resource and field name unions (typed overrides like `'Invoice.amount'`), inferred defaults per table, navigation entries, the lazy-import map of page overrides found by convention (`web/pages/<resource>/{list,form,detail}.tsx`) | Regenerated. Git-ignored like the D7 registry. |
| `web/resources/<resource>.ui.ts` | developer | **once**, when the table first appears | `defineResourceUi('Invoice', { columns: auto(), form: auto(), filters: auto(), navigation: { group: undefined, icon: 'receipt', sort: undefined } })` with comments listing what `auto()` resolved to today | **Never rewritten.** `auto()` keeps picking up new columns. If the developer replaced `auto()` with an explicit list or `auto().except('notes').order(['number', 'status'])`, new columns are **reported**, not added; `ui:sync --add-columns` can apply a reviewed patch. |
| `web/pages/<resource>/*.tsx` (ejected, L3) | developer | `sv eject ui Invoice --page list` | Full page source | Never rewritten by `migrate`. `sv upgrade` / `ui:sync --merge` applies template changes by the ADR-0012 three-way merge (base copy in `.strutvane/base/`, lock in `.strutvane/lock.json`). |

**Why this layout:** `auto()` gives the runtime-renderer property (new column → appears, D6 "adding a field needs no regeneration"); the owned config file gives Filament's "I can see and edit the resource" property; explicit lists and ejected files are never touched silently, which is the failure mode of Backpack's edited menu file and of Filament's one-shot generation. Typed names from `ui.gen.ts` turn a dropped column referenced in an owned file into a **typecheck error at build time**, not a blank column at runtime.

### 6.4 Customisation levels, applied to the UI

| Level | Example | Where |
|---|---|---|
| L0 | Nothing: migrate → screen + sidebar entry | runtime from manifest + `auto()` |
| L1 | Hide a column, change the icon/group/sort, page size, default sort, make a field non-searchable | `web/resources/invoices.ui.ts` (UI-only) or the model/resource options (also affects the API) |
| L2 | One custom cell, widget, filter, row action or detail tab | registries (exist) + `web/pages/invoices/columns.tsx` by convention |
| L3 | Whole page | `sv eject ui Invoice --page form` |

Rule of thumb for the RFC: **anything that changes what the API accepts (searchable, filterable, sortable, slug, routeKey) lives in the model/resource; anything purely visual lives in `*.ui.ts`.** The manifest carries both so a separate UI repo still gets them.

### 6.5 Reuse: keep, adapt, retire

| Piece | Verdict | Notes |
|---|---|---|
| `core/manifest-client.ts`, `filter-builder.ts`, `validation.ts`, `issues.ts`, `problems.ts`, `messages.ts`, `registry.ts`, `record-batcher.ts`, `http-client.ts`, `session-client.ts`, `ids.ts` | **Keep** | Tested invariants; the generator reuses the naming rules once moved here. |
| `core/list-query-url.ts`, `list-state.ts` | **Adapt** | Add offset paging (`page[number]`, capped totals), `fields[...]`, `filter[trashed]`, shorthand parsing; keep the cursor stack for the API path and past 10 000 rows. |
| `react/FieldShell.tsx`, `widgets.tsx`, `cells.tsx`, `ResourceForm.tsx` | **Keep / extend** | Add slug, money, date-time-with-zone, multi-select, switch, tel/url/email links, image cells; relation picker moves to `options`. |
| `react/ResourceList.tsx` | **Adapt** | Page numbers, page-size select, row selection + bulk bar, column visibility, trashed filter, empty/loading states of §4.12; keep server-side ops, first-click-ascending, virtualization fail-safe. |
| `react/FilterBar.tsx` | **Adapt** | Typed controls per §4.5 on top of the same `buildFilter`. |
| `react/ResourceDetail.tsx`, `relations.ts` | **Adapt** | Relation tabs, inline hasOne, trashed banner; uses nested relation endpoint. |
| `react/StrutvaneApp.tsx` | **Adapt** | Becomes the panel shell: shadcn sidebar (groups, sort, icons, badges, collapse), user menu with theme switch, Cmd+K palette, breadcrumbs. Keep its permission-aware routing logic. |
| `react/router.tsx` | **Retire (replace)** | D14 names TanStack Router; typed search params and code splitting matter once lists put a lot of state in the URL. Keep `matchPath` semantics in tests during the swap. |
| `react/app-styles.ts` (injected CSS) | **Retire** | Replaced by Tailwind 4 + shadcn tokens copied into the app; keep `--sv-*` aliases for one minor release. |
| `react/SignIn.tsx` | **Move** | Into owned auth screens installed by `@strutvane/auth` through installer `enhances` (layouts `simple`/`card`/`split`, like the starter kits). |
| Framework `query/compile.ts` `contains` | **Change** | `strpos`/`instr` → escaped `LIKE … ESCAPE` on the folded expression (§4.2), keeping the SQL ↔ memory equivalence tests. |
| Framework manifest | **Extend** | See §7. |

---

## 7. Contract and spec changes this implies (for the RFC)

All additive, so `MANIFEST_VERSION` stays `1`:

- `ResourceDescriptor.ui`: `sort?: number`, `navigation?: boolean`, `badge?: 'count' | {...}`, `description?: string`, `defaultSort?: string`, `pageSize?: { default: number; options: number[] }`, `globalSearch?: boolean`.
- `ResourceDescriptor`: `routeKey?: string`, `slug?: { field: string; from: string[] }`.
- `FieldDescriptor`: `listHidden?: boolean` (toggleable, hidden by default), `searchMode?: 'contains' | 'prefix' | 'exact' | 'fulltext'`, `aggregatable?: boolean`, `format?: { currency?: string; scale?: number }`, `placeholder?: string`.
- `ResourceCapabilities`: `forceDelete`, `bulk` (or per-op flags).
- `PageInfo`: `totalExact?: boolean`.
- `ListQuery`: `trashed?: 'with' | 'only'`.
- Hooks: `schema.migrated` payload type.
- Docs to update when accepted: `00` (D6/D14 wording on generation-on-migrate), `06` (endpoints, search, slugs), `08` (UI standards), `09` (`ui:sync`, `eject ui`), `17` (new hook), ADR for "search uses escaped LIKE + trigram expression indexes", ADR for "UI generation on migrate: runtime-rendered, config-owned", RFC for the high-level API endpoints.

## 8. Risks and open questions

1. **Model-first vs migration-first:** the proposal works with both through the schema snapshot, but D4/D5 must be revisited explicitly if the Laravel flow replaces them (an ADR, not a silent change).
2. **Auto-scaffolding models for every table** exposes more API surface. Deny-by-default makes it safe, but super-admin wildcards will see everything at once; confirm that is the wanted behaviour.
3. **Trigram index cost** on write-heavy tables: measure in the spike; keep `searchable({ index: false })`.
4. **Capped counts** change list semantics for API clients that relied on "no total"; ship behind `page[total]=true` for the API, default on only in the UI.
5. **Relation search and relation sort** are the most requested Filament features and the most expensive; both are deferred with a concrete design (§4.4, §4.6).
6. **Exports and bulk on "all matching rows"** need the queue (deferred in the framework).
7. **Unicode slugs:** decide whether the default for non-Latin titles is the random token or Unicode slugs; the brief targets enterprise B2B in India and elsewhere, so `unicode: true` may be the better default for some apps.

## Sources (all read 2026-11-14)

- Filament 5.x docs: resources overview, global search, table columns, tables overview, filters, managing relationships, navigation, tenancy, deleting records, export action, styling (`https://filamentphp.com/docs/5.x/...`); Filament source on GitHub (`filamentphp/filament`, branch `5.x`): `CanGenerateModelForms.php`, `CanGenerateModelTables.php`, `CanReadModelSchemas.php`; release coverage `https://laravel-news.com/filament-5`.
- Laravel Nova v5 docs: resources, search basics, global search, lenses (`https://nova.laravel.com/docs/v5/...`); `https://laravel.com/blog/laravel-nova-5-now-available`.
- Backpack 7.x CRUD tutorial: `https://backpackforlaravel.com/docs/7.x/crud-tutorial`.
- Laravel docs: starter kits (12.x), routing, pagination, Scout (13.x); release notes `https://laravel.com/docs/13.x/releases.md`.
- Refine Inferencer and interface references; React-Admin ListGuesser and List; AdminJS resource basics; Payload collections; Strapi 5 Content Manager; Directus fields.
- JSON:API 1.1 format: `https://jsonapi.org/format/`; spatie/laravel-query-builder v6 filtering and v7 introduction; spatie/laravel-sluggable README.
- PostgreSQL 18 `pg_trgm`; SQLite FTS5; MySQL 8.4 ngram parser.
- Strutvane (local, read-only): `packages/ui` README, CLAUDE.md, `src/core/*`, `src/react/*`; `packages/framework` README, CLAUDE.md, `src/query/compile.ts`, `src/openapi/manifest.ts`; `packages/contracts/src/{manifest,list-query,query-filter,field-type}.ts`; ADR-0003, ADR-0011, ADR-0012, ADR-0014; `docs/04-architecture.md` §4; `docs/05-developer-experience.md`.
