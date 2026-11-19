# HANDOFF.md: how any AI session (any Claude account) picks up and hands back Strutvane work

> **Why this file exists:** the project lead uses more than one Claude account, and each account has its own private memory. This file is the **shared memory**: it lives in the repo, so every account and session reads the same thing. Private, per-account memory is only a cache and must never contradict this file, `STATE.md` or git.
>
> Read with `CLAUDE.md` (which imports it), `STATE.md` (live status) and `docs/21-delivery-plan.md` §0 (dashboard).

## 1. Start of every session (any account), in this order
1. Read `CLAUDE.md`, `.claude/ECOSYSTEM.md`, then **`STATE.md`** in full.
2. Read §5 of this file (the session log): the newest entry says where the last session stopped and what it left half-done.
3. Run `node scripts/state-check.mjs` in the hub. It must print `OK`. If it reports unpushed or uncommitted work, find out who left it (session log), and don't build on top of it until it's understood.
4. **Identity check (mandatory):** run `node scripts/identity-check.mjs`. It must print `OK`.
   - **What it checks:** every repo's commit email is the project lead's **personal** email, and the active GitHub CLI login is the **personal** account `vishwajitvm`. Strutvane is a personal project on a personal GitHub org; a work account and a work email also exist on this computer and must **never** be used here.
   - **If it fails:** don't commit, push or run `gh` against these repos. Don't switch accounts or change `git config` yourself. Tell the project lead which check failed.
   - **When to run it again:** before **every** commit and push, because the login can change in the middle of a session.
5. Read the `NEXT.md` of the branch you'll work on (for example framework `v2/data-layer`, `v2/app-core`).
6. Only then plan the work. Take the next item from `STATE.md` §4 / §2a, or `docs/21-delivery-plan.md` §0.3–0.4, unless the project lead says otherwise.

## 2. Anti-hallucination rules (binding)
1. **Check, don't remember.** Before saying something is merged, pushed, passing, released or decided, check it (`git log`, `git status`, `git ls-remote`, the gate output, `state-check`).
2. **Files beat memory.** If a summary, your own memory or a chat message disagrees with git or `STATE.md`, git wins; fix the note.
3. **Verified vs reported.** A test count is "verified" only once the coordinating session re-runs it itself. An agent's numbers are marked *(agent-reported)* until then.
4. **Never invent:** no made-up commit ids, test counts, versions, APIs, package names or dates. Say "I don't know" and look.
5. **Write it down in the same change.** Status goes in `STATE.md`, decisions in `spikes/CONSISTENCY-2026-11-15.md` or an ADR, branch progress in that branch's `NEXT.md`, the session's story in §5 below, all in the same commit as the work.
6. **After a context summary:** re-read `STATE.md` and §5 before acting. A summary is a lossy copy.
7. **Security findings that are not fixed yet** go only in the git-excluded private file `docs/research/2026-11-15-audit-findings.md`, never in commits, `NEXT.md`, `STATE.md`, commit messages or this file. Counts ("2 critical") are fine; the "how" is not.

## 3. Working rules that bite (the full rules are in `CLAUDE.md` and `.claude/ECOSYSTEM.md`)
- npm only. Gate before every commit: `npm ci` then `npm run ci`; commit or push only if it exits 0 (WIP commits on a work branch at a stop are the one exception, and are labelled WIP).
- Conventional commits, signed off (`git commit -s`). Stage by path (pathspec); in the hub, never `amend`, `reset`, `checkout` or `stash` (other sessions may be working there).
- Work on short-lived branches and merge into `main` only after the coordinator has verified the gate 3× green. `RELEASE_ENABLED=true` on framework, auth, ui, logs and create-strutvane: **any push to `main` there runs the release workflow**, so run `changeset version` first and merge the framework first.
- Never: commit `.env`, secrets or Docker files; type passwords, OTPs or tokens; publish or approve on npm without the project lead's 2FA; touch `C:\personal_projects\demo-strutvane-project`.
- Commit and push only after `node scripts/identity-check.mjs` prints `OK` (personal email and personal GitHub account only, never the work ones).
- Ask the project lead before: creating, renaming or deleting repos; pushing to `main` in a new way; anything a running agent says it was blocked from doing.

