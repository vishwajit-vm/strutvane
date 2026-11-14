import { Model } from '#strutvane/model'

/** A group of posts, addressed by its slug in URLs. */
export class Category extends Model('categories') {
  /** The posts filed under this category. */
  posts() {
    return this.hasMany('posts', 'category_id')
  }
}
