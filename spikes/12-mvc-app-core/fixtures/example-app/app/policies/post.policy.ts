import type { AuthUser, Policy } from '#strutvane/auth'
import type { Post } from '../models/post.ts'

/**
 * Who may do what with posts. A method that is missing denies (Strutvane's default), so
 * `delete` below is admin-only through `before()`.
 */
export class PostPolicy implements Policy<Post> {
  /** Admins may do everything; for everyone else, fall through to the methods below. */
  before(user: AuthUser | null): boolean | undefined {
    return user?.is_admin === true ? true : undefined
  }

  /** Anyone may list posts (the controller narrows the list to what they may see). */
  viewAny(): boolean {
    return true
  }

  /** Published posts are public; drafts only for their author. */
  view(user: AuthUser | null, post: Post): boolean {
    return post.status === 'published' || user?.id === post.author_id
  }

  /** Any signed-in author may write. */
  create(user: AuthUser | null): boolean {
    return user !== null
  }

  /** Only the author may edit. */
  update(user: AuthUser | null, post: Post): boolean {
    return user?.id === post.author_id
  }
}