## 4. Stop protocol: on "stop", "pause", the usage limit, or a hand-over to another account
**When the project lead says "stop": stop immediately.** No new work, no verification runs, no waiting for agents to finish their steps.
1. Stop every subagent and background task (TaskStop / stop the shells and sleep timers).
2. Commit everything uncommitted on its work branch, by path, with a `wip:` / `docs(next):` message. Update that branch's `NEXT.md`: done, half-done, next, how to verify.
3. Update `STATE.md` (§2 rows, §2a, §6 log; mark agent numbers *(agent-reported)*).
4. Update `docs/21-delivery-plan.md` §0 (the dashboard: % done, done list, now / next / after, hours spent and left, release dates), then regenerate the PDF:
   ```bash
   node scripts/plan-to-pdf.mjs docs/21-delivery-plan.md <temp-dir>/plan.html
   "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu --no-pdf-header-footer --print-to-pdf="C:\personal_projects\strutvane\docs\21-delivery-plan.pdf" "file:///<temp-dir>/plan.html"
   ```
5. Add an entry at the top of §5 below (template there).
6. Run `node scripts/identity-check.mjs`. Only if it prints `OK`: commit the hub (`docs(state): …`) and **push every repo and branch**. If it fails: commit nothing more and push nothing; say so in the §5 entry and to the project lead.
7. Release this session's git worktrees once their branch is pushed and clean (`git -C packages/<repo> worktree remove <path>` and then `git worktree prune`). Worktrees in a session's scratchpad belong to that session only: while one exists, no other session or account can check out that branch. The branch and its commits stay.
8. Run `node scripts/state-check.mjs` and report the result in one line.
9. Update your own account's private memory with a pointer to this file. Nothing more is needed, because the facts live here.

**Same computer, different Claude accounts:** both accounts use the same project folder, so nothing needs to move between them. But only one account works at a time, and each finishes the stop protocol (including step 7) before the other starts.

