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

### 2026-11-16 evening: account A (the original coordinator) — paused for the hand-over
- **Did:**
  - stopped all agents;
  - framework `v2/data-layer` (f9e505a) and `v2/app-core` (ef3ab03) were committed with `NEXT.md` and pushed;
  - `STATE.md`, the plan dashboard and the PDF updated and pushed (hub 301c480);
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
