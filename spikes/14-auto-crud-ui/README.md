# Spike 14: Auto CRUD UI (migrate → screens + sidebar, customisable without losing edits)

**Date:** 2026-11-14.

**Environment:** Windows 11, Node v24.21.0, npm (not pnpm), TypeScript 6.0.3, React 19.3.1, Vite 8.3.8, Tailwind 4.3.5, TanStack Router 1.170.46 / Query 5.107.1 / Table 9.3.1, Tabler Icons 3.50.0, Recharts 3.10.1, Public Sans (@fontsource 5.3.0), Vitest 5.1.0 + jsdom 31 + Testing Library, axe-core 4.14.0, oxc-parser 0.158.0.

```bash
cd spikes/14-auto-crud-ui
npm install
npm test           # tsc --noEmit + vitest run (133 tests)
npm run build      # tsc --noEmit + vite build
npm run ui:sync    # regenerate example/.strutvane/ui.gen.ts from example/.strutvane/resources.json
npm run dev        # the admin on http://localhost:5173 with a seeded mock API at /api
```

> **Visual direction is being re-decided (2026-11-14).** The current look, tokens and component visuals will be replaced by the chosen mockup. The behaviour stays:
> - the generator;
> - the Back control and conveniences;
> - accessibility;
> - the overflow rule;
> - the API contract.

**Design standard:** [`DESIGN.md`](DESIGN.md) is the enforceable UI standard for `@strutvane/ui` and every package that adds screens: tokens for both themes, layout, component specs, content style, accessibility and extension points. The look is an **original design** in the style of popular premium admin templates: a vertical menu, a floating sticky navbar, cards with soft shadows, light and dark. No template's CSS, markup, images, illustrations, colours or fonts are used. Third-party assets and their licences are listed in DESIGN.md §10 and below.

The contract tests also run spike 10's real API in-process. They need `npm install` in `spikes/10-migration-first-schema`; without it they are skipped with a message.

## Question

> After `migrate`, can every table get list/create/edit/detail screens and a sidebar entry **by itself** (Filament-like: search, pagination, sorting, typed filters, relations, slugs), while the developer can customise each screen **without losing those changes on the next migrate**, and with a dropped column turning into a compile error instead of a blank column?

## Answer

**Yes, with "runtime-rendered, config-owned" generation** (design doc §6.2–6.3):

- `ui:sync` reads spike 10's `resources.json` and writes two kinds of files:
  - a **machine-owned** `.strutvane/ui.gen.ts`, regenerated every time;
  - **developer-owned** `resources/ui/<resource>.ui.ts` files, written **once**, for new tables only, with `columns: auto()`, `form: auto()` and `filters: auto()`.
- Screens are rendered at runtime from metadata plus the owned settings. So `auto()` picks up a migrated column with no regeneration.
- An explicit list (`columns: ['name', 'position']`) is never rewritten. `ui:sync` reports the new column instead.
- Every field name in an owned file is checked against a typed registry by declaration merging. When a migration drops a column that an owned file still names, the owned file stops compiling (`TS2322`, proven with the real compiler).
- The UI talks to **spike 10's real Hono CRUD API**, in-process. The mock used for fast tests and `npm run dev` returns **byte-identical** responses to spike 10 over a 47-request script.

## Evidence

`npm test` exits 0: `tsc --noEmit` plus **13 files, 133 tests (132 passed, 1 skipped)**. The skip is the "spike 10 not installed" placeholder, which only runs when the real contract tests can't. `npm run build` exits 0 (JS 874 kB, 261 kB gzip, of which Recharts is the largest part; CSS 41 kB; Public Sans woff2 files). Two consecutive full runs were green.

