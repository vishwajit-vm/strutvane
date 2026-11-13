/**
 * Migration planner: (previous models, next models) -> ordered SQL statements.
 *
 * Why not just call drizzle-kit's `generateMigration(prev, cur)`?
 * In drizzle-kit 0.31.11, whenever a diff contains BOTH a removed and an added table
 * (or a removed and an added column in the same table), `generateMigration` calls an
 * interactive terminal prompt ("is this a rename?"). Without a TTY it rejects with
 * "Interactive prompts require a TTY terminal"; with a TTY it blocks on stdin. Neither is
 * acceptable for a framework, CI, or an IDE integration. The resolvers are internal and
 * cannot be injected through the public API.
 *
 * So the planner works in four phases and only ever hands drizzle-kit diffs that
 * cannot trigger a prompt:
 *
 *   1. RESOLVE   Find rename candidates on the *model* level and ask the injected
 *                `resolveRename` callback about each one. Never guess. No callback +
 *                candidates => RenameResolutionRequiredError.
 *   2. CLASSIFY  Detect destructive / risky changes. Blocked unless `allowDestructive`.
 *   3. RENAME    Emit rename SQL ourselves (ALTER TABLE ... RENAME [COLUMN] ...).
 *   4. DIFF      Two drizzle-kit diffs:
 *                  A) renamed-previous -> intermediate   (only removals)
 *                  B) intermediate     -> next           (only additions / alterations)
 *                where `intermediate` = renamed-previous minus everything that disappears.
 *                Each diff is checked by `assertPromptFree` before drizzle-kit sees it.
 */
import {
  generateDrizzleJson,
  generateMigration,
  generateSQLiteDrizzleJson,
  generateSQLiteMigration,
} from 'drizzle-kit/api'
import { compilePg, compileSqlite, defaultNaming, type Naming } from './compile.js'
import { columnName, type FieldDef, type ModelDefinition } from './dsl.js'

export type Dialect = 'postgres' | 'sqlite'

export type RenameCandidate =
  | {
      readonly kind: 'table'
      readonly fromModel: string
      readonly toModel: string
      readonly fromTable: string
      readonly toTable: string
    }
  | {
      readonly kind: 'column'
      /** Model name and table name *after* any table rename. */
      readonly model: string
      readonly table: string
      readonly fromField: string
      readonly toField: string
      readonly fromColumn: string
      readonly toColumn: string
    }

/** `rename` keeps the data; `separate` means "drop the old one, create the new one". */
export type RenameDecision = 'rename' | 'separate'
export type RenameResolver = (candidate: RenameCandidate) => RenameDecision | Promise<RenameDecision>

export type DestructiveKind =
  | 'dropTable'
  | 'dropColumn'
  | 'changeType'
  | 'narrowType'
  | 'removeEnumValues'
  | 'makeRequired'
  | 'addRequiredWithoutDefault'
  | 'addUnique'

export interface DestructiveChange {
  readonly kind: DestructiveKind
  readonly table: string
  readonly column?: string
  /** `data-loss`: data is irreversibly removed. `may-fail`: fails if existing rows violate it. */
  readonly risk: 'data-loss' | 'may-fail'
  readonly detail: string
}

export class RenameResolutionRequiredError extends Error {
  override readonly name = 'RenameResolutionRequiredError'
  constructor(readonly candidates: readonly RenameCandidate[]) {
    super(
      `Possible renames need a decision (rename or separate): ${candidates
        .map((c) => (c.kind === 'table' ? `table ${c.fromTable} -> ${c.toTable}` : `${c.table}.${c.fromColumn} -> ${c.toColumn}`))
        .join('; ')}`,
    )
  }
}

export class DestructiveChangeError extends Error {
  override readonly name = 'DestructiveChangeError'
  constructor(readonly changes: readonly DestructiveChange[]) {
    super(
      `Migration contains ${changes.length} destructive/risky change(s); pass allowDestructive to proceed:\n` +
        changes.map((c) => `  - [${c.risk}] ${c.kind} ${c.table}${c.column ? `.${c.column}` : ''}: ${c.detail}`).join('\n'),
    )
  }
}

