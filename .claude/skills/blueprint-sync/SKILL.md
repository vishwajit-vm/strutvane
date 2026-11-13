---
name: blueprint-sync
description: Keep the Strutvane blueprint internally consistent. After any decision, rename or scope change, find and fix every stale reference, broken link and contradiction across docs/, READMEs and package CLAUDE.md files.
---

# blueprint-sync

1. Identify the change: the old term, decision or file name, and the new one.
2. Search everything:
   - `docs/**/*.md`
   - `README.md`
   - `CLAUDE.md`
   - `packages/*/README.md`
   - `packages/*/CLAUDE.md`
   - `packages/*/.claude/**`

   Search for the old term with case variants and code spans.
3. Fix each hit so it matches `docs/00-executive-summary.md`. Do not edit accepted ADRs; supersede them instead (see the `adr` skill).
4. Check links. Every relative `](…md)` target must exist. Section anchors must match real headings.
5. Check indexes: `docs/README.md`, the root `README.md` and `docs/adr/README.md` list every document.
6. Report what you fixed and anything that needs a human decision, such as genuine contradictions.

Useful link check (bash):

```bash
cd docs && for f in *.md adr/*.md research/*.md; do grep -o '](\([0-9a-zA-Z/._-]*\.md\)' "$f" | sed 's/](//' | while read l; do [ -f "$(dirname $f)/$l" ] || echo "$f -> $l"; done; done
```
