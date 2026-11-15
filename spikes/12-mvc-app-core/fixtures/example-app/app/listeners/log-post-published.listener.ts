import { app } from '#strutvane/foundation'
import { LoggerToken } from '#strutvane/foundation'

/**
 * Logs when a post is published. Discovered automatically: any `*.listener.ts` in app/listeners
 * exporting a class with a static `event` and a `handle()` method is a listener.
 */
export class LogPostPublished {
  static readonly event = 'post.published'

  handle(payload: unknown): void {
    const id = typeof payload === 'object' && payload !== null && 'id' in payload ? String(payload.id) : 'unknown'
    app().container.make(LoggerToken).info('Post published', { post: id })
  }
}