export interface PlanInput {
  readonly dialect: Dialect
  readonly previous: readonly ModelDefinition[]
  readonly next: readonly ModelDefinition[]
  readonly resolveRename?: RenameResolver
  readonly allowDestructive?: boolean
}

export interface MigrationPlan {
  readonly dialect: Dialect
  /** Ordered, executable SQL statements (one per entry, no trailing breakpoints). */
  readonly statements: readonly string[]
  /** Renames that were confirmed by the resolver. */
  readonly renames: readonly RenameCandidate[]
  /** Destructive changes found (non-empty only when allowDestructive was true). */
  readonly destructive: readonly DestructiveChange[]
}

// ───────────────────────────── phase 1: renames ─────────────────────────────

const sameShape = (a: FieldDef, b: FieldDef): boolean =>
  a.kind === b.kind && (a.kind !== 'belongsTo' || a.target === b.target)

interface ColumnEntry {
  readonly key: string
  readonly column: string
  readonly def: FieldDef
}

const columnsOf = (m: ModelDefinition): ColumnEntry[] =>
  Object.entries(m.fields).map(([key, def]) => ({ key, column: columnName(key, def), def }))

interface ResolvedRenames {
  readonly confirmed: RenameCandidate[]
  /** previous model name -> next model name, for confirmed table renames */
  readonly modelRenames: Map<string, string>
  /** `${nextModel}` -> (previous field key -> next field key) */
  readonly fieldRenames: Map<string, Map<string, string>>
}

async function resolveRenames(input: PlanInput): Promise<ResolvedRenames> {
  const prevByName = new Map(input.previous.map((m) => [m.name, m]))
  const nextByName = new Map(input.next.map((m) => [m.name, m]))
  const confirmed: RenameCandidate[] = []
  const unresolved: RenameCandidate[] = []
  const modelRenames = new Map<string, string>()
  const fieldRenames = new Map<string, Map<string, string>>()

  const ask = async (c: RenameCandidate): Promise<RenameDecision | undefined> => {
    if (!input.resolveRename) {
      unresolved.push(c)
      return undefined
    }
    const decision = await input.resolveRename(c)
    if (decision !== 'rename' && decision !== 'separate') {
      throw new TypeError(`resolveRename must return 'rename' or 'separate', got ${String(decision)}`)
    }
    return decision
  }

  // Tables: every (removed, added) pair is a candidate. Each removed model can be renamed at most once.
  const removed = input.previous.filter((m) => !nextByName.has(m.name))
  const added = input.next.filter((m) => !prevByName.has(m.name))
  const removedPool = [...removed]
  for (const a of added) {
    for (const r of [...removedPool]) {
      const c: RenameCandidate = { kind: 'table', fromModel: r.name, toModel: a.name, fromTable: r.table, toTable: a.table }
      if ((await ask(c)) === 'rename') {
        confirmed.push(c)
        modelRenames.set(r.name, a.name)
        removedPool.splice(removedPool.indexOf(r), 1)
        break
      }
    }
  }

  // Columns: within each (previous, next) model pair, candidates are removed x added columns of the same shape.
  const pairs: [ModelDefinition, ModelDefinition][] = []
  for (const p of input.previous) {
    const nextName = modelRenames.get(p.name) ?? p.name
    const n = nextByName.get(nextName)
    if (n) pairs.push([p, n])
  }
  for (const [p, n] of pairs) {
    const prevCols = columnsOf(p)
    const nextCols = columnsOf(n)
    const nextColNames = new Set(nextCols.map((c) => c.column))
    const prevColNames = new Set(prevCols.map((c) => c.column))
    const removedCols = prevCols.filter((c) => !nextColNames.has(c.column))
    const addedCols = nextCols.filter((c) => !prevColNames.has(c.column))
    const pool = [...removedCols]
    const map = new Map<string, string>()
    for (const a of addedCols) {
      for (const r of pool.filter((x) => sameShape(x.def, a.def))) {
        const c: RenameCandidate = {
          kind: 'column',
          model: n.name,
          table: n.table,
          fromField: r.key,
          toField: a.key,
          fromColumn: r.column,
          toColumn: a.column,
        }
        if ((await ask(c)) === 'rename') {
          confirmed.push(c)
          map.set(r.key, a.key)
          pool.splice(pool.indexOf(r), 1)
          break
        }
      }
    }
    if (map.size > 0) fieldRenames.set(n.name, map)
  }

  if (unresolved.length > 0) throw new RenameResolutionRequiredError(unresolved)
  return { confirmed, modelRenames, fieldRenames }
}

