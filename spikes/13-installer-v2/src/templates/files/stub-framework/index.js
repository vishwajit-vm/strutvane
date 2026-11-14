// SPIKE STUB of @strutvane/framework (spike 13). Just enough for the installer's end-to-end test:
// migrations with a tiny Laravel-style schema builder (spike 10 owns the real one), seeders, and an
// application object for `node strut dev`. The real package replaces this folder.

/** Declare a migration: `export default migration({ up(schema) {...}, down(schema) {...} })`. */
export function migration(definition) {
  return definition
}

/** Declare a seeder: `export default seeder(async (db) => { await db.insertOrIgnore(...) })`. */
export function seeder(run) {
  return { run }
}

/** Column types per dialect. Each entry: [sqlite, mysql, postgres]. */
const TYPES = {
  id: ['INTEGER PRIMARY KEY AUTOINCREMENT', 'BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY', 'BIGSERIAL PRIMARY KEY'],
  foreignId: ['INTEGER', 'BIGINT UNSIGNED', 'BIGINT'],
  integer: ['INTEGER', 'BIGINT', 'BIGINT'],
  text: ['TEXT', 'TEXT', 'TEXT'],
  boolean: ['INTEGER', 'TINYINT(1)', 'BOOLEAN'],
  timestamp: ['TEXT', 'TIMESTAMP NULL', 'TIMESTAMPTZ'],
}
const DIALECTS = ['sqlite', 'mysql', 'postgres']

/** One column with Laravel-style modifiers. */
class Column {
  constructor(name, type) {
    this.name = name
    this.type = type
    this.isNullable = false
    this.isUnique = false
    this.isPrimary = false
    this.defaultValue = undefined
    this.references = undefined
    this.onDelete = undefined
  }
  nullable() { this.isNullable = true; return this }
  unique() { this.isUnique = true; return this }
  primary() { this.isPrimary = true; return this }
  default(value) { this.defaultValue = value; return this }
  constrained(table) { this.references = table; return this }
  cascadeOnDelete() { this.onDelete = 'CASCADE'; return this }
}

/** Collects the columns of one table. */
class Blueprint {
  constructor(dialect) {
    this.dialect = dialect
    this.columns = []
  }
  add(name, kind) {
    const index = DIALECTS.indexOf(this.dialect)
    // Named types come from the table; anything else (VARCHAR(n)) is already SQL.
    const column = new Column(name, kind in TYPES ? TYPES[kind][index] : kind)
    this.columns.push(column)
    return column
  }
  id() { const c = this.add('id', 'id'); c.isNullable = true; return c } // PRIMARY KEY implies NOT NULL
  string(name, length = 255) { return this.add(name, `VARCHAR(${length})`) }
  text(name) { return this.add(name, 'text') }
  integer(name) { return this.add(name, 'integer') }
  boolean(name) { return this.add(name, 'boolean') }
  timestamp(name) { return this.add(name, 'timestamp') }
  foreignId(name) { return this.add(name, 'foreignId') }
  timestamps() { this.timestamp('created_at').nullable(); this.timestamp('updated_at').nullable() }
}

/** Quote a value for SQL. Strings double their single quotes; this stub never builds SQL from user input. */
export function sqlValue(value) {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE' // keywords all three dialects accept
  return `'${String(value).replace(/'/g, "''")}'`
}

/** A schema builder that records SQL statements for one dialect. */
export function createSchema(dialect) {
  const statements = []
  return {
    statements,
    create(table, define) {
      const blueprint = new Blueprint(dialect)
      define(blueprint)
      const lines = blueprint.columns.map((c) => {
        let sql = `${c.name} ${c.type}`
        if (c.isPrimary) sql += ' PRIMARY KEY'
        if (!c.isNullable && !c.isPrimary) sql += ' NOT NULL'
        if (c.defaultValue !== undefined) sql += ` DEFAULT ${sqlValue(c.defaultValue)}`
        if (c.isUnique) sql += ' UNIQUE'
        return sql
      })
      for (const c of blueprint.columns.filter((column) => column.references !== undefined)) {
        lines.push(`FOREIGN KEY (${c.name}) REFERENCES ${c.references}(id)${c.onDelete ? ` ON DELETE ${c.onDelete}` : ''}`)
      }
      statements.push(`CREATE TABLE ${table} (\n  ${lines.join(',\n  ')}\n)`)
    },
    dropIfExists(table) {
      statements.push(`DROP TABLE IF EXISTS ${table}`)
    },
  }
}

/** The app object `bootstrap/app.ts` exports; `node strut dev` serves it. */
export function createApplication({ routes }) {
  const table = new Map()
  const routerFor = (prefix) => ({
    get(path, handler) { table.set(`GET ${prefix}${path === '/' && prefix ? '' : path}`, handler) },
  })
  if (routes.web) routes.web(routerFor(''))
  if (routes.api) routes.api(routerFor('/api/v1'))
  return {
    /** Find and run a handler; returns `{ status, body }`. */
    async handle(method, path) {
      const handler = table.get(`${method} ${path}`)
      if (!handler) return { status: 404, body: { title: 'Not Found', status: 404 } }
      return { status: 200, body: await handler() }
    },
  }
}
