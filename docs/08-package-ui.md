# 08 — Package Spec: `@strutvane/ui`

> **Status:** planning.
> **Depends on:** `@strutvane/contracts`.
> **Works with:** `@strutvane/framework` (rich metadata) or **any OpenAPI 3.x API**.
> **Canonical decision:** D14 in [00](00-executive-summary.md).

## 1. Goals

1. **Zero-file CRUD UI.** A model registered in the backend gets list, create, edit and detail pages, a menu entry and search, with no UI code written (L0).
2. **Total control, progressively.** Configure (L1), override one column, field, slot or page (L2), or eject everything (L3). There is never a dead end.
3. **Owned design system.** Components are *copied into the app* (shadcn-compatible registry). Teams restyle or replace them entirely; there is no locked-in theme package.
4. **Backend-aware but backend-agnostic.** It uses `/.well-known/strutvane.json` when available and degrades to OpenAPI inference for third-party APIs.
5. **Enterprise UX baseline:**
   - WCAG 2.2 AA, i18n and RTL, dark mode
   - keyboard-first, with a command palette
   - saved views, bulk actions, export
   - audit "Activity" tabs
   - tenant switcher
6. **Fast.** Per-resource code splitting, virtualised tables, cached queries, and a first load under 200 KB gzip for the shell (budget).

**Non-goals:**

- A drag-and-drop page builder (possibly later, as a client of the same metadata).
- A runtime-only admin with no source the developer can edit.

