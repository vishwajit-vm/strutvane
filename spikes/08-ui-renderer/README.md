# Spike 08: UI renderer from a ResourceManifest

**Phase 0 · 2026-11-13 · Status: answered**

## 1. Question

Can `@strutvane/ui` render a complete, accessible, permission-aware CRUD UI **purely from a `ResourceManifest`**, while staying small and fast? Specifically:

1. **A list page.** Columns come from the fields or `ui.listColumns`. It needs sorting, filter chips mapped to `QueryFilter`, and cursor pagination via `ListQuery`.
2. **A create/edit form.** The widget is chosen from the field type. Client validation comes from the manifest. Server 422 `issues` are mapped onto the right field, including array paths. Focus moves to the first invalid field, with `aria-describedby` wired.
3. **Capabilities are respected.** There's no Create button when `capabilities.create=false`, and fields can be read-only.
4. **L1/L2 overrides work.** A per-field widget registry and per-column cell overrides must work **without forking the renderer**.

It also needs to render 500 rows fast enough.

## 2. Answer

**Yes.** One `ResourceDescriptor` drives a working list page and create/edit form with sorting, filters, cursor paging, client and server validation, and capability gating. axe reports **0 accessibility violations** on the list and on the form, both empty and showing errors. Per-field and per-column overrides work through a typed registry without touching the renderer.

The answer only holds under the **six rules in §6**. The spike found **five real defects** that a naive implementation ships with (§5).

## 3. Evidence

| Check | Result |
|---|---|
| Typecheck (strict: `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`) | ✅ clean |
| Test suite: 4 files, **48 tests** | ✅ 48/48 passed, **twice in a row** |
| `pure.test.ts`: URL ↔ ListQuery round-trip, fail-closed parsing, validation, issue routing, cursor reducer | 20/20 |
| `ResourceList.test.tsx`: columns, sort → ListQuery, filters, search, paging, deep links, capabilities, cell override, axe | 13/13 |
| `ResourceForm.test.tsx`: widgets per type, client validation + focus, server 422 incl. array paths, 409/500/404 banners, edit mode/read-only, widget override, axe | 13/13 |
| `perf.test.tsx`: 500 rows full vs virtualized, plus a fail-safe test | 2/2 |
| **Accessibility (axe-core 4.14)** | **0 violations** on the loaded list, the empty form, and the form showing errors. `color-contrast` is excluded because jsdom has no layout (see §7). |

**Test run output (run 1 and run 2):**

```
[perf] {"rows":500,"fullRender":{"medianMs":1081,"domRows":500},"virtualized":{"medianMs":151,"domRows":25}}
 Test Files  4 passed (4)
      Tests  48 passed (48)
[perf] {"rows":500,"fullRender":{"medianMs":1169,"domRows":500},"virtualized":{"medianMs":197,"domRows":25}}
 Test Files  4 passed (4)
      Tests  48 passed (48)
```

### Timings (500 rows, jsdom, median of 3 after warm-up)

| Strategy | DOM rows | Time to first render (range across runs) |
|---|---|---|
| Full render | 500 | **655–1,169 ms** |
| Virtualized (`@tanstack/react-virtual`, 40 px rows, overscan 10) | **25** | **109–197 ms** |

The ranges are wide because other spikes were running on the same machine. jsdom has no layout or paint, so these numbers measure DOM work plus React reconciliation. They're good for comparing the two strategies and catching regressions, but they don't guarantee browser frame times.

**Conclusion:** virtualization cuts DOM rows by 95% and render time by about 6×. It's on by default above 100 rows. The protocol caps pages at 100 rows, so 500 rows only happen with accumulated pages ("load more" or infinite scroll).

## 4. Design

### 4.1 Architecture

```
GET /.well-known/strutvane.json  ──►  ResourceManifest (per actor: capabilities, fields)
                                            │
            ┌───────────────────────────────┼─────────────────────────────────┐
            ▼                               ▼                                 ▼
     <ResourceList>                   <ResourceForm>                   Registry (typed)
  listFields(resource)            formFields(resource, mode)      widgets: Resource.field → widget
  TanStack Table v9 (columns,      TanStack Form (values,          name → type → default
  sort state, manualSorting)       validators, errorMap)           cells:   Resource.field → type
  useListQuery (state ↔            validateField (manifest →       → default
  ListQuery ↔ URL)                 issues, shared catalog)         messages: catalog (RFC-0003)
  FilterBar (buildSimpleFilter)    routeIssues (422 → fields)            ▲
            │                               │                       <StrutvaneUIProvider
            └──────────────► ResourceApi ◄──┘                        overrides={…}>
                         (generated client; FakeApi in tests)
```

