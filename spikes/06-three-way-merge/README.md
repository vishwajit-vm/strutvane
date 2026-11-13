# Spike 06: Three-way merge for `sv upgrade` of ejected files

**Date:** 2026-11-13. **Status:** answered.

## Question

Can `sv upgrade` safely update **ejected** (user-owned, user-edited) generated files when templates change? The merge takes three inputs:
- **base:** the original template output
- **theirs:** the new template output
- **ours:** the user's edited file

It must meet five requirements:
1. Non-overlapping changes merge cleanly.
2. Overlapping changes produce standard conflict markers plus a structured report, and **never silently drop user edits**.
3. Identical changes on both sides don't conflict.
4. It survives CRLF vs LF, trailing whitespace, formatter reflow, and user renames and deletions.
5. The state it needs (`.strutvane/base/` + `.strutvane/lock.json`) is minimal and recoverable when missing or corrupt.

## Answer

**Yes, with three design choices that are now proven:**
- **Merge on normalised comparison keys but emit original lines.** The user's version wins wherever both sides count a line as unchanged.
- **Treat file conventions (line ending, BOM, final newline) as three-way-merged properties.**
- **Never guess when information is missing:**
  - A lost or tampered base downgrades the merge to two-way, where every difference becomes a conflict.
  - An ambiguous rename is blocked.
  - Unresolved markers block a re-merge.

Raw line diff3 — whether node-diff3 or `git merge-file` — is **not** enough on its own. Both turn a CRLF user file into a whole-file conflict and change its line endings, and git also conflicts on a file without a final newline.

## Evidence

```
typecheck: clean (tsc 6.0.3, strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes)
Test Files  5 passed (5)
     Tests  47 passed (47)
property evidence run: PROPERTY_RUNS=2000 → 4 properties × 2,000 random cases, all pass
```

| Test file | What it proves | Tests |
|---|---|---|
| `test/corpus.test.ts` | 20 golden cases (realistic controller + React form page), each with reviewed output in `test/__golden__/` | 21 |
| `test/property.test.ts` | No line added by either side is ever lost; identity laws; CRLF behaves exactly like LF; trailing whitespace never conflicts | 4 |
| `test/upgrade.test.ts` | Plan/apply on real temp dirs: clean, conflict, deleted, moved, ambiguous move, foreign file, new file, missing/tampered base, corrupt/missing lock, dry run, rollback, crash recovery | 16 |
| `test/format.test.ts` | Formatter reflow with the **real Biome 2.6.7 CLI** and a real `biome.json`, plus fail-soft behaviour | 4 |
| `test/evaluation.test.ts` | Library comparison table + 200-case differential test against `git merge-file` | 2 |

**The tests are not toothless.** I planted two bugs and both were caught, then restored the code:

| Planted bug | Result |
|---|---|
| "Conflicts silently resolved in favour of the template" | 7 tests fail. The property test reports `user line lost: U0()` |
| "Identical-change (false conflict) detection removed" | 2 tests fail |

**The property test also found a real bug during the spike.** When the user's file equals the base, the merge used to copy the *user's* final-newline setting, so a template change to the final newline was lost. It's fixed by `mergeShapes()`: conventions now merge three-way like lines.

### Golden corpus (20 cases)

| # | Scenario | Result |
|---|---|---|
| 01 | User adds a hook; template adds optimistic locking + `restore` elsewhere | clean |
| 02 | User never edited the file | clean, exactly the new template |
| 03 | Template unchanged | clean, exactly the user file |
| 04 | Both made the identical change | clean |
| 05 | Both changed the same line differently | conflict `both-modified` |
| 06 | User deleted `update`; template modified it | conflict `deleted-by-you` |
| 07 | Template deleted `remove`; user customised it | conflict `deleted-by-template` |
| 08 | Both inserted different actions at the same spot | conflict `both-added` |
| 09 | User file is CRLF, templates LF | clean, CRLF kept |
| 10 | Mixed CRLF/LF user file | clean, majority style + note |
| 11 | Editor added trailing spaces on many lines | clean, user's whitespace kept |
| 12 | Same, strict mode, whitespace edit on a line the template changes | conflict (as configured) |
| 13 | Form: user adds a field; template adds props two lines away | clean |
| 14 | Form: user changes the hook line; template edits elsewhere | clean |
| 15 | No final newline | clean, kept |
| 16 | UTF-8 BOM | clean, kept |
| 17 | `__proto__` / `constructor` / `toString` lines | clean, exact |
| 18 | Base missing (two-way fallback) | conflict on every difference, labelled `(unavailable)` |
| 19 | User re-indented a block (wrapped in `<Card>`) | conflict (known line-merge limit, see Limits) |
| 20 | Nothing changed | clean, identical |

