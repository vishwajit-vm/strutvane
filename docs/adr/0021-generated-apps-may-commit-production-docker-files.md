# ADR-0021: Generated apps may commit a production Dockerfile and a dev container (opt-in)

- **Status:** Accepted
- **Date:** 2026-11-15
- **Deciders:** project lead
- **Related:** refines [ADR-0006](0006-docker-local-only.md); [00 D16](../00-executive-summary.md); [18 §2.1 questions 14 and 35](../18-v2-blueprint.md)

## Context

The v2 installer asks "Where will you deploy?" (question 35). In 2026, the most common answers need committed container files:
- a production Docker image (Kubernetes, Fly, ECS, Cloud Run, most PaaS);
- a dev container for Codespaces or VS Code Dev Containers.

ADR-0006 keeps Docker files out of Git. For generated apps it already allowed production files "generated on demand" (`sv docker:prod`) and an opt-in `--docker=commit` for the local compose file. The v2 blueprint had tightened this to "Docker files stay git-ignored". With that rule, the installer could offer neither option, so every team would have to hand-write a Dockerfile, the step most likely to be done insecurely (running as root, secrets baked into layers, no health check).

## Decision

**Generated apps** may get committed container files, **only when the developer picks them** in the installer or asks for them later:

1. **Production image.** Choosing "Docker image" in question 35, or running `node strut docker:prod` later, writes:
   - a multi-stage `Dockerfile` that builds with `npm ci`, ships only `build/` and production dependencies, and pins the Node major version;
   - a `.dockerignore` that always excludes `.env*`, `.git`, `node_modules`, `storage/` and test files;
   - a `HEALTHCHECK` on `/up`.

   The image runs as a non-root user with a read-only-friendly layout. Secrets are never copied in; they come from the platform's environment at runtime. These files are **committed** like any other app file.
2. **Dev container.** Choosing "Dev container" (an option of question 36, editor setup) writes `.devcontainer/devcontainer.json` and its compose file. They are committed so Codespaces works for the whole team.
3. **Unchanged from ADR-0006:**
   - the Sail-style local stack (`docker/compose.yaml`, run with `node strut services:up`) stays **git-ignored** by default, with the commit opt-in kept;
   - **Strutvane's own repositories still never commit Docker files.**
4. **Security tests:** the installer has attack-style tests proving that generated container files never contain secrets, never copy `.env*`, and never run as root.

## Alternatives considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| Keep ADR-0006 as is (generate on demand, don't offer in the installer) | No change | The installer can't answer the deploy question; most teams hand-write an insecure Dockerfile | The project lead chose to allow it (2026-11-15) |
| Always generate a Dockerfile | Zero friction for container users | Noise for VPS/PaaS users; more files to maintain | Opt-in respects "only what you picked" |
| Buildpacks / Nixpacks only, no Dockerfile | No container files in the repo | Platform-specific, opaque, weaker control of the user and layers | Still offered as a deploy recipe; not a replacement |

## Consequences

- **Positive:**
  - "Docker image" and Codespaces become first-class installer answers.
  - The generated Dockerfile is secure by default and tested.
  - Deployment docs can show one tested image.
- **Negative / costs we accept:**
  - We maintain a Dockerfile template per Node line and test it in CI (build plus a non-root and no-secrets scan).
  - The rule "no Docker files in Git" no longer holds for generated apps, so docs must state the split clearly: Strutvane repos never commit them; your app may.
- **Follow-ups:**
  - Update D16 in `00-executive-summary.md` (done with this ADR).
  - Update `CLAUDE.md` and the blueprint §2.1.
  - Update `ECOSYSTEM.md` §6 in **strutvane-tooling** (a synced file; change it there and run sync).
  - Add the Dockerfile template and its tests to the installer (spike 13, then `create-strutvane`).
  - Write a "Deploy with Docker" docs page.
