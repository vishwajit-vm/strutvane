/**
 * Names derived from the project name: database, users, roles, test database, Compose project.
 *
 * Why one module: the env file, the compose file, the init scripts and the options defaults must
 * agree on every name, or the database would be created under one name and used under another.
 *
 * @module
 */

/**
 * `my-app` → `my_app`: safe as a database or user name everywhere. MySQL user names are limited to
 * 32 characters, so the result is cut there.
 *
 * @example
 * sqlIdentifier('acme-portal') // 'acme_portal'
 * sqlIdentifier('9lives')      // 'app_9lives'
 */
export function sqlIdentifier(name: string): string {
  const id = name
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
  const safe = /^[a-z]/.test(id) ? id : `app_${id}`
  return safe.slice(0, 32)
}

/**
 * The test database: the dev database name plus `_test` (Laravel Sail's `testing` idea).
 *
 * @example
 * testDatabaseName('acme-portal') // 'acme_portal_test'
 */
export function testDatabaseName(name: string): string {
  return `${sqlIdentifier(name).slice(0, 27)}_test`
}

/**
 * The Docker Compose project name (`-p`): lowercase letters, digits, `-` and `_` only.
 * One name per app keeps two apps' containers and volumes apart.
 *
 * @example
 * composeProjectName('acme.portal') // 'acme-portal'
 */
export function composeProjectName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9_-]/g, '-')
}

/**
 * The PostgreSQL role names in Docker mode: `<id>_owner` owns the tables (migrations), `<id>_app`
 * only reads and writes rows (the app and the tests), so row-level security applies to the app.
 *
 * @example
 * postgresRoles('acme-portal') // { owner: 'acme_portal_owner', app: 'acme_portal_app' }
 */
export function postgresRoles(name: string): { readonly owner: string; readonly app: string } {
  const id = sqlIdentifier(name).slice(0, 26)
  return { owner: `${id}_owner`, app: `${id}_app` }
}
