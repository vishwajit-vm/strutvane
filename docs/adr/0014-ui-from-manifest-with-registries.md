# ADR-0014: The UI is rendered from the ResourceManifest through typed widget and cell registries

- **Status:** Accepted
- **Date:** 2026-11-13
- **Related:** [Spike 08 report](../../spikes/08-ui-renderer/README.md), [08 UI](../08-package-ui.md), [RFC-0003](../rfcs/0003-errors-and-messages.md)

## Context

Strutvane generates a UI for every resource with no per-resource code. Customizing it must never require forking the renderer.

Spike 08 showed that one `ResourceDescriptor` can drive an accessible list page and form page: axe-core found 0 violations. Its tests also caught **five defects** that naive implementations ship:
- number columns sorted descending on the first click
- the decimal point swallowed in number inputs
- error messages shown twice
- the error banner never receiving focus
- a virtualized table that renders **zero rows** when its container can't be measured

## Decision

- **`@strutvane/ui` renders lists and forms from the `ResourceDescriptor`.**
- **All list operations run on the server** through `ListQuery`. TanStack Table supplies only the row model and sort state (`manualSorting`, `sortDescFirst: false`). The URL parser and the filter bar share one filter builder, so the UI can never send a filter the server would reject.
- **TanStack Form owns form values and validators.**
- **A typed registry picks the component.** Widgets resolve `Resource.field` → named widget → field type → `default`. Cells resolve `Resource.field` → field type → `default`. Apps override either through a provider, with no fork.
- **Accessibility is wired once.** One shared field wrapper owns label, help and error wiring, so every override gets it automatically.
- **Errors use one message catalog,** shared by client validation and the server. A 422 issue goes to the deepest rendered field (e.g. `lines[1].amount`), else its parent field, else the form banner. Focus moves to the first invalid field.
- **Lists virtualize above 100 rows,** with a fail-safe window that always shows the first rows.
- **The framework-free half lives in `ui/core`,** so a future Vue renderer can reuse it.

## Consequences

- **Positive:**
  - zero per-resource UI code
  - overrides at field and column level
  - accessibility wired once
  - multiple renderer frameworks possible
- **Costs:** dynamic field names weaken TanStack Form's static types at a few seams.
- **Follow-ups (Phase 3):**
  - A browser test job (Playwright + axe) for colour contrast and real frame times.
  - A searchable relation picker beyond the first 100 records.
  - Base UI vs Radix evaluation.
  - The RFC-0003 flows: keeping the draft across a 401, a conflict diff view for 409, and offline autosave.