| Test file | Tests | What it proves |
|---|---|---|
| `generator/sync.test.ts` | 16 | **First sync** scaffolds one owned file per table, plus the registry and the lock. A second sync writes nothing; a dry run writes nothing. **Customise, then migrate (adds `posts.subtitle`, `posts.category_id`, `tags.color`):** the owned files stay byte-identical; `auto()` lists now include the new columns while keeping `except`/`order`/label/navigation edits; the explicit `tags.columns` list is unchanged and the report says `! New column tags.color (columns) is NOT shown … Add 'color' to that list`. A dropped column is reported; a dropped table's file is kept and called orphaned. **Never overwritten:** only a new table is scaffolded; a lost lock doesn't re-scaffold; a deleted owned file is reported, not recreated; a damaged lock is treated as missing. Output is deterministic (LF, no machine paths), and the committed `example/` equals fresh output. Friendly errors point to `sv migrate`. |
| `generator/typecheck.test.ts` | 3 | **Real TypeScript compiler:** `columns: ['title', 'subtitle', 'status']` compiles. After a migration drops `subtitle` and `ui:sync` runs, it fails with exactly one `TS2322 Type '"subtitle"' is not assignable`. `auto({ except: ['nope'] })`, `defaultSort: '-nope'`, `defineResourceUi('invoices')` and `icon: 'reciept'` (with "Did you mean 'receipt'?") are all compile errors. `password` is not a typed field name. |
| `generator/owned-reader.test.ts` | 5 | The static reader (oxc, never executes app code, ADR-0010) classifies `auto()`, `auto({...})`, explicit lists (also through `as const`/`satisfies`) and absent properties. It **reports, never guesses**, for variables and spreads (`posts.ui.ts:4`), syntax errors and missing default exports. |
| `app/shell.test.tsx` | 16 | The sidebar comes from the registry: plural labels, groups, explicit sort then A to Z, decorative icons, `aria-current`. Entries are hidden without `viewAny`, and such a URL says "Nothing here". **A table added by a later migrate appears in the sidebar and lists rows with no file edit.** Sign-in stub (email check, focus, roles) and sign-out. **Ctrl+K / Cmd+K** opens global search; Escape returns focus; Arrow and Enter open a record by slug; resources the user may not list are never searched. Dark mode toggles `html.dark`, is remembered, and still works when `localStorage` throws. Mobile drawer opens and closes. **Redesign:**<br>• the account menu (menu button pattern: first item focused, arrows, Escape returns focus) holds Sign out;<br>• a notifications menu;<br>• the dashboard: stat cards with live counts, plus charts whose data is also a screen-reader table ("published 22");<br>• a live sidebar badge whose accessible name is "Posts, 35 rows";<br>• collapse-to-icons (remembered, `title` tooltips, names kept);<br>• collapsible menu groups (`aria-expanded`). |
| `app/list.test.tsx` | 16 | **Page numbers** with a summary ("Showing 26–35 of 35 posts"), `aria-current`, a disabled Next on the last page. Page sizes 10/25/50/100 reset to page 1; malformed URL state is ignored. **Debounced search** with a polite count announcement. **Sort**: first click ascending, then descending, with `aria-sort`. **Typed filters** send exact wire params (`filter[status][in]=draft`, `filter[featured][eq]=true`, `filter[price][gte]=10`, `filter[author_id][eq]=2` via the async relation select). Empty-with-filters (Clear), empty (Create tag), skeleton loading (`aria-busy`), a 502 HTML page becomes a friendly error with Retry. **Deleted rows:** "Only deleted" shows 2 rows with a "Deleted" badge, and Restore works. **Delete confirm:** `alertdialog`, Cancel focused, Escape returns focus, the soft-delete wording, `DELETE /api/posts/1`. A viewer sees no write actions. An explicit column list is rendered exactly. No export/bulk controls appear by default. |
| `app/form-detail.test.tsx` | 10 | **Widgets by type** (text, textarea, decimal `inputmode`, enum select, relation combobox, switch, date). The owned `form: auto({ except: ['meta'], order: ['title', 'status'] })` applies. **The slug follows the title** (`Héllo, World!` becomes `hello-world`) until it is edited, with a URL preview. Client checks focus the first invalid field, with `aria-invalid` and a description. **Create** with keyboard relation select; the decimal point survives typing ("12."). The body is exactly what is needed, an untouched slug is left to the server, and you land on `/posts/launch-day`. **A server 422** (`Slug "engineering" is already taken.`) lands on its field and focuses it. **Edit sends only changed fields** (`PATCH /api/posts/1 {"status":"published"}`). **Detail by slug** (`/api/posts/by-slug/…`): relation links, breadcrumb, **hasMany tabs** (lazy, `?tab=posts`, Arrow keys, `filter[author_id][eq]=1`), a friendly 404, and id URLs for slug-less tables. |
| `app/a11y.test.tsx` | 13 | **axe-core: 0 violations on 11 screens and states**: sign-in, dashboard with charts loaded, list with filters open, empty list, form with errors, edit, detail with a relation tab, delete dialog, open account menu with the sidebar collapsed, a toast, search palette. `color-contrast` is off because jsdom has no layout (see Limits). The skip link is the first Tab stop and targets `<main>`; every form control has a `<label for>`. |
| `security/exposure.test.ts` | 8 | **Security review F-01, F-03, F-13, F-15.** 60 real secret column names (Laravel, Sanctum, Passport, Cashier, Fortify, Rails, Django) are all hidden by the shared redaction matcher; ordinary names stay visible. `secret: true` / sensitive names never appear in columns, form, filters or typed names, even when listed explicitly. The API never returns, filters, sorts, searches or accepts them, and its error hint doesn't list them. **Internal tables** (`sessions`, `personal_access_tokens`, `user_roles`, `team_members`, `jobs`, `failed_jobs`, `migrations`, `audit_events`, `cache_*`, or `internal: true`) get no owned file, typed names, registry entry or screen, also at runtime. Export and bulk are off unless opted in. |
| `contract/spike10.test.tsx` | 7 | **Spike 10's real API in-process on `node:sqlite`.** The 47-request script (pagination, search incl. `100%` and `_` as literals, multi-sort with NULLs, 12 filter shapes, 6 hostile queries, by-slug, 404s, 422s, a duplicate unique email, a non-Latin title, PATCH, soft delete) gives **identical status codes and bodies** from the mock and spike 10. Extensions are confirmed absent from spike 10 (`filter[trashed]` is a 422 there). **The UI on spike 10:** list/search/sort; create through the form; **the server de-duplicates the slug** (`/posts/hello-world-4`); a 422 unique email lands on the Email field; soft-delete from detail returns to a 4-row list. |
| `shared/contrast.test.ts` | 2×2 | **WCAG AA from the stylesheet itself:** 23 text/background pairs (4.5:1; focus ring 3:1) in light and dark, computed OKLCH → sRGB → luminance. Checked at the configured `--brand-hue` **and at every hue in 15° steps**, so any accent a developer configures stays readable. |
| `shared/design-tokens.test.ts` | 2 | **No hard-coded colours in components:** fails on hex, `rgb/hsl/oklch(...)`, Tailwind palette classes (`bg-red-500`, `text-white`, `bg-black/50`) and arbitrary colour values anywhere in `src/app`. The rule is itself tested against a planted bad snippet. |
| `app/conveniences.test.tsx` | 19 | **The P0 conveniences (DESIGN.md §11):**<br>• **Back:** goes back in history to the list with its page and filters intact, or to the parent route on a direct link (detail → list, edit → detail); Alt+←; icon-only with a name on mobile; not shown on top-level pages.<br>• **Unsaved-changes guard:** on Back and Escape, "Keep editing" is focused, Discard works, and axe passes.<br>• **Forms:** Save and add another; character counter.<br>• **Detail:** previous/next record; tab counts ("Posts, 13"); Copy ID.<br>• **Lists:** filter chips with remove and Clear all; column hide (remembered); compact density; search highlight; Undo after delete; type-to-confirm for permanent delete.<br>• **Shortcuts:** `?`, `e`, `n`, `g d`, `/`, never while typing; palette action "New post".<br>• **Overflow regression:** every scroll box is positioned, `main` has `min-w-0`, and the header is sticky. |
| `shared/pure.test.ts` | 14 | `auto()` defaults, `except`/`order`, unknown names; sidebar ordering, including package pages merged under the same rules and permissions; icon guesses; spike 10's wire format; the sort cycle; URL validation; page windows (`1 … 5 6 7 … 12`); form values (defaults, server-equivalent checks, edit diff with `null`); the slug rule. |

