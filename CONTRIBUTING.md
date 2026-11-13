# Contributing to Strutvane

Thanks for your interest! Strutvane is currently in the **design phase**: the blueprint is complete and implementation starts with Phase 0.

## Right now, the most useful contributions are
- Design feedback on the [blueprint](docs/README.md), via issues or discussions
- Real-world use cases and requirements from teams building B2B apps
- Pointers to prior art we should learn from

## Ground rules
- Be kind and constructive. We follow the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/).
- Public API and contract changes go through an RFC before code.
- Every change ships with tests, docs and a changeset.
- Sign off your commits (Developer Certificate of Origin): `git commit -s`.

## Development (once code exists)
Requirements: Node 24+ and pnpm. Docker is optional and for local services only (never committed).

```bash
pnpm install
pnpm lint && pnpm typecheck && pnpm test
```
