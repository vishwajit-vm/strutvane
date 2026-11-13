-- 001_roles.sql: bootstrap roles for the spike.
--
-- Run ONCE by a superuser. Tokens such as {{APP_USER_PASSWORD}} are replaced by the
-- setup code with values escaped through pg's escapeLiteral(), so no password is
-- concatenated into SQL unescaped.
--
-- Role model (the shape Strutvane's framework will generate):
--   app_owner  : owns the schema and tables and runs migrations. It is NOT a superuser.
--                It can log in here only so the tests can prove what FORCE ROW LEVEL SECURITY
--                does to the table owner.
--   app_user   : the role the application connects as at runtime. It has no BYPASSRLS
--                and no ownership, so row-level security always applies to it.
--   app_bypass : exists ONLY to demonstrate the BYPASSRLS risk. Never create one in production.

CREATE ROLE app_owner  LOGIN PASSWORD {{APP_OWNER_PASSWORD}}  NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
CREATE ROLE app_user   LOGIN PASSWORD {{APP_USER_PASSWORD}}   NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
CREATE ROLE app_bypass LOGIN PASSWORD {{APP_BYPASS_PASSWORD}} NOSUPERUSER BYPASSRLS   NOCREATEDB NOCREATEROLE;

REVOKE ALL ON DATABASE spike FROM PUBLIC;
GRANT CONNECT ON DATABASE spike TO app_owner, app_user, app_bypass;

CREATE SCHEMA app AUTHORIZATION app_owner;