**Manual check after the redesign** (Vite dev server, Chromium pane, 1366×850):

- **Dashboard, dark:** a white-on-accent logo mark and "Strutvane" over the menu. "Dashboard" is a filled indigo pill with a soft glow. ACCESS and CONTENT are uppercase group headings with chevrons; Posts carries a "35" pill badge; "Collapse menu" is pinned at the bottom. The navbar floats as a rounded card: a search field with a `Ctrl K` hint, a three-way theme switch, a bell with a red dot, and an initials avatar with a green status dot. The content shows breadcrumbs "Home › Dashboard", a welcome card with three numbered steps, four stat cards (4 Categories, 35 Posts, 12 Tags, 3 Users) with soft tinted icon tiles, a "Rows per table" bar chart (rounded bars), and a "Posts by status" donut with a legend (Draft 37 %, Published 63 %).
- **Posts list, light:** an off-white page with white cards. A page header with breadcrumbs, a description and a filled "+ New post" button. The table card has a search field, Filters and a "Hide deleted" select; uppercase muted column headers with sort arrows; 52 px rows with monospace slugs, right-aligned prices, soft status badges, author links and "✓ Yes / — No".

The first pass, before the redesign (1280×800 and a narrow width):

- **Sign-in:** a centred card on the system (dark) theme, with a three-button theme switch in the corner. An invalid email shows a red message under the field and keeps focus there.
- **Dashboard:** the welcome checklist (migrations done; make a screen your own; decide who sees what) and one card per resource. At narrow width the sidebar collapses behind a menu button.
- **Posts list:** sidebar "Dashboard / ACCESS: Users / CONTENT: Posts, Categories, Tags" with Lucide icons and Posts highlighted. A toolbar with search, Filters and a "Hide deleted" select. The table has sortable headers with arrow icons, monospace slugs, right-aligned prices (`12.50`), status badges, author names as links, "✓ Yes / — No" booleans, and localised dates. Wide tables scroll sideways.
- **Filter panel (light theme):** a three-column grid: "Title contains", "Slug contains", Price min/max, Status checkboxes, Author async select, Featured Any/Yes/No, date ranges, Category select. Ticking "draft" updates the URL (`?filter={"status.in":"draft"}`) and the "Filters (1)" button.
- **New post:** typing "Héllo, Wörld! Launch day" fills the slug `hello-world-launch-day` with a live URL preview. Submitting without an author moves focus to Author. Choosing "Asha Rao" and saving lands on `/posts/hello-world-launch-day`.
- **User detail:** Details and Posts tabs. The Posts tab shows that user's posts as a full table.
- **Ctrl+K:** a centred palette. "pric" lists the four "Pricing: …" posts with icons and a "Post" hint. Arrow keys move the highlight.

