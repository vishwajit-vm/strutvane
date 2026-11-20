# RFC-0006: Queues and background work

- **Status:** Draft (implementation in progress on framework branch `v2/queues`; changes made while implementing are marked *Amended 2026-11-20*)
- **Created:** 2026-11-20
- **Affects:** `@strutvane/framework` (new `queue/` module, `/queue` subpath, `Queue` and `Bus` facades, `node strut queue:*` commands, `config/queue.ts`), `@strutvane/framework/contracts` (the queue-driver types), `@strutvane/redis` (its experimental queue driver moves onto this contract), the future `queue-dashboard` add-on (observability hooks), and the 0.3 mail, notification and scheduler work that sits on top
- **Blueprint:** hub `docs/18-v2-blueprint.md` §10 "Background work (0.3)"; delivery plan `docs/21-delivery-plan.md` §4.2 (queues: jobs, chains, batches, unique jobs, retries, outbox)
- **Related:** ADR-0007 (tenancy rules), ADR-0022 (logging in the framework), RFC-0003 (error codes), integration map §4–5 (domain events through the outbox; `Queue` is a framework-owned service)

## Summary

Laravel's queue, built for TypeScript and for Strutvane's security defaults:

```ts
// app/jobs/send-welcome-email.ts
export const SendWelcomeEmail = defineJob({
  name: 'send-welcome-email',
  tries: 3,
  backoff: [10, 60, 300],
  timeout: 30,
  async handle({ userId }: { userId: string }, ctx) {
    const user = await User.findOrFail(userId)
    await mailer.send(user.email, 'Welcome!')
  },
})

await SendWelcomeEmail.dispatch({ userId: user.id })              // queued
await SendWelcomeEmail.dispatch({ userId }).delay(60).onQueue('emails')
await Bus.chain([ResizeImage.with({ id }), PublishPost.with({ id })]).dispatch()
await Bus.batch(rows.map((row) => ImportRow.with(row))).then(ImportDone.with({ importId })).dispatch()
```

```text
node strut queue:table        # writes the migrations for jobs, failed_jobs, job_batches, …
node strut migrate
node strut queue:work --queue=high,default
```

- **Drivers:** `database` (the default; SQLite, MySQL, MariaDB, PostgreSQL; no extra service), `sync` (runs in-process at dispatch, for tests and quick local work), `memory` (in-process with real reservations, for tests), and `redis` from the `@strutvane/redis` add-on through the same driver contract.
- **Delivery is at-least-once.** A worker reserves a job for a visibility window and acknowledges it when done; a crashed worker's job comes back by itself. Handlers must be idempotent, and the framework makes that easy (stable job ids, idempotent chain/batch bookkeeping).
- **Payloads are signed, plain data.** A job is found by its registered *name*, never by a module path or code; data is JSON-safe, size-capped and checked for secrets at dispatch; the envelope is HMAC-signed with a subkey of `APP_KEY`, and the worker refuses anything unsigned or altered.

## Motivation

- 0.3 is "background work": mail drivers, notifications (with the in-app bell) and the scheduler all need somewhere to run outside the request. Laravel's answer is the queue; ours must be the same so the docs and habits carry over.
- The ecosystem already needs it: the integration map's domain events are "delivered at-least-once through the outbox"; `files` wants variant jobs; `search` wants queued indexing; `@strutvane/redis` has a queue driver waiting for a contract.
- Queues are a classic source of incidents: jobs run twice by two workers, poison messages that crash every worker, deserialisation of attacker-controlled payloads into code, secrets copied into a jobs table, workers killed mid-job on deploy, tenant context lost in the worker. Each of these is designed out below, not left to app code.

## Design

### 1. Jobs

#### 1.1 `defineJob` (the default)

