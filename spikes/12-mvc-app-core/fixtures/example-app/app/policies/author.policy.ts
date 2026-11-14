import type { AuthUser, Policy } from '#strutvane/auth'
import type { Author } from '../models/author.ts'

/** Author profiles are public; creating and editing authors is for admins only. */
export class AuthorPolicy implements Policy<Author> {
  /** Admins may do everything. */
  before(user: AuthUser | null): boolean | undefined {
    return user?.is_admin === true ? true : undefined
  }

  /** Anyone may list authors. */
  viewAny(): boolean {
    return true
  }

  /** Anyone may read a profile. */
  view(): boolean {
    return true
  }
}