/** Applies confirmed renames to the previous models (data/defs unchanged, identifiers renamed). */
function applyRenames(previous: readonly ModelDefinition[], next: readonly ModelDefinition[], r: ResolvedRenames): ModelDefinition[] {
  const nextByName = new Map(next.map((m) => [m.name, m]))
  return previous.map((p) => {
    const newName = r.modelRenames.get(p.name)
    const target = newName ? nextByName.get(newName) : undefined
    const name = newName ?? p.name
    const table = target?.table ?? p.table
    const fmap = r.fieldRenames.get(name)
    const fields: Record<string, FieldDef> = {}
    for (const [key, def] of Object.entries(p.fields)) {
      const renamedKey = fmap?.get(key) ?? key
      // belongsTo targets follow model renames
      const t = def.kind === 'belongsTo' ? (r.modelRenames.get(def.target ?? '') ?? def.target) : undefined
      fields[renamedKey] = t !== undefined && t !== def.target ? { ...def, target: t } : def
    }
    return { ...p, name, table, fields }
  })
}

/**
 * Naming strategy that maps renamed identifiers back to the originals, so the compiled
 * "renamed previous" schema carries the constraint names that really exist in the database.
 */
function legacyNaming(previous: readonly ModelDefinition[], renamed: readonly ModelDefinition[], r: ResolvedRenames): Naming {
  const tableBack = new Map<string, string>()
  const colBack = new Map<string, string>()
  previous.forEach((p, i) => {
    const q = renamed[i] as ModelDefinition
    if (q.table !== p.table) tableBack.set(q.table, p.table)
    const fmap = r.fieldRenames.get(q.name)
    if (!fmap) return
    for (const [fromKey, toKey] of fmap) {
      const fromDef = p.fields[fromKey] as FieldDef
      const toDef = q.fields[toKey] as FieldDef
      colBack.set(`${q.table}.${columnName(toKey, toDef)}`, columnName(fromKey, fromDef))
    }
  })
  return (kind, table, column) =>
    defaultNaming(kind, tableBack.get(table) ?? table, colBack.get(`${table}.${column}`) ?? column)
}

// ───────────────────────────── phase 2: classify ─────────────────────────────

