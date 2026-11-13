# ADR-0007: Tenancy isolation is enforced by Postgres RLS under five mandatory rules

- **Status:** Accepted
- **Date:** 2026-11-13
- **Related:** [Spike 03 report](../../spikes/03-postgres-rls-tenancy/README.md), [07 Auth §4](../07-package-auth.md), [12 Security](../12-security-model.md), [ADR-0005](0005-identity-adapter-better-auth-default.md)

## Context

The default tenancy strategy keeps many tenants in shared tables with a `tenant_id` column. A bug that lets one tenant see another's data is the worst failure a B2B product can have.

Spike 03 tested the planned design against real PostgreSQL 18 and PgBouncer (transaction pooling), with 37 tests in all. In one test, 2,400 concurrent transactions ran over 4 shared server connections.

The spike found the design sound, but only under specific rules. Each rule below exists because the spike demonstrated a concrete failure without it.

## Decision

Tenant isolation on PostgreSQL is enforced in the database, through row-level security (RLS), in addition to application-level query scoping. These five rules are mandatory:

1. **RESTRICTIVE tenant policy.** It is created `AS RESTRICTIVE`, with `ENABLE` and `FORCE ROW LEVEL SECURITY`, and has both `USING` and `WITH CHECK`.
   - *Why:* with a permissive policy, any extra policy such as `USING (true)` (added later for "admins") silently exposes every tenant.
   - `WITH CHECK` also blocks inserting rows for another tenant, and moving a row to another tenant.
2. **The policy reads the tenant with `NULLIF(current_setting('app.tenant_id', true), '')::uuid`.**
   - *Why:* on a reused pooled connection, an unset setting reads as `''`, not NULL. Casting `''` to uuid raises an error, so every unscoped query would crash. With `NULLIF`, it fails closed and returns zero rows.
3. **The tenant is set transaction-locally only:** `set_config('app.tenant_id', $1, true)` inside `BEGIN … COMMIT`.
   - Session-level `SET` and `set_config(…, false)` are forbidden, and a lint rule enforces this.
   - *Why:* the spike showed session-level `SET` leaking the tenant to a *different client* on 40/40 queries through PgBouncer, and into the next request on a plain pool. Transaction-local settings leaked 0 times in 2,400 transactions.
4. **The runtime database role is never the table owner, a superuser, or `BYPASSRLS`.**
   - Migrations run as a separate owner role.
   - Views over tenant tables must be `security_invoker`, and `SECURITY DEFINER` functions over tenant tables are forbidden.
   - *Why:* superusers and `BYPASSRLS` roles always bypass RLS, owners can disable `FORCE`, and owner-defined views or functions leak every tenant.
5. **The tenant helper is robust.** `withTenant()` validates the tenant id as a UUID. It rolls back on error and always releases the connection. It listens for client `error` events and **destroys** broken connections instead of returning them to the pool.
   - *Why:* the first spike run crashed the Node process when a connection died mid-transaction.

**Checks that ship with the framework:**
- **Runtime check:** `sv doctor` runs a tenancy audit query that flags tables with `tenant_id` but no RLS, permissive tenant policies, a runtime role with `BYPASSRLS`, and definer views.
- **Generated tests:** every generated tenant-scoped resource includes cross-tenant read, update, delete and insert tests.

## Consequences

- **Positive:** isolation holds even when application code has a bug (defence in depth), and it holds through PgBouncer transaction pooling.
- **Costs:**
  - Postgres-specific code paths.
  - Two database roles to provision.
  - On MySQL and SQLite only application-level scoping is possible; `sv doctor` reports this clearly.
- **Follow-ups:**
  - Implement the lint rule, the `doctor` audit query and the generated cross-tenant tests in Phase 2.
  - Re-run the spike suite against Azure Database for PostgreSQL in Phase 4.
