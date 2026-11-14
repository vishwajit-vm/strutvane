/**
 * Rough overhead of the ORM versus raw parameterised SQL through the same driver.
 *
 * Usage: `npm run bench` (SQLite and PGlite). Set SPIKE11_MYSQL_URL to also measure MySQL, e.g.
 * against the container the tests start. Numbers are per operation, median of 5 rounds; they are
 * indicative only (one machine, in-process engines), which is all a spike needs: "is the ORM's own
 * work small next to the database's?"
 */
import { PGlite } from '@electric-sql/pglite'
import { snapshot } from '../fixtures/.strutvane/schema.ts'
import { User } from '../fixtures/app/models/user.ts'
import { Connection, type Driver, mysqlDriver, pgliteDriver, registerSchema, sqliteDriver, useConnection } from '../src/index.ts'
import { createTables } from '../test/support/ddl.ts'

const OPERATIONS = 2000
const ROUNDS = 5

interface Result {
  readonly engine: string
  readonly operation: string
  readonly rawMicros: number
  readonly ormMicros: number
}

/** Median microseconds per call of `fn`, over ROUNDS rounds of OPERATIONS calls. */
async function measure(fn: (index: number) => Promise<unknown>): Promise<number> {
  const rounds: number[] = []
  for (let round = 0; round < ROUNDS; round += 1) {
    const started = performance.now()
    for (let index = 0; index < OPERATIONS; index += 1) await fn(round * OPERATIONS + index)
    rounds.push(((performance.now() - started) * 1000) / OPERATIONS)
  }
  rounds.sort((a, b) => a - b)
  return rounds[Math.floor(rounds.length / 2)] ?? 0
}

async function benchEngine(engine: string, makeDriver: () => Promise<Driver>): Promise<Result[]> {
  const driver = await makeDriver()
  const connection = new Connection(driver)
  registerSchema(snapshot)
  useConnection(connection)
  await createTables(connection, snapshot)
  const q = (name: string): string => connection.grammar.quote(name)
  const p = (position: number): string => connection.grammar.placeholder(position)
  const session = await driver.acquire()
  const insertSql = `INSERT INTO ${q('users')} (${q('name')}, ${q('email')}, ${q('is_admin')}) VALUES (${p(1)}, ${p(2)}, ${p(3)})`
  const selectSql = `SELECT * FROM ${q('users')} WHERE ${q('id')} = ${p(1)}`
  const rawInsert = await measure((index) => session.run(insertSql, [`Raw ${index}`, `raw${index}@example.test`, false]))
  const rawSelect = await measure((index) => session.run(selectSql, [(index % 1000) + 1]))
  session.release()
  const ormInsert = await measure((index) => User.create({ name: `Orm ${index}`, email: `orm${index}@example.test` }))
  const ormSelect = await measure((index) => User.find((index % 1000) + 1))
  await connection.close()
  return [
    { engine, operation: 'select by id', rawMicros: rawSelect, ormMicros: ormSelect },
    { engine, operation: 'insert one row', rawMicros: rawInsert, ormMicros: ormInsert },
  ]
}

async function main(): Promise<void> {
  const results: Result[] = []
  results.push(...(await benchEngine('sqlite (node:sqlite)', async () => sqliteDriver(':memory:'))))
  results.push(...(await benchEngine('postgres (PGlite)', async () => pgliteDriver(await PGlite.create()))))
  const mysqlUrl = process.env['SPIKE11_MYSQL_URL']
  if (mysqlUrl !== undefined) results.push(...(await benchEngine('mysql 8.4', async () => mysqlDriver({ uri: mysqlUrl }))))
  const lines = ['| engine | operation | raw SQL (µs/op) | ORM (µs/op) | ORM overhead |', '|---|---|---|---|---|']
  for (const result of results) {
    const overhead = result.ormMicros - result.rawMicros
    lines.push(`| ${result.engine} | ${result.operation} | ${result.rawMicros.toFixed(1)} | ${result.ormMicros.toFixed(1)} | +${overhead.toFixed(1)} µs (${((result.ormMicros / result.rawMicros - 1) * 100).toFixed(0)}%) |`)
  }
  process.stdout.write(`${lines.join('\n')}\n`)
}

await main()
