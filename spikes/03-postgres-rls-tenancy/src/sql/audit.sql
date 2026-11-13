-- audit.sql: tenancy audit (prototype of a future `sv doctor` / CI check).
--
-- Returns every ordinary or partitioned table that has a `tenant_id` column but is NOT fully
-- protected. A table is fully protected when ALL of these hold:
--   * row level security is ENABLED
--   * row level security is FORCED (so it also applies to the table owner)
--   * it has at least one RESTRICTIVE policy (the tenant isolation policy)
-- An empty result means every tenant-scoped table is protected.
SELECT n.nspname                 AS schema_name,
       c.relname                 AS table_name,
       c.relrowsecurity          AS rls_enabled,
       c.relforcerowsecurity     AS rls_forced,
       EXISTS (
         SELECT 1 FROM pg_catalog.pg_policy p
         WHERE p.polrelid = c.oid AND NOT p.polpermissive
       )                         AS has_restrictive_policy
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
JOIN pg_catalog.pg_attribute a
  ON a.attrelid = c.oid AND a.attname = 'tenant_id' AND NOT a.attisdropped
WHERE c.relkind IN ('r', 'p')
  AND n.nspname NOT IN ('pg_catalog', 'information_schema')
  AND n.nspname NOT LIKE 'pg_toast%'
  AND (
        NOT c.relrowsecurity
     OR NOT c.relforcerowsecurity
     OR NOT EXISTS (
          SELECT 1 FROM pg_catalog.pg_policy p
          WHERE p.polrelid = c.oid AND NOT p.polpermissive
        )
  )
ORDER BY 1, 2;
