# ADR-0003: Model-first source of truth with thin, metadata-driven generation and L0–L3 control

- **Status:** Accepted
- **Date:** 2026-11-13
- **Related:** [04 §4](../04-architecture.md#4-levels-of-control-the-key-dx-idea), [05](../05-developer-experience.md), [06](../06-package-framework.md)

## Context

Developers want to declare only field names and types, yet still own and control every line.

The two common approaches both fail that goal:

- Heavy code generation breaks when regenerated.
- Runtime engines are black boxes.

## Decision

- `app/models/*.model.ts` is the single source of truth. Models are written with `defineModel` and `field.*`.
- Migrations are auto-diffed into committed SQL.
- API, validation, permissions, OpenAPI and UI read the model metadata at runtime through thin generated files.
- Developers move through four levels: declare → configure → override → eject.
- Ejected files are upgraded by three-way merge.

## Consequences

- Adding a field needs no regeneration.
- We maintain both the runtime engine and the eject templates. Golden tests and end-to-end tests guard both.