### 4.2 Data flow: list

```
user click/select/type
  → useListQuery reducer (filters, sort, search, cursor stack)
  → toListQuery()  ──► TanStack Query key ['strutvane','list',path,listQuery] ──► api.list()
  → toSearchString() ──► onSearchStringChange (the router persists it; deep links parse it back)
```

### 4.3 Data flow: form errors

```
submit ─► client validators (onSubmit) ── invalid ─► onSubmitInvalid → focus first invalid field
   │ valid
   ▼
api.create/update ─► 422 issues ─► routeIssues(issues, renderedFieldNames)
   │                                 ├─ deepest rendered field  → errorMap.onServer → aria-describedby
   │                                 ├─ parent field fallback (lines[9].amount → lines)
   │                                 └─ no match / path [] → form banner (role=alert)   (never dropped)
   └─► 409/404/5xx ─► banner via problemBannerText (no internals; 5xx shows the traceId)
editing a field clears its onServer error (it is stale)
```

### 4.4 Module map (all `src/`, 2.3k lines including docs)

| Module | Responsibility | Framework-free? |
|---|---|---|
| `contracts.ts` | Mirror of `@strutvane/contracts` v0 + `ValidationIssue` (RFC-0003) | ✅ |
| `messages.ts` | Catalog + `formatMessage` (shared by client and server) | ✅ |
| `validation.ts` | Manifest → client issues, including array items with full paths | ✅ |
| `errors.ts` | `ApiProblemError`, path → field-name mapping, `routeIssues`, banner text | ✅ |
| `list-query-url.ts` | ListState ↔ ListQuery ↔ URL. Fail-closed parsing; `buildSimpleFilter` shared with the UI | ✅ |
| `useListQuery.ts` | Reducer + hook (cursor stack; query changes reset the page) | React |
| `registry.tsx` | Widget/cell registries, resolution order, provider | React |
| `widgets.tsx`, `cells.tsx`, `relations.ts` | Default controls/cells; cached relation options | React |
| `FilterBar.tsx`, `ResourceList.tsx`, `ResourceForm.tsx` | Renderers | React |
| `fake-api.ts` | In-memory server: ADR-0008 filter semantics, server validation, problem+json | ✅ |

Half the code is framework-free. That half carries over unchanged to a future Vue renderer.

## 5. Defects found (each caught by a test, then fixed)

1. **Inconsistent first-click sort direction.** TanStack Table v9 auto-detects the first direction from the data: numeric columns start descending, text columns ascending. A generated UI must behave the same on every column, so `sortDescFirst: false` is now set.
2. **The number input swallowed the decimal point.** A controlled input that parses on every keystroke turns `"1250."` into `1250`, so typing `1250.5` produced `12505`. Now the widget keeps the **draft text** and only emits a number for complete numbers. Anything else is emitted as raw text, which validation reports.
3. **Duplicate error messages.** TanStack Form keeps one error slot per trigger (blur, submit, server), so the same message showed twice ("Number is required. Number is required."). Messages are now de-duplicated in the shared field shell.
4. **A newly shown error banner didn't get focus.** Focusing in a microtask runs *before* React commits the banner. Focus is now requested via state and applied in an effect after render.
5. **The virtualized table rendered zero rows** when its container can't be measured: a hidden tab, an unstyled parent, or jsdom. The first benchmark's "fast" number was rendering nothing. There's now a **fail-safe**: with data and no measurement, the first window of rows is rendered, and a test covers it.

## 6. Rules the real `@strutvane/ui` must adopt

1. **Server-side list operations.** Sort, filter, search and paging all go through `ListQuery`, with `manualSorting` and `sortDescFirst: false`. TanStack Table is used for column/header models and sort state only.
2. **One filter builder** (`buildSimpleFilter`) is shared by URL parsing and the filter UI, so the UI can never send a filter the server would reject. Unknown fields, operators and values are rejected and reported.
3. **One message catalog** is shared by client validation and the server, so a message reads the same wherever it was produced.
4. **Issue routing never drops a message.** Each message goes to the deepest rendered field, then a parent field, then the form banner. Focus moves to the first invalid field in visual order.
5. **Widgets render only the control.** Label, help and errors live in one shared shell, so accessibility wiring (`htmlFor`, `aria-invalid`, `aria-describedby`, `aria-required`) is written once and every override inherits it.
6. **Virtualize above 100 rows, with the fail-safe** and `aria-rowcount`/`aria-rowindex` so the semantics survive.