function classify(renamedPrev: readonly ModelDefinition[], next: readonly ModelDefinition[], dialect: Dialect): DestructiveChange[] {
  const out: DestructiveChange[] = []
  const nextByName = new Map(next.map((m) => [m.name, m]))
  for (const p of renamedPrev) {
    const n = nextByName.get(p.name)
    if (!n) {
      out.push({ kind: 'dropTable', table: p.table, risk: 'data-loss', detail: `model ${p.name} removed` })
      continue
    }
    const prevCols = new Map(columnsOf(p).map((c) => [c.column, c]))
    const nextCols = new Map(columnsOf(n).map((c) => [c.column, c]))
    for (const [col] of prevCols) {
      if (!nextCols.has(col)) out.push({ kind: 'dropColumn', table: n.table, column: col, risk: 'data-loss', detail: 'column removed' })
    }
    for (const [col, nc] of nextCols) {
      const pc = prevCols.get(col)
      const a = nc.def
      if (!pc) {
        if (a.required && a.default === undefined) {
          out.push({ kind: 'addRequiredWithoutDefault', table: n.table, column: col, risk: 'may-fail', detail: 'NOT NULL column without default; fails if the table has rows' })
        }
        if (a.unique) out.push({ kind: 'addUnique', table: n.table, column: col, risk: 'may-fail', detail: 'new unique column' })
        continue
      }
      const b = pc.def
      if (b.kind !== a.kind) {
        out.push({ kind: 'changeType', table: n.table, column: col, risk: 'data-loss', detail: `${b.kind} -> ${a.kind}` })
        continue
      }
      if (a.kind === 'string' && (a.length ?? 255) < (b.length ?? 255)) {
        out.push({ kind: 'narrowType', table: n.table, column: col, risk: 'may-fail', detail: `varchar(${b.length}) -> varchar(${a.length})` })
      }
      if (a.kind === 'decimal' && ((a.precision ?? 12) < (b.precision ?? 12) || (a.scale ?? 2) < (b.scale ?? 2))) {
        out.push({ kind: 'narrowType', table: n.table, column: col, risk: dialect === 'postgres' ? 'may-fail' : 'data-loss', detail: `decimal(${b.precision},${b.scale}) -> decimal(${a.precision},${a.scale})` })
      }
      if (a.kind === 'enum') {
        const gone = (b.values ?? []).filter((v) => !(a.values ?? []).includes(v))
        if (gone.length) out.push({ kind: 'removeEnumValues', table: n.table, column: col, risk: 'may-fail', detail: `removed values: ${gone.join(', ')}` })
      }
      if (a.required && !b.required && a.default === undefined) {
        out.push({ kind: 'makeRequired', table: n.table, column: col, risk: 'may-fail', detail: 'optional -> required; fails if NULLs exist' })
      }
      if (a.unique && !b.unique) out.push({ kind: 'addUnique', table: n.table, column: col, risk: 'may-fail', detail: 'fails if duplicates exist' })
    }
    // option-driven columns
    const optionCols: [keyof ModelDefinition['options'], string[]][] = [
      ['timestamps', ['created_at', 'updated_at']],
      ['softDeletes', ['deleted_at']],
      ['tenant', ['tenant_id']],
    ]
    for (const [opt, cols] of optionCols) {
      if (p.options[opt] && !n.options[opt]) {
        for (const col of cols) out.push({ kind: 'dropColumn', table: n.table, column: col, risk: 'data-loss', detail: `${opt} disabled` })
      }
      if (!p.options[opt] && n.options[opt]) {
        const hasDefault = opt === 'softDeletes' || (opt === 'timestamps' && dialect === 'postgres')
        if (!hasDefault) {
          for (const col of cols) out.push({ kind: 'addRequiredWithoutDefault', table: n.table, column: col, risk: 'may-fail', detail: `${opt} enabled on existing table` })
        }
      }
    }
  }
  return out
}

// ───────────────────────────── phase 3 + 4: SQL ─────────────────────────────

const q = (id: string): string => `"${id.replaceAll('"', '""')}"`

function renameStatements(renames: readonly RenameCandidate[]): string[] {
  // Table renames first; column candidates already reference the new table name.
  const tables = renames.filter((r) => r.kind === 'table')
  const columns = renames.filter((r) => r.kind === 'column')
  return [
    ...tables.map((r) => `ALTER TABLE ${q(r.fromTable)} RENAME TO ${q(r.toTable)};`),
    ...columns.map((r) => `ALTER TABLE ${q(r.table)} RENAME COLUMN ${q(r.fromColumn)} TO ${q(r.toColumn)};`),
  ]
}

