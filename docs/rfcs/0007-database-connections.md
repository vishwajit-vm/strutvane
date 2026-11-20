# RFC-0007: Several database connections, and every key in the app `.env`
- Status: Draft
- Created: 2026-11-20
- Affects: framework (`/database`, `/console`), skeleton, create-strutvane
- Decision: CONSISTENCY #132 (project lead, 2026-11-20)

## Summary

An app can use several databases at the same time. `DB_*` stays the **default** connection; each
extra connection is declared by name in `config/database.ts` and reads its own `DB_<NAME>_*` keys.
Code reaches it with `db.connection('<name>')`, a model with the `connection` option (or
`Model.on('<name>')` for one query), and the CLI with `--database=<name>`. A connection is checked
when it is first used, never at boot, so an app with every optional key empty still starts.

## Motivation

B2B apps read from a reporting database, a legacy MySQL next to a new PostgreSQL, or a local SQLite
cache. Today the framework has exactly one connection (`DatabaseConnectionToken`), and the only way
to reach another is to build a `Connection` by hand, without the app's settings, test database,
lazy opening or shutdown.

## Design

### Declaring a connection (`config/database.ts`)

```ts
export default defineConfig((env) => ({
  default: env.oneOf('DB_CONNECTION', CONNECTIONS, 'sqlite'),
  // … the default connection's keys, unchanged …
  connections: {
    // Each reads DB_<NAME>_* from .env when first used.
    mysql: { driver: 'mysql' },
    pgsql: { driver: 'pgsql' },
    reports: { driver: 'pgsql', database: 'reports' },
  },
}))
```

- A name is lowercase letters, digits and `_`, starting with a letter. `default` is reserved: it
  is the `DB_*` connection.
- Keys, each from config first, then from `.env`: `driver` (`DB_<NAME>_DRIVER`; defaults to the
  name when the name is an engine: `mysql`, `mariadb`, `pgsql`, `postgres`, `sqlite`), `host`,
  `port`, `database`, `username`, `socket`, `sslmode`, `ssl_ca`, `test_database`.
- `DB_<NAME>_PASSWORD` and `DB_<NAME>_URL` are read from the environment only, when the connection
  opens. `password` or `url` in the config file is refused (`secret_in_config`), because the
  config tree is cached and easy to dump.
- `database` is required for an extra connection (no silent `strutvane` default): a missing one is
  reported on first use as `database_not_configured`, naming `DB_<NAME>_DATABASE`.
- With `APP_ENV=testing`, `test_database` (`DB_<NAME>_TEST_DATABASE`) replaces `database`, as for
  the default connection.

### Using it

```ts
import { db, Model } from '@strutvane/framework/database'

await db.connection('reports').run(sql`SELECT count(*) AS n FROM visits`)
await db.connection('reports').transaction(async () => { … })   // only on reports
db.connection()                                                  // the default connection

export class Visit extends Model('visits', { connection: 'reports' }) {}   // always reports
await Post.on('archive').where('year', 2019).get()                        // one query elsewhere
```

- `db.connection(name?)` returns the ORM `Connection`. Inside an application it is that app's
  connection (opened lazily, closed by `app.shutdown()`); outside one, the connection a script set
  with `useConnection(connection, name)`.
- The `connection` model option is Laravel's `$connection`; `Model.on(name)` is Laravel's
  `Model::on()`: a subclass of the model bound to that connection, so its queries, saves,
  `afterCommit` and model events all use it. `Model.connection()` keeps returning the model's
  `Connection`.
- Transactions are per connection: a transaction on one never covers or rolls back another.
- `DatabaseManagerToken` (container) resolves named connections; binding
  `DatabaseConnectionToken` before boot still replaces the default one.

### The CLI

`migrate`, `migrate:status`, `migrate:rollback`, `migrate:reset`, `migrate:refresh`,
`migrate:fresh` and `db:seed` take `--database=<name>`: the same migrations (and seeders) against
that connection, which keeps its own `migrations` table. The CLI reads the declaration from
`config/database.ts` and the keys from `.env`, exactly as the app does.

### Errors (lowercase codes, each with a hint naming the key)

| Code | When |
|---|---|
| `unknown_connection` | the name is not declared in `config/database.ts` (lists the declared names) |
| `invalid_connection_name` | the name has other characters, or is `default` in `connections` |
| `database_not_configured` | a required key is empty (`DB_<NAME>_DATABASE`, or `DB_<NAME>_DRIVER` for a name that is not an engine) |
| `invalid_database_config` | a key has a bad value (port, sslmode, driver, CA file) |
| `secret_in_config` | `password` or `url` in `config/database.ts` for an extra connection |

All are `BootError`s raised on first use, never during boot.

### Every key in `.env` and `.env.example`

The skeleton's `.env.example` lists every key the framework reads (app, database with the extra
connections, logging, cache, session, queue, mail, filesystems/S3, broadcast) plus `REDIS_*`
(commented as needing `@strutvane/redis`), grouped with a comment each. Values that work without a
server are filled in (`REDIS_HOST=127.0.0.1`, `REDIS_PORT=6379`); secrets are empty. The installer
writes the same keys into `.env`, and generated secrets only there.

## Compatibility & migration

Additive. Apps without `connections` behave as before. `runWithConnection(resolve, work)` keeps its
signature; a named connection inside it is refused (`unknown_connection`) unless the resolver was
created with `runWithConnections`.

## Alternatives

- **Laravel's shape** (`DB_CONNECTION` picks one entry of `connections`): rejected by #132, which
  keeps `DB_*` as the default connection so existing apps and docs stay valid.
- **Env-only connections** (any `DB_<NAME>_*` works without a declaration): rejected; a typo in a
  name would silently open nothing or the wrong database. Declaring the name fails closed.
- **Eager validation at boot:** rejected by #132: an empty key must never stop an app that does not
  use that connection.

## Open questions

- Per-connection migration folders (`--path`) and a migration's own `connection`: not in this RFC.
- Read/write splitting (replicas) for one connection: later.
