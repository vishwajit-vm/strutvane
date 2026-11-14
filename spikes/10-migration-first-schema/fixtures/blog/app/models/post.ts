import { Model, type Scopes } from '#strutvane/model'

/**
 * A blog post. The columns (title, slug, content, price, status, …) come from the migrations;
 * this file only adds behaviour, the way an Eloquent model does.
 */
export class Post extends Model('posts') {
  /** Reusable filters, like Eloquent's local scopes. Values are type-checked against the columns. */
  static readonly scopes = {
    published: { status: 'published' },
    featured: { featured: true },
  } satisfies Scopes<'posts'>

  /** The user who wrote the post. */
  author() {
    return this.belongsTo('users', 'author_id')
  }

  /** The post's category, if it has one. */
  category() {
    return this.belongsTo('categories', 'category_id')
  }

  /** A computed attribute (Eloquent's accessor): plain TypeScript, fully typed. */
  get isPublished(): boolean {
    return this.status === 'published'
  }
}