```ts
export const ImportRow = defineJob({
  name: 'import-row',              // stable id, /^[a-z0-9][a-z0-9._:-]{0,127}$/; never derived from a file path
  schema: importRowSchema,         // optional Standard Schema (Zod 4): validated at dispatch AND before handle
  queue: 'imports',                // default queue; dispatch(...).onQueue() overrides
  connection: 'database',          // default connection; .onConnection() overrides
  tries: 5,                        // max attempts (default 1, like Laravel)
  backoff: 'exponential',          // seconds: number | number[] | 'exponential' (2^n with full jitter, capped)
  retryUntil: 3600,                // optional: stop retrying this many seconds after dispatch
  timeout: 60,                     // seconds; must be < the connection's retryAfter (checked at boot)
  maxExceptions: 3,                // optional: fail after N thrown errors even if tries remain (releases don't count); Amended 2026-11-20: deferred past 0.3.0
  unique: { key: (data) => data.rowId, for: 600, until: 'processing' }, // §5
  async handle(data, ctx) { … },
  async failed(data, error, ctx) { … },   // optional, after the final attempt
})
```

`handle` receives the validated data and a `JobContext`:

| `ctx.` | What |
|---|---|
| `jobId`, `attempt`, `queue`, `connection` | identity and the 1-based attempt number |
| `signal` | an `AbortSignal` aborted on timeout or worker shutdown; pass it to `fetch`, DB calls, streams |
| `release(delaySeconds)` | put the job back without counting an exception (rate-limited APIs) |
| `fail(reason)` | fail now, no more retries |
| `log` | the app logger with `{ jobId, job, attempt, tenantId }` context |
| `batch` | the batch (id, progress, `cancelled`), when the job belongs to one |
| `tenantId` | the tenant restored for this job (§9) |

#### 1.2 Class jobs

