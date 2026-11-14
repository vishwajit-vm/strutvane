/**
 * Type-level tests. These assertions are checked by `tsc --noEmit` (the first half of `npm test`):
 * every `expectTypeOf` must hold, and every `@ts-expect-error` line must really be an error
 * (an unused `@ts-expect-error` is itself a compile error, so misuse that silently compiled
 * would fail the build).
 *
 * Misuse lives inside functions that are never called, so it is only ever type-checked, never run.
 */
import { describe, expectTypeOf, test } from 'vitest'
import { Post } from '../fixtures/blog/app/models/post.ts'
import type { NewPost, Post as PostRow, PostJson, PostPatch, Tables, User, UserJson } from '../fixtures/blog/.strutvane/types/models.d.ts'
import { Model, type BelongsTo, type HasMany, type JsonValue, type RowOf, type Scopes, type TableName } from '../src/model.ts'
import type { Blueprint, ColumnBuilder, ForeignIdColumnBuilder, SlugColumnBuilder } from '../src/schema/blueprint.ts'

describe('migration builder types', () => {
  test('each column builder carries its value type', () => {
    const shapes = (t: Blueprint) => ({
      title: t.string('title'),
      status: t.enum('status', ['draft', 'published']),
      price: t.decimal('price', 12, 2),
      featured: t.boolean('featured'),
      slug: t.slug('slug'),
      author: t.foreignId('author_id'),
    })
    type Shapes = ReturnType<typeof shapes>
    expectTypeOf<Shapes['title']>().toEqualTypeOf<ColumnBuilder<string>>()
    expectTypeOf<Shapes['status']>().toEqualTypeOf<ColumnBuilder<'draft' | 'published'>>()
    expectTypeOf<Shapes['price']>().toEqualTypeOf<ColumnBuilder<number | string>>()
    expectTypeOf<Shapes['featured']>().toEqualTypeOf<ColumnBuilder<boolean>>()
    expectTypeOf<Shapes['slug']>().toEqualTypeOf<SlugColumnBuilder>()
    expectTypeOf<Shapes['author']>().toEqualTypeOf<ForeignIdColumnBuilder>()
  })

  test('valid chains compile', () => {
    const valid = (t: Blueprint): void => {
      t.enum('status', ['draft', 'published']).default('draft')
      t.decimal('price', 12, 2).default(0)
      t.decimal('price', 12, 2).default('0.00')
      t.slug('slug').nullable().from('title').unique()
      t.foreignId('author_id').constrained('users').cascadeOnDelete()
      t.string('subtitle').nullable().default(null)
      t.json('meta').nullable().default(null)
    }
    expectTypeOf(valid).toBeFunction()
  })

  test('misuse fails to compile', () => {
    const misuse = (t: Blueprint): void => {
      // @ts-expect-error 'archived' isn't one of the enum's values
      t.enum('status', ['draft', 'published']).default('archived')
      // @ts-expect-error an enum needs at least one value
      t.enum('status', [])
      // @ts-expect-error a boolean column can't default to text
      t.boolean('featured').default('yes')
      // @ts-expect-error a decimal can't default to a boolean
      t.decimal('price').default(true)
      // @ts-expect-error only foreignId columns can be constrained
      t.integer('author_id').constrained('users')
      // @ts-expect-error only slug columns are built from another column
      t.string('code').from('title')
      // @ts-expect-error JSON defaults differ per database, so only null is allowed
      t.json('meta').default({})
      // @ts-expect-error cascadeOnDelete is a foreign key modifier
      t.string('name').cascadeOnDelete()
    }
    expectTypeOf(misuse).toBeFunction()
  })
})

