# Spike 16: charts (`@strutvane/charts`)

**Date:** 2026-11-14.

**Environment:** Windows 11, Node v24.21.0, npm 11.19 (not pnpm), TypeScript 6.0.3, React 19.3.1, Vite 8.3.8, Tailwind 4.3.5, Recharts 3.10.1, Tabler Icons 3.50.0, Vitest 5.1.0 + jsdom 31 + Testing Library, axe-core 4.14.0, oxc-parser 0.158.0, PGlite 0.5.16, `node:sqlite`.

```bash
cd spikes/16-charts
npm install
npm test             # tsc --noEmit (incl. type-level tests) + vitest run (181 tests)
npm run build        # tsc --noEmit + vite build of the demo
npm run charts:sync  # regenerate example/.strutvane/charts.gen.ts + lock from resources.json
npm run dev          # demo on http://localhost:5173, served by the REAL aggregate handler on SQLite
```

## Question

> Can every resource get **useful charts suggested from `resources.json`**, kept in an **owned `charts.ts` file** that regeneration never overwrites, drawn as **themed, accessible React charts**, and fed by **one strict aggregate endpoint** that only touches declared fields, respects **policies and tenancy**, buckets dates identically on **every engine**, and can **hide small groups** of sensitive data?

## Answer

**Yes.** All five parts work end to end, on SQLite and PostgreSQL (PGlite) with identical numbers, and MySQL's SQL is pinned:

