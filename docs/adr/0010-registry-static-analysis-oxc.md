# ADR-0010: Convention discovery compiles to a typed registry by static analysis (oxc), with storm-safe watching

- **Status:** Accepted
- **Date:** 2026-11-13
- **Related:** [Spike 04 report](../../spikes/04-registry-compiler/README.md), [04 Architecture §3](../04-architecture.md)

## Context

Strutvane discovers models, resources, policies, routes, jobs, listeners, commands and pages by naming convention, then compiles what it finds into `.strutvane/registry.gen.ts`.

Spike 04 tested this on 200 files on Windows:
- **Static analysis is fast enough.** A full build took about 200 ms against a 500 ms budget, and an incremental rebuild about 10 ms against a 50 ms budget.
- **The TypeScript compiler API is not.** It takes **605 ms just to load**, which is more than the whole budget.
- **Windows watching has a trap.** Deleting a watched folder makes Windows `fs.watch` emit an endless storm of events, and a naive debounce never fires. The registry then silently stops updating.

## Decision

- **Parse, never execute.** Discovery reads files with **oxc-parser** and never runs user code. Names and keys must be literals; anything else produces a diagnostic with a code, a position and a hint (RFC-0003 style).
- **Deterministic output.** The generated file is byte-identical across runs and operating systems: code-unit sort order, POSIX paths, LF line endings and a content-hash header.
- **Typed output.** The registry exports union types for permissions, models, routes, jobs and pages, so `can('invoice.aprove')` is a compile error.
- **Safe writes.** Output is written atomically, and the last good output is kept when there are errors.
- **Watch mode** uses `fs.watch` on `app/` and `web/`, with three safeguards:
  - a debounce with a maximum wait, so a storm can't starve it
  - a storm guard
  - a once-a-second folder-existence check
- **Fast incremental builds.** Rebuilds skip unchanged files using their mtime and size, and cold builds read files in parallel. On Windows, cold builds are dominated by file opens, not parsing.

## Consequences

- **Positive:** typos in permissions and names become compile errors, and discovery is safe (no user code runs) and fast.
- **Costs:**
  - Dynamic patterns (factories, computed keys) can't be discovered and are reported as diagnostics.
  - oxc-parser is a pinned native 0.x dependency, kept behind an adapter.
- **Follow-ups (Phase 1):**
  - CI tests for the watcher on macOS and Linux.
  - Extract field types and modifiers, not just names.
  - Measure memory and behaviour above 200 files, and with barrel files and tsconfig path aliases.
