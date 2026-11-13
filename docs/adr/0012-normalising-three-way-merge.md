# ADR-0012: Upgrades of ejected files use a normalising three-way merge with fail-closed fallbacks

- **Status:** Accepted
- **Date:** 2026-11-13
- **Related:** [Spike 06 report](../../spikes/06-three-way-merge/README.md), [ADR-0003](0003-model-first-thin-metadata-driven-generation.md), [04 Architecture §4](../04-architecture.md)

## Context

Ejected files belong to the user and are usually edited. When a template changes, `sv upgrade` must merge the template's changes into the user's file without ever losing user edits.

Spike 06 found that the merge algorithm isn't the real problem. **Line endings are:**
- Raw diff3, whether `git merge-file` or node-diff3, turns a CRLF user file (the norm on Windows) into one whole-file conflict.
- git also conflicts on files without a final newline.

The spike also found that lost state (the stored base copy, or the lock file) must never lead to a wrong merge.

## Decision

- **Merge engine:** node-diff3, run on normalised comparison keys (LF, and optionally trailing-whitespace-insensitive).
  - The output is rebuilt from the original lines, preferring the user's lines wherever both sides are unchanged.
  - Line endings, BOM and the final newline are merged three-way, like lines (`mergeShapes`).
- **Fail closed on missing or bad state.**
  - Base copies are verified with sha256. If a base is missing or tampered with, the merge falls back to two-way, and every difference becomes a conflict.
  - The lock file is validated with zod, and a corrupt lock is backed up.
- **Moved files** are found by their template header. Ambiguous moves and unresolved conflict markers block the upgrade.
- **Optional formatter pass** with the user's own Biome config. It only runs when the user's file is already formatted, and it is never fatal.
- **Applying is a staged, journaled transaction,** with rollback and crash recovery.
- **No git dependency.**
- **After applying,** the CLI runs the project's typecheck and tests, because some conflicts are semantic rather than textual.

## Consequences

- **Positive:** user edits are never silently dropped (property-tested with 8,000 random cases), and the merge is cross-platform.
- **Costs:** semantic conflicts, such as a renamed identifier, need the post-upgrade typecheck, and re-indenting a block produces a conflict.
- **Follow-up:** package this as `@strutvane/devkit`'s merge engine, with the spike's golden corpus as its acceptance suite.
