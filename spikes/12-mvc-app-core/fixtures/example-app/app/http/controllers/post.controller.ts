import { authorize } from '#strutvane/auth'
import { now } from '#strutvane/foundation'
import type { Constraint } from '#strutvane/database'
import { ResourceController, type HttpContext } from '#strutvane/http'
import { route } from '#strutvane/routing'
import { Post } from '../../models/post.ts'
import { PostPolicy } from '../../policies/post.policy.ts'
import { StorePostRequest, UpdatePostRequest } from '../requests/post.request.ts'

/**
 * The posts API. index, show, store, update and destroy come from ResourceController; this
 * class only says what is specific to posts.
 */
export class PostController extends ResourceController<typeof Post> {
  protected readonly model = Post
  protected readonly policy = new PostPolicy()
  protected override readonly storeRequest = new StorePostRequest()
  protected override readonly updateRequest = new UpdatePostRequest()

  /** Guests see published posts; authors also see their own drafts; admins see everything. */
  protected override indexConstraints(ctx: HttpContext): Constraint[] {
    if (ctx.user?.is_admin === true) return []
    const visible: Constraint[] = [{ column: 'status', equals: 'published' }]
    if (ctx.user !== null) visible.push({ column: 'author_id', equals: ctx.user.id })
    return [{ anyOf: visible }]
  }

  /** The author is whoever is signed in, never a value the client sends. */
  protected override prepareForStore(values: Record<string, unknown>, ctx: HttpContext): Record<string, unknown> {
    return { ...values, author_id: ctx.requireUser().id, published_at: values['status'] === 'published' ? now() : null }
  }

  /**
   * `POST /api/posts/{post:slug}/publish`: an action beyond CRUD, written like any controller
   * method. The explicit return type keeps the route registry's types from becoming circular.
   */
  async publish(ctx: HttpContext): Promise<Response> {
    const post = await this.visible(ctx)
    await authorize(this.policy, 'update', ctx.user, post, 'post')
    await post.update({ status: 'published', published_at: now() })
    return ctx.json({ data: post, links: { self: route('posts.show', { post }) } })
  }
}
