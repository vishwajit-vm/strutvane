/**
 * Everything `sv types` writes, built in memory first so it can be compared, tested and written
 * atomically: model types, resource metadata, and SQL for each engine.
 */
import { randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { SchemaError } from '../schema/errors.ts'
import type { Replay } from '../schema/replay.ts'
import { createSchemaSql } from '../sql/ddl.ts'
import type { Dialect } from '../sql/dialect.ts'
import { downSql, upSql } from '../db/migrator.ts'
import { generateMetadata, type ResourceOverrides } from './metadata.ts'
import { generateModelTypes } from './types.ts'

const DIALECTS: readonly Dialect[] = ['sqlite', 'postgres', 'mysql', 'mariadb']

/**
 * Build every generated file as `{ relative path → content }`, sorted by path.
 *
 * @example
 * const files = buildArtifacts(replay)
 * files.get('.strutvane/types/models.d.ts') // 'export interface Post { … }'
 */
export function buildArtifacts(replay: Replay, overrides: ResourceOverrides = {}): Map<string, string> {
  const last = replay.migrations.at(-1)?.name ?? 'none'
  const files = new Map<string, string>()
  files.set('.strutvane/types/models.d.ts', generateModelTypes(replay.state, { source: `${replay.migrations.length} migrations, last ${last}` }))
  files.set('.strutvane/resources.json', `${JSON.stringify(generateMetadata(replay.state, overrides), null, 2)}\n`)
  for (const dialect of DIALECTS) {
    files.set(`.strutvane/sql/schema.${dialect}.sql`, orExplanation(dialect, () => sqlFile(createSchemaSql(replay.state, dialect))))
    files.set(`.strutvane/sql/migrations.${dialect}.sql`, orExplanation(dialect, () => migrationsSqlFile(replay, dialect)))
  }
  return new Map([...files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
}

/**
 * File operations {@link writeArtifacts} uses; tests replace `rename` to simulate Windows errors.
 *
 * @example
 * writeArtifacts(root, files, { rename: renameSync })
 */
export interface ArtifactIo {
  readonly rename: (from: string, to: string) => void
}

/** Windows error codes that mean "someone else has the file open for a moment". */
const TRANSIENT = new Set(['EPERM', 'EBUSY', 'EACCES'])
const RENAME_ATTEMPTS = 5

/**
 * Write the files under `root`, touching only those whose content changed (so file watchers and
 * editors don't see churn). Each write goes to a temp file first and is renamed into place, so a
 * crash never leaves a half-written `models.d.ts`. On Windows, a rename that hits a file another
 * process has open for a moment (antivirus, indexer, editor: EPERM/EBUSY/EACCES) is retried a few
 * times; if it still fails, the temp file is removed and the error is thrown.
 *
 * @example
 * writeArtifacts('fixtures/blog', buildArtifacts(replay)) // ['.strutvane/resources.json'] when only that changed
 */
export function writeArtifacts(root: string, files: ReadonlyMap<string, string>, io: ArtifactIo = { rename: renameSync }): string[] {
  const written: string[] = []
  for (const [relative, content] of files) {
    const target = join(root, relative)
    if (readOrUndefined(target) === content) continue
    mkdirSync(dirname(target), { recursive: true })
    // Unique per write: two processes (dev watcher and a CLI run) never share a temp file.
    const temporary = `${target}.${process.pid}.${randomBytes(4).toString('hex')}.tmp`
    try {
      writeFileSync(temporary, content)
      renameWithRetry(io, temporary, target)
    } catch (error) {
      rmSync(temporary, { force: true })
      throw error
    }
    written.push(relative)
  }
  return written
}

function renameWithRetry(io: ArtifactIo, from: string, to: string): void {
  for (let attempt = 1; ; attempt += 1) {
    try {
      io.rename(from, to)
      return
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? String(error.code) : ''
      if (!TRANSIENT.has(code) || attempt >= RENAME_ATTEMPTS) throw error
      // A synchronous pause: generation is synchronous, and this only runs after a failure.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, attempt * 10)
    }
  }
}

/**
 * A schema that one engine can't build (an index on TEXT is fine on PostgreSQL, not on MySQL) must
 * not stop generation for the others: that engine's file says why instead. `migrate` on that engine
 * compiles the same SQL and stops with the same SchemaError, before any statement runs.
 */
function orExplanation(dialect: Dialect, build: () => string): string {
  try {
    return build()
  } catch (error) {
    if (!(error instanceof SchemaError) || error.code !== 'INDEX_NOT_PORTABLE') throw error
    return `-- Not generated for ${dialect}: ${error.message}\n-- Fix: ${error.hint}\n`
  }
}

function readOrUndefined(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return undefined
  }
}

function sqlFile(statements: readonly string[]): string {
  return `-- Generated by Strutvane. Do not edit.\n\n${statements.map((statement) => `${statement};`).join('\n\n')}\n`
}

function migrationsSqlFile(replay: Replay, dialect: Dialect): string {
  const sections = replay.migrations.map((step) => {
    const up = upSql(step, dialect).map((statement) => `${statement};`).join('\n')
    const down = downSql(step, dialect).map((statement) => `${statement};`).join('\n')
    return `-- ${step.name}: up\n${up}\n\n-- ${step.name}: down\n${down}`
  })
  return `-- Generated by Strutvane. What each migration runs on ${dialect}. Do not edit.\n\n${sections.join('\n\n')}\n`
}
