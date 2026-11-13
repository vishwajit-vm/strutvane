# Spike 03: PostgreSQL row-level security for multi-tenancy

> **Status:** complete (2026-11-13) · **Verdict:** ✅ the design holds, with 5 mandatory rules (below)
> **Evidence:** 37 automated tests against real PostgreSQL 18.7 and PgBouncer 1.26.1. 3 consecutive green runs, ~45 s each.

## 1. Question

Does Strutvane's planned tenancy enforcement hold up? The design:

- shared tables with a `tenant_id` column
- `ENABLE` + `FORCE ROW LEVEL SECURITY`
- policies that read `current_setting('app.tenant_id', true)`
- the value set per transaction (`SET LOCAL` via `set_config(..., true)`)
- an app role that does not own the tables and has no `BYPASSRLS`

The spike asks five sub-questions:

1. Is every cross-tenant read, update, delete and insert blocked?
2. With no tenant set, is access fail-closed (zero rows, writes rejected)?
3. Is there zero leakage across pooled connections, including through PgBouncer in transaction mode?
4. What happens with session-level `SET`?
5. What can the table owner, superusers and other roles bypass?

## 2. Answer

**Yes, the design holds**, provided five rules are enforced:

1. The tenant isolation policy is `RESTRICTIVE`.
2. The policy expression uses `NULLIF(current_setting('app.tenant_id', true), '')`.
3. The tenant is only ever set transaction-locally, through a parameterised `set_config($1, $2, true)`.
4. The runtime role is neither owner, superuser nor `BYPASSRLS`, and no object it can reach is owned by such a role unless it is `security_invoker`.
5. The helper destroys connections it cannot cleanly close, and listens for client `error` events.

**The pooling result is conclusive.** PgBouncer served 2,400 concurrent transactions from 32 client connections on just **4 server backends** (PIDs 91–94). That is about 600 tenant-switching transactions per backend, with **0 cross-tenant rows** and **0 leaks into 240 unscoped queries**. A session-level `SET` through the same PgBouncer, by contrast, leaked tenant A's data to a different client on **40 out of 40** queries.

## 3. Evidence: test map

| File | Proves | Tests |
|------|--------|-------|
| `test/isolation.test.ts` | (1) SELECT, aggregate, by-PK read, UPDATE and DELETE are all scoped. INSERT spoofing another `tenant_id` and UPDATE moving a row to another tenant are both rejected by `WITH CHECK` (SQLSTATE `42501`). | 8 |
| `test/fail-closed.test.ts` | (2) No tenant means zero rows and rejected writes. A connection reused after a tenant transaction is clean again. `current_setting` semantics (NULL → `''`). A local setting outside a transaction lasts one statement. A malformed value errors. **Helper robustness:** invalid ids are rejected before a connection is checked out, rollback re-throws the original error, and broken connections are destroyed, not re-pooled. | 13 |
| `test/pooling.test.ts` | (3) 2,400 concurrent transactions on a direct `pg.Pool` (max 8), then 2,400 through PgBouncer in transaction mode (32 → 4). Includes jitter and 2% deliberate rollbacks. Zero cross-tenant rows, zero unscoped leaks, backend reuse verified by PID. | 2 |
| `test/session-leak.test.ts` | (4) `SET` and `set_config(..., false)` leak into the next request on a pooled connection. Through PgBouncer they leak to **other clients**. | 3 |
| `test/bypass.test.ts` | (5) A superuser always bypasses RLS, and so does a `BYPASSRLS` role. FORCE subjects the owner to RLS (here it is fully locked out), but the owner can turn FORCE off. A superuser-owned view and a `SECURITY DEFINER` function leak every tenant, while a `security_invoker` view does not. `app_user` cannot alter RLS, policies or its own role. | 7 |
| `test/policies.test.ts` | A restrictive tenant policy survives a sloppy extra permissive policy, while a permissive-only design **leaks**. The audit query flags tables missing RLS, FORCE or a restrictive policy. | 4 |

**Test summary (last run):**

```
Test Files  6 passed (6)
     Tests  37 passed (37)
[pgbouncer] 2400 transactions served by 4 server backends: 91, 92, 93, 94
```

**Environment:**
- `postgres:18.7-alpine`
- `edoburu/pgbouncer:v1.26.1-p0` (`POOL_MODE=transaction`, `DEFAULT_POOL_SIZE=4`)
- Node 24.21, `pg` 8.23.1, TypeScript 6.0.3, Vitest 5.1.0

## 4. Exact SQL used

The full files are [`src/sql/001_roles.sql`](src/sql/001_roles.sql), [`src/sql/002_schema.sql`](src/sql/002_schema.sql) and [`src/sql/audit.sql`](src/sql/audit.sql). The essential part:

