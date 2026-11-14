/**
 * The MVC model base: `export class Post extends Model('posts') {}`.
 *
 * This is the *smallest* active-record layer that lets the MVC core run end to end (find, find
 * by a column, route binding, create, update, delete, paginate). The real ORM (query builder,
 * relations, eager loading, factories) is designed in spike 11 and replaces this file; the
 * contract `ResourceController` needs from it is listed in the README and the shared design board.
 *
 * Columns are typed from spike 10's generated `TableRegistry`, so `post.title` is a `string`
 * without the model file declaring anything.
 */
import { randomBytes } from 'node:crypto'
import { currentApplication } from '../foundation/context.ts'
import { ClockToken } from '../foundation/tokens.ts'
import type { InsertOf, JsonOf, PatchOf, RowOf, TableName } from '../model.ts'
import { StrutvaneError } from '../support/errors.ts'
import { slugify } from '../support/str.ts'
import { fromDatabase, toDatabase, toJsonValue } from './casts.ts'
import { ConnectionToken, type Connection, type DatabaseRow } from './connection.ts'
import type { SqlValue } from './dialect.ts'
import type { ListRequest } from './list-query.ts'
import { buildListSql, type Constraint } from './list-sql.ts'
import { MetadataToken, type AppMetadata, type FieldMetadata, type ResourceMetadata } from './metadata.ts'

/**
 * One page of models plus Laravel-style paginator numbers.
 *
 * @example
 * const page: Paginated<Post> = await Post.paginate(request)
 * page.meta.lastPage
 */
export interface Paginated<TModel> {
  readonly data: TModel[]
  readonly meta: { readonly page: number; readonly perPage: number; readonly total: number; readonly lastPage: number; readonly from: number | null; readonly to: number | null }
}

/**
 * Instance methods every model has, on top of its columns.
 *
 * @example
 * await post.update({ title: 'New title' })
 */
export interface ModelMethods<TTable extends TableName> {
  /** The value for URLs: the given column, or the model's `routeKeyName`. */
  routeKey(field?: string): string | number
  /** The JSON API shape: hidden columns removed, dates as ISO strings. */
  toJSON(): JsonOf<TTable>
  /** Save changes (stamps `updated_at`). */
  update(values: PatchOf<TTable>): Promise<void>
  /** Save values a form request already validated (names checked against metadata). */
  updateFromValidated(values: Readonly<Record<string, unknown>>): Promise<void>
  /** Delete the row; a soft delete when the table has `deleted_at`. */
  delete(): Promise<void>
}

/**
 * A model instance: its columns as typed properties, plus the model methods.
 *
 * @example
 * const post: ModelInstance<'posts'> = …
 * post.title // string
 */
export type ModelInstance<TTable extends TableName> = RowOf<TTable> & ModelMethods<TTable>

/**
 * The static side shared by every model class, used for `this`-typed static methods.
 *
 * @example
 * function tableOf(model: ModelStatics): string { return model.table }
 */
export interface ModelStatics {
  /** The table this model reads and writes. */
  readonly table: TableName
  /** The column used for route binding by default (Laravel's `getRouteKeyName()` / `#[RouteKey]`). */
  readonly routeKeyName: string
  /**
   * The columns the auto API may write (security review F-10). When set, it is the whole
   * allowlist: columns added by later migrations stay read-only until listed here.
   */
  readonly fillable?: readonly string[]
}

/**
 * A concrete model class, as seen from a `this`-typed static method.
 *
 * @example
 * function tableOf(model: ModelConstructor): string { return model.table }
 */
export type ModelConstructor = (abstract new (attributes: never) => object) & ModelStatics

/**
 * The class `Model('posts')` returns.
 *
 * @example
 * class Post extends Model('posts') {}
 * const post = await Post.find(1) // Post | null
 */
