# Spike 19: Design direction C, "Minimal Enterprise" → **Crisp** (chosen default)

**Date:** 2026-11-14.

**Environment:** Windows 11, Node v24.21.0, npm, TypeScript 6.0.3 (strict + `exactOptionalPropertyTypes` + `noUncheckedIndexedAccess`), React 19.3.1, Vite 8.3.8, Tailwind CSS 4.3.5, `radix-ui` 1.8.1, cmdk 1.1.1, Lucide 1.73.0, Recharts 3.10.1, Inter Variable + Geist Mono (@fontsource 5.3.0), Vitest 5.1.0 + jsdom 31 + Testing Library, axe-core 4.14.0.

```bash
cd spikes/19-design-c-minimal
npm install
npm run dev        # http://localhost:5183 (strictPort)
npm test           # tsc --noEmit + vitest run (162 tests)
npm run build      # tsc --noEmit + vite build
```

**How to review:** open the app, then use the dashed **Screens** button (top right, also on the
sign-in page) to jump to every screen and state, or to trigger the overlays (command palette,
notifications, confirm dialog, toast, side drawer). Press `Ctrl K` (or `⌘ K`) anywhere, and `?`
for every shortcut. The theme menu (sun/moon) switches Light / Dark / System and is remembered.

**Outcome:** the lead chose this direction as the **default design**. It ships as
`@strutvane/design-crisp` ("Crisp: clean, minimal, business-first"); direction A ships alongside
as `@strutvane/design-vivid`; direction B is shelved.

**Design standard:** [`DESIGN-C.md`](DESIGN-C.md): what a design package provides, mood, exact
tokens for both themes, typography, scales, layout, component specs, do/don't, licences. Every
colour, radius, shadow, font, type size, density and shell size lives in
[`src/styles/tokens.css`](src/styles/tokens.css), so the shell and component skins can be lifted
into a design package on top of shared `@strutvane/ui` behaviour.

## Question

> What does a restrained, high-density, keyboard-first "Minimal Enterprise" direction look like
> for `@strutvane/ui`, across every screen an admin needs, at a premium bar, in light and dark,
> fully token-driven and accessible, so the lead can compare it with directions A and B?

## Answer

A complete clickable mockup with **17 screens and states**, all token-driven, AA-checked and
keyboard-operable:

| Area | Screens and states |
|---|---|
| Auth | Sign in (validation, show password, SSO, remember me), Forgot password (anti-enumeration confirmation, resend countdown) |
| Dashboard | Greeting header with period switch; 4 KPIs with meaning-aware deltas and sparklines; revenue area chart vs last year with custom tooltip and screen-reader table; status breakdown (stacked bar + table); top customers with bars; activity timeline; recent invoices |
| Invoice list | Breadcrumb + back; title + count; Import / Export / **New invoice** on the title row. Toolbar: saved views, search (`/`), filters popover (status, owner, minimum amount), filter chips, density (3 levels), columns, view switch. Dense table: sticky header, sortable columns (`aria-sort`), mono right-aligned amounts, status dots, avatars, row menus, selection + floating bulk bar with Undo, `J`/`K`/`X`/`Enter`/`Space` row navigation. Pagination with page size. **Empty**, **no results** and **loading skeleton** states. All state in the URL. |
| Board / Calendar | Kanban by status with totals, drag-and-drop and `Alt + ←/→` keyboard moves (announced); month grid with today, "+N more" popovers, prev/next/today, and an agenda list on phones. Both open the side drawer. |
| Form (create / edit) | Settings-style sections. Text, textarea with counter, currency, select, **async relation select** (cancellable search), date, switch rows, radio cards, file drop zone with progress and validation, tags. Inline errors + summary with jump links + first-invalid focus. Sticky save bar with unsaved-state indicator and Discard. |
| Detail | Header with status and actions (more menu, delete confirm); hairline summary strip; tabs in the URL (Overview with line items and totals, Activity with comment box, Related, Files with drop zone); properties, payment progress and customer panels. |
| Settings | Profile; Security (password strength, 2FA methods, set-up dialog with QR, recovery codes); Sessions (revoke one / all); Notifications (event × channel matrix, digest, quiet hours); API tokens (create with show-once secret, revoke); **Team members** (seats, search, status filter, inline roles, invite dialog, remove). |
| Global | Command palette (recent, go-to with `G` hints, actions, live invoice search, nested theme page), `G`-sequence shortcuts, `C`, `?` dialog, notifications popover (All/Unread, mark all read), confirm dialog, toasts with Undo, side drawer, 404. |

## Evidence

`npm test` exits 0: `tsc --noEmit` plus **6 files, 162 tests, all passing** (two consecutive runs).
`npm run build` exits 0: screens are lazy-loaded, so the entry chunk is 276 kB (86 kB gzip) and
Recharts (389 kB, 112 kB gzip) loads only with the dashboard; CSS 97 kB (40 kB gzip).

