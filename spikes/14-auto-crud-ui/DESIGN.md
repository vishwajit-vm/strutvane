# Strutvane UI design standard

> **Visual direction is being re-decided (2026-11-14).** Tokens and component visuals will be replaced by the chosen direction. Behavioural rules stay:
> - accessibility (§7);
> - conveniences (§11);
> - the Back control (§4);
> - layout and overflow rules (§3);
> - ownership and extension (§8);
> - content style (§6).

**Applies to:** `@strutvane/ui` and **every package that adds screens** (auth, logs viewer, files, notify, billing, …).
**Status:** v0.1 (2026-11-14), proven in `spikes/14-auto-crud-ui`.
**Source of truth for values:** `src/app/styles.css`. This document explains them. If the two ever disagree, the stylesheet wins and this file gets fixed in the same PR.

The look is a modern, card-based admin:
- a vertical menu;
- a floating sticky navbar;
- soft shadows and rounded corners;
- compact but airy spacing;
- full light and dark parity.

**The design is original.** It shares a *style* with popular premium admin templates. It uses no CSS, markup, images, illustrations, colours or fonts from any of them. The third-party assets used are listed in §10.

**How to read this document:**
- **MUST**: CI enforces the rule. A test fails when it is broken.
- **SHOULD**: reviewers enforce the rule.
- **MAY**: the rule is a recommendation.

---

## 1. Principles

1. **Clarity first.** Every screen answers "where am I, what can I do, what happened":
   - a page header with breadcrumbs;
   - one primary action;
   - a toast after every write.
2. **Dense, not cramped.** Tables and forms show a lot at once. The spacing rhythm (multiples of 4 px, mostly 16/20/24 px) keeps them easy to scan.
3. **Consistency over novelty.** Use the components in §4. A new pattern needs a change to this document first.
4. **Accessible by default.** WCAG 2.2 AA is release-blocking. Contrast is computed per token pair (§7), and axe runs on every screen.
5. **Light/dark parity.** Every token has a value in both themes. Nothing is "light only". A screen is done when it has been checked in both themes.
6. **Tokens, never literals.** Components use tokens. One accent hue themes the whole app (§2.1).

---

## 2. Design tokens

Every token is a CSS custom property on `:root`, overridden under `.dark`. Tailwind utilities map to them through `@theme inline`: `bg-primary`, `text-muted-foreground`, `shadow-card`, `rounded-xl`, `z-(--z-dropdown)`, `duration-(--duration-fast)`.

**MUST:** components use token utilities or `var(--token)` only. Hex values, `rgb()`/`hsl()`/`oklch()` literals, and Tailwind palette classes (`bg-red-500`, `text-white`) are rejected by `test/shared/design-tokens.test.ts`.

### 2.1 Colour

Colours are OKLCH, built around **one accent hue**:

```css
:root { --brand-hue: 277; }   /* the ONE place to change the accent (0–360) */
```

Changing it re-themes buttons, the active menu item, badges, focus rings, charts, the logo and the tinted neutrals, in both themes.

`test/shared/contrast.test.ts` checks every text/background pair for the configured hue **and for every hue in 15° steps**. So any accent a developer picks stays AA.

**Brand and surfaces**

| Token | Light | Dark | Use |
|---|---|---|---|
| `--background` | `oklch(0.975 0.004 H)` | `oklch(0.2 0.018 H)` | page behind cards |
| `--foreground` | `oklch(0.3 0.02 H)` | `oklch(0.91 0.01 H)` | body text |
| `--card` / `--card-foreground` | `oklch(1 0 0)` / foreground | `oklch(0.245 0.022 H)` / foreground | cards, menus, dialogs, navbar |
| `--sidebar` | `oklch(1 0 0)` | `oklch(0.245 0.022 H)` | vertical menu |
| `--muted` | `oklch(0.955 0.007 H)` | `oklch(0.28 0.02 H)` | table header, switch track bg, theme switch |
| `--muted-foreground` | `oklch(0.49 0.02 H)` | `oklch(0.74 0.02 H)` | secondary text, captions |
| `--accent` / `--accent-foreground` | `oklch(0.95 0.025 H)` / `oklch(0.4 0.13 H)` | `oklch(0.31 0.04 H)` / `oklch(0.88 0.06 H)` | hover and highlight backgrounds |
| `--primary` | `oklch(0.48 0.2 H)` | `oklch(0.7 0.15 H)` | primary buttons, active item, links |
| `--primary-foreground` | `oklch(0.995 0 0)` | `oklch(0.17 0.02 H)` | text on primary |
| `--primary-soft` / `--primary-soft-foreground` | `oklch(0.94 0.035 H)` / `oklch(0.42 0.17 H)` | `oklch(0.32 0.06 H)` / `oklch(0.86 0.08 H)` | soft buttons, badges, icon tiles |
| `--border` | `oklch(0.91 0.008 H)` | `oklch(0.32 0.02 H)` | dividers, card edges |
| `--input` | `oklch(0.86 0.01 H)` | `oklch(0.4 0.02 H)` | input borders, switch off |
| `--ring` | `oklch(0.48 0.2 H)`* | `oklch(0.7 0.15 H)` | focus ring |
| `--overlay` | `oklch(0.2 0.02 H / 0.5)` | `oklch(0.1 0.01 H / 0.65)` | modal and drawer backdrop |