### Library evaluation

| Scenario | **strutvane** (node-diff3 + normalisation) | node-diff3 raw | git merge-file --diff3 |
|---|---|---|---|
| non-overlapping edits (want clean) | ✅ clean | ✅ clean | ✅ clean |
| identical change both sides (want clean) | ✅ clean | ✅ clean | ✅ clean |
| overlapping edits (want conflict) | ✅ conflict | ✅ conflict | ✅ conflict |
| user file is CRLF (want clean) | ✅ clean | ❌ conflict, EOL changed | ❌ conflict, EOL changed |
| editor trailing whitespace (want clean) | ✅ clean | ✅ clean | ✅ clean |
| `__proto__` / `constructor` lines (want clean) | ✅ clean | ✅ clean | ✅ clean |
| user file without final newline (want clean) | ✅ clean | ✅ clean | ❌ conflict |

**Random differential test** (200 cases, seed 42):
- **Agreement:** strutvane and git agree on status in 199/200 cases.
- **Safety:** neither loses a user line.
- **The one difference:** it is benign. Both sides deleted the same line, and the template also deleted one of two identical `{` lines. node-diff3 aligns the duplicates so the shared deletion is recognised as identical, giving a correct clean merge. git aligns them differently and conflicts.

**Library choices:**

| Library | Decision | Why |
|---|---|---|
| **node-diff3 3.2.1** | ✅ Chosen engine | Exposes index-level regions (`diff3MergeRegions`, `diffIndices`), which lets us diff on normalised keys and rebuild output from original lines. Version 3.2.1 also fixed the prototype-key bug (`__proto__` lines) that older versions had. 4.0.0 was published hours before this spike, so it was skipped under the minimum-release-age policy. |
| **`git merge-file`** | ❌ Reference only | It's an excellent baseline, but the CLI must not hard-depend on git. Users can run `sv upgrade` before `git init`, and CI images and Windows machines may lack git. It's also process-per-file, and it fails the CRLF and final-newline cases. |
| **jsdiff 9.0.0** | ✅ For dry-run output only | v9 has no three-way merge API. We use it for the dry run's unified diffs (`createTwoFilesPatch`). |

## Design

```
src/text.ts     line-ending / BOM / final-newline detection, LF normalisation, comparison keys,
                mergeShapes() (three-way merge of file conventions)
src/merge.ts    mergeThreeWay() / mergeTwoWay(): pure functions; diff3 on keys, output from
                original lines; structured Conflict[]; hasConflictMarkers()
src/format.ts   Formatter interface + Biome CLI adapter (uses the user's biome.json); fail-soft
src/lock.ts     zod-validated lock (path-traversal-safe keys), sha256-verified bases,
                corrupt-lock backup, atomic writes (temp + rename)
src/header.ts   `// @strutvane-template <id>@<version>` header (lets moved files be found)
src/upgrade.ts  planUpgrade() → renderDryRun() → applyPlan() (staged + journaled transaction)
                → recoverUpgrade() (restores from the journal after a crash; idempotent)
src/fs.ts       injectable file-system interface (tests inject failures and crashes)
```

### Decision table (per file)

| Situation | Action |
|---|---|
| Template unchanged, or its change already present | `unchanged`: the base still advances to the new version |
| Clean merge | `update` |
| Conflicts | `conflict`: markers are written, the lock records `conflicted: true`, and the next run is `blocked` until the markers are removed |
| File missing, and its header found in exactly one other file | `update` at the new path. The lock key and base move with it. |
| File missing and no header found | `skip-user-deleted`: the lock remembers it, so it's never recreated |
| Header found in several files | `blocked`: never guess |
| Base missing or hash mismatch, or the lock is missing/corrupt | two-way merge: every difference is a conflict, nothing applied silently |
| A user file without our header at a template path | `blocked` |
| New file in the template | `create` |

### Conflict markers

```
<<<<<<< yours
    const record = await ctx.query.update(ctx.params.id, { ...input, updatedBy: ctx.actor.id })
||||||| framework/controller@1.0.0 (original)
    const record = await ctx.query.update(ctx.params.id, input)
=======
    const record = await ctx.query.update(ctx.params.id, input, { expectedVersion: ctx.request.ifMatch })
