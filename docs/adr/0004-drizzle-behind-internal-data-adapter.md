# ADR-0004: Drizzle as the SQL engine behind an internal data adapter

- **Status:** Accepted
- **Date:** 2026-11-13
- **Related:** [11 Technology decisions](../11-technology-decisions.md), [research/stack-snapshot](../research/stack-snapshot-2026-11.md)

## Context

We need:

- multi-dialect SQL
- schema diffing for migrations
- type safety

We must not write an ORM or lock users into one.

Upstream churn is high: Drizzle v1 is still an RC, and Prisma 8 is an RC rewrite.

## Decision

- Strutvane owns the model DSL and the CRUD/query layer.
- Drizzle sits underneath, behind an internal adapter. It provides the schema, migration diffing and drivers.
- Kysely is used for raw queries.
- A Prisma adapter may come later from the community.

## Consequences

- Drizzle types never leak into public contracts.
- Upgrading to Drizzle v1 GA is an internal change.
- We maintain an adapter layer.
