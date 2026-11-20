# RFCs (Requests for Comments)

An RFC is how a **public API or shared contract** changes in Strutvane. ADRs ([`../adr/`](../adr/)) record *internal* decisions; RFCs are for things other packages and users depend on.

## When you need an RFC

You need one for any change to:
- `@strutvane/contracts`
- a wire protocol: list query format, error format, manifest
- a public API of `core`, `framework`, `auth` or `ui`
- the installer protocol
- adding a new first-party package. That RFC must include a "why not a plugin?" section.

## Lifecycle

`Draft` → `Accepted` → `Implemented` (or `Rejected` / `Withdrawn`). Superseded RFCs link to their replacement.

1. Copy the template below to `NNNN-short-title.md` and open a PR.
2. Discuss it. The `architecture-reviewer` agent can give a first review.
3. Accept it when there is maintainer agreement. Record the date.
4. Implement it behind the `next` npm dist-tag. Then the integration repo must pass before a stable release.

## Index

| RFC | Title | Status |
|---|---|---|
| [0001](0001-contracts-v0.md) | Contracts v0 | Accepted (draft implementation) |
| [0002](0002-file-storage-and-uploads.md) | File storage and uploads | Accepted |
| [0003](0003-errors-and-messages.md) | Errors, validation messages and form error handling | Accepted |
| [0004](0004-logs-package.md) | `@strutvane/logs`: zero-config logging with a built-in viewer | Accepted |
| [0006](0006-queues-and-background-work.md) | Queues and background work: jobs, retries, unique jobs, chains, batches, outbox | Draft |
| [0007](0007-database-connections.md) | Several database connections, and every key in the app `.env` (#132) | Draft |

## Template

```md
# RFC-NNNN: Title
- Status: Draft
- Created: YYYY-MM-DD
- Affects: <packages>

## Summary
## Motivation
## Design (with examples)
## Compatibility & migration
## Alternatives
## Open questions
```
