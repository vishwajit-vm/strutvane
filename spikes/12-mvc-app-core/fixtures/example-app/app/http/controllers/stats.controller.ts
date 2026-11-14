import { ConnectionToken, type Connection } from '#strutvane/database'
import { Controller, type HttpContext } from '#strutvane/http'

/**
 * Admin statistics. Shows constructor injection: `inject` lists what the constructor receives,
 * and the compiler checks that the two match (no decorators, no reflection).
 */
export class StatsController extends Controller {
  static readonly inject = [ConnectionToken] as const
  readonly #db: Connection

  constructor(db: Connection) {
    super()
    this.#db = db
  }

  /** `GET /api/admin/stats`: row counts. */
  async show(ctx: HttpContext): Promise<Response> {
    const [posts] = await this.#db.select('SELECT COUNT(*) AS "total" FROM "posts" WHERE "deleted_at" IS NULL')
    const [authors] = await this.#db.select('SELECT COUNT(*) AS "total" FROM "authors"')
    return ctx.json({ data: { posts: Number(posts?.['total'] ?? 0), authors: Number(authors?.['total'] ?? 0) } })
  }
}