1. **Library: Recharts 3** (below), behind our own components, so it can be swapped.
2. **Components:** line, area, bar (stacked, grouped, horizontal), pie/donut, sparkline, KPI card with trend, and a dashboard grid. Colours come only from CSS variables (spike 14's tokens; a test rejects literals). Loading, error, empty and "hidden for privacy" states, a data-table fallback, `role="img"` charts with `<title>`/`<desc>`, keyboard focus and arrow keys. axe-core: **0 violations** on 6 screens and states.
3. **Suggestions + owned config:** `charts:sync` turns `resources.json` into suggestions (KPI, records per period, counts per enum/boolean, stacked split, sum/avg of decimals, top N by belongsTo). Each resource gets `resources/charts/<route>.charts.ts`, written **once** (`wx`). `widgets: auto()` picks up new suggestions after a migrate. An explicit list is never rewritten; `charts:sync` reports what it would have added. Field names and suggestion ids are type-checked, and a dropped column becomes `TS2322` (real compiler test).
4. **Endpoint:** `GET /api/v1/<resource>/aggregate` with strict validation. Unknown parameters are refused, fields must be on an allow-list, values are parsed per type, ranges are aligned, and there are at most 400 buckets. It runs through a scope with spike 11's tenant rule (a top-level `tenant = ?` AND, checked before rendering), plus policy `viewAny` and row scope, and the PostgreSQL RLS second layer.
5. **Security:** secret, hidden, tenant, internal, `aggregatable: false` and `personal` columns are never aggregatable. Attack tests show tenant A never sees tenant B. Small-group suppression with **complementary** suppression. 2,000 fuzzed requests: 0 server errors. Rate limits are below.

## 1. Chart library (checked 2026-11-14)

Each library drew the same bar + line + pie chart, bundled with esbuild 0.28.2 (minified, production React). The numbers are **gzip deltas over a React-only baseline of 67.5 kB**. Licences and types come from the installed `package.json` files.

| | Recharts 3.10.1 | Apache ECharts 6.1.0 | Chart.js 4.6.1 + react-chartjs-2 5.3.1 | visx 4.0.0 | Nivo 0.99.0 |
|---|---|---|---|---|---|
| Licence | MIT | Apache-2.0 | MIT | MIT | MIT |
| Size (gzip, over React) | +115 kB | +187 kB (tree-shaken core, SVG renderer) | **+60 kB** | +63 kB | +118 kB |
| Rendering | SVG (React components) | canvas or SVG (imperative `setOption`) | **canvas only** | SVG primitives | SVG/canvas/HTML |
| CSS-variable theming | **direct** (`fill="var(--chart-1)"`) | JS theme object; must resolve variables (canvas can't read them) | JS options; must resolve variables | direct | theme object |
| Accessibility | `accessibilityLayer` (default on in v3): focusable surface, arrow keys move the tooltip; `title`/`desc` props | `aria` option generates a description; canvas has no DOM | canvas: nothing to read; needs our own fallback | nothing built in; you build it | some ARIA props; no keyboard |
| SSR | renders SVG markup | server-side SVG via a separate API | no (canvas) | yes | `@nivo/static` |
| TS types | bundled | bundled | bundled | bundled | bundled |
| Fit | React-native API, responsive container, stacked/grouped/horizontal built in | powerful, but imperative, large and canvas-first | smallest, but canvas defeats tokens and a11y | smallest SVG option, but everything (axes, tooltips, legends, keyboard) is ours to build | heavy (react-spring), slow-moving release cadence |

**Choice: Recharts.** It's the only option that gives SVG with CSS variables (so light/dark and a brand-hue change re-theme charts with no JS), keyboard navigation out of the box, and a React-component API. Spike 14 already depends on it (DESIGN.md §10), so the admin ships one charting library. The cost is ~55 kB gzip more than Chart.js or visx. That's acceptable for an admin bundle and recoverable with lazy chunks (catalogue request U9). **visx is the fallback** if size ever matters more than build time. Our components hide the library (they take `ChartData`, not Recharts props), so a swap stays local to `src/ui/components/charts.tsx`.

## 2. Interfaces

### The aggregate endpoint

```text
GET /api/v1/<resource>/aggregate
  ?metric=count|sum|avg            required (no min/max: they return one row's exact value)
  &field=<numeric>                 required for sum/avg, refused for count
  &groupBy=<date|enum|boolean|belongsTo field>
  &interval=day|week|month         required iff groupBy is a date; weeks start Monday (ISO)
  &splitBy=<enum|boolean>          second dimension (stacked/grouped); not with a top N
  &dateField=<date>                what from/to limit (default: groupBy date, else created_at)
  &from=YYYY-MM-DD[THH:MM:SSZ]&to=…  UTC, from inclusive, to exclusive, aligned to whole buckets, years 1900–9998
  &limit=1..50                     top N for belongsTo groups (default 10); the rest → "__other__"
  &filter[field][op]=value         spike 10's list filters (eq ne in gt gte lt lte contains startsWith null)
```

```jsonc
// 200 application/json, Cache-Control: private, no-store
{
  "data":   [{ "key": "2026-11-01", "values": { "paid": 4, "draft": null }, "suppressed": ["draft"] }],
  "series": [{ "key": "draft" }, { "key": "sent" }, { "key": "paid" }, { "key": "void" }],   // [{ "key": "value" }] without splitBy
  "meta":   { "resource": "invoices", "metric": "count", "field": null, "groupBy": "created_at", "groupKind": "date",
              "interval": "month", "splitBy": "status", "splitKind": "category", "dateField": "created_at",
              "from": "2025-12-01T00:00:00.000Z", "to": "2026-12-01T00:00:00.000Z", "timezone": "UTC",
              "minGroupSize": null, "suppressedCells": 0, "truncated": false }
}
```

- **Keys:** bucket start `YYYY-MM-DD` for dates (every bucket in the range, zero-filled); enum options in schema order (zero-filled); `true`/`false`; related ids; `__other__`, `__none__` (NULL) and `__total__` (no groupBy). Labels are the browser's job, in its locale.
- **Values:** count is an integer; sum is rounded to the column's scale; avg is `null` when there is nothing to average, rounded to scale + 2.
- **Errors** (RFC 9457 problem+json, spike 12's shape):
  - **404** `not_found`: unknown, internal and `aggregates: false` resources all get the identical body;
  - **403** `forbidden` (checked before validation, so field names never leak to someone without `viewAny`) and `tenant_required`;
  - **422** `invalid_aggregate`, with every `issues[]` at once, each with a fix, listing allowed names only (F-13);
  - **405** for anything but GET;
  - **500** generic for bugs and unscopable tables (details go to `onError`).

### The owned chart file: `resources/charts/<route>.charts.ts`

```ts
import { auto, defineResourceCharts } from '#strutvane/charts'      // product: '@strutvane/ui/charts'
export default defineResourceCharts('invoices', {
  widgets: [                                                       // or auto({ except, order }): follows the schema
    { id: 'invoices.revenue', kind: 'stat', title: 'Revenue', metric: 'sum', field: 'total', date: 'issued_on', days: 30 },
    'invoices.new',                                                // a suggestion id (typed union)
    { id: 'invoices.paid-vs-unpaid', kind: 'bar', title: 'Invoiced per month, paid and unpaid', metric: 'sum',
      field: 'total', groupBy: 'issued_on', interval: 'month', range: { last: 6, unit: 'month' }, splitBy: 'paid', size: 'lg' },
    'invoices.by-status', 'invoices.top-customer',
  ],
  dashboard: ['invoices.revenue', 'invoices.new', 'invoices.by-status'],   // auto() = KPI + first category chart; false = none
  aggregates: auto(),                                              // server allow-list; { numeric: [...], groupBy: [...] } narrows; false = off
  privacy: { minGroupSize: 5 },                                    // sensitive data: hide groups of 1..4 (and their complements)
  sort: 1,                                                         // order on the home dashboard
})
```

**Typing.** `.strutvane/charts.gen.ts` augments `ChartsRegistry` with `{ numeric; date; category; relation; suggestion }` unions per resource. Discriminated unions make these compile errors:
- `metric: 'sum'` without a numeric `field`;
- `field` on `count`;
- `interval` on a non-date group, or a date group without one;
- `splitBy` that isn't an enum or boolean;
- `limit` on a non-relation group;
- an `avg` KPI;
- a foreign id prefix;
- secret, tenant or unknown names.

**Ownership.** `charts.gen.ts` and `charts.lock.json` are machine-owned (atomic writes). Owned files are created once with `wx`, and are never overwritten or recreated.

**Reading owned files.** The generator reads them **statically** with oxc and never runs app code (ADR-0010). At runtime, `resolve.ts` re-checks everything and **drops and reports** anything invalid, failing closed (an invalid `minGroupSize` becomes 10, not off).

### Dashboards and the sidebar

- **Home dashboard:** `homeDashboardWidgets(resolved, canViewAny)` gives each resource's `dashboard` picks, ordered by `sort` then label. It hides resources the user can't `viewAny`.
- **Insights tab:** all of a resource's widgets (`/<route>?tab=insights`).
- **Named dashboards** (a package's provider, in `boot()`):

  ```ts
  app.dashboards.add(defineDashboard({ name: 'sales', label: 'Sales', permission: 'dashboards.sales',
    widgets: ['invoices.revenue', 'customers.new', 'invoices.top-customer'] }))
  ```

  `dashboardNavigation()` turns each one into a spike-14 sidebar entry: `{ name: 'dashboards.sales', label, path: '/dashboards/sales', icon: 'chart-bar', group: 'Dashboards', permission }`. It's shown only with the permission. Widgets of resources the user can't list are dropped, and unknown ids are reported through `onMissing`.

## 3. Evidence

`npm test` exits 0: `tsc --noEmit` plus **11 files, 181 tests** (2026-11-15). `npm run build` exits 0. The full suite was run 5 times in a row green after the Windows fix in Finding 6.

| File | Tests | What it proves |
|---|---|---|
| `server/aggregate.test.ts` | 36 (18 × SQLite, PGlite) | **Same rows, same expected numbers on both engines.** Counts by enum (zero-filled, soft-deleted row excluded); booleans as `true`/`false` (1/0 vs `t`/`f`). **Boundaries:** the last millisecond of September and midnight on 1 October land in different months; Sunday 23:59:59 and Monday 00:00 in different weeks. Avg skips NULL. A DATE column, empty days zero-filled, the default 12-month window. A stacked split. A top N with ties broken by key, plus an exact "other". Filters: `in`, decimal `gte`, `contains` with `%` as a literal, NULL-safe `ne`. The policy row scope. 403 without `viewAny` (no field names leaked). A 422 listing every issue. `no-store`. 405. |
| `server/security.test.ts` | 30 | **Tenant A never sees B** (1,000,000-sized values) through totals, groups, days, top N, splits, "other", avg. B sees exactly its own. The tenant column can't be grouped, filtered or summed. No tenant gives 403. A global table works; an unscopable one gives a generic 500. **RLS second layer on PGlite:** raw SQL with *no* WHERE, run as tenant A under a non-owner role, sees only A's 16 rows, and 0 rows with no tenant. **Choke point:** a missing or other-tenant condition throws before rendering. The secret-looking `api_key` and hidden `password` are refused and never listed in hints. Internal and unknown resources get identical 404s. No policy gives 403; a broken policy scope gives 500 (never "all rows"); guests never fall through a row-scoped policy. **Suppression (k = 5)** on both engines: groups of 1–4 hidden, 0 shown, complementary hiding, an ungrouped total, sums and averages counted by the rows that carry a value, every filter refused and sub-day windows widened to whole days (a differencing-attack test). **Fuzz:** 2,000 seeded random queries give only 200/422, no 500, no `onError`. |
| `server/validate.test.ts` | 32 | Typed plans (aligned ranges, LIKE escaping, `filter[x]=v` means eq). 23 refusal cases, each naming the parameter. Messages say how to fix and list allowed names only. Privacy filter rules. The suppression grid: primary, 2-D complementary until stable, zero never hidden. |
| `server/dialects.test.ts` | 16 | The JS calendar reference. SQLite `strftime` buckets match it for 7 boundary instants × day/week/month. **PostgreSQL matches in Los Angeles *and* Kiritimati (UTC+14) session zones**, for `timestamptz` and `date`. The naive `date_trunc` without `AT TIME ZONE 'UTC'` puts 1 October 00:00 UTC in September (shown). **MySQL SQL pinned:** backticks, `?`, `WEEKDAY()` Monday weeks, `NOT (a <=> ?)`, DATETIME without `Z`, booleans 1/0. `NULLS LAST` on PostgreSQL top N. Identifier guard. |
| `shared/charts.test.ts` | 19 | The capability rules (no id, tenant, `deleted_at`, secret, hidden, `aggregatable: false` or `personal`; internal targets skipped). Deterministic suggestions; donut ≤ 6, else bar. Every suggestion passes its own server allow-list. Resolution fails closed (5 bad names give 5 issues, nothing widened). Custom widget rules. KPI windows. Privacy fallback. `aggregates: false`. Home dashboard order and `viewAny`. Named dashboards become sidebar entries. Friendly definition errors. The wire format. |
| `shared/types.test.ts` | 3 | **Type-level** (compiled by `tsc`): the registry unions, plus 14 `@ts-expect-error` misuse cases (listed under Typing above). |
| `generator/sync.test.ts` | 10 | First sync scaffolds 4 owned files (none for internal `sessions` or empty `tags`; no secret names in the generated file). Idempotent; dry run writes nothing. **The committed example equals fresh output.** Customise, then migrate: owned files stay byte-identical; `+ New suggestion customers.by-region is shown`; `! New suggestion invoices.sum-discount is NOT shown … Add 'invoices.sum-discount'`. **Drop `total`:** reported, and the **real TypeScript compiler** fails on the owned file (clean before). A deleted file isn't recreated; a damaged lock never re-scaffolds; orphans are kept and reported; the static reader handles auto, explicit and unreadable forms (`a.ts:3`). |
| `ui/widgets.test.tsx` | 11 | React on the **real handler**: skeleton (`aria-busy`), then `role="img"` named by `<title>`, `tabindex=0`, a `<desc>` summary, and a hidden table with the exact numbers. "Show as a table" toggles (`aria-pressed`). The interval switch refetches the exact URL. Stacked series columns. The KPI says "Up 33% from the previous 30 days" (`text-success`). Relation labels plus "Other". A proxy's HTML 502 becomes a friendly message, and Retry recovers. 403 and 422 messages. All zeros gives the empty state. Suppressed cells read "Hidden (too few records)", with a privacy note. |
| `ui/a11y.test.tsx` | 9 | **axe 0 violations:** a full resource dashboard (every kind), the home dashboard with suppression, loading/error/empty, the visible table, the demo shell in dark mode on the named dashboard. **Keyboard:** Tab goes interval → table toggle → chart; ArrowRight on a focused chart shows the tooltip. Shell entries, and theme switching with throwing storage. |
| `ui/pure.test.ts` | 10 | UTC bucket labels, key labels, number formats, summaries (privacy sentence), token colours for "Other", KPI windows (a suppressed day hides the total), relative ranges (incl. 31 January), widget queries, friendly client errors. |
| `ui/design-tokens.test.ts` | 2 | No colour literals or Tailwind palette classes in `src/ui`/`src/demo`; every chart token is defined for light and dark. |

**Screenshots (described):** taken in the browser pane against `npm run dev` (real handler, seeded SQLite, dark system theme, 1360×900).
- **Dashboard:** a left menu (Dashboard; INSIGHTS: Invoices, Customers, Employees, Users; DASHBOARDS: Sales). The page header has a three-button theme switch.
- **Row 1:** two KPI cards. "Revenue 154,352.88, ↗ Up 1% from the previous 30 days" (green) with a purple sparkline, and "New invoices 123, ↘ Down 4%" (red).
- **Row 2:** "Invoiced per month, paid and unpaid", grouped bars in two token colours over 6 months, with a Day/Week/Month switch and a table toggle. Next to it, "Invoices by status", a donut with 891 in the centre and a legend with counts and percentages.
- **Row 3:** "Top customers by invoices" (horizontal bars with customer names), "New customers" and "Customers by country".

The project lead judged the look not premium. The visual direction is being re-decided in spikes 17–19, so the visuals here are **placeholders**. Every colour, radius and shadow is a token, so the chosen design re-skins the charts without code changes.

## 4. Findings

1. **PostgreSQL buckets depend on the session time zone** unless timestamps go through `AT TIME ZONE 'UTC'`. Proven: midnight on 1 October UTC is "September" for a Los Angeles session. DATE columns are cast to `timestamp` so they never pass through `timestamptz`.
2. **Every engine needs its own week rule.** SQLite uses `'weekday 0', '-6 days'`, PostgreSQL uses `date_trunc('week')` (ISO), and MySQL uses `DATE_SUB(DATE(x), INTERVAL WEEKDAY(x) DAY)`. MySQL's `WEEK()` default mode starts weeks on Sunday, so it's avoided. All are checked against one JS reference on 7 boundary instants.
3. **PostgreSQL sorts NULL first in `DESC`**; SQLite and MySQL sort it last. Without `NULLS LAST`, a related record whose amounts are all NULL would take a top-N slot on PostgreSQL only.
4. **A real bug found by a test:** a global table with no filters rendered `… AS t WHERE` (an empty WHERE) and returned 500. Fixed by omitting WHERE when there are no conditions.
5. **A real bug found by the fuzz test:** `to=9999-12-31` aligned forward becomes `+010000-01-01T…`, which no engine parses, and `0001` became `1901` through `Date.UTC`. Accepted years are now 1900–9998.
6. **A Windows defect:** replacing `charts.gen.ts` failed with `EPERM` on `rename` about one full-suite run in four, when another process had the file open for a moment. Five short retries for EPERM/EBUSY/EACCES fix it (5/5 runs green). The productised writer (spike 14's too) needs the same retry.
7. **`count < k` suppression alone leaks through totals.** One hidden cell equals "total − visible". Complementary suppression (hide the next-smallest cell in the same row/column, until stable) is needed, and `min`/`max` are left out because they *are* one row's value.
8. **Filters are a differencing attack** on sensitive resources. `filter[name][eq]=…` + count singles a person out, and even `filter[department][eq]=sales` returns the complementary partner of a hidden cell on its own, so "total − the rest" recovers it. With privacy on, every filter is refused (422 `not_allowed_with_privacy`) and an ungrouped from/to window is widened to whole UTC days.
9. **The order of checks matters:** policy (403) before validation (422). A 422 lists allowed field names, which someone without `viewAny` shouldn't learn. Unknown, internal and disabled resources share one 404 body.
10. **Recharts in jsdom** draws nothing: `ResponsiveContainer` measures 0×0 with `getBoundingClientRect`. A test-only shim sizes `.recharts-responsive-container`. Recharts 3 keeps `tabIndex=0` when `role="img"` is passed, and its arrow-key tooltip works under Testing Library.
11. **The browser and the server must resolve the same allow-list,** or suggested charts get 422s. One `resolveCharts()` runs on both. The browser gets trimmed metadata (no secret column names); the server reads the full `resources.json`.

## 5. Limits and next steps (not verified here)

- **MySQL was not executed** (SQL text only). Spike 11's Docker helper can run the same suite. Expect `DATE_FORMAT` on `DATETIME` to be exact under the pinned `+00:00` session, and `TIMESTAMP` columns to convert through it.
- **Time zones:** buckets are UTC. A per-user zone (`tz=Europe/Berlin`) needs per-engine conversions (`AT TIME ZONE` / `CONVERT_TZ`, which needs MySQL's tz tables / SQLite has no tz database) and DST-aware JS bucket keys. Designed, not built. The catalogue's F7 asks for `tz`.
- **Rate limits** (to implement in the product):
  - `throttle:aggregate`, 30 requests/min per user and 120/min per tenant (spike 12's limiter; IPv6 /64);
  - weighted cost for day buckets and top N (F15 `limiter.consume(key, cost)`);
  - statement timeout per engine (`SET LOCAL statement_timeout = '3s'`, MySQL `MAX_EXECUTION_TIME(3000)` hint, SQLite `interrupt()`);
  - a cache keyed by **tenant + actor scope + query** (never shared across tenants; F16).
  - Pages refresh every widget at once, so a dashboard of 8 widgets is 8 requests; a batch endpoint is a natural follow-up.
- **Suppression limits:**
  - Overlapping date ranges or interval changes can still be differenced. That's acceptable for "don't show 1–4 people" and not a formal guarantee (no noise or differential privacy).
  - Zero counts are shown.
  - The complementary step is per line, not a global optimiser.
- **Indexes:** bucketing by an expression can't use an index for grouping; the range filter can. Large tables want `(tenant_id, created_at)` indexes; spike 10 should emit them for `timestamps()`.
- **Relation labels** come from an injected resolver (the demo uses static names). The product should use spike 14's list endpoint (`filter[id][in]=…`, policy-checked). The top N reveals related **ids** the user may not view, which the list endpoint's `filter[customer_id]` already reveals too.
- **Bundle:** the demo is 686 kB / 200 kB gzip (React + Recharts + metadata), with no code splitting.
- **Visuals:** see Screenshots. A real-browser contrast/axe run (Playwright) is still to do.

## Recommendation

1. **Adopt Recharts behind our own `ChartData` components** in `@strutvane/ui/charts` (seeded by spike 14's `charts.tsx`). Keep the table fallback, `role="img"` + `<title>`/`<desc>`, and the token-only rule.
2. **Adopt the aggregate contract above** as the framework's `ResourceService.aggregate` (catalogue F1/F7), with:
   - the allow-list from `resolveCharts` (resources.json + owned file);
   - policy before validation;
   - the spike-11 tenant choke point;
   - `NULLS LAST`, `AT TIME ZONE 'UTC'` and the per-engine week rules (Findings 1–3);
   - empty-WHERE and year-range guards;
   - small-group plus complementary suppression.
3. **Adopt `charts:sync`** on the `schema.migrated` hook with the create-once owned file, the lock, and the rename retry (Finding 6).
4. **Next:** run the suite on real MySQL 8.4; add a `tz` parameter; add rate limits and a statement timeout; add a batch endpoint for dashboards; re-skin to the chosen design (spikes 17–19).
