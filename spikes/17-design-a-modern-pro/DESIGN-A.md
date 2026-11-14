# Design direction A: "Modern Pro"

> One of three candidate visual directions for `@strutvane/ui` (2026-11-15). The source of truth for every value below is [`src/styles.css`](src/styles.css); this document explains them. If the two ever disagree, the CSS wins and this file is stale.

## 1. Mood

**Confident, polished, commercial.** The feel of a top-selling vertical-menu admin template: a white sidebar with an accent-gradient active pill, a light translucent top bar, and content in soft, rounded cards floating on a faintly tinted page. It should look *finished* on first impression (gradients, glows, illustrations, sparklines) and stay *calm* after an eight-hour working day (one accent, quiet greys, generous but disciplined spacing).

Three words: **layered** (cards, shadows, tints, glows), **vivid** (one strong indigo-violet accent), **orderly** (one spacing scale, one radius scale, one alignment rule).

Everything here is original: our own tokens (OKLCH), our own logo glyph and illustrations (hand-written SVG), open-licence building blocks only (Radix primitives MIT, Tailwind CSS 4 MIT, Tabler Icons MIT, Recharts MIT, cmdk MIT, Plus Jakarta Sans OFL via @fontsource). No commercial template's CSS, markup, images or colours were used or downloaded.

## 2. Palette

All colours are OKLCH custom properties. The accent hue is one variable (`--brand-hue: 274`); every accent token derives from it, and `test/contrast.test.ts` proves that **every hue from 0° to 345° (15° steps)** still passes WCAG AA, so a team can rebrand by changing one number.

### Light theme (`:root`)

| Token | Value | Use |
|---|---|---|
| `--background` | `oklch(0.972 0.006 274)` | Page: cool off-white, so white cards float |
| `--foreground` | `oklch(0.29 0.03 274)` | Body text, titles (deep ink, not black) |
| `--card` / `--popover` | `oklch(1 0 0)` | Cards, menus, dialogs |
| `--muted` | `oklch(0.958 0.008 274)` | Table headers, quiet panels |
| `--muted-foreground` | `oklch(0.5 0.025 274)` | Labels, captions, secondary text |
| `--subtle` | `oklch(0.945 0.012 274)` | Hover fill, skeletons, progress tracks |
| `--border` | `oklch(0.915 0.01 274)` | Hairlines, dividers, card edges |
| `--input` | `oklch(0.64 0.02 274)` | Control borders (≥3:1 on card) |
| `--primary` | `oklch(0.5 0.215 var(--brand-hue))` | Main action, active states |
| `--primary-2` | `oklch(0.5 0.2 calc(var(--brand-hue) + 18))` | Far end of the brand gradient |
| `--primary-foreground` | `oklch(1 0 0)` | Text on primary / gradient |
| `--primary-soft` | `oklch(0.948 0.03 var(--brand-hue))` | Tinted chips, soft buttons, active sub-item |
| `--primary-soft-foreground` | `oklch(0.47 0.2 var(--brand-hue))` | Links, accent text, text on soft tint |
| `--ring` | `oklch(0.58 0.2 var(--brand-hue))` | Focus outline and glow |
| `--secondary` / `-foreground` | `oklch(0.948 0.01 274)` / `oklch(0.32 0.03 274)` | Neutral chips and counters |
| `--success` / `--success-soft` | `oklch(0.5 0.13 155)` / `oklch(0.95 0.045 155)` | Paid, positive trends |
| `--warning` / `--warning-soft` | `oklch(0.52 0.12 60)` / `oklch(0.955 0.055 80)` | Partly paid, due soon |
| `--danger` / `--danger-soft` | `oklch(0.52 0.2 25)` / `oklch(0.955 0.03 20)` | Overdue, errors |
| `--danger-solid` / `-foreground` | `oklch(0.55 0.21 25)` / `oklch(1 0 0)` | Destructive buttons only |
| `--info` / `--info-soft` | `oklch(0.5 0.12 235)` / `oklch(0.95 0.035 230)` | Pending, neutral notices |
| `--chart-1…5` | `0.56 0.21 hue` · `0.7 0.13 195` · `0.78 0.15 75` · `0.64 0.2 350` · `0.66 0.15 155` | Accent, cyan, amber, pink, green |
| `--chart-grid` | `oklch(0.92 0.01 274)` | Dashed gridlines |
| `--sidebar` / `-foreground` / `-muted` | `oklch(1 0 0)` / `oklch(0.36 0.03 274)` / `oklch(0.52 0.02 274)` | Navigation |
| `--topbar` | `oklch(0.972 0.006 274 / 0.82)` | Translucent sticky bar (with blur) |
| `--overlay` | `oklch(0.22 0.03 274 / 0.5)` | Modal backdrop |