`H` = `var(--brand-hue)`. *`--ring` follows `--primary` in light mode.

**Primary scale:**
- **Light:** soft `0.94` → foreground-on-soft `0.42` → hover `0.95` → solid `0.48`.
- **Dark:** soft `0.32` → solid `0.7` → on-soft text `0.86`.

All steps share hue `H`. Chroma rises towards the solid step.

**Semantic colours** (fixed hues, so they don't change with the brand)

| Token | Light | Dark | Soft (light / dark) |
|---|---|---|---|
| `--success` | `oklch(0.5 0.13 155)` | `oklch(0.76 0.13 155)` | `oklch(0.95 0.04 155)` / `oklch(0.3 0.05 155)` |
| `--warning` | `oklch(0.5 0.12 70)` | `oklch(0.8 0.12 80)` | `oklch(0.96 0.05 85)` / `oklch(0.31 0.05 80)` |
| `--destructive` (danger) | `oklch(0.53 0.2 27)` | `oklch(0.72 0.16 27)` | `oklch(0.95 0.03 27)` / `oklch(0.31 0.06 27)` |
| `--info` | `oklch(0.5 0.12 235)` | `oklch(0.78 0.11 235)` | `oklch(0.95 0.03 235)` / `oklch(0.31 0.05 235)` |

The semantic colour is the *text and icon* colour; `-soft` is its background. `--destructive-foreground` is `oklch(0.995 0 0)` light and `oklch(0.17 0.02 27)` dark.

**Chart series:** `--chart-1` = the brand. `--chart-2..4` are the brand hue + 120°, + 220° and + 60°:
- **Light:** L 0.55–0.7.
- **Dark:** L 0.7–0.75.

### 2.2 Typography

| Token | Value |
|---|---|
| Family | `'Public Sans', ui-sans-serif, system-ui, sans-serif` (`--font-sans`; weights 400, 500, 600 bundled via @fontsource) |
| `text-xs` | 0.75rem / 1rem (12/16 px): badges, table headers (uppercase, `tracking-wider`), captions |
| `text-sm` | 0.8125rem / 1.25rem (13/20): labels, secondary text, breadcrumbs |
| `text-base` | 0.9375rem / 1.5rem (15/24): body, inputs, table cells, menu items |
| `text-lg` | 1.125rem / 1.75rem (18/28): dialog titles |
| `text-xl` | 1.25rem / 1.75rem (20/28): app name, section titles |
| `text-2xl` | 1.5rem / 2rem (24/32): page `<h1>`, stat values |

**Weights:**
- 400 for body text;
- 500 for labels, buttons and the active menu item;
- 600 for headings, stat values and badges.

**Headings:**
- one `<h1>` per page, in the page header;
- card titles are `<h2>` (`text-base font-semibold`);
- never skip a level.

### 2.3 Spacing

Tailwind's 4 px base (`--spacing: 0.25rem`).

**Rhythm:**
- 4 and 8 px inside controls;
- 12 px between icon and label;
- 16 px between fields in a row;
- 20 px for card padding (`p-5`) and form row gaps;
- 24 px between cards (`gap-6`) and for page padding on desktop (`px-6`).

**MUST NOT:** use arbitrary pixel values (`p-[13px]`) except for one-off optical alignment, with a comment.

### 2.4 Radius

| Token | Value | Use |
|---|---|---|
| `--radius` (`rounded-md`) | 0.5rem (8 px) | inputs, buttons, selects |
| `rounded-sm` | 0.375rem | badges |
| `rounded-lg` | 0.625rem | menu items, tabs, list options |
| `rounded-xl` | 0.75rem | cards, dialogs, dropdowns, navbar, toasts |
| `rounded-full` | | avatars, count badges, the switch |

### 2.5 Shadows (elevation)

| Token | Light | Dark | Use |
|---|---|---|---|
| `--shadow-sm` | `0 1px 3px` brand-tinted 8 % | black 25 % | the switch thumb, a focused input, the active theme option |
| `--shadow-card` | two layers: `0 2px 6px` + `0 8px 24px`, brand-tinted 6 % | `0 2px 10px` black 30 % | cards, the navbar, the sidebar |
| `--shadow-popover` | `0 8px 30px` brand-tinted 16 % | black 45 % | dropdowns, dialogs, toasts, a stat card on hover |
| `--shadow-primary` | `0 2px 8px` primary 35 % | primary 30 % | primary buttons, the active menu item, the active tab |

Borders are subtle (`border-border/60`); elevation comes from shadow. Never use both a strong border and a strong shadow.

### 2.6 Breakpoints

Tailwind defaults:

| Name | Width |
|---|---|
| `sm` | 40rem / 640 px |
| `md` | 48rem / 768 px |
| `lg` | 64rem / 1024 px |
| `xl` | 80rem / 1280 px |
| `2xl` | 96rem / 1536 px |

**`md` is the shell breakpoint:** below it, the sidebar becomes a drawer.

### 2.7 Z-index

| Token | Value | Layer |
|---|---|---|
| `--z-sticky` | 10 | sticky navbar |
| `--z-sidebar` | 30 | sidebar and its drawer backdrop |
| `--z-dropdown` | 40 | dropdowns, relation listboxes |
| `--z-overlay` | 50 | modal backdrop and dialog |
| `--z-toast` | 60 | toasts, the focused skip link |

**MUST:** use these tokens (`z-(--z-dropdown)`), never raw numbers.

### 2.8 Motion

| Token | Value | Use |
|---|---|---|
| `--duration-fast` | 120 ms | hover, colours, the switch, chevrons |
| `--duration-base` | 200 ms | sidebar width, the drawer, card hover, a busy table fading |
| `--duration-slow` | 300 ms | larger entrances (charts animate with Recharts' defaults) |
| `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | everything |

**MUST:** respect `prefers-reduced-motion`. The stylesheet reduces every transition and animation to 0.01 ms, and skeletons use `motion-reduce:animate-none`. Motion is never the only signal of a change.

---

## 3. Layout

```
┌───────────────┬──────────────────────────────────────────────────────────┐
│ ▲ Strutvane   │  ┌─ navbar (sticky, floating card) ───────────────────┐  │
│               │  │ 🔍 Search…  Ctrl K      ☀ ☾ 🖥   🔔   (AR)         │  │
│ ▣ Dashboard   │  └────────────────────────────────────────────────────┘  │
│ ACCESS     ⌄  │  Home › Posts                                            │
│  👥 Users     │  Posts                                   [+ New post]    │
│ CONTENT    ⌄  │  Search, filter and manage posts.                        │
│ ▌📄 Posts 35▐ │  ┌─ card ──────────────────────────────────────────────┐ │
│  📁 Categories│  │ [search……………] [Filters] Deleted [Hide deleted ▾]   │ │
│  🏷 Tags      │  │ TITLE ↕   SLUG ↕   PRICE ↕   STATUS   AUTHOR …      │ │
│               │  │ …rows…                                         ⋯   │ │
│ ⇤ Collapse    │  │ Showing 1–25 of 35 posts   Rows [25▾]  « ‹ 1 2 › »  │ │
└───────────────┴──┴─────────────────────────────────────────────────────┴─┘
```

| Element | Value |
|---|---|
| Sidebar width | expanded `--sidebar-width` **16.25rem (260 px)**; collapsed `--sidebar-width-collapsed` **4.75rem (76 px)** |
| Sidebar | fixed and full height; brand row = navbar height; menu scrolls; the collapse button is pinned at the bottom (desktop only) |
| Navbar | `--navbar-height` **3.875rem (62 px)**; sticky; floats as a card 12 px from the top, inset 16 px (24 px from `md`); blurred backdrop |
| Content | `max-width: --content-max-width` **90rem (1440 px)**, centred; padding 16 px, 24 px from `md`; 24 px vertical |
| Page header | breadcrumbs (`text-sm`, chevron separators, last crumb `aria-current="page"`), then the `<h1>`, an optional description, actions right-aligned; 24 px below |
| Grid | `gap-6` everywhere. Dashboard stat cards: 1 → 2 (`sm`) → 4 (`xl`). Charts: 2/3 + 1/3 at `lg`. Forms: 1 column, 2 from `md`, with textareas/JSON spanning both |

**Responsive rules:**
- Below `md`, the sidebar is an off-canvas drawer. It is opened by the navbar's menu button, and closed by the overlay, its close button, or following a link.
- Labels are always shown in the drawer, even when the desktop menu is collapsed.
- Tables scroll horizontally inside their card. The page never scrolls sideways.
- Page header actions wrap under the title.
- Touch targets are at least 32 px; menu items are 40 px.

**Overflow rule (MUST):** wide content scrolls inside its own box, never the page.
- **The box:** every scroll container (`overflow-auto` / `overflow-x-auto`) is also positioned (`relative`).
- **Why:** visually hidden text (`sr-only`, which is `position: absolute`) inside a non-positioned scroll box escapes it and widens the whole page. This was found at 1440 px: the Posts table pushed the page to 1918 px, and content slid under the sidebar.
- **The content column:** carries `min-w-0`.
- **Regression test:** `test/app/conveniences.test.tsx`.

---

## 4. Components

Every component lives in the app as owned code (`src/app/components/ui/*`, shadcn-style) and uses tokens only. **States**, in order:
- **default**;
- **hover**: `accent` bg, or primary at 90 %;
- **active**: pressed or current;
- **focus**: always the `--ring`, 2 px, never removed without a replacement;
- **disabled**: 50 % opacity, `pointer-events-none`, a `disabled` attribute;
- **loading**: label changes to "Saving…" plus `disabled`, or a skeleton;
- **error**: `--destructive` border, plus a message linked with `aria-describedby`.

| Component | Anatomy | Variants / sizes | State notes | Do / Don't |
|---|---|---|---|---|
| **Button** (`button.tsx`) | optional icon (16 px) + label | `default` (primary, `shadow-primary`), `soft` (primary-soft), `outline` (card + input border), `ghost`, `destructive`, `link`; sizes `default` h-36 px, `sm` h-32, `icon` 36×36 | loading = text "Saving…" + disabled; `type="button"` by default | **Do:** one `default` button per view. **Don't:** icon-only without `aria-label`; red for anything but destroying data. |
| **Input / Textarea** (`input.tsx`) | label above (`text-sm font-medium`), control (h-40 px, `rounded-md`, `bg-card`, `border-input`), help, error | text, email, url, tel (picked from the column name), numeric via `inputmode` | focus: `border-primary` + 2 px ring at 30 %; error: `aria-invalid` gives a destructive border; disabled: `bg-muted` | **Do:** keep the typed text as is ("12." stays). **Don't:** `type="number"` for decimals; placeholder as the label. |
| **Select** (`native-select.tsx`) | native `<select>` styled like an input | single; an empty option only when nullable or there is no default | same as Input | **Do:** native for ≤ ~20 fixed options. **Don't:** custom listboxes for enums. |
| **Async select** (`RelationSelect.tsx`) | ARIA 1.2 combobox input + listbox popover (`shadow-popover`, `z-dropdown`) + optional clear button | single | Loading…, error and "no match" rows; Up/Down/Enter/Escape | **Do:** show the current value's title even when it is not on page 1. **Don't:** load the whole table. |
| **Checkbox / radio** | native input `size-4 accent-primary` + label | checkbox group as `<fieldset>`/`<legend>` | native focus ring | **Do:** wrap the input in its label. |
| **Switch** (`switch.tsx`) | 44×24 track, 20 px thumb | one size | on: `bg-primary` + `shadow-primary`; off: `bg-input` | `role="switch"` + `aria-checked`; labelled by `<label for>`. |
| **Date picker** | native `type="date"` / `datetime-local` styled as Input | date, datetime | | Datetimes are entered in the user's time zone and sent as UTC. A `DATE` is formatted in UTC (it never shifts a day). |
| **Badge** (`badge.tsx`) | text, `rounded-sm`, `text-xs font-semibold` | `default` (primary-soft), `muted`, `success`, `warning`, `danger`, `info` | | **Do:** text carries the meaning (colour reinforces). **Don't:** badges as buttons. |
| **Avatar** (`avatar.tsx`) | initials in a 36 px circle, a soft tone from the name; optional status dot (`ring-card`) | sizes via `className` | | Decorative (`aria-hidden`); the name is always in nearby text. No remote images by default. |
| **Card** (`card.tsx`) | `rounded-xl`, `bg-card`, `shadow-card`, `border-border/60`; `CardHeader` (h2 title + subtitle + actions), `CardContent` (`p-5`) | `as="section"` with `aria-labelledby` for regions | stat card hover: `shadow-popover` | **Don't:** nest cards inside cards (use a divider). |
| **Stat card** (dashboard) | 44 px soft-tone icon tile + value (`text-2xl font-semibold`) + label | tone cycles primary, success, info, warning | value skeleton while loading | The whole card is one link to the list. |
| **Table** (`ResourceTable.tsx`) | full-bleed inside its card; header `bg-muted/60`, `text-xs uppercase tracking-wider`; rows 52 px (`h-13`), `px-5`, `text-base`, hover `accent/40`; numbers right-aligned with `tabular-nums`; actions column right-aligned (View, Edit, Delete as 36 px icon buttons with names) | one density (comfortable); compact is a future token | sortable header = button with `aria-sort`, first click ascending; busy = previous rows at 60 % opacity; loading = skeleton rows (`aria-busy`); empty = see §6 | **Do:** the title column links to the record. **Don't:** hide row actions behind hover only. |
| **Pagination** (`Pagination.tsx`) | "Showing 1–25 of 35 posts", Rows per page (10/25/50/100), first/prev/numbers/next/last as `soft` 32 px buttons; the current page `default` + `aria-current="page"` | | edges disabled | Window: 1 … n-1 n n+1 … last. |
| **Tabs** (detail page) | pill tabs: active = `bg-primary` + `shadow-primary`; panel = a card | | roving tabindex; Left/Right/Home/End | The open tab is in the URL (`?tab=`). |
| **Dropdown menu** (`dropdown-menu.tsx`) | 36 px round trigger; panel 288 px, `rounded-xl`, `shadow-popover`, optional header block, items 36 px `rounded-lg` with a 16 px icon | `align` start/end | menu button pattern: `aria-haspopup`, `aria-expanded`; the first item is focused; arrows, Home/End, Escape (focus returns), Tab and outside click close | **Don't:** put form fields in a menu. |
| **Modal / confirm** (`dialog.tsx`, `DeleteButton.tsx`) | overlay `bg-overlay`; panel max 32 rem, `p-6`, `rounded-xl`, `shadow-popover`; confirm = 48 px soft icon circle + title + description + actions (Cancel, then the destructive action) | `dialog`, `alertdialog` | focus trap; Cancel focused first; Escape and backdrop close; focus returns to the opener | Say what happens: "moves to the trash. You can restore it later." / "cannot be undone." |
| **Toast** (`toast.tsx`) | bottom-right stack, 320 px, success icon + message + Dismiss; `shadow-popover` | success (others reuse Alert tones later) | 4 s auto-dismiss; polite live region; never steals focus | After every create, save, delete and restore. One sentence, past tense. |
| **Alert** (`alert.tsx`) | `rounded-lg`, `p-4`, title + body | `error` (destructive-soft), `info` (info-soft) | `role="alert"` for errors after an action, `status` otherwise | Always include the next step ("Retry"). |
| **Tooltip** | native `title` in v0.1 (collapsed menu items) | | | **Planned:** an accessible tooltip (`role="tooltip"`, shown on focus and hover, Escape dismisses). Never put essential information only in a tooltip. |
| **Back control** (`BackButton.tsx`, in `PageHeader`'s `back` prop) | arrow-left icon (20 px) + "Back to <Plural>" (or "Back to <record title>" on edit), placed before the `<h1>` | desktop: icon + text; below `sm`: icon only, named by `aria-label` | **Behaviour:** goes back in history when the previous entry is inside the app (`useCanGoBack`), so the list returns with its URL state (page, filters, sort) and scroll position (router scroll restoration). Otherwise (direct link, new tab) it goes to the parent route: detail → list, edit → detail, create → list. **Keys:** Alt+← anywhere; Escape inside a form. Both pass through the unsaved-changes guard. | **When to show:** on every page below the top level (detail, create, edit, nested and custom pages). **Never** on top-level pages (dashboard, lists). Breadcrumbs stay. |
| **Breadcrumbs** (`PageHeader.tsx`) | `nav[aria-label=Breadcrumb] > ol`; chevron separators (`aria-hidden`); links muted, hover primary | | last crumb `aria-current="page"` | Always start at Home. |
| **Sidebar item / group** (`Sidebar.tsx`) | item: 20 px icon (stroke 1.75) + label + optional badge, 40 px, `rounded-lg`; group: an uppercase `text-xs` heading button with a chevron | expanded, collapsed (icons + `title`), drawer | active = `bg-primary text-primary-foreground shadow-primary` (exactly one class set, via `activeProps`/`inactiveProps`); group `aria-expanded` | Badge: `'count'` (live rows) or short text; its accessible name reads "Posts, 35 rows". |
| **Navbar items** (`TopBar.tsx`) | search trigger (icon + "Search…" + `kbd` hint), theme switch (3 pressed-state buttons in a group), notifications (bell + dot), account (avatar + status dot) | | each a ≥ 32 px target with an accessible name | Keep to these four; packages extend through §8. |
| **Search (Ctrl/Cmd+K)** (`CommandPalette.tsx`) | dialog with a combobox input (48 px) and a listbox; screens first, then records with icons and a type hint | | Ctrl+K / Cmd+K anywhere (also inside inputs: a modifier never collides with typing); Up/Down wrap; Enter opens; Escape closes | Only searches resources the user may list. |
| **Charts** (`charts.tsx`, seed of `@strutvane/charts`) | `<figure aria-label>` + chart (`aria-hidden`) + a visually hidden data table; card wrapper | bar, donut | skeleton while loading; Recharts' entry animation (reduced-motion respected) | Series colours `fill-chart-1..4` in order; gridlines `stroke-border`; axes `muted-foreground` 12 px; tooltip = card + `shadow-popover`. **Don't:** encode meaning by colour alone (legend + percentages). |

---

## 5. Iconography

- **Set:** [Tabler Icons](https://tabler.io/icons) via `@tabler/icons-react` (MIT), outline style only.
- **Sizes:**
  - 20 px (`size-5`) for menu items and navbar;
  - 16 px (`size-4`) inside buttons and menus;
  - 24–28 px for stat tiles and empty states.
- **Stroke:** 1.75 for menu icons, Tabler's default 2 elsewhere.
- **Accessibility:** icons are always `aria-hidden`. The control's text or `aria-label` names it.
- **Resource icons:** these come from a closed `IconName` list. The owned files and the generator share it, so an unknown icon is a type error.

---

## 6. Content style

**Voice:** friendly, short, specific. Address the user as "you". Sentence case everywhere ("New post", not "New Post").

| Situation | Pattern | Example |
|---|---|---|
| Buttons | verb + noun | "New post", "Save changes", "Delete post", "Clear search and filters" |
| Labels | the column's label, sentence case; required = `*` + "(required)" for screen readers | "Published on *" |
| Empty, no data | what is missing + the next step | "No tags yet", then [Create tag] |
| Empty, filtered | why it's empty + the way out | "No posts match your search or filters", then [Clear search and filters] |
| Errors | what went wrong + how to fix it; never internals | "Title is required." / "Price can have at most 2 digits after the decimal point." / "The server had a problem. Please try again; if it keeps happening, tell your administrator." |
| Not found / no access | the same message for both (no enumeration) | "This page does not exist, or you do not have access to it." |
| Confirmations | the consequence, in plain words | "“Hello” moves to the trash. You can restore it later." |
| Toasts | past tense, one sentence | "Post “Launch day” created." / "Changes saved." |
| Help text | how and why, not what | "Filled in from the title (a number is added if it is taken); edit it to choose your own." |

---

## 7. Accessibility requirements

**WCAG 2.2 AA is release-blocking.**

**Contrast**: computed by `test/shared/contrast.test.ts`.
- **Text:** ≥ 4.5:1 for every pair, at the configured hue and at every 15° hue.
- **UI parts and the focus ring:** ≥ 3:1.

Measured at hue 277:

| Pair | Light | Dark |
|---|---|---|
| `--foreground` on `--background` | 12.71 | 13.86 |
| `--foreground` on `--card` | 13.67 | 12.44 |
| `--muted-foreground` on `--card` | 6.28 | 7.04 |
| `--muted-foreground` on `--background` | 5.84 | 7.84 |
| `--muted-foreground` on `--muted` | 5.51 | 6.33 |
| `--accent-foreground` on `--accent` | 8.25 | 9.16 |
| `--primary-foreground` on `--primary` | 6.95 | 6.95 |
| `--primary` on `--card` (links) | 7.05 | 5.90 |
| `--primary-soft-foreground` on `--primary-soft` | 7.50 | 8.24 |
| `--destructive` on `--card` | 5.85 | 6.12 |
| `--destructive-foreground` on `--destructive` | 5.77 | 7.22 |
| `--destructive` on `--destructive-soft` | 4.97 | 5.08 |
| `--success` on `--success-soft` | 4.90 | 6.56 |
| `--warning` on `--warning-soft` | 5.44 | 7.00 |
| `--info` on `--info-soft` | 5.02 | 6.64 |
| `--ring` on `--card` (focus, ≥ 3) | 5.91 | 5.90 |

**Focus:**
- every interactive element shows a 2 px `--ring` on `:focus-visible`;
- inputs also turn `border-primary`;
- never `outline: none` without a replacement.

**Keyboard:**
- **Shell:** the skip link is the first Tab stop. Ctrl/Cmd+K opens search.
- **Composite widgets:** tabs, menus, the combobox and listboxes use arrow keys.
- **Dialogs and menus:** dialogs trap focus. Escape closes dialogs and menus and returns focus to the opener.
- **Forms:** after a failed submit, focus moves to the first invalid field.

**ARIA patterns** (WAI-ARIA APG):
- combobox (search, relation select);
- menu button (account, notifications);
- tabs;
- dialog and alertdialog;
- switch;
- table with `aria-sort`;
- live regions (the list count `role="status"`, toasts `aria-live="polite"`);
- breadcrumb `nav` with `aria-current`.

**Names:**
- icon buttons carry an `aria-label`;
- the badge text joins the link name with punctuation ("Posts, 35 rows").

**Charts:** each chart also renders its numbers as a visually hidden table.

**Testing:** `test/app/a11y.test.tsx` runs axe-core on every generated screen and state (sign-in, dashboard with charts, list with filters, empty list, form with errors, edit, detail with a tab, the delete dialog, the open account menu with a collapsed sidebar, a toast, the search palette). The required result is **0 violations**. jsdom can't measure contrast, so the contrast test above covers it.

---

## 8. How packages extend the UI (without breaking the standard)

A package never ships its own CSS colours, fonts or layout. It contributes data, and the shell renders it with these components.

1. **Sidebar entries.** Packages register `NavigationPage` entries in the app's navigation registry (spike 12: `app.navigation.items`): `{ name, label, path, icon, group?, sort?, badge?, permission }`.
   - They are merged with the resource entries by `buildNavigation`, under the same ordering rules.
   - An entry is shown only when the user has `permission` (deny by default).
   - `icon` must be an `IconName`.
2. **Screens.**
   - **Resource screens:** come from metadata and owned `resources/ui/*.ui.ts` files.
   - **Custom screens:** are composed of `PageHeader` + `Card` + the components in §4.
   - **Package pages:** screens outside the SPA (for example the logs viewer at `/_strutvane/logs`) link the same stylesheet and use the same tokens.
3. **Dashboard widgets.** **Planned:** a `DashboardWidget` registry, `{ id, title, size: 'stat' | 'third' | 'two-thirds' | 'full', permission, render }`, rendered inside `Card`/`ChartCard`.
   - A widget's data comes from its package's API, under the user's permissions.
   - Charts use `@strutvane/charts` (§4 Charts) and series tokens only.
4. **Navbar.** Packages may add **notifications** (planned `@strutvane/notify` feeds the bell menu) and **account menu items** (`DropdownItem`s). They never add new top-level navbar buttons.
5. **Themes.**
   - **Accent:** apps re-theme by setting `--brand-hue` (one line).
   - **Deeper changes:** a full theme overrides tokens only, never component classes, and must keep `test/shared/contrast.test.ts` green.
   - **Font:** apps may swap `--font-sans` for another OFL/open font.
6. **Enforcement in every package that ships screens:**
   - copy `test/shared/design-tokens.test.ts` (no literal colours);
   - copy `test/shared/contrast.test.ts` when the package defines tokens;
   - run axe on each of its screens.

---

## 11. UX conveniences

Each item is part of the standard: **P0** = in the spike now (tested); **P1** = the real 0.2 build; **P2** = later. Every item is keyboard-accessible, token-based, and covered by axe where it renders something. Tests: `test/app/conveniences.test.tsx`.

### Navigation

| Item | What and when | Keyboard / accessibility | Priority | Where |
|---|---|---|---|---|
| Back control with restored list state | see §4 "Back control" | Alt+←; `aria-label` when icon-only | **P0 done** | `components/BackButton.tsx` |
| Breadcrumbs | every page | `nav` + `aria-current` | **P0 done** | `components/PageHeader.tsx` |
| Deep links | list search, filters, sort, page and size live in the URL; the detail tab is `?tab=` | | **P0 done** | `route-search.ts`, `ListPage.tsx` |
| Command palette | jump to a screen, a record (by title), or an action ("New post", switch theme, keyboard shortcuts) | Ctrl/Cmd+K, `/`; combobox + listbox | **P0 done** | `shell/CommandPalette.tsx` |
| Next/previous record | on detail pages, in the list's default order (approximated by id; no position endpoint yet) | links named "Next post: <title>" | **P0 done** | `resource/RecordNavigation.tsx` |
| Keyboard shortcuts + `?` overlay | `g d` dashboard, `/` search, `n` new, `e` edit, `?` help, Esc closes | single keys never fire while typing or under a dialog | **P0 done** | `shell/shortcuts.tsx` |
| Recently viewed records | palette section and dashboard card | | P1 | needs per-user storage |
| Pinned favourites in the sidebar | pin any list or record | | P1 | needs per-user storage |

### Lists

| Item | What and when | Keyboard / accessibility | Priority | Where |
|---|---|---|---|---|
| Sticky table header | the header stays while rows scroll inside the card (`max-h: 70vh`) | | **P0 done** | `ResourceTable.tsx` |
| Column show/hide | "Columns" menu; the title column always stays; remembered per viewer (localStorage) | `menuitemcheckbox` + `aria-checked`; stays open while toggling | **P0 done** | `ListView.tsx`, `view-prefs.ts` |
| Density toggle | comfortable (52 px rows) or compact (36 px); remembered per viewer | `aria-pressed` | **P0 done** | same |
| Filter chips + Clear all | each active search, filter or deleted-rows setting is a chip with a remove button | the remove button is named "Remove filter: Price at least 10" | **P0 done** | `FilterChips.tsx` |
| Shareable URL | "Copy link to this view" (filters, sort and page included) | toast confirms; fallback when the clipboard is blocked | **P0 done** | `ListView.tsx`, `lib/clipboard.ts` |
| Search-term highlight | matches in text cells wrapped in `<mark>` (literal, case-insensitive, like the server) | colour pair contrast-tested | **P0 done** | `ResourceTable.tsx` (`Highlighted`) |
| Copy ID / link | on detail pages | names include the id ("Copy ID (1)") | **P0 done** | `RecordNavigation.tsx` |
| Bulk actions, export | opt-in per resource (`actions`) | | exists (opt-in) | `define-ui.ts` |
| Column resize/reorder, saved views, quick-view drawer, inline edit | | | P1 | |

### Forms

| Item | What and when | Keyboard / accessibility | Priority | Where |
|---|---|---|---|---|
| Save and add another | on create forms: save, toast, then a fresh form with focus on the first field | | **P0 done** | `FormPage.tsx` |
| Unsaved-changes guard | any navigation away from a changed form (link, Back, Escape, Alt+←, browser Back) asks "Leave without saving?"; reloading or closing the tab uses the browser's prompt; never after a successful save | `alertdialog`; "Keep editing" is focused | **P0 done** | `FormPage.tsx` (`useBlocker`) |
| Help text, required markers, character counters | counter "12/200" for limited text fields; read as "12 of 200 characters" | via `aria-describedby`, not a live region | **P0 done** | `FormField.tsx` |
| Scroll to first error | after a failed save: centre the first invalid field and focus it | | **P0 done** | `FormPage.tsx` |
| Duplicate record, autosaved drafts (never secret fields), date range presets, drag-drop upload | | | P1 | |

### Safety and feedback

| Item | What and when | Keyboard / accessibility | Priority | Where |
|---|---|---|---|---|
| Undo delete | the soft-delete toast has "Undo" (10 s, paused while hovered or focused); the same is always possible via Deleted records, then Restore | the toast action is a real button | **P0 done** | `DeleteButton.tsx`, `toast.tsx` |
| Type-to-confirm | permanent deletes (tables without soft deletes) need the record's name typed | labelled input; the button stays disabled until it matches | **P0 done** | `DeleteButton.tsx` |
| Retry on network errors | reads retry twice on no connection or 5xx; never on 4xx, never writes | | **P0 done** | `api/client.ts` (`shouldRetry`) |
| Skeleton loaders | | `aria-busy` | exists | |
| Optimistic updates with rollback, offline indicator, session-expiry warning | | | P1 | |

### Context

| Item | What and when | Keyboard / accessibility | Priority | Where |
|---|---|---|---|---|
| Relative time + exact tooltip | timestamps read "3 hours ago"; `title` shows the exact local time; `<time dateTime>` | | **P0 done** | `cells.tsx`, `lib/time.ts` |
| Related-record counts on tabs | "Posts 13" on detail tabs | spoken "Posts, 13" | **P0 done** | `RecordNavigation.tsx` |
| Created/updated **by** | needs audit data | | P1 (audit package) | |
| Per-record activity history, contextual docs link, first-run tour | the welcome checklist exists | | P1 | |
| Language switcher | | | P2 | |

## 9. Changelog

| Version | Date | Change |
|---|---|---|
| 0.2 | 2026-11-14 | Added:<br>• the Back control (§4);<br>• the overflow rule (§3);<br>• the UX conveniences chapter (§11) with the P0 set implemented and tested.<br>The visual direction is being re-decided (note at top). |
| 0.1 | 2026-11-14 | First standard, from spike 14:<br>• OKLCH tokens with one `--brand-hue`, light and dark;<br>• Public Sans and Tabler Icons;<br>• the shell (260/76 px sidebar, 62 px floating navbar, 1440 px content);<br>• component specs;<br>• contrast, axe and hard-coded-colour tests. |

Changes to this standard follow the normal flow: a PR that updates `styles.css`, this file and the tests together, and a changelog row.

---

## 10. Third-party assets and licences

| Asset | Package (version) | Licence | Use |
|---|---|---|---|
| Tabler Icons | `@tabler/icons-react` 3.50.0 | MIT | all icons |
| Public Sans typeface | `@fontsource/public-sans` 5.3.0 | SIL Open Font License 1.1 | UI font (self-hosted from the npm package) |
| Recharts | `recharts` 3.10.1 | MIT | dashboard charts |
| Tailwind CSS | `tailwindcss` / `@tailwindcss/vite` 4.3.5 | MIT | utility CSS engine |
| shadcn/ui patterns | (copied patterns, no package) | MIT | component structure ideas (cva variants, token names such as `--primary`, `--muted-foreground`) |
| class-variance-authority | 0.7.1 | Apache-2.0 | button variants |
| clsx / tailwind-merge | 2.1.1 / 3.7.0 | MIT | class joining |
| TanStack Router / Query / Table | 1.170.46 / 5.107.1 / 9.3.1 | MIT | routing, data, table model |
| React / React DOM | 19.3.1 | MIT | UI runtime |

No images, illustrations or icons other than those above. The logo mark (`BrandMark.tsx`) and the avatars (initials) are drawn in code for this project.
