# Spike 17: design direction A, "Modern Pro"

**Question:** what would `@strutvane/ui` look like as a premium, commercial-grade vertical-menu admin (rich cards, gradients, sparklines, illustrations, equal-quality light and dark themes), and does that direction hold up across every screen type the framework generates?

**Answer (for the lead to judge):** a clickable mockup of 19 screens in both themes, built only from tokens and open-licence parts, with WCAG AA proven for every colour pair and 0 axe violations on the densest screens. Compare it with directions B and C, then pick.

The design is documented in **[DESIGN-A.md](DESIGN-A.md)** (mood, exact tokens for both themes, type, spacing, radius, shadow, components, do/don't).

## Preview

```bash
cd spikes/17-design-a-modern-pro
npm install
npm run dev        # http://localhost:5181  (strict port)
```

Use the dashed **Screens** button (top bar, or top-right on the sign-in pages) to jump to any screen; the moon/sun button switches theme (remembered in `localStorage`); `Ctrl/⌘ K` opens the command palette. `npm run build && npm run preview` serves the production build on the same port.

## Screens

| Area | Screens |
|---|---|
| Auth | Sign in (split layout, brand panel with original illustration), Forgot password (+ "check your inbox" state) |
| Overview | Dashboard: hero card with target progress, 4 KPI cards (trend chips, sparklines), revenue area chart (12M/6M/3M), invoices-by-status donut, collection-goal ring, top plans (sparklines + share bars), activity timeline, recent invoices table |
| Invoices | List (breadcrumb + back + title + count + actions on one row; status tabs with counts; search, saved views, filters popover, filter chips, density, column visibility, view switch; sticky header, avatar cells, status badges, right-aligned numbers, progress bars, row menu, selection + floating bulk bar, pager with page size), empty state, loading skeleton, quick-view drawer, delete confirmation |
| | Create / Edit form: 4 sectioned cards, two-column grid, text, textarea with counter, currency, number, select, async relation select, date, switches, radio cards, tags, file drop zone with previews, inline validation, sticky summary, sticky action bar |
| | Detail: status badge + actions, 4 summary cards, tabs (Overview with field list + line items, Activity timeline, Payments table, Files), customer card, promo card |
| Views | Kanban board (drag and drop + keyboard "Move to" menu), Calendar (month grid; agenda list on phones; upcoming list) |
| Account | Profile (cover, avatar, about, stats, teams, activity), Settings tabs: Profile, Security (password strength, 2FA methods, recovery codes dialog), Sessions, Notifications matrix, API tokens (create-token dialog that shows the token once), Team members (stats, role select per member, invite dialog, remove confirmation) |
| Components | Overlays & feedback: command palette, notifications dropdown, confirm dialog, drawer, toasts (4 tones), buttons, badges, controls, skeletons |

All data is typed, seeded mock data (`src/data`): 64 invoices whose statuses agree with their dates and payments, 18 customers, 10 team members, fixed "today" of 14 Nov 2026.

## Stack (all open licence)

React 19, TypeScript strict (no `any`, no non-null assertions), Vite 8, Tailwind CSS 4, Radix primitives via `radix-ui` (MIT), cmdk (MIT), Recharts 3 (MIT), Tabler Icons (MIT), Plus Jakarta Sans via `@fontsource-variable` (OFL). Original logo glyph and illustrations, hand-written SVG. A small History-API router (`src/lib/router.tsx`) instead of a routing library, so screens stay easy to read.

## Tests (`npm test` = typecheck + Vitest; 63 tests)

- `screens.test.tsx`: every screen in the switcher renders in **light and dark** (38 renders) with an h1 and the right theme class; shell, theme memory and 404.
- `a11y.test.tsx`: axe-core **0 violations** on dashboard, invoice list (with rows selected and the bulk bar open) and create form (before and after a failed submit), both themes.
- `contrast.test.ts`: WCAG AA for 31 text/background pairs in both themes, computed exactly from `styles.css`, for the configured accent **and every accent hue in 15° steps**.
- `no-hard-coded-colours.test.ts`: no hex, colour function, Tailwind palette class or arbitrary colour anywhere in `src/` (the rule itself is tested).
- `logic.test.ts`: list filter/sort/paging, pager window, validation messages, mock-data consistency.

## What was checked in the browser (2026-11-15)

Run on the dev server and inspected at **1440×900** and **375×812**, in **light and dark**:

- Dashboard, invoice list (+ empty, loading, row selection/bulk bar), create form (+ validation), detail, board, calendar, profile, settings (security, API tokens), team, sign-in, overlays page (command palette, notifications, confirm dialog, quick-view drawer).
- Horizontal overflow measured with a script on all 19 routes at 375px: `scrollWidth` equals the viewport everywhere.

Fixed during that pass:

1. The welcome card crowded its buttons and truncated stat labels at 1440px; rebalanced the grid (6/6), shortened labels, added a target-progress row to fill the card.
2. KPI cards squeezed the number beside the sparkline at narrow widths; the sparkline now runs edge-to-edge along the bottom.
3. Stray 1px vertical scrollbars on horizontally scrollable tab rows (`overflow-y-hidden`).
4. Profile, team and API-token pages overflowed at 375px: single-column grids lacked a shrinkable track (`grid-cols-1`), and absolutely positioned helpers inside scroll areas escaped them (scroll containers are now `relative`).
5. Toasts covered the form's sticky Save button; they now appear top-right, below the top bar.
6. The form's action bar stacked three full-width buttons on phones; it is now one row (Cancel lives in the back button).
7. Calendar chips truncated names at 1440px; amounts now show only on very wide screens.
8. axe: a definition list with nested wrappers and an unlabeled hidden file input.

## Honest notes

- **Mockup, not product code.** Behaviour is simulated (toasts instead of requests). Productised components will be rewritten with full tests, as for every spike.
- **Charts animate on mount** (Recharts default). In a background/hidden browser tab the animation can pause mid-way; it completes when the tab is visible.
- **Bundle:** one ~300 kB gzip chunk (Recharts + Radix). Fine for a mockup; the product would code-split per screen.
- **Kanban drag and drop** is native HTML5 (mouse only); keyboard users move cards with each card's "Move to" menu.
- **Ports:** `npm run dev` uses 5181 as briefed. The shared hub `.claude/launch.json` (not part of this commit) starts it on 5191 for the side-by-side comparison.