export interface ModelClass<TTable extends TableName> extends ModelStatics {
  new (attributes: RowOf<TTable>): ModelInstance<TTable>
  readonly table: TTable
  /** Find by primary key. Soft-deleted rows are not found. */
  find<TThis extends ModelConstructor>(this: TThis, id: number): Promise<InstanceType<TThis> | null>
  /** Find the first row where `column = value`. */
  findBy<TThis extends ModelConstructor>(this: TThis, column: string, value: SqlValue): Promise<InstanceType<TThis> | null>
  /** Route model binding: `field` from `{post:slug}`, or the model's `routeKeyName`. */
  resolveRouteBinding<TThis extends ModelConstructor>(this: TThis, value: string, field?: string): Promise<InstanceType<TThis> | null>
  /** Insert a row with typed values. */
  create<TThis extends ModelConstructor>(this: TThis, values: InsertOf<TTable>): Promise<InstanceType<TThis>>
  /** Insert a row from values a form request already validated (names checked against metadata). */
  createFromValidated<TThis extends ModelConstructor>(this: TThis, values: Readonly<Record<string, unknown>>): Promise<InstanceType<TThis>>
  /** One page of rows for a validated list request, plus extra constraints. */
  paginate<TThis extends ModelConstructor>(this: TThis, request: ListRequest, constraints?: readonly Constraint[]): Promise<Paginated<InstanceType<TThis>>>
  /** `true` if any row (soft-deleted ones too) has `column = value`, ignoring the row whose key is `exceptKey`. */
  isTaken(column: string, value: SqlValue, exceptKey?: SqlValue): Promise<boolean>
  /** The resource metadata for this model's table. */
  metadata(): ResourceMetadata
}

/**
 * Create the base class for a model of `table`. Laravel infers the table from the class name;
 * here it is named explicitly, because that is what lets TypeScript look its columns up.
 *
 * @example
 * export class Post extends Model('posts') {
 *   static override readonly routeKeyName = 'slug'
 *   get isPublished(): boolean { return this.status === 'published' }
 * }
 */