**The 5-hour usage limit:**
- If the session can read usage (the Claude desktop app's usage tool), check it every ~15 minutes while agents run.
- At about **85%**, run the stop protocol above, so everything is pushed before 100%.
- If usage can't be read, run the stop protocol after each big milestone anyway; then hitting the limit loses nothing.

## 5. Session log (newest first; every session adds one entry when it stops)
Template:
```
### YYYY-MM-DD HH:MM (timezone): <account label, e.g. "account A" / "account B"> — <one-line summary>
- Did: …
- Commits / branches (pushed? yes/no): …
- Verified by re-running: … | Agent-reported only: …
- Left half-done: … (see <repo> NEXT.md)
- Next session should start with: …
```

### 2026-11-19 ~23:35 IST: account A — stopped for the night (the lead asked to stop by 12:00)
- **Released today (live on npm, now the `latest` default):** `@strutvane/auth`, `@strutvane/design-crisp` and `@strutvane/design-vivid` at 0.2.0-next.1, joining framework and ui. The lead moved `latest` for all five by hand.
- **Decision #131:** pre-1.0 releases go to `latest`. tooling 14c0922 stages `next` versions as `latest` and never moves it backwards; it's synced into framework, ui, auth, both designs, npx, create-strutvane and social-login.
- **Merged but not released:**
  - **create-strutvane 0.2.0-next.2** (main cc34ddb): Linux, Windows and the security checks are green. **macOS CI fails:**
    1. generated apps hit fsevents under strict-allow-scripts;
    2. 2 path tests (`/var` vs `/private/var`).
    FIRST TASK next time.
  - **social-login** (main 1306a62): needs a trusted publisher plus `RELEASE_ENABLED`.
- **Verified by re-running:**
  - auth: 864 + 64 tests, 3×;
  - designs: 106 / 233 tests, 3×;
  - installer: 524 tests, 3× on Windows;
  - tooling: 148 tests, 3×.
- **Next:**
  1. installer macOS fixes → release;
  2. framework gaps (`v2/gaps`);
  3. search verification;
  4. health, redis, import-export, files, charts;
  5. log-viewer after framework logging;
  6. the npx macOS fix.
  Weekly usage was about 65%, so stay paced.

### 2026-11-18 ~17:20 UTC: account A — stopped by the project lead ("stop everything")
- **Did:**
  - **released `@strutvane/framework` 0.2.0-next.1 and `@strutvane/ui` 0.2.0-next.1 to npm** (approved by the lead; CI green on all platforms);
  - installer v2 merged (0.2.0-next.1; its GitHub CI fix on `fix/ci-linux`);
  - social-login verified and synced;
  - search done (agent-reported);
  - tooling has 6 new targets.
- **All pushed.** No agents, no worktrees, no scheduled resume.
- **Note:** the old v1 `create-strutvane@0.1.0-next.0` was published to `next` by a batch approval; the v2 installer release replaces it.
- **Next session:** see STATE §2a, top rows first:
  1. installer CI fix → stage;
  2. auth → stage;
  3. designs → stage;
  4. trusted publishers + `RELEASE_ENABLED` for the new packages (the lead clicks on npmjs.com);
  5. framework gaps.

### 2026-11-18 ~14:10 UTC: account A — agents stopped at 71% (5-hour window), all pushed
- **Did:**
  - after the lead fixed the git email, pushed the pending status update (1fcbfcd);
  - resumed 8 package agents; 3 stalled under machine load (files, charts, health) and were WIP-committed;
  - the others were stopped and committed at the usage limit;
  - verifying framework `fix/release-0.2` myself: run 1 is 3,121 passed.
- **All branches are pushed:** heads in STATE §2a.
- **Next:**
  1. Finish the framework verification (runs 2–3, R1/R5), then merge to `main`, push and stage the npm release.
  2. Resume the package agents a few at a time; overload stalls them.
  3. Framework extension points that the package agents keep hitting (STATE §2a).

### 2026-11-18 ~11:35 UTC: account A — stopped by the project lead ("stop things")
- **Did:**
  - after the 16:00 IST reset ran 9 agents: framework blockers, the installer, and 7 new packages (social-login, files, charts, health, redis, search, import-export);
  - framework `fix/release-0.2` reached 3 green gate runs (3,121 tests, agent-reported).
- **All pushed:** heads are in STATE §2a. No agents, no worktrees, no auto-resume.
- **Next session should start with:**
  1. Framework `fix/release-0.2`: R1/R5 checks and my own 3× gate, then merge to `main` and push. The release stages 0.2.0-next.0 and the lead approves it on npmjs.com.
  2. The installer gate.
  3. Resume the 7 package agents from their NEXT.md files.
  4. Max 2–3 heavy gates at once.
  5. Watch the weekly limit (37% used).

### 2026-11-18 ~10:12 UTC: account A — stopped at 84% before the 16:00 IST reset
- **Did:**
  - framework `fix/release-0.2` 2492d9f: 4 of 5 blockers fixed (compat, database connection, exports, timeout); resources.json is WIP; the gate hasn't run;
  - installer `v2/installer` 62bbf28: renders from the skeleton, the 7 bugs fixed in code; tests still to update;
  - log-viewer `v2/log-viewer` 8d85229 done;
  - catalogue `feat/catalogue` d15a218 and docs `docs/framework-0.2` 51f7120 done, waiting on decisions or a port to the hub;
  - tooling d91e087 and npx 10aa9b1 verified and merged;
  - ui verified (499 tests).
- **All pushed.** No agents and no worktrees left.
- **Next session:**
  - 16:07 IST auto-resume: resume framework + installer, start 7 new packages (social-login, files, charts, health, redis, search, import-export), keep ≥10 in development;
  - verify framework `fix/release-0.2` 3×, then merge it to `main` and push, which stages the npm release;
  - the npx CI fails on macOS: fix it;
  - framework gaps from the docs agent (STATE §4);
  - storage gaps: `config/filesystems.ts` not read, no public disk / `storage:link`.

### 2026-11-18 ~10:00 UTC: account A — checkpoint before the 16:00 IST reset (agents still running)
- **Did:**
  - resumed at 08:20 UTC;
  - verified ui `v2/behaviour` c375f7b 3× (499 tests, against a framework 0.2 tarball);
  - verified and merged tooling `main` d91e087 (144/144) and npx `main` 10aa9b1 (107 passed);
  - the framework release blockers are partly fixed on `fix/release-0.2` 2ec0b7a (compat, sandbox timeout);
  - started the installer→skeleton switch, the log-viewer, the catalogue and docs agents;
  - stopped agent-tools (the project lead: release-critical work first).
- **Commits / branches:** all pushed. Agents in flight: STATE §2a.
- **Next session should start with:** STATE §2a.
  - Resume any stopped agent: its id is in memory `strutvane-resume-point`, or start a fresh one from the branch's NEXT.md.
  - When framework `fix/release-0.2` is done and verified 3×, merge it to `main` and push; the release then stages 0.2.0-next.0.

### 2026-11-18 ~04:10 UTC: account A — stopped by the project lead ("stop now")
- **Did:**
  - after the weekly reset ran 7 agents: framework CI fix, framework logging, auth codes, ui codes + RFC-0003, skeleton, npx guard, docs;
  - created 43 planned repos (2026-11-17) and renamed strutvane-logs to strutvane-log-viewer;
  - fixed the framework TruffleHog failure (6dfc239).
- **Commits / branches (all pushed):**
  - framework: `fix/ci-cross-platform` bf2fa91, `v2/logging` f3e28b8;
  - auth `v2/native-engine` 9e4bf38;
  - ui `v2/behaviour` c375f7b;
  - skeleton `v2/skeleton` 7a8be7e;
  - npx `main` 1e58faf;
  - docs `docs/framework-0.2` 2c9b4a1;
  - hub RFC-0003 faa5a14.
  No worktrees are left.
- **Verified by re-running:** npx guard 3× (107 passed). ui a9e8751: 1 of 3 runs failed on a flaky test, which is now fixed, so ui needs a re-run. The rest is agent-reported.
- **Left half-done:** see `STATE.md` §2 and §4 and each branch's `NEXT.md`.
- **Next session should start with:** `STATE.md` §4 step 1. These framework release blockers came from the skeleton's integration test:
  - `strutvane.compat` still `^0.1`;
  - no database connection in the v2 Application.
  Then the CI fix merge, which stages the npm release. Run at most 2–3 heavy test gates at once.

### 2026-11-17: account A — paused for the weekly usage limit (85%)
- Did: read `STATE.md`, ran state-check and identity-check (both OK); read both framework branches' `NEXT.md` and the private findings; started two agents (data-layer security fixes, app-core finish) in scratchpad worktrees, then stopped them within minutes when the weekly limit reached 85%. Neither had changed anything; the worktrees were released.
- Commits / branches (pushed? yes): this hub commit only; framework branches unchanged (`v2/data-layer` f9e505a, `v2/app-core` ef3ab03).
- Verified by re-running: state-check, identity-check. | Agent-reported only: nothing new.
- Left half-done: nothing new; the plan is unchanged (see the 2026-11-16 entry below and each branch's `NEXT.md`).
- Next session should start with: after 2026-11-18 00:00 UTC (weekly reset), §1, then re-launch the same two jobs: (1) data-layer: fix the 2 critical + 2 high findings (private file) with whole-class tests, stabilise the gate under load, re-run the security review; (2) app-core: NEXT.md items in order (tsc fixture, command tests, lowercase codes, exports/facades, serve wiring, deterministic serve-lifecycle test, changeset, gate 3×). Check usage (`get_usage`) every ~15 minutes and stop at ~85% of the 5-hour OR weekly limit.

### 2026-11-17: account A — commit identities corrected on the hub
- Did: two hub commits made with the wrong (work) identity, and a README contributor-badge commit, were rewritten on `main` at the project lead's request. All five commits since `ade92da` now carry only the personal identity (author, committer and `Signed-off-by`), with unchanged content, messages and dates; the badge commit was dropped. `main`'s force-push protection was lifted for that single push and restored.
- Commit id changes: 376e5d2→19871a4, 301c480→0cd873f, e6170dd→f80f25b, 418c2f3→713b5c9, 833fa40→25349c9; ea9744f dropped. Local clones made before this must reset to `origin/main`.
- Verified: content identical to the pre-badge tree; no commit in the hub history carries the work identity; identity-check OK.
- Next session should start with: §1 as usual.

### 2026-11-16 evening: account A (the original coordinator) — paused for the hand-over
- **Did:**
  - stopped all agents;
  - framework `v2/data-layer` (f9e505a) and `v2/app-core` (ef3ab03) were committed with `NEXT.md` and pushed;
  - `STATE.md`, the plan dashboard and the PDF updated and pushed (hub 0cd873f);
  - wrote this file. Its commit was made on 2026-11-17 while the office GitHub account was active, so it was **not pushed** then; the next session should push it with the personal account.
- **Verified:** `state-check` OK at the pause.
- **Agent-reported only:**
  - data-layer gate: 2,205 passed, 1 green run;
  - auth v2: 819 + 63;
  - installer v2: 473.
- **Left half-done:** both framework branches; see each one's `NEXT.md` and `STATE.md` §2a.
  - **data-layer:** 2 critical + 2 high security findings (private file). Fix these first.
  - **app-core:** 1 `tsc` error in a test fixture; command tests missing; the full gate has never run.
- **Next session should start with:**
  1. §1 of this file.
  2. Fix the data-layer review findings, each with a whole-class regression test, then re-run the security review.
  3. Finish app-core.
  4. Merge both, resolving the `make:migration` conflict, and run the gate 3×.
  5. Once npm has unlocked (from 2026-11-17 08:35 UTC), and only with the project lead present for 2FA: stage the framework release, then the 0.2 core train (`release/0.2/patches/README.md`).
  6. Answer the 6 open decisions in `STATE.md` §3, or ask the project lead.
