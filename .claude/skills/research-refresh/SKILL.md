---
name: research-refresh
description: Re-verify third-party facts in the Strutvane blueprint (library versions, competitor status, licenses, name availability) and write a new dated research snapshot. Use before starting a phase, or when a doc's facts are older than ~3 months.
---

# research-refresh

1. Read `docs/research/stack-snapshot-*.md` (the latest one) and `docs/02-competitive-analysis.md`.
2. Re-verify with primary sources:
   - npm registry dist-tags (`https://registry.npmjs.org/<pkg>`)
   - official release notes and blogs
   - GitHub repos

   Do not rely on memory.
3. Write `docs/research/stack-snapshot-YYYY-MM.md` with a source for every row. Mark anything unverified as *(unverified)*. Add a "changes since last snapshot" section.
4. Name availability: re-run the script at the end of `docs/research/naming-checks-2026-11-13.md` for `strutvane` and save the dated output.
5. Update the docs whose decisions are affected (usually `11-technology-decisions.md` and `15-risks-and-tradeoffs.md`). Raise genuine decision changes to the user, and use the `adr` skill if they agree.
6. Never put user or project personal data into search queries or request headers.
