# Crisp: clean, minimal, business-first

> **Crisp** (design direction C, "Minimal Enterprise") was chosen on 2026-11-14 as the **default
> design** of `@strutvane/ui`. It will ship as the design package `@strutvane/design-crisp`;
> direction A ships alongside it as `@strutvane/design-vivid`. Original design. Every value below
> is the one in [`src/styles/tokens.css`](src/styles/tokens.css) (the single source), mapped onto
> Tailwind utilities by [`src/styles/app.css`](src/styles/app.css); the tests enforce the rules
> marked **(tested)**.

## 0. What a design package provides

A design package (`@strutvane/design-crisp`, `@strutvane/design-vivid`) is a *skin* on top of the
shared `@strutvane/ui` behaviour (routing, data, forms, tables, accessibility, keyboard). It provides:

1. **Tokens, light and dark:** one `tokens.css` with every colour, shadow, radius, font, type
   size, density (control and row heights), shell size and motion value. Nothing else may contain
   a literal colour, and every Tailwind scale points at a token **(tested)**.
2. **Fonts:** the self-hosted font files and their `@fontsource` imports (Crisp: Inter Variable, Geist Mono).
3. **Shell:** sidebar, top bar, inset content panel, mobile navigation drawer and the auth layout (sign-in / reset frame).
4. **Component skins:** the class recipes for buttons, inputs, selects, switches, radio cards, badges, cards, tables, tabs, menus, dialogs, drawer, toasts, bulk bar and command palette. Behaviour (Radix, cmdk, keyboard handling) stays in `@strutvane/ui`.
5. **Chart palette:** `--chart-1…4` and `--chart-grid`, plus the chart styling rules (axes, grid, tooltip) in §6.
6. **Illustrations:** the empty-state drawings and the logo treatment, drawn with token colours only so they follow the theme.

In this spike these pieces already sit apart: `src/styles/tokens.css` + `app.css` (1, 2),
`src/shell/` and `src/screens/auth/AuthLayout.tsx` (3), `src/components/ui/` (4), the chart
tokens (5), and `src/components/empty-state.tsx` + `brand.tsx` (6).

## 1. Mood

Calm precision. The interface should feel like a well-made instrument: quiet surfaces, crisp
hairlines, numbers that line up, one confident colour that always means "this is the action" or
"this is where you are". Nothing decorates; everything aligns.

- **Near-monochrome.** Zinc-tinted neutrals do 95% of the work. Status uses small dots, not fills.
- **One accent: cobalt.** Primary button, focus ring, selection, active tab, links, the leading chart series. Never two accent buttons on screen.
- **Borders, not shadows.** Structure comes from 1 px hairlines. Only floating layers (menus, popovers, dialogs, drawer, toasts, bulk bar) cast a shadow.
- **Dense but breathable.** 13 px working text, 32 px controls, 40 px rows by default, a strict 4 px grid.
- **Keyboard-first.** `Ctrl/⌘ K` reaches everything; `G` sequences, `C`, `/`, `J`/`K`/`X`/`Enter`/`Space` in lists; `?` lists them all.
- **Equal themes.** Dark is designed, not inverted: its own surfaces, borders, accent and status values, each contrast-tested.

## 2. Palette and tokens

All values live in [`tokens.css`](src/styles/tokens.css): colours per theme in `:root` / `.dark`,
and the theme-independent shape, type, density, shell and motion tokens in a final `:root` block
(§3–§4). Components use **roles**, never colours: `bg-surface`, `text-fg-muted`, `border-border`, `bg-accent`.
Tailwind's default palette is reset (`--color-*: initial`), so `bg-blue-500` does not exist **(tested)**,
and no hex, `rgb()`, `oklch()` or named colour may appear outside `tokens.css` **(tested)**.

### Surfaces and text

| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#f7f7f8` | `#09090b` | Canvas behind the sidebar and the inset panel |
| `--surface` | `#ffffff` | `#111113` | Content panel, cards, tables, inputs, popovers |
| `--surface-subtle` | `#f4f4f5` | `#18181b` | Hover, table header, segmented track |
| `--surface-muted` | `#ebebed` | `#222226` | Pressed, skeletons, progress tracks |
| `--overlay` | `rgb(9 9 11 / .32)` | `rgb(0 0 0 / .6)` | Modal scrim |
| `--fg` | `#0b0b0f` | `#ededef` | Primary text |
| `--fg-muted` | `#52525b` | `#a1a1aa` | Labels, secondary text |
| `--fg-subtle` | `#66666f` | `#8e8e97` | Meta, timestamps, placeholders (still AA) |
| `--border` | `#e6e6e9` | `#232327` | Hairlines everywhere |
| `--border-strong` | `#d4d4d8` | `#303036` | Secondary button outline, hover borders |
| `--input` | `#d4d4d8` | `#3a3a41` | Form control outline |

### Accent, inverse, status

| Token | Light | Dark | Use |
|---|---|---|---|
| `--accent` | `#4353e8` | `#5664f0` | Primary button, selection, today, chart series 1 |
| `--accent-hover` | `#3746d6` | `#4a57e3` | Primary hover (darker in both themes, keeps AA) |
| `--accent-fg` | `#ffffff` | `#ffffff` | Text on accent |
| `--accent-subtle` | `#eef0fd` | `#1b1e3a` | Selected rows, active filter button |
| `--accent-text` | `#3a4bdb` | `#9aa4ff` | Links, "Choose files", counts on accent tint |
| `--ring` | `#4353e8` | `#7c8aff` | 2 px focus outline, 2 px offset |
| `--inverse` / `--inverse-fg` | `#18181b` / `#fafafa` | `#fafafa` / `#18181b` | Bulk-action bar, tooltips |
| `--success` / `-subtle` / `-text` | `#1f9d55` / `#e9f6ef` / `#157046` | `#30a46c` / `#0f2419` / `#4cc38a` | Paid, positive deltas |
| `--warning` / `-subtle` / `-text` | `#d98b00` / `#fdf4e3` / `#8a5300` | `#e5a000` / `#2a1f0b` / `#f2b84b` | Due soon, unsaved changes |
| `--danger` / `-subtle` / `-text` | `#c9372c` / `#fdeceb` / `#b42318` | `#d4392e` / `#2c1313` / `#ff8a80` | Overdue, errors, destructive confirm |
| `--danger-hover` | `#b22d23` | `#bd3128` | Destructive button hover |
| `--neutral` | `#a1a1aa` | `#71717a` | Draft / void dots |
| `--chart-1…4`, `--chart-grid` | `#4353e8 #a5aef6 #a1a1aa #d4d4d8`, `#ececef` | `#7c8aff #3d4594 #71717a #3a3a41`, `#1f1f23` | Lead series, then quiet neutrals |
| `--avatar-1…5`, `--avatar-fg` | desaturated tints, `#2b2b33` | deep tints, `#e4e4e7` | Initials avatars |

**Contrast (tested, both themes):** 32 text/background pairs at ≥ 4.5:1 (every text token on
canvas, surface and subtle; text on accent, danger, inverse, every status tint and every avatar
tint), and 5 non-text pairs (focus ring, accent, success, danger) at ≥ 3:1 against surfaces.

### Elevation

| Token | Light | Dark |
|---|---|---|
| `--shadow-xs` | `0 1px 2px rgb(16 16 24/.05)` | `0 1px 2px rgb(0 0 0/.4)` |
| `--shadow-sm` | two-layer 1–2 px | `0 1px 2px rgb(0 0 0/.5)` |
| `--shadow-pop` | 1 px ring + 4/16 px + 16/32 px soft layers | white 6% ring + deep black layers |
| `--highlight` | `inset 0 1px 0 rgb(255 255 255/.12)` | same at .10 (top sheen on solid buttons) |

## 3. Typography

