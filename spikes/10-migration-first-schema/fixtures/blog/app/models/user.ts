import { Model } from '#strutvane/model'

/**
 * A person who can sign in and write posts.
 *
 * No columns here: they come from the migrations, through the generated types.
 */
export class User extends Model('users') {
  /** The posts this user wrote. */
  posts() {
    return this.hasMany('posts', 'author_id')
  }
}
