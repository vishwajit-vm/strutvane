/**
 * "Continue without Docker (SQLite)": the way out when Docker is missing or not running, so the
 * app still starts.
 *
 * What it changes (and only this):
 * - `.env` and `.env.example`: `DB_CONNECTION=sqlite`, the SQLite file paths, mail to the log, and
 *   the server/Docker-only keys commented out (Laravel does the same for SQLite), so nothing is
 *   lost if the user switches back later;
 * - `.strutvane/env.json`: mode `host`, so `node strut` stops forwarding into a container;
 * - removes the git-ignored `docker/` folder (it would start containers nobody uses);
 * - rewrites README.md and AGENTS.md, which describe how the app runs;
 * - the stored options: `database: 'sqlite'`, `docker: false`.
 *
 * @module
 */
import { rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { commentOutEnvKey, setEnvValue } from '../env-file.ts'
import { answersOf, type ProjectOptions, resolveOptions } from '../options.ts'
import type { SetupState } from '../setup-state.ts'
import { buildEnvSections, type TypedSecrets } from '../templates/env.ts'
import { renderProject } from '../templates/project.ts'
import type { ConnectionAnswers } from './runner.ts'
import { type EnvFile, readEnvFile, writeEnvFile } from './env-io.ts'

/** Keys that only make sense with a database server or Docker. */
const SERVER_KEYS = [
  'DB_HOST',
  'DB_PORT',
  'FORWARD_DB_PORT',
  'DB_USERNAME',
  'DB_PASSWORD',
  'DB_MIGRATION_USERNAME',
  'DB_MIGRATION_PASSWORD',
  'DB_ROOT_PASSWORD',
  'MAIL_HOST',
  'MAIL_PORT',
  'FORWARD_MAILPIT_PORT',
  'COMPOSE_PROJECT_NAME',
  'STRUT_UID',
  'STRUT_GID',
] as const

/** Files regenerated for the new mode (they describe how the app runs; none holds user edits yet). */
const REGENERATED: ReadonlySet<string> = new Set(['README.md', 'AGENTS.md', '.strutvane/env.json', 'strutvane.json'])

/** Point one env file at SQLite. */
function sqliteEnv(text: string): string {
  let next = setEnvValue(text, 'DB_CONNECTION', 'sqlite')
  next = setEnvValue(next, 'DB_DATABASE', 'database/database.sqlite')
  next = setEnvValue(next, 'DB_TEST_DATABASE', 'database/testing.sqlite')
  next = setEnvValue(next, 'MAIL_MAILER', 'log')
  for (const key of SERVER_KEYS) next = commentOutEnvKey(next, key)
  return next
}

/**
 * Switch a created project to SQLite without Docker and return the updated state (the caller
 * saves it).
 *
 * @example
 * state = switchToSqlite('C:/code/my-app', state)
 */
export function switchToSqlite(directory: string, state: SetupState): SetupState {
  const files: EnvFile[] = ['.env', '.env.example']
  for (const file of files) writeEnvFile(directory, file, sqliteEnv(readEnvFile(directory, file)))
  rmSync(join(directory, 'docker'), { recursive: true, force: true })
  const stored = { ...state.options, database: 'sqlite' as const, docker: false, connection: undefined }
  const options: ProjectOptions = { ...stored, directory }
  for (const file of renderProject(options)) {
    if (REGENERATED.has(file.path)) writeFileSync(join(directory, file.path), file.content)
  }
  return { ...state, options: stored }
}

/** Keys that only exist in Docker mode (or for roles setup creates); commented out for your own server. */
const DOCKER_ONLY_KEYS = [
  'FORWARD_DB_PORT',
  'DB_ROOT_PASSWORD',
  'DB_MIGRATION_USERNAME',
  'DB_MIGRATION_PASSWORD',
  'MAIL_HOST',
  'MAIL_PORT',
  'FORWARD_MAILPIT_PORT',
  'COMPOSE_PROJECT_NAME',
  'STRUT_UID',
  'STRUT_GID',
] as const

/** Connection keys that may be absent for your own server (written only when set). */
const OPTIONAL_CONNECTION_KEYS = ['DB_SOCKET', 'DB_SSL_CA', 'DB_URL'] as const

/**
 * "Use my own database server" (after a Docker problem) and "Change the connection details" (after
 * a refused login): point the project at a MySQL/MariaDB/PostgreSQL server the user runs, without
 * Docker. Every rule of the questions applies again (resolveOptions), the password and URL go to
 * `.env` only, and the files that describe how the app runs are regenerated.
 *
 * @example
 * state = useOwnServer('C:/code/my-app', state, { dbHost: '127.0.0.1', dbUser: 'root', dbPassword: '' })
 */
export function useOwnServer(directory: string, state: SetupState, details: ConnectionAnswers): SetupState {
  if (state.options.database === 'sqlite') return switchToSqlite(directory, state)
  const answers = { ...answersOf({ ...state.options, docker: false, connection: undefined }), docker: false, ...details }
  const resolved = resolveOptions(answers, dirname(directory))
  const typed: TypedSecrets = {
    ...(details.dbPassword === undefined ? {} : { dbPassword: details.dbPassword }),
    ...(details.dbUrl === undefined ? {} : { dbUrl: details.dbUrl }),
  }
  const section = buildEnvSections(resolved, typed).find((candidate) => candidate.title === 'Database')
  const files: EnvFile[] = ['.env', '.env.example']
  for (const file of files) {
    let text = readEnvFile(directory, file)
    for (const variable of section?.vars ?? []) {
      const value = file === '.env' ? variable.value : (variable.example ?? variable.value)
      text = setEnvValue(text, variable.key, variable.secret === true && file === '.env.example' ? '' : value)
    }
    const written = new Set((section?.vars ?? []).map((variable) => variable.key))
    for (const key of [...DOCKER_ONLY_KEYS, ...OPTIONAL_CONNECTION_KEYS]) if (!written.has(key)) text = commentOutEnvKey(text, key)
    text = setEnvValue(text, 'MAIL_MAILER', 'log')
    writeEnvFile(directory, file, text)
  }
  rmSync(join(directory, 'docker'), { recursive: true, force: true })
  const { directory: _directory, ...stored } = resolved
  for (const file of renderProject(resolved, typed)) {
    if (REGENERATED.has(file.path)) writeFileSync(join(directory, file.path), file.content)
  }
  return { ...state, options: stored }
}
