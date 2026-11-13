/**
 * Applies the spike's SQL files to a fresh database. It must be run as a superuser, and only
 * for bootstrap: the roles are created first, then the schema is built as `app_owner`.
 */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { Client } from 'pg'

const sqlDir = new URL('./sql/', import.meta.url)

export interface RolePasswords {
  readonly appOwner: string
  readonly appUser: string
  readonly appBypass: string
}

/** Reads a SQL file that ships with the spike. */
export async function readSql(name: string): Promise<string> {
  return readFile(fileURLToPath(new URL(name, sqlDir)), 'utf8')
}

/**
 * Replaces `{{TOKEN}}` placeholders with SQL string literals escaped by pg.
 * Unknown or missing tokens throw, so the database never receives a half-rendered statement.
 */
export function renderSqlTemplate(
  sql: string,
  values: Readonly<Record<string, string>>,
  escapeLiteral: (value: string) => string,
): string {
  const rendered = sql.replace(/\{\{([A-Z0-9_]+)\}\}/g, (_match, token: string) => {
    const value = values[token]
    if (value === undefined) throw new Error(`Missing value for SQL template token {{${token}}}`)
    return escapeLiteral(value)
  })
  return rendered
}

/** Creates roles, schema, tables and policies. `superuser` must be connected as a superuser. */
export async function migrate(superuser: Client, passwords: RolePasswords): Promise<void> {
  const roles = renderSqlTemplate(
    await readSql('001_roles.sql'),
    {
      APP_OWNER_PASSWORD: passwords.appOwner,
      APP_USER_PASSWORD: passwords.appUser,
      APP_BYPASS_PASSWORD: passwords.appBypass,
    },
    (value) => superuser.escapeLiteral(value),
  )
  await superuser.query(roles)
  await superuser.query(await readSql('002_schema.sql'))
}
