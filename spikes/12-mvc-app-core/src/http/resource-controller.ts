/**
 * Controllers: a plain `Controller` base (Laravel's empty `App\Http\Controllers\Controller`), and
 * `ResourceController`, which gives a model the five API actions with:
 *
 * - **index:** pagination, search, sort and filters from `resources.json`, plus optional
 *   per-controller constraints (`indexConstraints`), behind the policy's `viewAny`;
 * - **show / update / destroy:** the route-bound model, behind `view` / `update` / `delete`;
 * - **store / update:** form-request validation (yours, or derived from the metadata), unique
 *   checks with a friendly 422, and the policy's `create` / `update`;
 * - every error as RFC 9457 problem+json (422 with field issues, 403, 404, 409).
 *
 * It is a normal class you own and override, not a black box: every step is a protected method.
 */
import { allows, authorize, type Policy } from '../auth/gate.ts'
import { currentApplication } from '../foundation/context.ts'
import type { ResourceMetadata } from '../database/metadata.ts'
import type { ModelConstructor, ModelStatics, Paginated } from '../database/model.ts'
import { parseListQuery, type ListRequest } from '../database/list-query.ts'
import type { Constraint } from '../database/list-sql.ts'
import type { SqlValue } from '../database/dialect.ts'
import { FormRequest } from '../validation/form-request.ts'
import { MetadataRequest } from '../validation/from-metadata.ts'
import type { HttpContext } from './context.ts'
import { HttpError, NotFoundError, ValidationError } from './problem.ts'
import type { Issue } from '../support/issue.ts'

/**
 * Laravel's base controller: empty on purpose. Extend it so every controller has one place to
 * add shared helpers later.
 *
 * @example
 * export class HomeController extends Controller {
 *   index(ctx: HttpContext): Response { return ctx.html('<div id="root"></div>') }
 * }
 */
export abstract class Controller {}

/**
 * What `ResourceController` needs from a model instance. This is the contract the ORM (spike 11)
 * must keep.
 *
 * @example
 * const record: ResourceRecord = await Post.find(1)
 */
export interface ResourceRecord {
  routeKey(field?: string): string | number
  toJSON(): unknown
  updateFromValidated(values: Readonly<Record<string, unknown>>): Promise<void>
  delete(): Promise<void>
}

/**
 * What `ResourceController` needs from a model class: the static half of the ORM contract.
 *
 * @example
 * const model: ResourceModel = Post
 */
export interface ResourceModel extends ModelStatics {
  readonly name: string
  new (attributes: never): ResourceRecord
  metadata(): ResourceMetadata
  paginate<TThis extends ModelConstructor>(this: TThis, request: ListRequest, constraints?: readonly Constraint[]): Promise<Paginated<InstanceType<TThis>>>
  createFromValidated<TThis extends ModelConstructor>(this: TThis, values: Readonly<Record<string, unknown>>): Promise<InstanceType<TThis>>
  /** `true` if any row (soft-deleted ones too) has `column = value`, ignoring the row `exceptKey`. */
  isTaken(column: string, value: SqlValue, exceptKey?: SqlValue): Promise<boolean>
}

/**
 * The base for CRUD controllers. Set `model` and `policy`; optionally `storeRequest`,
 * `updateRequest`, `indexConstraints()` and `prepareForStore()`.
 *
 * @example
 * export class PostController extends ResourceController<typeof Post> {
 *   protected readonly model = Post
 *   protected readonly policy = new PostPolicy()
 * }
 * // routes/api.ts: Route.apiResource('posts', PostController)
 */
export abstract class ResourceController<TModel extends ResourceModel> extends Controller {
  /** The model class this controller serves. */
  protected abstract readonly model: TModel
  /** The policy that guards every action (a missing method denies). */
  protected abstract readonly policy: Policy<InstanceType<TModel>>
  /** Validation for `store`; derived from the metadata when not set. */
  protected readonly storeRequest: FormRequest<object> | undefined = undefined
  /** Validation for `update`; derived from the metadata when not set. */
  protected readonly updateRequest: FormRequest<object> | undefined = undefined