## Third-party assets (all open source)

| Asset | Licence |
|---|---|
| Tabler Icons (`@tabler/icons-react` 3.50.0) | MIT |
| Public Sans (`@fontsource/public-sans` 5.3.0) | SIL OFL 1.1 |
| Recharts 3.10.1 | MIT |
| Tailwind CSS 4.3.5, shadcn/ui patterns (copied structure), clsx, tailwind-merge, TanStack, React | MIT |
| class-variance-authority 0.7.1 | Apache-2.0 |

The logo mark and the avatars are drawn in code; the spike ships no images. Versions are pinned exactly, and the newest Tabler release (published that day) was skipped on purpose (minimum release age).

## Design

```
spike 10: migrate ──► .strutvane/resources.json
                           │
                 ui:sync (scripts/ui-sync.ts → src/generator)
          ┌────────────────┼───────────────────────────────┐
          ▼                ▼                               ▼
 .strutvane/ui.gen.ts   .strutvane/ui.lock.json      resources/ui/<route>.ui.ts
 (machine; every sync)  (field names at last sync)   (developer; written ONCE, new tables only)
  • UiRegistry augmentation (typed field names)        export default defineResourceUi('posts', {
  • metadata (minus internal tables)                     columns: auto(), form: auto(), filters: auto(),
  • static imports of owned files                        navigation: { icon: 'file-text', group: 'Content' } })
          │                                                │
          └──────────────► runtime: resolveResourceUi(metadata, owned config) ──► screens + sidebar
```