### Dark theme (`.dark`)

| Token | Value | Note |
|---|---|---|
| `--background` | `oklch(0.2 0.022 274)` | Deep indigo-navy, never pure black |
| `--foreground` | `oklch(0.93 0.012 274)` | Soft white |
| `--card` | `oklch(0.245 0.026 274)` | One clear step above the page |
| `--popover` | `oklch(0.27 0.027 274)` | One more step for floating surfaces |
| `--muted` / `--subtle` | `oklch(0.285 0.026 274)` / `oklch(0.3 0.03 274)` | |
| `--muted-foreground` | `oklch(0.74 0.02 274)` | |
| `--border` / `--input` | `oklch(0.33 0.026 274)` / `oklch(0.56 0.03 274)` | Cards get a visible hairline in dark |
| `--primary` / `--primary-2` | `oklch(0.5 0.2 hue)` / `oklch(0.48 0.19 hue+18)` | Same fill weight as light, so white text stays AA |
| `--primary-soft` / `-foreground` | `oklch(0.32 0.075 hue)` / `oklch(0.83 0.1 hue)` | Accent text is *lighter* in dark |
| `--ring` | `oklch(0.7 0.16 hue)` | |
| `--success` / `-soft` | `oklch(0.8 0.13 155)` / `oklch(0.31 0.05 155)` | Status text flips light-on-dark |
| `--warning` / `-soft` | `oklch(0.83 0.12 80)` / `oklch(0.32 0.05 70)` | |
| `--danger` / `-soft` | `oklch(0.79 0.12 22)` / `oklch(0.32 0.06 20)` | |
| `--danger-solid` | `oklch(0.55 0.19 25)` | |
| `--info` / `-soft` | `oklch(0.8 0.1 230)` / `oklch(0.31 0.05 235)` | |
| `--chart-1…5` | `0.68 0.18 hue` · `0.74 0.12 195` · `0.8 0.14 75` · `0.7 0.18 350` · `0.72 0.14 155` | Lifted for dark surfaces |
| `--sidebar` | `oklch(0.245 0.026 274)` | Same as card |

**Pairing rule.** Every tone has a *text* token and a *soft* token: `text-success` on `bg-success-soft`, `text-primary-soft-foreground` on `bg-primary-soft`. Components never invent pairs; they use the maps in `src/components/ui/tone.ts`. All 31 pairs are contrast-tested in both themes.

## 3. Typography

**Plus Jakarta Sans Variable** (OFL), self-hosted with `@fontsource-variable`. Geometric and friendly, with distinct numerals; tables and KPIs use `tabular-nums` (`.tabular`) so figures align.

| Role | Size / line height | Weight | Class |
|---|---|---|---|
| Display number (KPI, totals) | 26–28 / 32–36 | 700, tight tracking | `text-[1.625rem] font-bold tracking-tight` |
| Page title (h1) | 24 / 32 | 700, tight | `text-2xl font-bold tracking-tight` |
| Auth headline | 28 / 36 | 700 | `text-[1.75rem]` |
| Card title (h2) | 16 / 24 | 600 | `text-base font-semibold` |
| Body | 14 / 22 | 400–600 | `text-sm` (body default) |
| Label / caption | 13 / 20 | 500–600 | `text-label` (custom token) |
| Small meta | 12 / 16 | 400–700 | `text-xs` |
| Overline (section headings, table headers) | 11 / 16, +0.08em, uppercase | 600 | `text-overline` (custom token) |

Hierarchy comes from **weight and colour first, size second**: one big number per card, titles in `foreground`, everything supporting in `muted-foreground`.

## 4. Spacing, radius, shadow

**Spacing** is Tailwind's 4px scale, used in a few fixed steps:

- 4 / 6 / 8 px inside components (icon gaps, badge padding);
- 12 px between related controls (toolbar, button groups: `gap-2`/`gap-3`);
- 16 / 20 / 24 px for card padding (`p-5` phone and default, `sm:p-6`) and grid gutters (`gap-4` phone, `sm:gap-6`);
- page gutters 16 / 24 / 32 px (`px-4 sm:px-6 lg:px-8`), content capped at 1440px;
- cards own their rhythm: a vertical flex with a 20px gap; header, content and footer only add side padding, so every card has identical spacing.

**Radius scale** (`--radius-*`): 6px badges and chips (`rounded-sm`) · 8px buttons and inputs (`rounded-md`) · 10px menu items, nav pills, icon chips (`rounded-lg`) · 14px cards (`rounded-xl`) · 18px dialogs and hero surfaces (`rounded-2xl`) · full for avatars and pills.