  /**
   * `GET /posts`: one page, with `?page`, `?perPage`, `?search`, `?sort` and `?filter[…]`.
   *
   * @example
   * // GET /api/posts?search=hello&sort=-created_at&filter[status]=published
   */
  async index(ctx: HttpContext): Promise<Response> {
    await authorize(this.policy, 'viewAny', ctx.user, undefined, this.label())
    const parsed = parseListQuery(this.model.metadata(), ctx.query)
    if (!parsed.ok) throw new ValidationError(parsed.issues)
    const page = await this.model.paginate(parsed.request, await this.indexConstraints(ctx))
    return ctx.json({ data: page.data, meta: page.meta })
  }

  /**
   * `GET /posts/{post}`: the bound model, if the policy's `view` allows it.
   *
   * @example
   * // GET /api/posts/hello-world
   */
  async show(ctx: HttpContext): Promise<Response> {
    return ctx.json({ data: await this.visible(ctx) })
  }

  /**
   * `POST /posts`: validate, check uniques, create, and answer 201 with a `Location` header.
   *
   * @example
   * // POST /api/posts {"title": "Hello"}
   */
  async store(ctx: HttpContext): Promise<Response> {
    await authorize(this.policy, 'create', ctx.user, undefined, this.label())
    const input = await (this.storeRequest ?? new MetadataRequest(this.model.metadata(), 'create', this.model.fillable)).validate(ctx)
    const values = await this.prepareForStore({ ...input }, ctx)
    await this.assertUnique(values, undefined)
    const record = await this.withConflictHandling(() => this.model.createFromValidated(values))
    return ctx.json({ data: record }, 201, this.locationHeader(ctx, record))
  }

  /**
   * `PUT/PATCH /posts/{post}`: validate (every field optional), check uniques, save.
   *
   * @example
   * // PATCH /api/posts/hello-world {"status": "published"}
   */
  async update(ctx: HttpContext): Promise<Response> {
    const record = await this.visible(ctx)
    await authorize(this.policy, 'update', ctx.user, record, this.label())
    const input = await (this.updateRequest ?? new MetadataRequest(this.model.metadata(), 'update', this.model.fillable)).validate(ctx)
    const values = await this.prepareForUpdate({ ...input }, record, ctx)
    await this.assertUnique(values, record)
    await this.withConflictHandling(() => record.updateFromValidated(values))
    return ctx.json({ data: record })
  }

  /**
   * `DELETE /posts/{post}`: soft delete when the table has `deleted_at`, then 204.
   *
   * @example
   * // DELETE /api/posts/hello-world
   */
  async destroy(ctx: HttpContext): Promise<Response> {
    const record = await this.visible(ctx)
    await authorize(this.policy, 'delete', ctx.user, record, this.label())
    await record.delete()
    return ctx.noContent()
  }

  /**
   * Extra list conditions, for rows this user may see. Default: none. (Policy-to-SQL compilation
   * from spike 02 would generate this from the policy; here it is written by hand.)
   *
   * @example
   * protected override indexConstraints(ctx: HttpContext): Constraint[] {
   *   return [{ anyOf: [{ column: 'status', equals: 'published' }, { column: 'author_id', equals: ctx.user?.id ?? null }] }]
   * }
   */
  protected indexConstraints(_ctx: HttpContext): readonly Constraint[] | Promise<readonly Constraint[]> {
    return []
  }

  /**
   * Adjust validated values before insert, for example to set the owner from the signed-in user.
   *
   * @example
   * protected override prepareForStore(values, ctx) { return { ...values, author_id: ctx.requireUser().id } }
   */
  protected prepareForStore(values: Record<string, unknown>, _ctx: HttpContext): Record<string, unknown> | Promise<Record<string, unknown>> {
    return values
  }

