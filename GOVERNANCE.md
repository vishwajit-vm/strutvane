# Strutvane Governance

This document explains how Strutvane is run: who decides what, how decisions are made and recorded, how releases and security work, and what we promise users. It applies to every repository in the Strutvane ecosystem.

## 1. Mission and permanent commitments

**Mission:** give TypeScript teams Laravel-level productivity for enterprise B2B apps, with every line of the result owned, overridable code.

These commitments are **permanent**. Changing any of them requires the process in §9, and we intend never to change them:

1. **MIT, all of it.** Every Strutvane package is MIT-licensed. Enterprise capabilities stay in the open-source core and are never moved behind a paid licence. That includes RBAC, audit logs, multi-tenancy, SSO/SCIM hooks and the logs viewer.
2. **No relicensing.** Contributions are made under the Developer Certificate of Origin (DCO), not a Contributor License Agreement that would allow relicensing.
3. **Security first.** Vulnerabilities are handled through private disclosure with published response times (§6). Security is tested continuously in every repo ([VAPT program](docs/13-testing-strategy.md#14-continuous-security-testing-vapt-program)).
4. **Users own their code.** Generated code belongs to the app developer and never depends on a hosted service.

## 2. Roles

| Role | Who | Can |
|---|---|---|
| **User** | Anyone using Strutvane | Use, report issues, request features, join discussions |
| **Contributor** | Anyone who has had a contribution merged (code, docs, tests, design feedback) | Open PRs, comment on RFCs, review |
| **Maintainer** | Contributors granted write access to one or more repos (listed in each repo's `CODEOWNERS` once there is more than one maintainer) | Review and merge PRs in their repos, triage, cut releases for their packages |
| **Core team** | Maintainers responsible for the shared foundations: contracts, core, tooling, and the decision records | Accept RFCs and ADRs, change shared configs (tooling), coordinate release trains |
| **Project lead** | Currently the founder and repository owner ([vishwajitvm](https://github.com/vishwajitvm)) | Final decision when consensus isn't reached (§3), appoint the first maintainers, steward the brand |

**Becoming a maintainer:** sustained, high-quality contributions to a repo (typically several merged PRs plus reviews over at least three months), nomination by an existing maintainer, and no objection from the core team within 7 days. Inactive maintainers (no activity for 12 months) move to *emeritus*, are thanked publicly, and can return any time.

**As the project grows,** the project lead role is intended to give way to a core-team vote. Moving to a neutral foundation (e.g. the OpenJS Foundation) will be considered once adoption justifies it (see [16 §B.2](docs/16-docs-and-ecosystem-strategy.md)).

## 3. How decisions are made

Most decisions are made by **lazy consensus**: a proposal is accepted if nobody with standing objects within the review window.

| Kind of decision | Mechanism | Review window | Recorded in |
|---|---|---|---|
| Bug fix, internal refactor, docs, tests | PR reviewed and approved by one maintainer of that repo | — | The PR and its changeset |
| Public API, shared contract, wire protocol, installer protocol, **new package** | **RFC** ([process](docs/rfcs/README.md)) accepted by the core team | 7 days minimum | `docs/rfcs/` |
| Architecture, technology, security or process decision | **ADR** accepted by the core team | 3 days minimum | `docs/adr/` |
| How packages connect | Update to the [integration map](docs/17-integration-map.md) in the same PR as the change | Same as the change | `docs/17-integration-map.md` |
| Shared configs and CI | PR to strutvane-tooling, then synced to all repos | 3 days, or immediately for security fixes | tooling history |
| Changes to this document | §9 | 14 days | This file's history |

**When consensus isn't reached:**
1. The discussion moves to a dedicated thread with options written down.
2. The core team decides by simple majority.
3. The project lead breaks a tie.

The reasoning is always recorded.

**The canonical decisions** live in [docs/00-executive-summary.md](docs/00-executive-summary.md) (D1–D24) and in accepted ADRs. They win over any other document. Accepted ADRs are never edited, only superseded.

## 4. Contributing

- **The full guide:** [CONTRIBUTING.md](CONTRIBUTING.md).
- **For contributors working with AI assistants:** every repo carries the shared ecosystem memory (`.claude/ECOSYSTEM.md`) and the `strutvane-contribute` workflow.
- **Every change ships with tests and docs,** plus a changeset for published packages. It must pass the repo's quality gate.
- **Commits use conventional messages** and are signed off (`git commit -s`, DCO).
- **Branches:** every repo integrates on `main`. Feature branches are merged back once green. `main` is protected against force-push and deletion.

## 5. Releases and versioning

- **Semantic versioning** for every package. `0.x` may break, but only with a changeset and the RFC updated.
- **Release train:** `contracts`, `core`, `framework`, `auth`, `ui`, `cli`, `logs` and `files` share a major version and are tested together by the integration suite before a stable release ([10](docs/10-repositories-publishing-versioning.md)).
- **Channels:** `latest` (stable), `next` (release candidates, RFC implementations) and `canary` (per-commit snapshots).
- **Publishing:** only through each repo's release workflow with npm **trusted publishing** (OIDC + provenance). Nobody publishes from a laptop. The one-time name reservations in 2026 were the documented exception.
- **Support after 1.0:** the previous major gets security fixes for 18 months after the next major ships. Every breaking change comes with a migration guide and, where possible, a codemod (`sv upgrade`).

## 6. Security

- **Report privately** through GitHub's private vulnerability reporting ("Report a vulnerability" on any repo's Security tab). Never open a public issue.
- **Response times:**
  - acknowledgement within **48 hours**
  - assessment within **5 business days**
  - fixes for high and critical issues within **14 days** where feasible
- **Disclosure:** coordinated, with credit to the reporter.
- **Every security fix includes a regression test** for the whole vulnerability class.
- **Before 1.0:** an independent penetration test of auth, tenancy, uploads, the logs viewer and generators.

## 7. Code of conduct

Everyone in Strutvane spaces follows the [Code of Conduct](CODE_OF_CONDUCT.md) (Contributor Covenant 2.1).
- **Reports** are handled confidentially by the core team. Anyone involved in a report recuses themselves.
- **Consequences** range from a private warning to a permanent ban, proportionate to the harm.

## 8. Brand and trademark

"Strutvane" and its logo identify this project. Trademark clearance is in progress, so no claim of registration is made.
- **Allowed:** talking about Strutvane, building and publishing plugins named `strutvane-plugin-*` or `@your-scope/strutvane-*`, and saying your product is "built with Strutvane".
- **Not allowed without permission:**
  - using the name or logo in a way that suggests official endorsement
  - publishing under the `@strutvane` npm scope or the `strutvane` GitHub namespace
  - naming a fork "Strutvane"

## 9. Changing this document

1. Open a PR against this file in the hub repository.
2. It stays open for at least **14 days** for discussion.
3. It needs approval from the core team. Changes to §1 (permanent commitments) also need approval from the project lead and must be announced publicly beforehand.

---

*Adopted 2026-11-14, at the close of Phase 0.*