**Shadow scale** (`--elev-*`, cool-tinted, theme-aware): `shadow-xs` controls · `shadow-sm` cards at rest · `shadow-md` cards on hover · `shadow-lg` menus and popovers · `shadow-xl` dialogs, drawers, toasts · `shadow-primary` a soft accent glow under primary buttons and the active nav pill. Dark mode uses deeper, more opaque shadows plus a visible card border.

**Motion:** 150–200 ms, ease-out. Cards lift 2px on hover, menus pop in (fade + 4px rise), drawers slide, skeletons shimmer. All motion is disabled under `prefers-reduced-motion`.

## 5. Components

- **Sidebar** (260px, collapsible to a 76px icon rail, remembered): logo row; uppercase overline section headings; 42px items with 22px icons; **active leaf = brand-gradient pill with accent glow**; a group containing the current page gets a neutral tint and stays open; active child = soft accent pill with a filled dot; count badges as soft pills; a workspace/plan card pinned to the bottom. Below 1024px it becomes a left drawer.
- **Top bar** (64px, sticky): translucent `--topbar` with backdrop blur and a hairline; search field that opens the command palette (`Ctrl/⌘ K`); theme toggle, shortcuts grid, notifications (unread counter, tinted list, "Mark all as read"), avatar menu with presence dot.
- **Page header:** breadcrumb (muted, 13px) above one row holding back button + title + count badge on the left and actions on the right, **vertically centred on one line**; on phones the actions wrap below as full-width buttons.
- **Cards:** white on tinted page, 14px radius, `shadow-sm`, hairline border; header = title + muted description + `⋯` menu. KPI cards add a tinted icon chip, trend chip, display number, an edge-to-edge sparkline and a blurred tone glow in the corner. The hero card uses a soft accent wash and an illustration.
- **Buttons:** 38px (`md`), 32px (`sm`), 44px (`lg`); variants primary (solid + glow), soft (tinted accent), outline (neutral), ghost, danger (solid red, destructive confirmations only), link.
- **Inputs:** 38px, 8px radius, 3:1 border, accent border + 3px soft ring on focus, danger border + ring when `aria-invalid`. Select (Radix), async relation picker (cmdk in a popover), date, currency with addon, switch rows, radio cards, tags, drag-and-drop file zone with previews.
- **Badges:** soft tint + dot for status (Paid green, Pending blue, Partly paid amber, Overdue red, Draft neutral), solid counters on the accent.
- **Tables:** uppercase overline headers on `--muted`, sticky inside the card's scroll area; avatar + name + email cells; numbers right-aligned and tabular; due dates with an urgency hint; progress bars for collection; row-action `⋯` menu; selection tints the row and raises a floating dark bulk-action pill; pager with page size.
- **Overlays:** menus/popovers 10px radius + `shadow-lg`; dialogs 18px radius + `shadow-xl` over a blurred backdrop; confirmation dialogs focus **Cancel** first; drawers slide from the right with a gradient summary panel; toasts top-right, tinted icon, auto-dismiss, swipe to close.
- **Charts:** gradient area fill for the main series, dashed comparison line, dashed horizontal gridlines only, muted axis ticks with no axis lines, card-style tooltips, donut with rounded segments and the total in the centre, legends that double as data tables.
- **Illustrations:** original token-coloured SVGs (auth panel, growth, empty tray, shield, mail, cover rings); always decorative, never the only carrier of information.

## 6. Do / don't

**Do**
- Use one primary button per view; everything else is soft, outline or ghost.
- Pair every status colour with a word and a dot (never colour alone).
- Keep numbers tabular and right-aligned; put the unit in the header, not every cell.
- Let wide content (tables, boards) scroll **inside** its card; the page never scrolls sideways.
- Reach for a tone map (`TONE_SOFT`, `TONE_TEXT`, `TONE_FILL`) instead of composing colours.
- Give every icon-only button an `aria-label` (and a tooltip when it is not obvious).

**Don't**
- Don't write a literal colour in a component (hex, `rgb()`, `bg-red-500`, `text-white`); the test fails.
- Don't use the gradient for more than one element per view region (active nav pill, hero/summary panel, primary emphasis).
- Don't stack shadows and borders heavily in light mode; cards rely on `shadow-sm` + hairline.
- Don't use red for anything but errors, overdue and destructive actions.
- Don't put essential information in tooltips, hover states or charts only.
- Don't centre-align table text or mix radius values inside one component.
