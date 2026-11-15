# 0.2 release patches: one framework copy, everywhere

These patches come from the packaging audit (2026-11-15). They fix the **two-kernels** problem. Today, any add-on installed next to the merged `@strutvane/framework` also pulls in the old `@strutvane/core` and `@strutvane/contracts`. Generated apps also run the old `@strutvane/cli`, so container tokens and error classes no longer match: for example, a `NotFoundError` from auth renders as HTTP 500.

Each patch has a test that fails without it. All of them were gated against the local framework and re-checked with `git am --3way` against the real repos on 2026-11-15.

## Order

The add-on patches peer-depend on `@strutvane/framework@^0.1.0-next.1`. That version doesn't exist until the merged framework is published, so the order matters.

| Step | Repo | Patch | When |
|---|---|---|---|
| 1 | framework (`v2/consolidate`) | `framework/0001-…` (B6): the CLI identifies as `@strutvane/framework`; `doctor` fails on absorbed packages; Node `>=24.3` | Now. It merges with the framework fix pass |
| 2 | framework | `changeset version` → `0.1.0-next.1`, then publish (staged, approved with 2FA) | After the npm account unlocks (2026-11-17 08:35 UTC) and gates R1–R9 pass |
| 3 | auth, logs, files, ui | `<repo>/0001-fix-deps-peer-depend-…`: the framework becomes a peer + dev dependency, imports are retargeted, `engines >=24.3` | Right after step 2. Then run `npm install` to regenerate each lockfile and run the gate |
| 4 | create-strutvane | `0001-fix-templates-generated-apps-depend-on-the-merged-fr…` (B7) and `0002-…empty CORS_ORIGINS…` | With step 3 |
| 5 | npm | `npm deprecate` the old `@strutvane/{core,contracts,cli,devkit}` with a pointer to the framework | After steps 3–4 are published |

`REPLAY.sh` reproduces the whole audit. `tools/` holds the probes, including the two-kernel probe and the subpath import probe.

## Still open (not patched)

- **No package ships an installer**, so `node strut install:<x>` / `sv add` only adds the dependency. That's Phase 1 feature work, under the integration map's connection 5.
- **create-strutvane depends on contracts/devkit at runtime (B8).** This needs a decision.
- **Boot validation gaps:** some malformed or empty env values are accepted, and a few give exit 1 instead of a config error. This belongs to the framework fix pass.
- **Leftover pnpm and absorbed names** in READMEs and a few messages.
- **The `latest` tags still point at the `0.0.0-reserved.0` placeholders.** Move them on the first real release.
