-- 002_schema.sql: tenant-scoped tables and row-level security policies.
--
-- Executed by the bootstrap superuser session after `SET ROLE app_owner`, so every object
-- is owned by app_owner, never by a superuser. That matters because superusers bypass RLS,
-- and objects they own (views, SECURITY DEFINER functions) can leak rows. See test/bypass.test.ts.
--
-- Tenant expression used by every policy:
--
--     NULLIF(current_setting('app.tenant_id', true), '')::uuid
--
--   * current_setting(name, missing_ok => true) returns NULL when the setting was never defined
--     in this session, so an unscoped query sees zero rows (fail closed) instead of erroring.
--   * After a transaction that used set_config(..., is_local => true) ends, the session reports
--     '' (empty string), not NULL. Casting ''::uuid would raise an error, so NULLIF maps '' back
--     to NULL. Proven in test/fail-closed.test.ts.
--   * tenant_id = NULL is never true, so a missing tenant matches no rows, and WITH CHECK
--     rejects every write.

SET ROLE app_owner;

CREATE TABLE app.tenants (
  id   uuid PRIMARY KEY,
  name text NOT NULL
);

CREATE TABLE app.invoices (
  id         uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid          NOT NULL REFERENCES app.tenants (id),
  number     text          NOT NULL,
  amount     numeric(12,2) NOT NULL CHECK (amount >= 0),
  created_at timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT invoices_tenant_number_uq UNIQUE (tenant_id, number)
);

-- Composite index that leads with tenant_id: every RLS-filtered query can use it.
CREATE INDEX invoices_tenant_created_idx ON app.invoices (tenant_id, created_at DESC);

-- tenants: a tenant may only see its own row.
ALTER TABLE app.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.tenants FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_self ON app.tenants
  AS PERMISSIVE FOR SELECT
  USING (id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- invoices: tenant isolation is a RESTRICTIVE policy. Restrictive policies are AND-ed with
-- everything else, so no permissive policy added later (for example an RBAC rule like
-- "managers can read all invoices") can ever widen access across tenants.
-- test/policies.test.ts shows the leak a permissive-only design allows.
ALTER TABLE app.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE app.invoices FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON app.invoices
  AS RESTRICTIVE FOR ALL
  USING      (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);

-- A restrictive policy alone grants nothing: at least one permissive policy must allow the row.
-- This is the slot where @strutvane/auth would generate RBAC/ABAC permissive policies.
CREATE POLICY app_access ON app.invoices
  AS PERMISSIVE FOR ALL TO app_user
  USING (true)
  WITH CHECK (true);

GRANT USAGE  ON SCHEMA app       TO app_user, app_bypass;
GRANT SELECT ON app.tenants      TO app_user, app_bypass;
GRANT SELECT, INSERT, UPDATE, DELETE ON app.invoices TO app_user;
GRANT SELECT ON app.invoices     TO app_bypass;

RESET ROLE;
