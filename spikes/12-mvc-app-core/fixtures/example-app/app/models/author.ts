import { Model } from '#strutvane/model'

/**
 * An author. The columns (name, email, bio, is_admin, api_token…) come from the migrations; this
 * file only adds behaviour, the way an Eloquent model does.
 */
export class Author extends Model('authors') {
  /**
   * What the API may write. `is_admin` and `api_token` are deliberately absent: columns not
   * listed here are read-only through the API, even if a later migration adds them.
   */
  static override readonly fillable = ['name', 'email', 'bio']
}