```sql
-- Roles: runtime role is NOT the owner, NOT superuser, NOT BYPASSRLS
CREATE ROLE app_owner LOGIN PASSWORD '…' NOSUPERUSER NOBYPASSRLS;   -- owns tables, runs migrations
CREATE ROLE app_user  LOGIN PASSWORD '…' NOSUPERUSER NOBYPASSRLS;   -- application runtime
CREATE SCHEMA app AUTHORIZATION app_owner;

SET ROLE app_owner;   -- objects are created by the owner, never by a superuser
CREATE TABLE app.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES app.tenants (id),
  number text NOT NULL, amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, number)
);
CREATE INDEX invoices_tenant_created_idx ON app.invoices (tenant_id, created_at DESC);

ALTER TABLE app.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.invoices FORCE  ROW LEVEL SECURITY;

-- Tenant isolation: RESTRICTIVE, so it is AND-ed with every other policy
CREATE POLICY tenant_isolation ON app.invoices AS RESTRICTIVE FOR ALL
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- Access grant slot (RBAC/ABAC permissive policies from @strutvane/auth go here)
CREATE POLICY app_access ON app.invoices AS PERMISSIVE FOR ALL TO app_user USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON app.invoices TO app_user;
```

The per-request scoping, prototyped in [`src/tenant.ts`](src/tenant.ts) as `withTenant()`:

```sql
BEGIN;
SELECT set_config('app.tenant_id', $1, true);   -- true = transaction-local (= SET LOCAL, but parameterised)
-- … application queries …
COMMIT;   -- or ROLLBACK; the setting is discarded either way
```

## 5. Findings

### F1. Transaction-local settings are pool-safe, including PgBouncer in transaction mode ✅

PostgreSQL discards `set_config(..., true)` at the end of the transaction. PgBouncer in transaction mode only reassigns a server connection *between* transactions. So a tenant id can never cross from one transaction to another. Verified under contention: 32 clients on 4 backends, 2,400 transactions, jitter, rollbacks.

### F2. `current_setting(name, true)` is NULL **or `''`** when unset: use `NULLIF` ⚠️

- Before a custom setting has ever been set in a session, `current_setting('app.tenant_id', true)` returns **NULL**.
- After any transaction set it locally, the session reports **`''`** (empty string) from then on.

A policy written as `current_setting(...)::uuid` would therefore **raise `22P02` on every unscoped query on a reused pooled connection**. That fails closed, but it's noisy and easy to misdiagnose. `NULLIF(…, '')::uuid` maps both cases to NULL, and `tenant_id = NULL` never matches. The result is a clean, silent zero rows.

### F3. Session-level `SET` is a critical vulnerability with poolers ❌

`SET app.tenant_id = …` and `set_config(..., false)` persist on the physical connection:

- With a `pg.Pool`, the next unrelated request inherits the tenant.
- With PgBouncer in transaction mode, the setting **leaks to other client connections and other app instances**. PgBouncer doesn't run `server_reset_query` in transaction mode by default.

`SET` also can't take bind parameters, which invites string interpolation.

### F4. The tenant policy must be RESTRICTIVE ⚠️

Permissive policies are OR-ed together. With a permissive tenant policy, any later permissive rule, such as an innocent `USING (true)` for an "auditor can read" feature, silently exposes **all tenants** (proven). A restrictive tenant policy is AND-ed, so no permissive rule can widen it.

A restrictive policy grants nothing alone. Each runtime role needs a permissive "access" policy. As a side effect, roles without one (here, the owner) see nothing at all.

### F5. Bypass vectors (none of them are a bug; all must be designed out) ⚠️

| Vector | Behaviour | Mitigation |
|--------|-----------|------------|
| Superuser | Always bypasses RLS, even with FORCE | Never use a superuser at runtime. Don't run migrations as a superuser either, since objects it creates inherit the bypass. |
| `BYPASSRLS` role | Bypasses RLS | Never grant it to runtime roles. Have the doctor check it. |
| Table owner | Subject to RLS under FORCE, but can `ALTER TABLE … NO FORCE` | The runtime role must not be the owner. Use a separate migration role. |
| View owned by a privileged role | RLS is checked as the **view owner**, so it leaks | Always create views `WITH (security_invoker = true)` (PG 15+), owned by `app_owner` |
| `SECURITY DEFINER` function owned by a privileged role | Runs as the owner, so it leaks | Forbid them in generated code, or require an explicit tenant filter and review |
| RI checks (FKs) | Bypass RLS by design | Harmless: they only check existence. Noted for completeness. |

### F6. pg clients need an `error` listener while checked out ❌ → fixed

When a backend dies mid-transaction (crash, failover, `pg_terminate_backend`), a checked-out `pg` client emits `error`. `pg.Pool` only listens on *idle* clients, so the event became an **uncaught exception that crashed the process**. The spike's first run caught this.

`withTenant()` now attaches a listener for the checkout's lifetime. It surfaces the failure as a rejected promise and **destroys** the connection instead of re-pooling it.

### F7. A tenancy audit query is cheap and effective ✅

[`src/sql/audit.sql`](src/sql/audit.sql) lists every table that has a `tenant_id` column but lacks RLS, lacks FORCE, or lacks a restrictive policy. It returns nothing for a correct schema and flagged all three seeded mistakes. This should become part of `sv doctor` and CI.

## 6. Limits and risks not covered