## 7. Limits and risks (not verified here)

- **No real browser.** jsdom has no layout or paint, so color contrast, real frame times, scroll-time virtualization, and keyboard focus order across a real layout are unchecked. **Next:** Playwright + axe in Chromium/Firefox/WebKit in the `ui` repo's CI.
- **Relation picker:** loads one page (≤ 100) of the target. Large targets need an async, searchable combobox.
- **Array fields** are rendered by a built-in `ArrayFieldEditor` (items use registry widgets). The group itself isn't registry-overridable yet. TanStack Form's types for dynamic field names needed `as never`/`any` at two seams, a typing cost of metadata-driven forms.
- **Not built:**
  - RFC-0003 rows 6, 9 and 12: keeping the draft across a 401 re-login, a diff view on 409, offline autosave and idempotent retry.
  - Bulk actions, export, saved views, custom actions (`ActionDescriptor`), the detail page and relation tabs.
- **Primitives and distribution:** native elements only. **Base UI vs Radix was not evaluated**, and the **shadcn-registry "copy into project" distribution is untested**.
- **i18n:** `{param}` interpolation only. ICU plurals/number formats and locale switching aren't done.
- **Variable row heights** with virtualization are untested (fixed 40 px rows were used).

## 8. Recommendation for `@strutvane/ui`

- **Adopt the architecture as-is:** registry + provider, `useListQuery`, `routeIssues`, shared catalog, shared field shell.
- **Split the package:**
  - `ui/core`: framework-free modules, which are half of this spike
  - `ui/react`: renderers, widgets and cells
- **Keep the 48 tests as the seed acceptance suite.** Add a Playwright + axe browser job before Phase 3's gate (WCAG 2.2 AA).
- **Next UI spike (Phase 1–3):** the async relation combobox, the detail page, custom actions, and the RFC-0003 draft/offline flows.

## 9. Suggested ADR

> **ADR-00XX: The UI is rendered from the ResourceManifest through typed widget/cell registries**
>
> **Context:** Strutvane generates UIs for every resource, with no per-resource code. Customization must not require forking. Spike 08 showed that one descriptor can drive accessible list and form pages, and found five defects in naive implementations.
>
> **Decision:**
> - `@strutvane/ui` renders lists and forms from `ResourceDescriptor`.
> - All list operations are server-side through `ListQuery`; TanStack Table supplies models and sort state only (`manualSorting`, `sortDescFirst: false`).
> - TanStack Form owns values and validators.
> - A typed registry resolves widgets (`Resource.field` → named → type → `default`) and cells (`Resource.field` → type → `default`), and apps override it via a provider.
> - Client validation and the server share one message catalog. 422 issues route to the deepest rendered field, else a parent field, else the form banner, with focus on the first invalid field.
> - Lists virtualize above 100 rows, with a fail-safe window.
> - The framework-free half lives in `ui/core`.
>
> **Consequences:**
> - (+) Zero per-resource UI code. Overrides at field and column granularity. Accessibility wired once. A future Vue renderer reuses `ui/core`.
> - (−) Dynamic field names weaken TanStack Form's static types at a few seams. A browser test job (Playwright + axe) is required for contrast and real performance.

## 10. Run it

```bash
cd spikes/08-ui-renderer
corepack pnpm@12.18.0 install
corepack pnpm@12.18.0 test        # 48 tests; perf numbers are printed as [perf] {...}
corepack pnpm@12.18.0 typecheck
```

**Stack (exact pins):**
- React 19.3.1
- @tanstack/react-table 9.3.1, react-form 1.33.5, react-query 5.107.1, react-virtual 3.14.26
- Vitest 5.1.0, jsdom 31.0.1
- @testing-library/react 16.3.3, user-event 14.6.10, jest-dom 7.0.1
- axe-core 4.14.0
- TypeScript 6.0.3

jsdom was chosen over happy-dom because axe-core depends on DOM accessibility APIs that jsdom implements more completely.