  /**
   * Adjust validated values before an update.
   *
   * @example
   * protected override prepareForUpdate(values) { return { ...values, published_at: values.status === 'published' ? new Date() : null } }
   */
  protected prepareForUpdate(values: Record<string, unknown>, _record: InstanceType<TModel>, _ctx: HttpContext): Record<string, unknown> | Promise<Record<string, unknown>> {
    return values
  }

  /**
   * The resource this controller serves. The app checks it at boot (internal tables are refused).
   *
   * @example
   * new PostController().resourceMetadata().table // 'posts'
   */
  resourceMetadata(): ResourceMetadata {
    return this.model.metadata()
  }

  /**
   * The bound record, if the user may `view` it. A record the user may not see answers exactly
   * like a missing one (Laravel's `denyAsNotFound`), so the ids and slugs of hidden rows can't be
   * probed through show, update, delete or custom actions (security review F-23). A record the user
   * *can* see but not change still gets an honest 403 from the next check.
   *
   * @example
   * const post = await this.visible(ctx) // then: await authorize(this.policy, 'update', …)
   */
  protected async visible(ctx: HttpContext): Promise<InstanceType<TModel>> {
    const record = this.bound(ctx)
    if (await allows(this.policy, 'view', ctx.user, record)) return record
    throw new NotFoundError(`No ${this.label()} matches "${ctx.param(this.parameterName(ctx))}".`)
  }

  /** The model bound from the route (binding already returned 404 if it didn't exist). */
  protected bound(ctx: HttpContext): InstanceType<TModel> {
    return ctx.model(this.model)
  }

  /** The route parameter holding the record (the last one in the path: `post` in /posts/{post}). */
  protected parameterName(ctx: HttpContext): string {
    return Object.keys(ctx.params).at(-1) ?? ''
  }

  /** The singular label in lower case, for messages ("post"). */
  protected label(): string {
    return this.model.metadata().label.singular.toLowerCase()
  }

  /**
   * Check unique columns before writing, so a duplicate is a friendly 422 on the right field
   * instead of a driver error. A race between two requests still hits the unique index; that
   * is caught by {@link withConflictHandling} as a 409.
   */
  protected async assertUnique(values: Readonly<Record<string, unknown>>, current: InstanceType<TModel> | undefined): Promise<void> {
    const resource = this.model.metadata()
    const issues: Issue[] = []
    const record: ResourceRecord | undefined = current
    const exceptKey = record?.routeKey(resource.primaryKey)
    for (const field of resource.fields) {
      const value = values[field.name]
      if (!field.unique || (typeof value !== 'string' && typeof value !== 'number')) continue
      if (await this.model.isTaken(field.name, value, exceptKey)) issues.push({ field: field.name, code: 'taken', message: `That ${field.label.toLowerCase()} is already taken.` })
    }
    if (issues.length > 0) throw new ValidationError(issues)
  }

  /**
   * Run a write and turn a unique-index violation into a 409. The error text differs per engine
   * (SQLite "UNIQUE constraint failed", MySQL "Duplicate entry" / errno 1062, PostgreSQL 23505).
   */
  protected async withConflictHandling<TResult>(write: () => Promise<TResult>): Promise<TResult> {
    try {
      return await write()
    } catch (error) {
      if (error instanceof Error && /UNIQUE constraint failed|Duplicate entry|23505/.test(error.message)) {
        throw new HttpError(409, 'conflict', 'Conflict', `Another ${this.label()} was saved with the same unique value at the same moment. Try again.`)
      }
      throw error
    }
  }

  /** `Location: /api/posts/hello-world` when the resource has a named `show` route. */
  protected locationHeader(ctx: HttpContext, record: InstanceType<TModel>): Record<string, string> {
    const storeName = ctx.route?.name
    if (storeName === undefined || !storeName.endsWith('.store')) return {}
    const showName = `${storeName.slice(0, -'.store'.length)}.show`
    const urls = currentApplication('ResourceController.store()').url
    if (!urls.has(showName)) return {}
    const parameter = this.model.metadata().label.singular.toLowerCase()
    return { location: urls.route(showName, { [parameter]: record }) }
  }
}