| Module | Job |
|---|---|
| `src/shared/metadata.ts` | spike 10's `resources.json` types (mirrored; the contract test guards drift) plus forward-compatible `secret` / `internal` flags |
| `src/shared/define-ui.ts` (`#strutvane/ui`) | `defineResourceUi`, `auto()`, `UiRegistry` (augmented by `ui.gen.ts`), opt-in `actions` |
| `src/shared/{defaults,resolve-ui,navigation,exposure,icons,slug}.ts` | the `auto()` rules, resolution, sidebar ordering (resources plus package pages such as the logs viewer, each behind a permission), secret/internal rules, icon guess, slug rule; shared by the generator and the browser |
| `src/generator/{owned-reader,render,plan,sync,report}.ts` | static reader (oxc), file renderers, the pure planner, safe I/O (`wx` create-once, atomic temp+rename, skip unchanged), report text |
| `src/mock-api/*` | an in-memory API with spike 10's exact contract plus `filter[trashed]` and `POST /:id/restore`; used by `npm run dev` and fast tests |
| `src/app/api/*` | `createApiClient` (transport-injected, defensive problem+json parsing), the list wire format |
| `src/app/shell/*` | `AppShell` (skip link, Ctrl/Cmd+K), `Sidebar`, `TopBar`, `CommandPalette`, `ThemeSwitch`, `SignInPage` stub, `HomePage` checklist |
| `src/app/resource/*` | `ListPage`/`ListView`, `ResourceTable` (TanStack Table v9), `FilterPanel`, `Pagination`, `FormPage` + `form-values.ts` + widgets (`RelationSelect` ARIA combobox), `DetailPage` (tabs), `DeleteButton`, states |
| `src/app/components/ui/*`, `src/app/components/PageHeader.tsx` | shadcn-style owned components (Button with cva, Input, NativeSelect, Switch, Badge, Alert, Card, DropdownMenu, Avatar, Toast, Dialog with focus trap, Skeleton) and the page header with breadcrumbs; `src/app/styles.css` holds every token (DESIGN.md §2) |
| `src/app/shell/{BrandMark,charts,notifications}.tsx` | the original logo mark, the Recharts bar and donut charts (each with a hidden data table), demo notifications |
| `example/` | the blog app: spike 10's `resources.json`, generated `ui.gen.ts` + lock, owned files with real customisations |

### Owned file (what a developer edits): `example/resources/ui/posts.ui.ts`

```ts
import { auto, defineResourceUi } from '#strutvane/ui'
export default defineResourceUi('posts', {
  columns: auto(),                                              // new columns appear by themselves
  form: auto({ except: ['meta'], order: ['title', 'status'] }),  // still follows the schema
  filters: auto(),
  navigation: { icon: 'file-text', group: 'Content', sort: 1 },
  defaultSort: '-created_at',
})
```

Other settings: `label`, `pageSize` (10/25/50/100), `navigation.hidden`, and `actions: { export?, bulk? }` (off by default). Anything that changes what the API accepts (searchable, sortable, slug, fillable) stays in the migration or model (design doc §6.4).

## Findings