- **`--font-ui`: Inter Variable** (OFL, self-hosted via `@fontsource-variable/inter`) for UI, with `--font-features` = `'cv11', 'ss03'` (single-storey a, rounded quotes).
- **`--font-numeric`: Geist Mono** (OFL, `@fontsource/geist-mono` 400/500) for IDs, amounts in tables, IPs, token prefixes: class `num` (tabular, −0.01em).
- **Display figures** (KPIs, totals, drawer amount): Inter with `tnum`, `ss01` and `--tracking-display` (−0.035em), class `figure`. Large mono digits read as code; Inter with tabular figures reads as a report.
- **Titles:** `--tracking-title` (−0.015em), used as `tracking-(--tracking-title)`.

Sizes are tokens too (`--size-*` / `--leading-*`), mapped to the `text-*` utilities:

| Utility | Size / line | Use |
|---|---|---|
| `text-2xs` | 11 / 16 | Key hints, avatar initials, meta chips |
| `text-xs` | 12 / 16 | Captions, table headers, badges, breadcrumbs |
| `text-sm` | 13 / 20 | **Working size:** body, tables, controls, menus |
| `text-base` | 14 / 20 | Dialog titles, reading text |
| `text-lg` | 16 / 24 | Rare emphasis |
| `text-xl` | 20 / 28 | Page titles (`h1`, semibold, −0.015em) |
| `text-2xl` | 24 / 32 | KPI values |
| `text-3xl` | 30 / 36 | Hero totals (revenue, drawer amount) |

Weights: 400 body, 500 labels/buttons/values, 600 headings and figures. Never 700+.

## 4. Scales

- **Spacing:** Tailwind's 4 px unit only (`1` = 4 px). Rhythm: 4 inside controls, 8 between related controls, 12 between cards, 16 card padding, 24 between page sections, 32 between settings sections.
- **Density (`--control-*`, `--row-*`):** controls 28 (`h-control-sm`), **32 (`h-control-md`, default)**, 36 (`h-control-lg`, auth); icon buttons are square at the same heights. Rows 32 compact · **40 default** · 48 comfortable (`h-row-*`; the density switch is remembered per browser). A roomier design package changes these six numbers only.
- **Shell (`--sidebar-width`, `--topbar-height`):** 240 px (`w-sidebar`) and 48 px (`h-topbar`).
- **Radius (`--shape-*` → `rounded-*`):** `xs` 3 (checkbox, kbd) · `sm` 4 (badges, chips) · `md` 6 (controls, menu items) · `lg` 8 (cards, popovers, panel) · `xl` 12 (dialogs, palette, bulk bar) · `full` (status pills, avatars, switches).
- **Borders:** always 1 px; dashed only for drop zones and the mockup-only Screens button.
- **Motion:** `--duration-fast/base/slow` (140 / 160 / 220 ms) with `--ease-out-quick` = `cubic-bezier(.2,.8,.2,1)`. Pop-in (opacity + 2 px + 0.98 scale) for floating layers, 16 px slide for the drawer, 8 px rise for the bulk bar and toasts. `prefers-reduced-motion` reduces everything to 1 ms.
- **(tested)** every `--text-*`, `--radius-*`, `--font-*`, `--spacing-*`, `--shadow-*` and `--ease-*` in `app.css` is a `var()` of a `tokens.css` token, never a literal.

## 5. Layout

- **Shell:** `--sidebar-width` (240 px) sidebar on the canvas; content in an **inset panel** (8 px margin, 8 px radius, hairline, `shadow-xs`) that owns its scroll. Below 1024 px the panel is full-bleed and the sidebar is a drawer.
- **Top bar (`--topbar-height`, 48 px):** search trigger (`Ctrl K`), then Screens (mockup only), theme, notifications, help.
- **Page header:** breadcrumb (12 px) → one 36 px row: back button, title, count/status, actions right. Title and primary action share one vertical centre. On phones the actions wrap to their own row (16 rem title basis).
- **Widths:** dashboard/detail max 1320 px; forms and settings 880–960 px; lists and board full width with only the table area scrolling (header, toolbar and pagination stay put).
- **Settings-style sections:** 260 px explanation column + fields, hairline between sections.

## 6. Components

