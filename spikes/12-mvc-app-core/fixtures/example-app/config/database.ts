import { defineConfig } from '#strutvane/foundation'
import type { ConnectionSettings } from '#strutvane/database'

/**
 * Database connections, Laravel's config/database.php. MySQL is the default, as in Laravel; this
 * example app runs on SQLite (DB_CONNECTION=sqlite in .env) so it needs no server.
 */
export default defineConfig((env) => {
  const connections = {
    mysql: {
      driver: 'mysql',
      host: env.string('DB_HOST', '127.0.0.1'),
      port: env.integer('DB_PORT', 3306),
      database: env.string('DB_DATABASE', 'strutvane'),
      username: env.string('DB_USERNAME', 'root'),
      password: env.optional('DB_PASSWORD'),
    },
    pgsql: {
      driver: 'postgres',
      host: env.string('DB_HOST', '127.0.0.1'),
      port: env.integer('DB_PORT', 5432),
      database: env.string('DB_DATABASE', 'strutvane'),
      username: env.string('DB_USERNAME', 'postgres'),
      password: env.optional('DB_PASSWORD'),
    },
    sqlite: {
      driver: 'sqlite',
      database: env.string('DB_DATABASE', 'storage/database.sqlite'),
    },
  } as const satisfies Record<string, ConnectionSettings>
  return {
    default: env.oneOf('DB_CONNECTION', ['mysql', 'pgsql', 'sqlite'], 'mysql'),
    connections,
  }
})