>>>>>>> framework/controller@1.1.0 (new)
```

Each conflict also has a structured entry with these fields:
- `kind`: `both-modified`, `both-added`, `deleted-by-you` or `deleted-by-template`
- `outputLine`
- `ours`, `base` and `theirs`

These entries feed the CLI report and `--json` output.

### Transactions

`applyPlan` runs in three steps:
1. **Stage:** every new content is written into `.strutvane/staging/<tx>/`, every original is backed up, and the journal is written.
2. **Commit:** the staged files are renamed into place. The lock is renamed last.
3. **On failure:** committed operations are restored and the staging area is removed. If the rollback itself fails (for example, the process died), the journal stays behind. The next `applyPlan` then refuses to run, and `recoverUpgrade` restores the pre-upgrade state.

## Limits & risks

| Limit | Why | Mitigation |
|---|---|---|
| **Semantic conflicts are invisible.** If the user renames an identifier and the template's new code still uses the old name, the merge comes out clean but won't compile. | Line merges know nothing about TypeScript | `sv upgrade` must run the project's `typecheck` (and tests) after applying, and report failures next to merge results. Longer term, consider an AST-aware merge for common shapes. |
| **Re-indentation conflicts** (case 19) | Every re-indented line looks changed | Document it. A future option could compare with leading whitespace ignored, but emitting the right indentation is non-trivial. |
| **Adjacent edits conflict** | node-diff3 treats touching hunks as overlapping, the same as git | Safe by design (no guessing). It slightly raises the conflict rate. |
| **Formatter step needs a working formatter** | The Biome CLI spawns one process per file | Fail-soft with notes, and only applied when the user's file is already formatted. Prettier needs its own adapter (same interface). |
| **A whitespace-only user edit on a line the template changes is superseded** (in the default trailing-whitespace-insensitive mode) | By the comparison key, the user "didn't change" that line | Use `ignoreTrailingWhitespace: false` for whitespace-significant files (Markdown, template literals with trailing spaces). |
| **Duplicate-line alignment can differ from git** (1/200 random cases) | Ambiguous longest-common-subsequence alignment of identical lines | No user-line loss either way. Covered by the property test. |
| **Not tested:** binary files, very large files (>10k lines), non-UTF-8 encodings | Out of scope | Treat binaries as replace-or-skip. Benchmark large files in Phase 1. Detect non-UTF-8 and refuse. |

## Recommendation for `@strutvane/devkit` and `@strutvane/cli`

1. **devkit owns the engine.** Move `text.ts`, `merge.ts`, `lock.ts`, `header.ts` and `upgrade.ts` into `@strutvane/devkit` as the public merge/upgrade API. Keep the `Fs` and `Formatter` interfaces injectable.
2. **The CLI owns the UX:**
   - `sv upgrade --dry-run`: unified diffs plus a summary table
   - `sv upgrade`: applies; exits with code 1 when conflicts exist; offers `--json`
   - `sv upgrade --recover`
   - `sv upgrade --continue`: re-checks conflicted files once the markers are gone
3. **Every ejected file carries the template header**, and every eject writes its base and lock entry. Commit `.strutvane/` to version control. It's small, and it lets teammates upgrade too.
4. **Run the project's quality gate after applying** (`typecheck` + `test`), to catch semantic conflicts that line merges cannot see.
5. **Keep the 20-case corpus and the property suite as permanent devkit tests.** Add a golden case for every bug report.

## Suggested ADR

> **ADR-00XX: Upgrades of ejected files use a normalising three-way merge with fail-closed fallbacks**
>
> **Context:** Ejected files are user-owned and edited. Template upgrades must merge into them without ever losing user edits. Raw diff3 (`git merge-file`, node-diff3) fails on CRLF user files and on files without a final newline. Lost state (base, lock) must not produce wrong merges.
>
> **Decision:**
> - node-diff3 runs on normalised comparison keys (LF, optional trailing-whitespace-insensitive). Output is rebuilt from original lines, preferring the user's lines wherever both sides are unchanged.
> - Line endings, BOM and final newline are merged three-way.
> - Base copies are sha256-verified. If one is missing or tampered with, the merge falls back to two-way, where every difference is a conflict.
> - Moved files are found by their template header. Ambiguous moves and unresolved markers block.
> - The lock is zod-validated, and corrupt locks are backed up.
> - Apply is a staged, journaled transaction with rollback and crash recovery.
> - git is not required.
>
> **Consequences:**
> - (+) User edits are never silently dropped (property-tested), and the merge is cross-platform.
> - (−) Semantic conflicts need a typecheck after the upgrade. Re-indentation produces conflicts.

## Run it

```bash
cd spikes/06-three-way-merge
corepack pnpm@12.18.0 install
corepack pnpm@12.18.0 exec tsc --noEmit
corepack pnpm@12.18.0 test                                   # 47 tests
PROPERTY_RUNS=2000 corepack pnpm@12.18.0 exec vitest run test/property.test.ts
corepack pnpm@12.18.0 exec vitest run test/evaluation.test.ts --silent=false   # prints the comparison table
```

The evaluation's git column needs `git` on PATH (it is skipped otherwise). The format tests use the Biome CLI installed in this spike's `node_modules`.