/** renamed-previous minus every table / column / option-column that disappears or changes identity. */
function intermediateOf(renamedPrev: readonly ModelDefinition[], next: readonly ModelDefinition[]): ModelDefinition[] {
  const nextByName = new Map(next.map((m) => [m.name, m]))
  const out: ModelDefinition[] = []
  for (const p of renamedPrev) {
    const n = nextByName.get(p.name)
    if (!n) continue
    const fields: Record<string, FieldDef> = {}
    for (const [key, def] of Object.entries(p.fields)) {
      const nd = n.fields[key]
      // keep only fields that survive with the same column name; belongsTo targets that vanish are dropped too
      if (nd && columnName(key, nd) === columnName(key, def) && (def.kind !== 'belongsTo' || nextByName.has(def.target ?? ''))) {
        fields[key] = def
      }
    }
    out.push({
      ...p,
      fields,
      options: {
        timestamps: p.options.timestamps && n.options.timestamps,
        softDeletes: p.options.softDeletes && n.options.softDeletes,
        tenant: p.options.tenant && n.options.tenant,
      },
    })
  }
  return out
}

/** Invariant guard: a diff handed to drizzle-kit must not contain anything its prompts would fire on. */
export function assertPromptFree(from: readonly ModelDefinition[], to: readonly ModelDefinition[]): void {
  const fromTables = new Set(from.map((m) => m.table))
  const toTables = new Set(to.map((m) => m.table))
  const createdTables = [...toTables].filter((t) => !fromTables.has(t))
  const deletedTables = [...fromTables].filter((t) => !toTables.has(t))
  if (createdTables.length && deletedTables.length) {
    throw new Error(`Internal invariant violated: diff both creates [${createdTables}] and deletes [${deletedTables}] tables`)
  }
  const allCols = (m: ModelDefinition): Set<string> => {
    const s = new Set(columnsOf(m).map((c) => c.column))
    s.add('id')
    if (m.options.tenant) s.add('tenant_id')
    if (m.options.timestamps) (s.add('created_at'), s.add('updated_at'))
    if (m.options.softDeletes) s.add('deleted_at')
    return s
  }
  const toByTable = new Map(to.map((m) => [m.table, m]))
  for (const f of from) {
    const t = toByTable.get(f.table)
    if (!t) continue
    const a = allCols(f)
    const b = allCols(t)
    const created = [...b].filter((c) => !a.has(c))
    const deleted = [...a].filter((c) => !b.has(c))
    if (created.length && deleted.length) {
      throw new Error(`Internal invariant violated: ${f.table} both adds [${created}] and drops [${deleted}] columns`)
    }
  }
}

async function drizzleDiff(
  dialect: Dialect,
  from: readonly ModelDefinition[],
  fromNaming: Naming,
  to: readonly ModelDefinition[],
  toNaming: Naming,
): Promise<string[]> {
  assertPromptFree(from, to)
  if (dialect === 'postgres') {
    const a = generateDrizzleJson(compilePg(from, { naming: fromNaming }))
    const b = generateDrizzleJson(compilePg(to, { naming: toNaming }))
    return generateMigration(a, b)
  }
  const a = await generateSQLiteDrizzleJson(compileSqlite(from, { naming: fromNaming }))
  const b = await generateSQLiteDrizzleJson(compileSqlite(to, { naming: toNaming }))
  return generateSQLiteMigration(a, b)
}

/** Plans a migration from `previous` to `next`. Pure: never touches a database. */
export async function planMigration(input: PlanInput): Promise<MigrationPlan> {
  const renames = await resolveRenames(input)
  const renamedPrev = applyRenames(input.previous, input.next, renames)
  const legacy = legacyNaming(input.previous, renamedPrev, renames)

  const destructive = classify(renamedPrev, input.next, input.dialect)
  if (destructive.length > 0 && !input.allowDestructive) throw new DestructiveChangeError(destructive)

  const intermediate = intermediateOf(renamedPrev, input.next)
  const removals = await drizzleDiff(input.dialect, renamedPrev, legacy, intermediate, legacy)
  const additions = await drizzleDiff(input.dialect, intermediate, legacy, input.next, defaultNaming)

  return {
    dialect: input.dialect,
    statements: [...renameStatements(renames.confirmed), ...removals, ...additions].map((s) => s.trim()).filter(Boolean),
    renames: renames.confirmed,
    destructive,
  }
}
