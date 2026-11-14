/**
 * The MVC model base: `class Post extends Model('posts') { … }`.
 *
 * The model file holds behaviour (relations, scopes), never columns: columns live in migrations.
 * The generated `.strutvane/types/models.d.ts` adds every table to {@link TableRegistry}, and that
 * is how `Model('posts')` knows a post has a `title: string` without the model file saying so.
 * After `sv migrate` regenerates the types, a renamed or dropped column becomes a compile error
 * everywhere it's used.
 */

/**
 * Any value JSON can hold. Used for `t.json(…)` columns.
 *
 * @example
 * const meta: JsonValue = { tags: ['a', 'b'], pinned: true }
 */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }

/**
 * The four shapes of one table, as the type generator writes them.
 *
 * @example
 * type PostShapes = { row: Post; insert: NewPost; update: PostPatch; json: PostJson }
 */
export interface TableShapes {
  /** A row as the model sees it (timestamps as `Date`). */
  readonly row: object
  /** What creating a row needs. */
  readonly insert: object
  /** What updating a row accepts. */
  readonly update: object
  /** A row as the JSON API returns it. */
  readonly json: object
}

/**
 * Every table in the app. Empty here on purpose: the generated `models.d.ts` fills it in through
 * declaration merging, so the framework never imports app code.
 *
 * @example
 * // in .strutvane/types/models.d.ts
 * declare module '#strutvane/model' { interface TableRegistry { posts: { row: Post; … } } }
 */
export interface TableRegistry {}

/**
 * The name of any table the migrations created.
 *
 * @example
 * const table: TableName = 'posts' // 'post' would not compile
 */
export type TableName = keyof TableRegistry & string

/**
 * A row of a table, as the model sees it.
 *
 * @example
 * type PostRow = RowOf<'posts'> // { id: number; title: string; … }
 */
export type RowOf<TTable extends TableName> = TableRegistry[TTable] extends { row: infer TRow } ? TRow : never

/**
 * A column name of a table.
 *
 * @example
 * const column: ColumnOf<'posts'> = 'title'
 */
export type ColumnOf<TTable extends TableName> = keyof RowOf<TTable> & string

/**
 * A "belongs to" relation (`post.author()`), as plain data the query layer can use.
 *
 * @example
 * const relation: BelongsTo<'users'> = { kind: 'belongsTo', related: 'users', foreignKey: 'author_id' }
 */
export interface BelongsTo<TRelated extends TableName> {
  readonly kind: 'belongsTo'
  readonly related: TRelated
  readonly foreignKey: string
}

/**
 * A "has many" relation (`user.posts()`).
 *
 * @example
 * const relation: HasMany<'posts'> = { kind: 'hasMany', related: 'posts', foreignKey: 'author_id' }
 */
export interface HasMany<TRelated extends TableName> {
  readonly kind: 'hasMany'
  readonly related: TRelated
  readonly foreignKey: string
}

/**
 * Named, reusable filters: Laravel's local scopes, as data. Values are type-checked against the
 * row, so `{ status: 'archived' }` on a `'draft' | 'published'` column doesn't compile.
 *
 * @example
 * static scopes = { published: { status: 'published' } } satisfies Scopes<'posts'>
 */
export type Scopes<TTable extends TableName> = Readonly<Record<string, Partial<RowOf<TTable>>>>

/**
 * What every model instance can do, on top of having its columns as properties.
 *
 * @example
 * post.belongsTo('users', 'author_id')
 */
export interface ModelMethods<TTable extends TableName> {
  /** Declare that this row points to a row of `related` through `foreignKey` (a column on *this* table). */
  belongsTo<TRelated extends TableName>(related: TRelated, foreignKey: ColumnOf<TTable>): BelongsTo<TRelated>
  /** Declare that rows of `related` point to this row through `foreignKey` (a column on *their* table). */
  hasMany<TRelated extends TableName>(related: TRelated, foreignKey: ColumnOf<TRelated>): HasMany<TRelated>
}

/**
 * A model instance: its columns as typed properties, plus the model methods.
 *
 * @example
 * const post: ModelInstance<'posts'> = new Post(row)
 * post.title // string
 */
export type ModelInstance<TTable extends TableName> = RowOf<TTable> & ModelMethods<TTable>

/**
 * The class `Model('posts')` returns: something you can `extend` and `new`.
 *
 * @example
 * class Post extends Model('posts') {}
 */
export interface ModelClass<TTable extends TableName> {
  new (attributes: RowOf<TTable>): ModelInstance<TTable>
  /** The table this model reads and writes. */
  readonly table: TTable
}

/**
 * Create the base class for a model of `table`. Laravel infers the table from the class name;
 * here the table is named explicitly, because that is what lets TypeScript look its columns up.
 *
 * @example
 * export class Post extends Model('posts') {
 *   author() { return this.belongsTo('users', 'author_id') }
 * }
 * new Post(row).title // string, straight from the migrations
 */
export function Model<TTable extends TableName>(table: TTable): ModelClass<TTable> {
  class BaseModel {
    static readonly table = table

    constructor(attributes: RowOf<TTable>) {
      // Columns become plain properties, like Eloquent's `$post->title`.
      Object.assign(this, attributes)
    }

    belongsTo<TRelated extends TableName>(related: TRelated, foreignKey: string): BelongsTo<TRelated> {
      return { kind: 'belongsTo', related, foreignKey }
    }

    hasMany<TRelated extends TableName>(related: TRelated, foreignKey: string): HasMany<TRelated> {
      return { kind: 'hasMany', related, foreignKey }
    }
  }
  // TypeScript can't express "the constructor also adds the row's columns as properties" inside a
  // class body, so the precise type is stated once, here, instead of in every model file.
  return BaseModel as unknown as ModelClass<TTable>
}