- **Performance** was not benchmarked. The composite `(tenant_id, …)` index exists, but query plans under RLS at scale (and the planner's handling of `NULLIF(current_setting())`, which is STABLE and evaluated once per statement) should be measured in the Phase 4 performance work.
- **PgBouncer prepared statements:** `pg` uses unnamed statements for parameterised queries, which work in transaction mode. Named prepared statements need `max_prepared_statements` (PgBouncer ≥ 1.21). Not exercised here.
- **Schema-per-tenant and DB-per-tenant** strategies are out of scope (shared-schema only).
- **MySQL and SQLite** have no RLS. Tenancy there is app-level only, as already documented in the tiers in `docs/06`.
- **Logical replication, `COPY`, and `pg_dump` run by privileged roles** bypass RLS. Operational procedures must account for this.
- `withTenant()` hands `work` the raw client. The real framework must expose a restricted interface so user code cannot issue `COMMIT`, `SET` or `set_config` inside the scope.

## 7. Recommendations

### For `@strutvane/framework`

1. **Generate migrations exactly as in §4:** `ENABLE` + `FORCE`, a RESTRICTIVE tenant policy using `NULLIF(current_setting('app.tenant_id', true), '')::uuid`, `(tenant_id, …)` composite indexes, and objects owned by the migration role.
2. **Ship a single transaction-scoping primitive**, the production version of `withTenant()`, used by every resource handler, job and listener. It must:
   - validate the tenant id
   - `BEGIN` → `set_config($1, $2, true)` → work → `COMMIT`/`ROLLBACK`
   - attach a client `error` listener
   - destroy connections it can't close cleanly
   - expose a restricted query API to user code
3. **Use two database roles in generated config:** `DB_MIGRATION_USER` (owner, used by `sv migrate`) and `DB_USERNAME` (runtime, non-owner, no BYPASSRLS). Boot **refuses** to start in production if the runtime role is a superuser, has BYPASSRLS, or owns tenant tables. These can all be checked from `pg_roles` and `pg_class`.
4. **Add `sv doctor` / CI checks:**
   - the audit query (F7)
   - views without `security_invoker`
   - `SECURITY DEFINER` functions
   - the runtime role's attributes
5. **Lint rule** (Biome plugin, or a custom rule in `@strutvane/devkit`): forbid
   - SQL strings matching `/\bSET\s+(?!LOCAL\b)(SESSION\s+)?app\./i`
   - `set_config(` with a third argument that is not literally `true`
   - `RESET app.` outside the framework internals

   Error message: *"Session-level settings leak across pooled connections. Use the framework's tenant scope."*

### For `@strutvane/auth`

1. **RBAC/ABAC rules compile to PERMISSIVE policies** (or app-level filters) **layered under the RESTRICTIVE tenant policy.** Auth rules then can never widen tenant scope.
2. **Make cross-tenant platform access explicit.** It runs under a separate `platform_admin` path with its own role and full audit logging. It is never implemented by relaxing the tenant policy.
3. **Run the tenant resolver once per request.** Its output is the only value ever passed to the scoping primitive; user input never reaches `set_config` directly.

## 8. Suggested ADR

> **ADR-00XX: Postgres tenancy enforcement via transaction-local settings and RESTRICTIVE RLS**
>
> **Status:** Proposed. **Context:** Spike 03 (37 tests, PG 18.7, PgBouncer 1.26.1).
>
> **Decision.** For the `shared` tenancy strategy on PostgreSQL, Strutvane enforces isolation in the database:
>
> - **Tables:** every tenant table has `ENABLE` + `FORCE ROW LEVEL SECURITY` and a `RESTRICTIVE` policy, `tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid`, in both `USING` and `WITH CHECK`.
> - **Scoping:** the tenant is set only with `set_config('app.tenant_id', $1, true)` inside a framework-owned transaction. Session-level `SET`/`set_config(..., false)` is forbidden by lint and review.
> - **Roles:** the runtime role is neither owner, superuser nor BYPASSRLS. Migrations run as a separate owner role. Views are `security_invoker`, and `SECURITY DEFINER` functions are disallowed in generated code.
> - **Enforcement:** boot-time and `sv doctor` checks enforce the role and catalog rules.
>
> **Consequences.**
>
> - Defence in depth: app-level filters plus DB enforcement.
> - Compatible with PgBouncer transaction pooling.
> - Two DB roles to configure.
> - Postgres-specific (MySQL/SQLite remain app-level only).
> - RBAC must be layered as permissive policies or app filters under the restrictive tenant policy.

## 9. Re-run this spike

Requirements: Node ≥ 24 and a running Docker daemon. Images are pulled automatically, and containers are random-named, `--rm`, and removed after the run.

```bash
cd spikes/03-postgres-rls-tenancy
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm@12.18.0 install
corepack pnpm@12.18.0 typecheck
corepack pnpm@12.18.0 test          # ~45 s; starts PG 18 + PgBouncer, runs 37 tests, cleans up
```

Verify nothing is left behind:

```bash
docker ps -a --filter name=sv-spike03
```

No Docker files are written to disk, per ADR-0006.
