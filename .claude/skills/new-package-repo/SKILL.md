---
name: new-package-repo
description: Create a new first-party Strutvane package repository (e.g. notify, files, payments) with the standard professional scaffolding, CLAUDE.md, .claude skills/agents/commands, and GitHub repo settings. Use when the roadmap adds a package.
---

# new-package-repo

**Preconditions:**
- An accepted RFC/ADR for the package. Its RFC must include a "why not a plugin?" section.
- The user's explicit go-ahead to create a public GitHub repo.

1. Pick the name: `@strutvane/<capability>` (one lowercase noun). Repo: `vishwajitvm/strutvane-<capability>` (later `strutvane/<capability>`). Check that npm `@strutvane/<capability>` is unpublished.
2. Create `packages/<capability>/` with the same files as the existing package repos. Copy the structure of `packages/framework/`:
   - `README.md` (badges, design-phase note, capabilities, API preview, ecosystem table, links)
   - `CLAUDE.md` (purpose, status, boundaries, conventions, definition of done)
   - `.claude/skills/*/SKILL.md`, `.claude/agents/<reviewer>.md`, `.claude/commands/{spec,pre-pr}.md`
   - `LICENSE` (MIT, The Strutvane Authors), `CONTRIBUTING.md`, `SECURITY.md`, `.gitignore` (Docker + env ignored), `.editorconfig`
   - `.github/PULL_REQUEST_TEMPLATE.md`, `.github/ISSUE_TEMPLATE/*`
3. Write the package spec as `docs/NN-package-<capability>.md`, and add it to `docs/README.md`, the root `README.md` ecosystem table and every package README's ecosystem table.
4. Set the package boundaries: it depends only on `core` + `contracts`, and it implements the installer protocol (config, `.env` + `.env.example`, migrations, routes, UI pieces).
5. `git init -b main`, commit, then create the repo:

   ```bash
   gh repo create vishwajitvm/strutvane-<capability> --public --description "<tagline>" --homepage https://github.com/vishwajitvm/strutvane --source . --push
   ```

   Then set topics (`gh repo edit --add-topic …`) and enable private vulnerability reporting.
6. Run `blueprint-sync` and report.
