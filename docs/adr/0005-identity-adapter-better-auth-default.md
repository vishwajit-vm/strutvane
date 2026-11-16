# ADR-0005: Identity via adapter (Better Auth default); native authorization, tenancy and audit

- **Status:** Accepted; its "Better Auth is the default" part is superseded by ADR-0023 (2026-11-16)
- **Date:** 2026-11-13
- **Related:** [07 Auth](../07-package-auth.md), [12 Security](../12-security-model.md)

## Context

Hand-rolled authentication is the largest security liability in the project.

Better Auth is the strongest candidate to build on:

- It is MIT-licensed and mature.
- It now also maintains Auth.js.
- Vercel acquired it in July 2026, which is a governance risk.

## Decision

- **Identity:** an `IdentityEngine` adapter interface, with Better Auth as the default.
- **Enterprise IdPs:** OIDC and SAML adapters.
- **Fallback:** an optional native engine built only on audited primitives (argon2id, jose, arctic, @simplewebauthn).
- **Native features:** authorization (RBAC plus SQL-compilable ABAC), tenancy (RLS) and audit. These are the differentiator.

## Consequences

- We own less of the security surface.
- There is an exit path if Better Auth's direction changes.
- We own a security-critical authorization engine. To back it, we invest in property tests, mutation tests, cross-tenant tests and an external audit.