export function Model<TTable extends TableName>(table: TTable): ModelClass<TTable> {
  class BaseModel {
    static readonly table: TableName = table
    static readonly routeKeyName: string = 'id'

    constructor(attributes: Readonly<Record<string, unknown>>) {
      // Columns become plain properties, like Eloquent's `$post->title`.
      Object.assign(this, attributes)
    }

    static metadata(): ResourceMetadata {
      return services('metadata()').metadata.resource(this.table)
    }

    static async find(this: typeof BaseModel, id: number): Promise<BaseModel | null> {
      return this.findBy(this.metadata().primaryKey, id)
    }

    static async findBy(this: typeof BaseModel, column: string, value: SqlValue): Promise<BaseModel | null> {
      const resource = this.metadata()
      assertColumn(resource, column)
      const { db } = services(`${this.name}.findBy()`)
      const q = (name: string): string => db.dialect.quote(name)
      const softDelete = resource.softDeletes ? ` AND ${q('deleted_at')} IS NULL` : ''
      const rows = await db.select(`SELECT * FROM ${q(resource.table)} WHERE ${q(column)} = ${db.dialect.placeholder(1)}${softDelete} LIMIT 1`, [value])
      const row = rows[0]
      return row === undefined ? null : this.hydrate(row)
    }

    static async resolveRouteBinding(this: typeof BaseModel, value: string, field?: string): Promise<BaseModel | null> {
      const column = field ?? this.routeKeyName
      const resource = this.metadata()
      // Integer keys only match digits: `/posts/abc` is a 404 without a query, and `1abc`
      // can't sneak through the engine's loose text-to-number comparison.
      if (resource.fields.find((entry) => entry.name === column)?.cast === 'integer') {
        return /^\d{1,15}$/.test(value) ? this.findBy(column, Number(value)) : null
      }
      return this.findBy(column, value)
    }

    static async create(this: typeof BaseModel, values: Readonly<Record<string, unknown>>): Promise<BaseModel> {
      return this.createFromValidated(values)
    }

    static async createFromValidated(this: typeof BaseModel, values: Readonly<Record<string, unknown>>): Promise<BaseModel> {
      const resource = this.metadata()
      const { db, now } = services(`${this.name}.create()`)
      const row: Record<string, unknown> = { ...values }
      for (const column of Object.keys(row)) assertColumn(resource, column)
      if (resource.slug !== undefined && (row[resource.slug.field] === undefined || row[resource.slug.field] === '')) {
        row[resource.slug.field] = await uniqueSlug(db, resource, String(row[resource.slug.from] ?? ''))
      }
      if (resource.timestamps) {
        row['created_at'] = now
        row['updated_at'] = now
      }
      const columns = Object.keys(row)
      const placeholders = columns.map((_, index) => db.dialect.placeholder(index + 1))
      const params = columns.map((column) => toDatabase(fieldOf(resource, column), row[column], db.dialect))
      const result = await db.execute(`INSERT INTO ${db.dialect.quote(resource.table)} (${columns.map((column) => db.dialect.quote(column)).join(', ')}) VALUES (${placeholders.join(', ')})`, params)
      // `insertId` works on SQLite and MySQL; PostgreSQL needs `RETURNING` (a dialect concern for the ORM).
      const created = await this.find(result.insertId)
      if (created === null) throw new Error(`The new ${this.name} (id ${result.insertId}) could not be read back.`)
      return created
    }

    static async isTaken(this: typeof BaseModel, column: string, value: SqlValue, exceptKey?: SqlValue): Promise<boolean> {
      const resource = this.metadata()
      assertColumn(resource, column)
      const { db } = services(`${this.name}.isTaken()`)
      const q = (name: string): string => db.dialect.quote(name)
      const params: SqlValue[] = [value]
      let sql = `SELECT 1 AS ${q('hit')} FROM ${q(resource.table)} WHERE ${q(column)} = ${db.dialect.placeholder(1)}`
      if (exceptKey !== undefined) {
        params.push(exceptKey)
        sql += ` AND ${q(resource.primaryKey)} <> ${db.dialect.placeholder(2)}`
      }
      // Soft-deleted rows count: the unique index still covers them.
      return (await db.select(`${sql} LIMIT 1`, params)).length > 0
    }

    static async paginate(this: typeof BaseModel, request: ListRequest, constraints: readonly Constraint[] = []): Promise<Paginated<BaseModel>> {
      const resource = this.metadata()
      const { db } = services(`${this.name}.paginate()`)
      const sql = buildListSql(resource, request, constraints, db.dialect)
      const counted = await db.select(sql.count.sql, sql.count.params)
      const total = Number(counted[0]?.['total'] ?? 0)
      const rows = await db.select(sql.select.sql, sql.select.params)
      const offset = (request.page - 1) * request.perPage
      return {
        data: rows.map((row) => this.hydrate(row)),
        meta: {
          page: request.page,
          perPage: request.perPage,
          total,
          lastPage: Math.max(1, Math.ceil(total / request.perPage)),
          from: rows.length === 0 ? null : offset + 1,
          to: rows.length === 0 ? null : offset + rows.length,
        },
      }
    }

    /** Build a model from a raw database row, applying each column's cast. */
    static hydrate(this: typeof BaseModel, row: DatabaseRow): BaseModel {
      const resource = this.metadata()
      const attributes: Record<string, unknown> = {}
      for (const field of resource.fields) attributes[field.name] = fromDatabase(field, row[field.name])
      return new this(attributes)
    }

    routeKey(field?: string): string | number {
      const column = field ?? this.#model().routeKeyName
      const value = this.#attribute(column)
      if (typeof value === 'string' || typeof value === 'number') return value
      throw new StrutvaneError('INVALID_ROUTE_KEY', `${this.constructor.name}.${column} is ${value === null ? 'null' : typeof value}, so it can't go in a URL.`, 'Bind routes by a column that is always a string or number (id or slug).')
    }

    toJSON(): Record<string, unknown> {
      const json: Record<string, unknown> = {}
      for (const field of this.#model().metadata().fields) if (!field.hidden) json[field.name] = toJsonValue(this.#attribute(field.name))
      return json
    }

    async update(values: Readonly<Record<string, unknown>>): Promise<void> {
      await this.updateFromValidated(values)
    }

    async updateFromValidated(values: Readonly<Record<string, unknown>>): Promise<void> {
      const model = this.#model()
      const resource = model.metadata()
      const { db, now } = services(`${model.name}#update()`)
      const changes: Record<string, unknown> = { ...values }
      for (const column of Object.keys(changes)) assertColumn(resource, column)
      if (resource.timestamps) changes['updated_at'] = now
      const columns = Object.keys(changes)
      if (columns.length === 0) return
      const assignments = columns.map((column, index) => `${db.dialect.quote(column)} = ${db.dialect.placeholder(index + 1)}`)
      const params = columns.map((column) => toDatabase(fieldOf(resource, column), changes[column], db.dialect))
      const key = resource.primaryKey
      await db.execute(`UPDATE ${db.dialect.quote(resource.table)} SET ${assignments.join(', ')} WHERE ${db.dialect.quote(key)} = ${db.dialect.placeholder(columns.length + 1)}`, [...params, toDatabase(fieldOf(resource, key), this.#attribute(key), db.dialect)])
      Object.assign(this, changes)
    }

    async delete(): Promise<void> {
      const model = this.#model()
      const resource = model.metadata()
      if (resource.softDeletes) {
        await this.update({ deleted_at: services(`${model.name}#delete()`).now })
        return
      }
      const { db } = services(`${model.name}#delete()`)
      const key = resource.primaryKey
      await db.execute(`DELETE FROM ${db.dialect.quote(resource.table)} WHERE ${db.dialect.quote(key)} = ${db.dialect.placeholder(1)}`, [toDatabase(fieldOf(resource, key), this.#attribute(key), db.dialect)])
    }

    #model(): typeof BaseModel {
      return this.constructor as typeof BaseModel
    }

    #attribute(column: string): unknown {
      return (this as unknown as Record<string, unknown>)[column]
    }
  }
  // TypeScript can't express "the constructor also adds the row's columns as properties" inside a
  // class body, so the precise public type is stated once, here, instead of in every model file.
  return BaseModel as unknown as ModelClass<TTable>
}

/** The services a model needs, from the current app. */
function services(helper: string): { db: Connection; metadata: AppMetadata; now: Date } {
  const { container } = currentApplication(helper)
  return { db: container.make(ConnectionToken), metadata: container.make(MetadataToken), now: container.make(ClockToken)() }
}

function fieldOf(resource: ResourceMetadata, column: string): FieldMetadata {
  const field = resource.fields.find((entry) => entry.name === column)
  if (field === undefined) throw unknownColumn(resource, column)
  return field
}

function assertColumn(resource: ResourceMetadata, column: string): void {
  fieldOf(resource, column)
}

function unknownColumn(resource: ResourceMetadata, column: string): StrutvaneError {
  return new StrutvaneError('UNKNOWN_COLUMN', `The "${resource.table}" table has no "${column}" column.`, `Columns: ${resource.fields.map((field) => field.name).join(', ')}. If you just added it, run the migration and regenerate the types.`)
}

/**
 * A free slug: `hello-world`, or on a collision `hello-world-k3f9` with a short random suffix.
 *
 * Why random and not `-2`, `-3` (spike 10's counter): a counter tells the client how many rows
 * with that title exist, including rows it may not see (security review F-14). Soft-deleted rows
 * keep their slug reserved, because the unique index still covers them.
 */
async function uniqueSlug(db: Connection, resource: ResourceMetadata, source: string): Promise<string> {
  const slugField = resource.slug?.field ?? 'slug'
  const base = slugify(source)
  if (base === '') throw new StrutvaneError('EMPTY_SLUG', `Couldn't build a ${slugField} from "${source}".`, `Send a ${slugField}, or give ${resource.slug?.from ?? 'the source column'} some letters or digits.`)
  const q = (name: string): string => db.dialect.quote(name)
  const sql = `SELECT 1 AS ${q('hit')} FROM ${q(resource.table)} WHERE ${q(slugField)} = ${db.dialect.placeholder(1)} LIMIT 1`
  let candidate = base
  // Five attempts: with 36^4 suffixes a repeat collision means something else is wrong.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    if ((await db.select(sql, [candidate])).length === 0) return candidate
    candidate = `${base}-${randomSuffix()}`
  }
  throw new StrutvaneError('SLUG_EXHAUSTED', `Couldn't find a free ${slugField} for "${source}".`, `Send a ${slugField} explicitly.`)
}

/** Four characters from [a-z0-9], from the crypto RNG. */
function randomSuffix(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789'
  return Array.from(randomBytes(4), (byte) => alphabet[byte % alphabet.length] ?? 'x').join('')
}