## 2. Architecture

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ web/ (owned app code)  pages overrides · components/ui · layouts · theme       │
├───────────────────────────────────────────────────────────────────────────────┤
│ @strutvane/ui/react      Renderer: <ResourceList/Form/Show>, layouts, widgets,  │
│                          field-widget registry, slots, hooks (useResource,     │
│                          useList, useForm, useCan), TanStack Router integration│
├───────────────────────────────────────────────────────────────────────────────┤
│ @strutvane/ui/core       Framework-agnostic headless core:                     │
│  · manifest loader (strutvane.json | OpenAPI inference | ui.resources.ts)      │
│  · resource registry  · data client (ListQuery protocol, Problem errors)       │
│  · query/filter/sort/pagination state machines (URL-synced)                    │
│  · permission helpers (AccessProvider)  · form schema from field metadata      │
│  · providers: data, auth, access, router, i18n, notification                   │
├───────────────────────────────────────────────────────────────────────────────┤
│ @strutvane/contracts     ResourceManifest · ListQuery · QueryFilter · Problem   │
└───────────────────────────────────────────────────────────────────────────────┘
```

- `@strutvane/ui/core` has **no React dependency**, so future Vue and Svelte renderers reuse it whole.
- Server state goes through **TanStack Query** (core uses `@tanstack/query-core`). Tables use **TanStack Table v9**, forms **TanStack Form**, routing **TanStack Router**.
- The typed client comes from `.strutvane/client.gen.ts` in full-stack projects (end-to-end types), or from OpenAPI codegen in UI-only mode.

### 2.1 Technology stack

| Concern | Choice | Notes |
|---------|--------|-------|
| Framework | React 19.x | Concurrent features, `use`, Actions |
| Build/dev | Vite 8 (Rolldown) | Same dev server as the API in full-stack mode (one port) |
| Routing | TanStack Router | Type-safe, file + code routes, search-param state |
| Server state | TanStack Query 5 | Caching, optimistic updates, invalidation per resource |
| Tables | TanStack Table v9 (headless) + TanStack Virtual | Virtualised rows/columns |
| Forms | TanStack Form + Standard Schema (Zod 4) | Same validation rules as the API |
| Styling | Tailwind CSS 4 + CSS-variable design tokens | Themes are just token files |
| Primitives | **Base UI** (`@base-ui/react`) by default; Radix option | Matches the shadcn CLI v4 default; configurable per project |
| Component distribution | shadcn CLI v4 compatible **registry** (`@strutvane/*` namespace) | `sv ui:add data-table` = `shadcn add @strutvane/data-table` |
| Icons | Lucide (default), swappable | Icon names in metadata (`ui.icon: 'receipt'`) |
| Charts (dashboards) | Recharts or ECharts via adapter | Widgets are registry components |

## 3. Metadata-driven pages (L0)

For each resource in the manifest the renderer auto-registers routes:

| Route | Page | Features |
|-------|------|----------|
| `/<resource>` | **List** | Data table, global search, filter builder + quick filter chips, multi-column sort, column show/hide/reorder/resize/pin, density, cursor or offset pagination, row selection, **bulk actions**, **export** (CSV/XLSX, server-side), **saved views** (per user, shareable per tenant), empty/error/loading states, URL-synced state |
| `/<resource>/new` | **Create form** | Widgets inferred from field types, sections/tabs from metadata, relation pickers with async search, client validation from the same schema, server `fieldErrors` mapped to fields, unsaved-changes guard |
| `/<resource>/:id/edit` | **Edit form** | As above + optimistic concurrency (ETag / `updatedAt` check), field-level read/write masks |
| `/<resource>/:id` | **Detail** | Field groups, relation tabs (`hasMany` / `manyToMany` as embedded lists), **Activity tab** (audit events), custom action buttons, prev/next navigation |
| `/` | **Dashboard** | Widget grid: stat, chart, recent records, "my tasks". Configured in `web/dashboard/` or per role. |
| global | **Search & command palette** | `Ctrl/⌘ K`: navigate, search across `searchable()` fields of permitted resources, run actions |

**Everything is permission-aware.** Menu items, buttons, columns, fields and actions are hidden or disabled using `AccessProvider`, which is fed by the manifest and `/auth/me`. The API still enforces every rule.

### 3.1 Field type → widget map (defaults)

| Field type | Form widget | List cell | Filter operators |
|------------|-------------|-----------|------------------|
| `string`, `slug` | Text input | Text (truncated, tooltip) | eq, contains, startsWith, in |
| `text` | Textarea (auto-grow) | Truncated text | contains |
| `richText` / `markdown` | Rich-text editor (Tiptap adapter) / Markdown editor with preview | Plain-text excerpt | contains |
| `email` / `url` / `phone` | Typed input + validation | Mailto / link / tel link | eq, contains |
| `password` | Password + strength meter (write-only) | — (never listed) | — |
| `integer`, `decimal`, `float` | Number input (locale-aware) | Right-aligned number | eq, lt, lte, gt, gte, between |
| `money` | Currency input | Formatted currency | between, gt, lt |
| `percent` | Number + % suffix | Percentage / mini bar | between |
| `boolean` | Switch | Badge / check icon | is true / false |
| `enum` | Select (≤ 7 options: radio group) | Coloured badge (`ui.colors`) | in, notIn |
| `set` | Multi-select / checkbox group | Badge list | containsAny, containsAll |
| `date` / `time` / `datetime` | Date / time / datetime picker (TZ-aware) | Locale-formatted, relative tooltip | before, after, between, presets ("last 7 days") |
| `duration` | Duration input | Humanised | between |
| `json(schema)` | Generated sub-form from schema; raw JSON editor fallback | Key summary | — (custom) |
| `array(of)` | Repeater | Count / chips | containsAny |
| `address` / `geoPoint` | Address fieldset / map picker (adapter) | One-line address / coordinates | within radius (PG + PostGIS, later) |
| `belongsTo` | Async combobox (searches the related resource's `title`) | Link to the related record | eq, in |
| `hasMany` / `manyToMany` | Inline table editor / multi-combobox | Count with popover | has, hasNone |
| `file` / `image` / `files` | Dropzone with preview (future files package) | Thumbnail / file chip | — |
| `color` | Colour picker | Swatch | eq |
| `computed` / `virtual` | Read-only display | As underlying type | as underlying type |

Custom field types registered in the backend (`money`, `phone`, …) ship a matching widget through the **field-widget registry** (§6.2).

## 4. Layouts, navigation and auth screens

- **Default app layout:**
  - collapsible sidebar (groups from `ui.group`, icons, badges)
  - topbar with global search, notifications slot, **tenant switcher**, theme toggle and user menu
  - breadcrumbs and page header with actions
- **Alternative layouts** (registry): `topnav`, `split` (list + detail side panel), `minimal` (auth pages).
- Layouts are owned files in `web/layouts/`. Swapping or editing them is ordinary React.
- **Auth screens**, installed when `@strutvane/auth` exists or with `sv ui:add auth-screens` against any `AuthProvider`:
  - login · register · forgot / reset password · verify email · magic-link sent
  - MFA challenge · MFA enrolment · passkeys
  - profile · sessions · API tokens
  - admin users · roles & permission matrix · tenant / organisation settings · members · invitations · audit explorer
  - an impersonation banner
- **Error pages:** 403 (with "request access" slot), 404, 500 (with trace id), offline.

## 5. Theming and design systems

**Design tokens** are CSS custom properties in `web/theme/tokens.css`, consumed by Tailwind 4 `@theme`:

```css
@theme {
  --color-primary: oklch(0.55 0.18 255);
  --color-primary-foreground: oklch(0.98 0 0);
  --radius-md: 0.5rem;
  --font-sans: "Inter Variable", system-ui, sans-serif;
  --density-row: 2.5rem;
}
.dark { --color-primary: oklch(0.70 0.15 255); /* … */ }
```

- **Themes** are token files:
  - `sv ui:theme create corporate`
  - `sv ui:theme apply corporate`
  - per-tenant theming (logo, primary colour) is loaded at runtime from tenant settings
- **Swap the design system:**
  - Components in `web/components/ui` are plain owned React + Tailwind.
  - Replace them (company design system, MUI, Mantine, Ant) by re-pointing the **component map**: `defineUi({ components: { Button: AcmeButton, DataTable: AcmeTable } })`.
  - Renderers only depend on the component map's interfaces, never on concrete files.
- **Dark mode:** system preference with a stored override (class strategy).
- **Density:** comfortable / compact, per user.
- **Branding:** app name, logo, favicon and login illustration via `config/ui.ts` and env (`VITE_APP_NAME`).

## 6. Customisation levels (L1–L3)

### 6.1 L1 — Configure (backend `ui:` options or `web/ui.config.ts`)

```ts
// app/resources/invoice.resource.ts (backend; published in the manifest)
ui: {
  icon: 'receipt', group: 'Billing', label: { singular: 'Invoice', plural: 'Invoices' },
  list:   { columns: ['number', 'customer', 'amount', 'status', 'dueDate'], defaultSort: '-dueDate',
            quickFilters: ['status'], bulkActions: ['delete', 'export', 'send'] },
  form:   { sections: [{ title: 'Details', fields: ['number', 'customer', 'dueDate'] },
                       { title: 'Amounts', fields: ['amount', 'status'] }] },
  show:   { tabs: ['lines', 'activity'] },
  colors: { status: { draft: 'gray', sent: 'blue', paid: 'green', void: 'red' } },
}
```

### 6.2 L2 — Override one piece

File conventions are auto-registered: no imports and no route wiring.

```
web/pages/invoices/columns.tsx    → override individual list cells
web/pages/invoices/fields.tsx     → override individual form widgets
web/pages/invoices/list.tsx       → replace the whole list page (receives the default as a prop)
web/pages/invoices/form.tsx       → replace create/edit form
web/pages/invoices/show.tsx       → replace detail page
web/pages/invoices/actions.tsx    → custom action UI (dialogs, wizards)
web/pages/reports/revenue.tsx     → brand-new custom page, auto-routed at /reports/revenue
```

```tsx
// web/pages/invoices/columns.tsx — override one cell, keep everything else
import { defineColumns } from '@strutvane/ui/react'
export default defineColumns('invoice', {
  amount: ({ row }) => <Money value={row.amount} currency={row.currency} />,
  status: { cell: ({ value }) => <StatusPill value={value} />, width: 120 },
})
```

```tsx
// web/ui.config.ts — global field-widget registry (applies to every resource)
import { defineUi } from '@strutvane/ui/react'
export default defineUi({
  widgets: { money: MoneyInput, phone: PhoneInput, richText: AcmeEditor },
  slots: { 'topbar.right': <HelpButton />, 'invoice.show.header': InvoiceStatusTimeline },
})
```

```tsx
// web/pages/invoices/list.tsx — wrap the default page instead of rewriting it
import { ResourceList, type ListPageProps } from '@strutvane/ui/react'
export default function InvoiceList(props: ListPageProps<'invoice'>) {
  return (<><OverdueBanner /><ResourceList {...props} toolbar={{ extra: <ImportButton /> }} /></>)
}
```

**Slots** are named extension points on every page: `<resource>.list.toolbar`, `<resource>.form.footer`, `<resource>.show.sidebar`, `layout.sidebar.footer`, `topbar.right`, `dashboard.widgets`, and more.

### 6.3 L3 — Eject

```bash
pnpm sv eject ui Invoice --page form    # writes full, readable source of the form page
pnpm sv eject ui Invoice                # list + form + show
pnpm sv eject ui --components           # all renderer components into web/components/strutvane
```

Ejected files are tracked in `.strutvane/lock.json`. `sv upgrade` applies template updates by three-way merge and never silently overwrites.

## 7. Components as an owned registry

- Distributed via a **shadcn CLI v4 compatible registry** under the `@strutvane` namespace (`components.json` registries config).
- `sv ui:add <item>` wraps `shadcn add @strutvane/<item>` and also records the item in `.strutvane/lock.json`.
- **Registry items:**
  - `data-table`, `filter-builder`, `resource-form`, `relation-picker`, `date-range-picker`
  - `money-input`, `command-palette`, `saved-views`, `activity-feed`, `stat-card`, `chart-card`
  - `tenant-switcher`, `auth-screens`, `layouts/*`, `themes/*`
- Copied files live in `web/components/ui/` and are **owned**: edit freely.
- `sv ui:diff <item>` shows upstream changes. `sv ui:update <item>` merges them with three-way merge.
- Organisations can publish their **own registry** (an internal design system). `config/ui.ts → registries: ['@acme']` makes `sv ui:add @acme/button` work.

## 8. UI-only mode (any OpenAPI API)

```bash
npm create strutvane@latest backoffice -- --preset ui
# prompts: API base URL, OpenAPI URL, auth type (Strutvane | OIDC | API key | custom)
```

- **Inference:**
  - Groups `paths` into resources (`/customers`, `/customers/{id}`).
  - Maps schemas to field types (formats → widgets) and detects list/show/create/update/delete operations.
  - Guesses `title` fields.
  - Recognises pagination conventions: JSON:API, page/limit, cursor, Spring, Laravel.
- **Mapping file** (`web/ui.resources.ts`, owned) fixes anything inference gets wrong:

```ts
import { defineResources } from '@strutvane/ui/core'
export default defineResources({
  customers: {
    operations: { list: 'GET /v2/clients', show: 'GET /v2/clients/{clientId}' },
    title: 'companyName',
    fields: { status: { type: 'enum', options: ['lead', 'active', 'churned'] }, internalId: { hidden: true } },
    pagination: { style: 'page', pageParam: 'p', sizeParam: 'per_page', totalPath: 'meta.total' },
    filters: { status: { param: 'state', operators: ['eq'] } },
  },
})
```

- `sv ui:pages --from-openapi <url>` re-runs inference and shows a diff against the mapping file.

## 9. Providers (pluggable)

| Provider | Default | Alternatives |
|----------|---------|--------------|
| **DataProvider** | Strutvane REST (ListQuery protocol, Problem errors) | Generic OpenAPI REST, JSON:API, GraphQL (later), custom |
| **AuthProvider** | Strutvane auth (`/auth/me`, cookie or token) | OIDC (PKCE: Entra ID, Okta, Keycloak, Auth0), API key, custom |
| **AccessProvider** | Manifest + `/auth/me` effective permissions | CASL ability, custom function |
| **RouterProvider** | TanStack Router | React Router 8 (adapter), Next.js App Router (later) |
| **I18nProvider** | ICU MessageFormat (labels from metadata + `web/locales/*.json`) | i18next adapter |
| **NotificationProvider** | Toasts (registry `sonner`-style component) | Custom |
| **RealtimeProvider** *(later)* | SSE from the framework's event stream | WebSocket, Pusher-compatible |

## 10. Routing

- **TanStack Router** with a generated route tree: `.strutvane/routes.gen.ts`, built from the manifest plus `web/pages/**` overrides and custom pages.
- Resource routes are **lazy**: each resource's pages are a separate chunk.
- Search params (filters, sort, page, view) are typed and URL-synced, so links are shareable and the back button works.
- Route guards use `AccessProvider`. Unauthenticated users go to `/login?redirect=…`; forbidden users get a 403 page.

## 11. Accessibility and internationalisation

- **WCAG 2.2 AA** is a release-blocking quality bar:
  - axe checks in CI on every generated page
  - full keyboard operation, visible focus
  - ARIA grid semantics for tables
  - announcements for async updates
  - reduced-motion support
- **i18n:**
  - Every label comes from metadata (`label`, `help`) or locale files.
  - Dates, numbers and currency are formatted with `Intl`.
  - RTL layout support. `sv ui:locale add de` scaffolds a translation file with all keys.

## 12. Performance

- **Code splitting:** per resource and per heavy widget (rich text, charts, maps).
- **Tables:** virtualised rows and columns (TanStack Virtual), server-side filtering/sorting/pagination always, debounced search.
- **Query caching:** per-resource keys; mutations invalidate precisely (list + record + relations); optimistic updates for inline edits.
- **Budgets enforced in CI:**
  - shell ≤ 200 KB gzip
  - resource chunk ≤ 60 KB gzip
  - LCP ≤ 2.0 s on mid-tier hardware (Lighthouse CI)

## 13. Testing

| Layer | Tooling | What |
|-------|---------|------|
| Core (headless) | Vitest | Manifest parsing, OpenAPI inference corpus (50+ real-world specs), query-state machines, permission helpers |
| Components | Vitest + Testing Library (browser mode) | Widgets per field type, data table behaviours |
| Generated pages | Playwright | CRUD flows per preset, permission-hidden actions, tenant switcher, auth screens |
| Accessibility | axe-core in Playwright | Every generated route, light + dark |
| Visual regression | Playwright screenshots | Registry components × themes |
| User tests | Shipped `@strutvane/ui/testing`: `renderResource('invoice')`, mock manifest, MSW handlers from OpenAPI | Developers test their overrides |

## 14. Package exports

| Entry | Contents |
|-------|----------|
| `@strutvane/ui/core` | Manifest loader, resource registry, data client, query state, providers (no React) |
| `@strutvane/ui/react` | Renderer components, hooks (`useResource`, `useList`, `useRecord`, `useForm`, `useCan`, `useActor`, `useTenant`), `defineUi`, `defineColumns`, `defineFields` |
| `@strutvane/ui/vite` | Vite plugin: route-tree generation, manifest typing, dev integration with the API server |
| `@strutvane/ui/installer` | Installer used by `sv add ui` |
| `@strutvane/ui/testing` | Test utilities |
| Registry `@strutvane/*` | Copyable components, layouts, themes |

## 15. Future targets

| Target | Plan |
|--------|------|
| **Next.js (App Router)** | Post-1.0. Server components for list/show shells, client islands for tables/forms; core reused. |
| **TanStack Start** | Post-1.0 (Start 1.0 stable since 2026-10). Natural fit with the TanStack Router-based renderer. |
| **Vue 3 / Nuxt** | Year 2: `@strutvane/ui/vue` renderer on the same `ui/core`. |
| **Mobile** | Not planned; the typed client SDK + manifest let React Native apps reuse the metadata. |