describe('generated model types (fixtures/blog/.strutvane/types/models.d.ts)', () => {
  test('rows have the right types and nullability, straight from the migrations', () => {
    expectTypeOf<PostRow['id']>().toEqualTypeOf<number>()
    expectTypeOf<PostRow['title']>().toEqualTypeOf<string>()
    expectTypeOf<PostRow['content']>().toEqualTypeOf<string | null>()
    expectTypeOf<PostRow['price']>().toEqualTypeOf<string>()
    expectTypeOf<PostRow['status']>().toEqualTypeOf<'draft' | 'published'>()
    expectTypeOf<PostRow['featured']>().toEqualTypeOf<boolean>()
    expectTypeOf<PostRow['published_on']>().toEqualTypeOf<string | null>()
    expectTypeOf<PostRow['meta']>().toEqualTypeOf<JsonValue | null>()
    expectTypeOf<PostRow['created_at']>().toEqualTypeOf<Date | null>()
    expectTypeOf<PostRow['category_id']>().toEqualTypeOf<number | null>()
    expectTypeOf<User['password']>().toEqualTypeOf<string | null>()
  })

  test('renamed and dropped columns are gone', () => {
    expectTypeOf<PostRow>().not.toHaveProperty('body')
    expectTypeOf<PostRow>().not.toHaveProperty('excerpt')
    expectTypeOf<Tables>().not.toHaveProperty('labels')
    expectTypeOf<Tables>().toHaveProperty('tags')
  })

  test('JSON shapes use strings for timestamps and never contain secrets', () => {
    expectTypeOf<PostJson['created_at']>().toEqualTypeOf<string | null>()
    expectTypeOf<UserJson>().not.toHaveProperty('password')
  })

  test('NewPost requires exactly what the database can\'t fill in', () => {
    const minimal: NewPost = { title: 'Hello', author_id: 1 }
    const full: NewPost = { title: 'Hello', author_id: 1, price: '12.50', status: 'published', subtitle: null, published_on: '2026-11-14' }
    const patch: PostPatch = {}
    expectTypeOf([minimal, full, patch]).toBeArray()
    const misuse = (): NewPost[] => [
      // @ts-expect-error author_id is required (not nullable, no default)
      { title: 'Hello' },
      // @ts-expect-error id is set by the database
      { title: 'Hello', author_id: 1, id: 5 },
      // @ts-expect-error created_at is set by the framework
      { title: 'Hello', author_id: 1, created_at: new Date() },
      // @ts-expect-error status must be one of the enum values
      { title: 'Hello', author_id: 1, status: 'archived' },
      // @ts-expect-error title can't be null
      { title: null, author_id: 1 },
    ]
    expectTypeOf(misuse).toBeFunction()
  })
})

describe('MVC model base', () => {
  test('Model(\'posts\') gives the class every column, plus its own behaviour', () => {
    const use = (post: Post) => ({
      title: post.title,
      content: post.content,
      author: post.author(),
      published: post.isPublished,
    })
    type Used = ReturnType<typeof use>
    expectTypeOf<Used['title']>().toEqualTypeOf<string>()
    expectTypeOf<Used['content']>().toEqualTypeOf<string | null>()
    expectTypeOf<Used['author']>().toEqualTypeOf<BelongsTo<'users'>>()
    expectTypeOf<Used['published']>().toEqualTypeOf<boolean>()
    expectTypeOf<RowOf<'posts'>>().toEqualTypeOf<PostRow>()
    expectTypeOf<TableName>().toEqualTypeOf<'users' | 'posts' | 'categories' | 'tags'>()
  })

  test('misuse of tables, columns and scopes fails to compile', () => {
    const misuse = (post: Post): unknown[] => [
      // @ts-expect-error there is no table called 'post'
      Model('post'),
      // @ts-expect-error 'writer_id' isn't a column of posts
      post.belongsTo('users', 'writer_id'),
      // @ts-expect-error the hasMany key must be a column of the *other* table
      post.hasMany('users', 'author_id'),
      // @ts-expect-error body was renamed to content by a later migration
      post.body,
      // @ts-expect-error 'archived' isn't a valid status, even inside a scope
      { stale: { status: 'archived' } } satisfies Scopes<'posts'>,
    ]
    const relation: HasMany<'posts'> = { kind: 'hasMany', related: 'posts', foreignKey: 'author_id' }
    expectTypeOf(misuse).toBeFunction()
    expectTypeOf(relation.related).toEqualTypeOf<'posts'>()
  })

  test('at runtime the model exposes the row as properties', () => {
    const row: PostRow = {
      id: 1, title: 'Hello', slug: 'hello', content: null, price: '0.00', status: 'published', author_id: 1, featured: false,
      published_on: null, meta: null, created_at: null, updated_at: null, deleted_at: null, subtitle: null, category_id: null,
    }
    const post = new Post(row)
    expectTypeOf(post.title).toEqualTypeOf<string>()
    if (post.title !== 'Hello' || !post.isPublished || post.author().foreignKey !== 'author_id' || Post.table !== 'posts') {
      throw new Error('The model should expose its row and relations at runtime.')
    }
  })
})