1. **Chained `auto().except('x')` cannot be type-checked.** Calling a method on `auto()` loses the contextual type, so `auto().except('typo')` would compile. The options form `auto({ except, order })`, with `NoInfer`, gives precise errors at the typo. **Change from the design doc's chained syntax.**
2. **Parse, don't execute, works for owned files.** oxc reads the shapes reliably. Anything non-literal is reported with `file:line` and its checks are skipped. Nothing is guessed, and no app code runs during `migrate` (ADR-0010 holds, unlike spike 10's migration replay).
3. **A lock file is needed to say "new column".** `ui.lock.json` holds the field names seen at the last sync. A lost or damaged lock is safe: owned files are never overwritten (`wx`), so it only mutes the "new column" report once.
4. **Real UI defect found by the delete test.** Column definitions depended on relation titles that arrive later. Each arrival created new cell component types, React remounted every cell, and an open delete dialog vanished mid-click. Fix: relation rows reach cells through context; column definitions are stable.
5. **Real ordering bug found by a unit test.** `Array.prototype.sort` moves `undefined` to the end **without calling the comparator**. So "ungrouped sidebar entries first" silently sorted them last. Fixed by placing the ungrouped section by hand.
6. **The slug UX needs one rule:** on create, an **untouched** slug is not sent. The server builds the same slug and de-duplicates it (`hello-world-4` on spike 10), instead of answering "already taken" to a slug the user never typed. A slug the user edits is sent and validated (422 on its field).
7. **The mock equals spike 10 byte for byte** over 47 requests, including messages and edge cases (`100%`, `_`, NULL ordering, decimals as fixed-scale strings, `日本` → "Couldn't build a slug"). So UI tests on the mock are evidence about the real contract, not a guess.
8. **Spike 10 lacks what the UI's soft-delete screens need:** `filter[trashed]=with|only` (422 there today) and `POST /:id/restore`. The mock implements both as the design doc proposes. There is also no `options`, `count`, `/search` endpoint or `page[total]`. The UI uses the list endpoint for relation selects, title batches (`filter[id][in]=…`, one request per relation column per page) and global search (parallel `?search=&perPage=5` per listable resource), so it works on spike 10 today.
9. **`new` is a reserved slug.** The route `/$resource/new` wins over `/$resource/$key`, so a post whose slug is `new` would open the create form. Spike 10's `slugify` doesn't reject reserved words yet (design doc §4.7 lists them).
10. **Security review folded in** (F-01, F-03, F-13, F-15):
    - internal tables are dropped before generation and again at runtime;
    - secret columns use the logs pipeline's sensitive-key matcher plus a forward-compatible `secret: true`, and never reach typed names, screens, filters, sort, search or writes;
    - export and bulk are opt-in per resource (`actions`).

    The matcher deliberately over-matches (`tokenizer_version` is hidden); heuristics may only hide.
11. **No engine assumptions in the UI.** The app now defaults to MySQL, so search case rules, collation and NULL ordering stay entirely server-side. The UI only sends spike 10's documented parameters. Calendar dates are formatted in UTC so a `DATE` never shifts a day; timestamps use the user's time zone.
12. **The design rules found real defects:**
    - **Contrast:** the hue sweep showed that a green or cyan accent at L 0.52 drops to 4.0–4.5:1 in light mode. The primary went to L 0.48, which is AA at every hue.
    - **Badge naming:** accessible names drop spaces between inline children, so the badge read as "Posts35rows". It now reads "Posts, 35 rows".
    - **Class conflicts:** active and inactive menu link classes were both present, and CSS order decided the colour. They are now split with `activeProps`/`inactiveProps`.