| Component | Spec |
|---|---|
| Button | `primary` accent + top sheen; `secondary` surface + `border-strong` + xs shadow; `ghost` for toolbars; `danger` only inside confirms. `type="button"` by default. |
| Inputs | 32 px, `--input` hairline, focus = accent border + 3 px ring at 20%; `aria-invalid` turns it danger. Currency input: symbol prefix, ISO suffix, mono right-aligned, normalises on blur. |
| Field | Label (13/500) + control + one-line help or inline error (icon + text), wired with `aria-describedby`. Error summary at the top links to each field; first invalid field is focused. |
| Select / Relation select | Radix Select for known lists; cmdk combobox for server search with cancellable requests and a "Searching…" row. |
| Switch / Checkbox / Radio cards | Accent only for "on". Radio cards: title + one-line reason, selected = accent border + ring + 40% tint. |
| Tags | Chips inside the control; Enter/comma adds, Backspace removes, datalist suggestions. |
| File drop | Dashed zone that is a real labelled file input; per-file progress; inline errors naming the file and limit. |
| Status | Neutral pill + 6 px dot + word. Open = accent, Overdue = danger, Paid = success, Draft/Void = neutral. |
| Table | Sticky header on `surface-subtle`; mono right-aligned money; status pills; owner avatars; hover reveals row actions (always visible on touch); roving-tabindex rows. Selected rows use `accent-subtle`. |
| Bulk bar | Inverse floating bar, 12 px radius, count + actions + `Esc`. |
| Cards | Surface + hairline + 8 px radius, 48 px header (title 13/600, description 12 subtle). No shadow. |
| KPI | Label, 24 px figure, delta pill coloured by *meaning* (a falling overdue amount is green), 32 px sparkline. |
| Charts | Recharts: no axis lines, dashed `chart-grid`, 11 px subtle ticks (mono on the value axis), accent area with 18% → 0 gradient, comparison as dashed neutral line, custom tooltip with year-over-year delta. A visually hidden data table carries the numbers for screen readers. |
| Tabs | Text tabs with a 2 px foreground underline; counts in a subtle chip; state in the URL. |
| Command palette | 640 px, 12 vh from top. Recent, Go to (with `G` hints), Actions, live invoice search (number, customer, status dot, amount), nested "Change theme…" page with a breadcrumb chip; footer key hints. |
| Dialogs / drawer / confirm | Scrim + pop-in; title, description, footer with primary last. Confirm focuses **Cancel** and names the action ("Delete 2 invoices"). Drawer is a quick look with "Open invoice". |
| Toasts | Bottom-right (bottom-centre on phones), surface + hairline + pop shadow, icon, optional Undo. |
| Empty states | Original line drawings in token colours with one accent detail, a one-line reason and the next action. |

## 7. Do and don't

**Do**
- Use one primary button per view; everything else secondary or ghost.
- Put money, IDs and counts in `num` (columns) or `figure` (display) so digits line up.
- Say what happens and how to fix it: "Choose a due date on or after the issue date."
- Keep status quiet (dot + word) and let overdue be the only warm colour on a page.
- Give every icon-only button an `aria-label` and a tooltip.
- Add new colours as tokens in both themes, then extend the contrast test.

**Don't**
- Don't use shadows to separate content that sits on the page; use a hairline.
- Don't fill whole badges or rows with status colour.
- Don't write a colour outside `tokens.css` (the test fails), or a Tailwind palette class (it does not exist).
- Don't use mono for large numbers, or more than one accent element competing in a region.
- Don't hide information only in a tooltip, or convey state by colour alone.
- Don't animate longer than 220 ms or move things more than 16 px.

## 8. Assets and licences

Inter (OFL 1.1) and Geist Mono (OFL 1.1) via @fontsource; Radix primitives via `radix-ui` (MIT);
cmdk (MIT); Lucide icons (ISC); Recharts (MIT); Tailwind CSS 4 (MIT). The logo mark, empty-state
drawings and the illustrative QR pattern are original SVGs drawn for this spike. No CSS, markup,
images or logos were copied from any product or template.