| Test file | Tests | What it proves |
|---|---|---|
| `screens.test.tsx` | 37 | **Every screen in the registry renders its `<h1>` in light and in dark** (17 × 2), with `html.dark` set only in dark. The empty list shows its call to action, the loading list is `aria-busy` with no rows, an unknown record is a 404 inside the shell. The registry is the same list the Screens switcher uses, so a new screen cannot skip this test. |
| `a11y.test.tsx` | 10 | **axe-core: 0 violations on dashboard, list and form in both themes**, plus: list with filters open and a row selected (bulk bar), form after a failed submit, command palette open, sign-in. `color-contrast` is off in jsdom (no layout) and is covered by the next file. |
| `contrast.test.ts` | 77 | **WCAG AA computed from `tokens.css` itself**: 32 text pairs ≥ 4.5:1 and 5 non-text pairs ≥ 3:1, per theme; every needed token exists as hex; the maths matches WCAG reference values. It caught two real failures during the build (dark primary and danger *hover* at 3.98 and 4.02:1), fixed by darkening the hovers. |
| `tokens.test.ts` | 4 | **No hard-coded colours outside `tokens.css`**: hex, colour functions, Tailwind palette and black/white classes, arbitrary colour values and named colours in style props, across every `.ts`/`.tsx`/`.css` in `src/`. The rule is tested against a planted bad snippet, and Tailwind's palette is proven switched off (`--color-*: initial`). **Every type, radius, font, density, shadow and easing scale in `app.css` is a `var()` of a `tokens.css` token** (37 declarations, none literal). |
| `logic.test.ts` | 20 | Money (narrow symbols, compact `K`/`M`), deltas with a real minus, due/relative wording from a fixed "now"; route matching and query helpers; list state from the URL (junk ignored, saved view as base, `-` clears a view filter); page windows; 238 deterministic invoices with every status and currency; search/filter/stable sort/page clamping; **line items reconcile to the cent for all 238 invoices**; form rules; month grid; sign-in, password strength, file-type/size messages, sparkline paths. |
| `interactions.test.tsx` | 14 | `Ctrl K` → type `2264` → Enter opens INV-2264; nested "Change theme…" applies and remembers Dark. `G I`, `C`, `?`. Table: `J` moves focus, `X` selects (bulk bar shows "1 selected"), `K` + `Enter` opens. Sorting sets `aria-sort` and `?sort=amount`. Bulk delete: alert dialog with **Cancel focused**, rows removed, **Undo** restores. Filter chips remove one filter. No-results state. Form: summary "Fix 3 fields", first invalid field focused with `aria-invalid`; async customer search fills the billing e-mail; tags Enter/comma/Backspace and the unsaved indicator. Theme survives reload via storage. Notifications mark-all-read. Board card opens the drawer. |

### Browser check (what was inspected)

Vite dev server in the Claude Browser pane (Chromium), 2026-11-14/15:

- **1440 × 900, light and dark:** dashboard, invoice list (with 3 rows selected and the bulk bar, filters active as chips), detail, create form (and after a failed submit), board (with the drawer open), calendar, team, security, sign-in, and the command palette.
- **375 × 812 (mobile emulation):** every route, measured with `document.documentElement.scrollWidth` = **375 on all 15 routes** (no horizontal page overflow), plus screenshots of dashboard, list, detail and calendar (agenda layout).

Fixed as a result of that review:
1. **Horizontal overflow at 375 px on Team and API tokens (616 px).** Cause: an `sr-only` (absolutely positioned) header label inside a horizontally scrolling table escaped its non-positioned scroll container. Every scroll container is now `relative`; settings and section grids use `grid-cols-1` (`minmax(0,1fr)`) so wide tables can't stretch them.
2. Page titles squeezed to one letter on phones next to the actions: the title block now has a 16 rem flex basis, so actions wrap to their own row.
3. Tabs grew a phantom vertical scrollbar (negative margin under `overflow-x-auto`): the baseline is now an inset shadow.
4. Calendar cells clipped their third invoice: rows have a 120 px minimum and the grid scrolls.
5. Typography: large mono numbers looked like code; display figures now use Inter tabular figures with tight tracking (`figure`), mono stays for columns. Compact money upper-cased (`€18.5K`, `€1.8M`), `US$` → `$`, search placeholder no longer truncated, settled invoices show their due date instead of repeating "Paid".

## Limits (honest)

- The browser pane was narrower than 1440 px, so "1440" screenshots were emulated and scaled down; fine detail (1 px hairlines) was checked by zooming, not at native resolution.
- `color-contrast` is proven from tokens (pairs that are used), not by axe on rendered pixels; translucent overlays (e.g. `bg-accent-subtle/60` on selected rows) were checked by eye only.
- Input outlines (`--input`) are below 3:1 against the surface, a deliberate calm-UI trade-off shared by most SaaS tools; inputs are identified by label, fill and focus ring. Documented in DESIGN-C.md as a known gap if strict WCAG 1.4.11 is required.
- Data is mock and read-only; edits (delete, mark paid, moves) live in screen state with Undo and reset on navigation. The router is a 100-line History-API router for the mockup only; the product uses TanStack Router (spike 14).
- The QR code is an illustrative pattern, not a real TOTP encoding.

## Decision it fed

Direction comparison (A Modern Pro, B Glass, C Minimal Enterprise) for `@strutvane/ui`'s default
theme: **C won and becomes `@strutvane/design-crisp`, the default.** The token contract
(`tokens.css` roles and scales, `--color-*: initial`, the token and contrast tests) carries over as
the design-package interface; see DESIGN-C.md §0.

After the decision, density, shape, type, font and shell values moved from `app.css` and the
component classes into `tokens.css` (`h-control-md`, `h-row-default`, `w-sidebar`, `rounded-md` →
`--shape-md`, …) and the screens were re-measured in the browser: controls 32 px, rows 40 px,
sidebar 240 px, top bar 48 px, 13 px table text, 6 px control radius, no overflow at 1440 px.