13. **The third round found four real defects:**
    - **Page overflow** (seen by the user at 1440 px). Root cause: `sr-only` texts (`position: absolute`) inside table cells escaped the table's non-positioned `overflow-x-auto` box and widened the page to 1918 px.
      - **Fix:** the scroll box is `relative`, and the content column has `min-w-0`.
      - **Verified in a real browser:** page width = viewport (1425 px); the table scrolls inside its 1115 px box.
      - **Guarded by:** a structural test, because jsdom has no layout. Playwright has no browser installed here.
    - **Out-of-memory loop.** `useLocation()` in the shortcut hook re-rendered the shell on every router update, until the test worker ran out of heap. Fix: subscribe to the pathname string only (`useRouterState({ select })`). Found with a temporary render counter.
    - **Remounting cells, again.** The visible-columns array was rebuilt on every render, giving the table new cell components; the delete dialog closed mid-click. Fix: memoised (third instance of this defect class, see Finding 4).
    - **Windows `EPERM` on rename** in `ui:sync`'s atomic write, while a file watcher (a running dev server) held `ui.gen.ts`. This also explains the earlier one-off flaky sync test. Fix: retry the rename with a short backoff, like graceful-fs; the dev server also ignores `.tmp`.
14. **jsdom quirks worth knowing:**
    - Vite's module runner under jsdom needs `server.fs.allow: ['..']` to load a sibling project.
    - Recharts measures nothing in jsdom: give `ResponsiveContainer` an `initialDimension`, and assert on the chart's hidden data table instead.
    - `new Function('return import()')` has no import hook inside Vitest's VM.
    - `scrollTo` must be stubbed for the router.

## Limits & risks (not verified here)

- **Colour contrast** wasn't measured: jsdom has no layout. The palette was eyeballed in light and dark mode in Chromium. A Playwright + axe run in a real browser (both themes) is the next step; Playwright was optional and is not installed here.
- **Not built:**
  - export and bulk UI (only the opt-in switch);
  - column visibility toggles;
  - saved views;
  - per-row "is empty" filters;
  - capped totals and cursor paging past 10,000 rows;
  - ejected pages (L3) with three-way merge;
  - optimistic concurrency (ETag/409).
- **Validation is metadata-derived**, mirroring spike 10's rules. The beyond-Laravel request (generated Zod schemas and `client.gen.ts`, for live validation) waits on spike 10 and spike 12 emitting them. The form already routes server 422s field by field, so swapping in Zod is local to `form-values.ts`.
- **Permissions are a stub** (`demoPolicy`). Hiding is not security: the API must refuse, and spike 10 has no auth yet.
- **Owned files are config only** (thin by design). Pages come from the package. An owned page override (L2/L3) was not prototyped.
- **The mock does not model `ON DELETE CASCADE / SET NULL`.** The `users` resource still gets a screen here because the blog uses it as the author relation. Security review F-01.3 says `users` should become an owned controller, not an auto resource.
- **The bundle is 874 kB** (261 kB gzip) with no code splitting; Recharts is most of the growth. TanStack Router's lazy routes would split the dashboard and its charts from the CRUD screens.
- **Colour contrast in a real browser** (axe in Playwright) is still to do. The palette maths is tested, but rendered states such as translucent hovers over images are not.

## Recommendation

1. **Adopt "runtime-rendered, config-owned"** as specified:
   - `ui:sync` hooked to `schema.migrated`;
   - `.strutvane/ui.gen.ts` (machine);
   - `resources/ui/<route>.ui.ts` (owned, written once);
   - `.strutvane/ui.lock.json` (machine, committed).

   Use the `auto({ except, order })` options syntax (Finding 1).
2. **Ship these as `@strutvane/ui` code with these regression tests:**
   - the static owned-file reader;
   - create-once writes;
   - stable table cell renderers (Finding 4);
   - the ungrouped-first sidebar (Finding 5);
   - the untouched-slug rule (Finding 6);
   - the exposure rules shared with the API (Finding 10).
3. **Spike 10 / the framework should add:**
   - `filter[trashed]`, `restore`, `internal` and `secret` flags in `resources.json`;
   - reserved slug words;
   - the `options`/`count`/`search` endpoints later;
   - per-role readable fields for error hints (F-13).
4. **Adopt `DESIGN.md` as the UI standard.** Every package with screens copies the no-literal-colour and contrast tests and runs axe on its screens.
5. **Next:** Playwright + axe contrast in both themes; owned page overrides (L2/L3) with the ADR-0012 merge; Zod-driven live validation once spike 10 emits schemas.
