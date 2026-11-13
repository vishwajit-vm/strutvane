# ADR-0001: Brand "Strutvane" with descriptive package names under `@strutvane`

- **Status:** Accepted (pending trademark clearance)
- **Date:** 2026-11-13
- **Related:** [03 Naming & brand](../03-naming-and-brand.md), [research/naming-checks](../research/naming-checks-2026-11-13.md)

## Context

The ecosystem needs one brand able to carry dozens of future packages. The name must be unused on npm, GitHub and the wider web.

## Decision

- **Brand:** Strutvane.
- **Scoped packages:** `@strutvane/<capability>`, i.e. `framework`, `auth`, `ui`, `core`, `contracts`, `devkit` and `cli`.
- **CLI launcher:** the unscoped `strutvane` package.
- **Starter:** `create-strutvane`.

## Alternatives considered

| Option | Why not |
|--------|---------|
| Mortarkit | "Mortar Kit" game item; Mortar, LLC has pending Class 9 applications |
| Ashlarkit | Live USPTO "ASHLAR" software mark |
| A coined name per package (gardiq, strutiq…) | Collided with existing companies; each name needs its own clearance; newcomers can't infer what it does |
| Themed words (gatehouse, quarry, rampart…) | Already used in the same niche on npm |

## Consequences

- An exclusive npm scope guarantees unique package names and leaves room to grow without limit.
- Trademark clearance is needed for one word only.
- A professional clearance is still required before launch.
