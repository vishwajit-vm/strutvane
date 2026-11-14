import { Model } from '#strutvane/model'

/** A blog post. Columns come from the migrations; behaviour lives here. */
export class Post extends Model('posts') {
  /** URLs use the slug: /api/posts/hello-world (Laravel's #[RouteKey('slug')]). */
  static override readonly routeKeyName = 'slug'

  /** `author_id` is not here: the controller sets it from the signed-in user. */
  static override readonly fillable = ['title', 'slug', 'body', 'status']

  /** A computed attribute (Eloquent's accessor): plain TypeScript, fully typed. */
  get isPublished(): boolean {
    return this.status === 'published'
  }
}