For teams that prefer classes (Laravel's `ShouldQueue`), a class form maps onto the same definition:

```ts
export class SendInvoice extends Job<{ invoiceId: string }> {
  static readonly jobName = 'send-invoice'
  static readonly tries = 3
  async handle({ invoiceId }: { invoiceId: string }, ctx: JobContext) { … }
}
await SendInvoice.dispatch({ invoiceId })
```

The class is never serialised: only `jobName` and the data travel. A new instance handles each attempt (no state leaks between jobs). No decorators, no reflection.

#### 1.3 The job registry

The worker can only run jobs it knows by name. Jobs are registered (a) automatically from `app/jobs/**/*.ts` at boot (every exported job definition; the same discovery rules as listeners), (b) by providers with `app.jobs.register(Job)`, and (c) by add-ons in their provider. Two jobs with one name stop boot (`queue_job_duplicate_name`). A payload naming an unknown job is a poison message (§7.4), never an import.

### 2. Payloads: the envelope

What a driver stores is one JSON string, the **envelope**:

```json
{
  "v": 1,
  "id": "01936a1e-…",          // UUIDv7, stable across retries (the idempotency key)
  "job": "import-row",
  "data": { "rowId": "r1" },
  "queue": "imports",
  "tries": 5, "backoff": [10, 60], "timeout": 60, "retryUntil": 1765000000000, "maxExceptions": 3,
  "tenantId": "…",             // §9, optional
  "chain": [ … ],              // §6, optional: remaining steps, each { job, data, options }
  "chainCatch": { … },         // optional
  "batchId": "…",              // §7, optional
  "unique": { "key": "…", "owner": "…", "until": "processing" }, // §5, optional
  "dispatchedAt": 1764999000000,
  "sig": "base64url HMAC-SHA256"
}
```

Rules, enforced at dispatch (the error names the field path and how to fix it):

1. **Plain data only** (`queue_payload_not_plain`): objects with `Object.prototype` or `null` prototype, arrays, strings, finite numbers, booleans, `null`. No `undefined` in arrays, no class instances (including `Date`, `Map`, models: pass an id or an ISO string), no functions, symbols, `bigint` (pass a string), no cycles. Depth ≤ 32.
2. **Size cap** (`queue_payload_too_large`): the whole envelope ≤ 64 KiB by default (`config/queue.ts` `maxPayloadBytes`, hard ceiling 1 MiB, the Redis driver's limit). Large data goes to storage; the job carries the key. *Amended 2026-11-20:* 64 KiB, not 256 KiB, so the default fits the portable `TEXT` payload column on MySQL/MariaDB.
3. **No secrets** (`queue_payload_sensitive`): keys matching the logger's sensitive-key matcher (`password`, `token`, `secret`, `apiKey`, registered hidden fields, …) are refused. The hint: pass an id and load the secret inside `handle`. Jobs tables end up in backups, dashboards and logs; secrets must not.
4. **Signed** (`sig`): HMAC-SHA256 over the canonical JSON of every other field, keyed by an HKDF subkey of `APP_KEY` (`info = "strutvane.queue.v1"`), the same derivation storage signing uses. `APP_KEY` rotation: the worker also accepts signatures from `APP_PREVIOUS_KEYS`, so in-flight jobs survive a rotation.
5. **No code:** the envelope names a registered job; nothing in it is ever imported, `eval`ed or used as a path.

The `data` is validated again with `schema` in the worker before `handle` (a job queued by an older deploy with an older shape fails as `queue_payload_invalid`, not with a `TypeError` deep inside the handler).

### 3. Dispatching

*Amended 2026-11-20:* no thenable `PendingDispatch` (an object that only acts when awaited is easy to forget, and linters flag `then` properties). Options go in the second argument, or fluently on `Job.with(data)`, which ends with `.dispatch()`.

| API | Does |
|---|---|
| `Job.dispatch(data, { delay, queue, connection, afterCommit })` | pushes and resolves to the job id (`undefined` when a unique job's lock is held) |
| `Job.with(data).delay(seconds \| Date)` | available after the delay; `.dispatch()` ends a fluent call |
| `.onQueue(name)` / `.onConnection(name)` | routing; queue names `/^[A-Za-z0-9_.-]{1,64}$/` |
| `.afterCommit()` | inside a DB transaction, push only after it commits; dropped if it rolls back (the default when `config/queue.ts` `afterCommit: true`) |
| `.viaOutbox()` | write to the transactional outbox in the current transaction (§8; not implemented yet) |
| `Job.dispatchSync(data)` | run now, in this process, through the full lifecycle (validation, tenant, `failed()`), no driver |
| `Job.dispatchIf(cond, data)` / `dispatchUnless` | sugar |
| `Bus.dispatch(Job.with(data))`, `Queue.push(...)`, `Queue.later(...)`, `Queue.size(queue)` | the facades |

`afterCommit` needs a commit hook on the ORM connection: `Connection.afterCommit(fn)` runs `fn` after the outermost transaction commits (savepoint rollbacks drop callbacks registered inside them). This is a small, separate addition to the database layer. Callbacks run once the transaction's connection is back in the pool (SQLite has a single connection, and the callback pushes through it); one that throws is ignored, because the transaction already committed, so the queue logs its own push failures.

### 4. Workers

```text
node strut queue:work [connection] --queue=high,default --sleep=3 --timeout=60 --tries=1
                      --memory=128 --max-jobs=0 --max-time=0 --stop-when-empty --rest=0 --backoff=0
```

The loop: pick the first queue in priority order that has a job; run it; acknowledge; repeat; sleep `--sleep` seconds when every queue is empty. Per job:

1. **Decode and verify** the envelope (signature, version, known job, schema). Failure → poison (§7.4).
2. **Attempt check:** the driver counts attempts at reservation. If `attempt > tries`, or `retryUntil` has passed, the job is failed *without running* (`queue_max_attempts_exceeded`). This is what stops a job that kills the worker process (OOM, native crash) from looping forever.
3. **Unique lock** (§5, `until: 'processing'`): released before `handle` runs.
4. **Run** `handle` inside the app scope (container, config, DB connection), the tenant (§9), and a timeout.
5. **Success** → advance the chain / batch (§6, §7) → `ack`. **Failure** → `release` with backoff while attempts remain, else the failed-job store + `failed()` hook + chain catch / batch bookkeeping → `ack`.

**Timeouts.** JavaScript cannot kill a running promise. On timeout the worker aborts `ctx.signal`, records the attempt as failed (`queue_job_timed_out`) and releases or fails it. If the handler still has not settled after a short grace (5 s), the worker stops taking jobs and exits with code 2 so the supervisor restarts a clean process (Laravel kills the child the same way). The config check `timeout < retryAfter` (`queue_timeout_not_below_retry_after`) is what guarantees a slow job's reservation does not expire while it runs, so a second worker never picks it up.

**Graceful shutdown.** `SIGTERM` / `SIGINT` (and `queue:restart`, §4.1): stop reserving, abort nothing yet, let the current job finish for up to `--timeout` seconds, then acknowledge, close the connection and exit 0. A job still running when the grace runs out is not acknowledged: its reservation expires and another worker retries it. A second signal exits immediately.

**Limits.** `--memory` (MB, resident set; default 512, *amended 2026-11-20*: Laravel's 128 is below what a booted Node app with a database driver already uses) and `--max-jobs` / `--max-time` stop the worker *between* jobs with exit code 12 (memory) or 0 (limits), for a supervisor (systemd, Docker, PM2) to restart.

**Logs.** The worker logs through the framework logger only (ADR-0022), with `{ process: 'worker', pid }` context. Each worker process writes its own file next to the app's log (`storage/logs/strutvane-worker-<pid>.log`), so files never interleave; the log viewer and `log:tail` merge them. Payload `data` is never logged by default (only job name, id, queue, attempt, duration, error code).

#### 4.1 `queue:restart`

Writes `strutvane:queue:restart = <timestamp>` to the default cache store (file by default, shared by every process on the machine; Redis across machines). Workers check it between jobs and stop gracefully when it is newer than their start time. Deploy scripts run it after `migrate`.

### 5. Unique jobs

`unique: { key, for, until }` (Laravel's `ShouldBeUnique`): dispatch acquires a lock `queue:unique:<job>:<key>` for `for` seconds in the queue's **lock store**; if it is held, the dispatch is skipped and resolves to `undefined` (and `queue.job.skipped` is emitted). `until: 'processing'` (default) releases the lock just before `handle` runs; `'completed'` releases it after success or final failure. The lock owner is a random token in the envelope, so only that job releases it; `for` bounds a lock whose job vanished.

The lock store is a small contract (`acquire(key, owner, ttlSeconds)`, `release(key, owner)`), implemented by the database driver (a `queue_locks` table: insert if absent, else take over an expired lock with a compare-and-set update, then read the owner back; *amended 2026-11-20*: affected-row counts aren't trusted, because MySQL's driver reports *found* rows for `ON DUPLICATE KEY UPDATE`), the memory driver and the Redis add-on (`SET NX PX`). The scheduler's `withoutOverlapping` and `onOneServer` (§12) reuse it.

### 6. Chains

`Bus.chain([A.with(a), B.with(b), C.with(c)]).catch(ChainFailed.with(x)).dispatch()` pushes `A` with the remaining steps in its envelope (signed with it). When `A` succeeds, the worker pushes `B` **before** acknowledging `A`. The next step's id is derived (`uuidv5(A.id, 'chain:1')`), and drivers that support idempotent pushes (database: insert ignored on a duplicate id) make the "pushed, crashed before ack, pushed again" case a no-op; on drivers that cannot (Redis today), `B` may run twice, which at-least-once already allows. When a step fails for good, the chain stops and the `catch` job is pushed once.

### 7. Batches and failures

#### 7.1 Batches

```ts
const batch = await Bus.batch(rows.map((row) => ImportRow.with(row)))
  .name('import 2026-11')
  .allowFailures()
  .then(ImportDone.with({ importId }))      // all succeeded (or failures allowed)
  .catch(ImportFailed.with({ importId }))   // first failure (when failures are not allowed)
  .finally(ImportCleanup.with({ importId }))
  .dispatch()
batch.id // → Bus.findBatch(id): { total, pending, failed, progress, cancelled, finishedAt }
```

Callbacks are **jobs, not closures** (closures cannot be serialised safely). Storage: `job_batches` (counters, options, timestamps) plus `job_batch_jobs (batch_id, job_id, state)`. Each job's completion is recorded with a compare-and-set on its member row (`pending → done | failed`), and the counters change only when that CAS succeeds. A job delivered twice therefore never counts twice, and `then` / `catch` / `finally` are claimed once with a CAS on `finished_at` / `cancelled_at`. `ctx.batch.cancelled` lets long batches stop early; `Bus.cancelBatch(id)` cancels.

#### 7.2 Failed jobs

A job that failed for good is stored (default: the `failed_jobs` table on the app connection; memory under `sync`/tests): id, connection, queue, the envelope, the error (`code`, message, stack: redacted like a log record), `failed_at`.

| Command | Does |
|---|---|
| `queue:failed [--json]` | list failed jobs |
| `queue:retry <id…\|all> [--queue=]` | re-push with a fresh attempt count and a new signature, then remove from the store |
| `queue:forget <id>` | remove one |
| `queue:flush [--hours=N]` | remove all (or older than N hours); needs `--force` outside local, like other destructive commands |
| `queue:clear [connection] [--queue=]` | remove waiting jobs from a queue (destructive guard) |
| `queue:prune-batches [--hours=24]` | remove finished batches |

#### 7.3 Retries and backoff

Attempt `n` (1-based) failed → delay `backoff[n-1]` (last value repeats), or `'exponential'`: `min(cap, base · 2^(n-1))` with full jitter (`base = 1 s`, `cap = 1 h`). `ctx.release(s)` returns the job without counting toward `maxExceptions`.

#### 7.4 Poison messages

An envelope that cannot be parsed, has a bad or missing signature (`queue_payload_tampered`), names an unknown job (`queue_job_unknown`), or fails its schema (`queue_payload_invalid`) is moved to the failed store immediately with that code and acknowledged: it is never run and never retried automatically, and it never stops the worker. A tampered payload is also logged at `warning` with the job id (never the payload).

### 8. The transactional outbox

`dispatch(...).viaOutbox()` (and the framework's durable domain events) inserts the signed envelope into `outbox_messages (id, connection, queue, envelope, available_at, created_at, dispatched_at)` **in the caller's transaction**, so the job exists exactly when the business change committed. A relay moves undispatched rows to their queue driver, oldest first, in small claims (`UPDATE … SET claimed_until` CAS, like a reservation), and marks them dispatched. It runs inside every `queue:work` (one tick per idle loop) and as `node strut queue:relay` for dedicated setups. Pushes reuse the outbox id, so a relay crash between push and mark is deduplicated by the database driver and is at-least-once elsewhere. `queue:prune-outbox --hours=24` removes dispatched rows.

### 9. Tenancy

At dispatch the current tenant (`currentTenant()`) is captured into the signed envelope. The worker validates it (`assertTenantId`) and runs `handle` inside `runWithTenant(tenantId, …)`, so ORM tenant scopes and Postgres RLS (`set_config('app.tenant_id', …, true)`, ADR-0007 rule 3) apply exactly as in the request that dispatched it. A job dispatched outside a tenant runs outside one. Because the tenant id is signed, a row edited in the jobs table cannot move a job into another tenant. The actor is not carried: jobs pass ids and authorise explicitly when they need to.

### 10. Drivers and the contract

Types in `@strutvane/framework/contracts` (`QueueDriver`, `ReservedJob`, `PushOptions`, `QueueLockStore`), compatible with the interface `@strutvane/redis` proposed:

```ts
interface QueueDriver {
  push(queue: string, payload: string, options?: { delaySeconds?: number; id?: string }): Promise<string>
  pop(queue: string, options?: { visibilitySeconds?: number }): Promise<ReservedJob | undefined>
  ack(job: ReservedJob): Promise<boolean>          // false: the reservation was lost (expired and re-reserved)
  release(job: ReservedJob, delaySeconds?: number): Promise<boolean>
  size(queue: string): Promise<number>
  clear(queue: string): Promise<number>
  extend?(job: ReservedJob, visibilitySeconds: number): Promise<boolean>   // optional heartbeat
  close?(): Promise<void>
}
```

The only additions to the Redis proposal are the optional `id` (idempotent push; drivers that cannot honour it ignore it), `extend` and `close`. Add-ons register drivers with `registerQueueDriver(app.container, 'redis', (config, deps) => driver)` in their provider's `register()` (*amended 2026-11-20*: a factory map in the container, `QueueDriversToken`, instead of `QueueManager.extend`, because the manager is built at boot after every provider registered); `config/queue.ts` then names `driver: 'redis'`. The framework ships a **driver contract test suite** in `@strutvane/framework/testing` (`queueDriverContract({ idempotentPush, usesClock })`) that every driver runs, including the concurrency cases below. The cases are runner-agnostic (they throw through `node:assert`), and a driver on its server's clock (Redis `TIME`) sets `usesClock: false` to skip the time-travel cases.

**Database driver.** Table `jobs (id, queue, payload, attempts, available_at, reserved_until, reservation, created_at)`, index `(queue, available_at)`. Times are epoch milliseconds from the app clock. `pop` selects a few candidate ids and claims one with a compare-and-set `UPDATE … SET reserved_until = ?, reservation = <random>, attempts = attempts + 1 WHERE id = ? AND available_at <= ? AND (reserved_until IS NULL OR reserved_until <= ?)`; the update that reports one affected row owns the job. This is correct on every engine (no `SKIP LOCKED` needed; PostgreSQL and MySQL 8 may use it later as an optimisation). `ack` is `DELETE … WHERE id = ? AND reservation = ?`, so a worker whose reservation expired cannot delete the job another worker now owns. Clocks of workers on different machines must agree to well within `retryAfter`.

**Sync driver.** `push` runs the job immediately through the full lifecycle in the caller's process; delays are ignored; a final failure throws to the caller (tests see it). **Memory driver.** Real reservations in one process, for tests and the contract suite.

### 11. Configuration

```ts
// config/queue.ts
export default defineConfig((env) => ({
  default: env.string('QUEUE_CONNECTION', 'database'),
  connections: {
    sync: { driver: 'sync' },
    database: { driver: 'database', table: 'jobs', queue: 'default', retryAfter: 90, afterCommit: false },
  },
  failed: { driver: 'database', table: 'failed_jobs' },   // or 'memory' / 'null'
  batching: { table: 'job_batches' },
  maxPayloadBytes: 262_144,
}))
```

Without a config file `QUEUE_CONNECTION` decides; unset, the default is `sync` under `APP_ENV=testing`, else `database` (*amended 2026-11-20*: no "sync with a boot warning" fallback: the database connection opens lazily, so boot can't tell whether it will work). `.env.example` gains `QUEUE_CONNECTION=database`. A bad config (unknown driver, `timeout ≥ retryAfter`, a default naming no connection) stops boot with a friendly error.

### 12. Observability hooks (queue-dashboard)

The queue manager emits in-process events: `queue.job.queued`, `.processing`, `.processed`, `.released`, `.failed`, `.skipped` (unique), `queue.worker.started`, `.stopping`, `.idle`, `queue.batch.finished`. Each carries ids, names, queue, connection, attempt, durations and the error code, never the payload data. The queue-dashboard add-on subscribes through the container (`QueueManagerToken.listen(listener)`), stores metrics where it likes, and reads queue sizes through `size()`. These are hooks (integration map connection 3), not a new connection kind.

### 13. Security summary (threat model)

| Threat | Defence |
|---|---|
| Forged or edited job rows (SQL access, a compromised Redis) run code or change tenant | No code in payloads (registry by name); HMAC signature over every field; tenant signed |
| Secrets in jobs tables, backups, dashboards | Sensitive keys refused at dispatch; payload data never logged |
| Two workers run one job | CAS reservation; `timeout < retryAfter` enforced; ack only with the reservation token |
| Poison message stops all workers | Decoding/verification failures go to the failed store; attempts counted at reservation so crash loops end |
| Unbounded payloads (memory, DB bloat) | Size cap at dispatch, depth cap, driver cap |
| Worker killed mid-job on deploy | SIGTERM drain; unacked jobs return after `retryAfter` |
| Duplicate side effects from at-least-once delivery | Stable job id as idempotency key; idempotent chain/batch/outbox bookkeeping |
| Prototype pollution through payload JSON | Parsed with a reviver that drops `__proto__`/`constructor` keys; plain-object check |

Attack-style tests ship with the implementation: tampered signature, swapped tenant, unknown job name, oversized and deep payloads, `__proto__` payloads, two workers racing on one job, SIGTERM mid-job, a job that never settles, a handler that throws on every attempt.

### 14. What sits on top (sketch, for 0.3 follow-ups)

- **Mail.** `Mail.to(user).send(new WelcomeMail(data))` sends now; `.queue()` dispatches the framework job `strutvane.mail.send` carrying the mailable's registered *name* and plain data (mailables are discovered from `app/mail/` like jobs). Drivers (`smtp`, `log`, `array`, and add-on drivers such as SES or Postmark) live behind a `Mailer` contract. Rendering happens in the worker, so the queue never stores rendered HTML with personal data longer than needed.
- **Notifications.** `notify(user, InvoicePaid.with({ invoiceId }))` resolves channels per notifiable (`mail`, `database`, add-on channels); each channel delivery is one `strutvane.notification.send` job, so one failing channel retries alone. The `database` channel writes the `notifications` table that the UI's bell reads (unread count, mark as read) over the generated API.
- **Scheduler.** `routes/console.ts`: `Schedule.job(PruneTokens.with({})).daily().onOneServer()`, `Schedule.command('queue:prune-batches').hourly()`. `schedule:work` ticks every minute (development, containers); `schedule:run` is for cron. Due tasks dispatch onto the queue (or run inline for commands); `withoutOverlapping` and `onOneServer` use the queue lock store (§5). `schedule:list` shows the next runs.
- **Durable domain events.** `Event.emitDurable(event)` writes to the outbox (§8); listeners marked `queued` run as jobs keyed by the event's `idempotencyKey`.

## Compatibility & migration

- New API; nothing existing changes behaviour. The `Queue` and `Bus` facades stop throwing `facade_not_available` (their reserved member names stay, plus new ones).
- `@strutvane/redis`: its experimental `src/queue/contract.ts` is replaced by an import from `@strutvane/framework/contracts`; `RedisQueueDriver` keeps its semantics and adds `close`. It should run the framework's driver contract suite.
- Apps add the tables with `node strut queue:table && node strut migrate` (the installer's skeleton can include the migrations by default for new apps).

## Alternatives

- **BullMQ / pg-boss / Graphile Worker as the engine.** Each ties the default to one backend (Redis, PostgreSQL), while Strutvane's default must run on SQLite and MySQL with no extra service (blueprint row 18). Their models can still be wrapped as add-on drivers.
- **`SELECT … FOR UPDATE SKIP LOCKED` only.** Not available on SQLite and not on older MariaDB; the CAS claim works everywhere and stays the correctness baseline.
- **Serialising closures for batch callbacks** (Laravel's `SerializableClosure`). Executing code from a database row is exactly the risk this design removes; callbacks are jobs.
- **Exactly-once delivery.** Not achievable across a crash between side effect and ack; at-least-once plus idempotency keys is honest and testable.

## Open questions

1. Payload encryption (Laravel's `ShouldBeEncrypted`) for jobs that must carry personal data: an opt-in `encrypt: true` using the app `Encrypter`? Proposed for 0.3.x, not 0.3.0.
2. Should `queue:work` default to `--queue=default` or to every queue named in config?
3. PostgreSQL `LISTEN/NOTIFY` (and MySQL polling only) to cut idle latency below `--sleep`: worth it in 0.3, or later?
4. Rate-limited jobs (`RateLimited` middleware): job middleware in 0.3 or 0.3.x?
