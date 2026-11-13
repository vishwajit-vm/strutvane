---
name: adr
description: Record an architecture decision as a new ADR in docs/adr, and update the executive summary and affected docs. Use whenever a significant technical, product or process decision is made or changed.
---

# adr — record an architecture decision

1. Read `docs/00-executive-summary.md` and `docs/adr/README.md` to find related decisions and the next free number.
2. Copy `docs/adr/0000-template.md` to `docs/adr/NNNN-<kebab-title>.md` and fill in Context, Decision, Alternatives (table) and Consequences. Use today's date. Status starts as `Proposed`; set it to `Accepted` only when the user confirms.
3. If it changes an existing decision:
   - set the old ADR's status line to `Superseded by ADR-NNNN`. This is the only edit allowed to an accepted ADR.
   - update the matching `D#` row in `docs/00-executive-summary.md`.
4. Add the ADR to the table in `docs/adr/README.md`.
5. Run the `blueprint-sync` skill so every doc that mentions the old decision is updated.
6. Report what changed, with file links.
