/**
 * Request context (requestId, traceId, tenantId, actorId, …) carried implicitly through async calls
 * with AsyncLocalStorage, so every log line inside a request is enriched without passing a logger
 * around. In the real framework this store lives in @strutvane/core.
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import type { Fields } from './record.ts'

const storage = new AsyncLocalStorage<Fields>()

/** Run `fn` with `context` visible to every log call made (synchronously or asynchronously) inside it. */
export function runWithContext<T>(context: Fields, fn: () => T): T {
  return storage.run(context, fn)
}

/** The current request context, or `undefined` outside any request. */
export function getContext(): Fields | undefined {
  return storage.getStore()
}
