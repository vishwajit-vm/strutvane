# ADR-0022: Logging is built into the framework with Laravel-style channels configured from `.env`; the UI is the separate `log-viewer` package

- **Status:** Accepted
- **Date:** 2026-11-15
- **Deciders:** project lead (direction), coordinator (defaults)
- **Related:** refines [ADR-0015](0015-logs-own-pipeline-per-process-files.md) and [RFC-0004](../rfcs/0004-logs-package.md); [18 §5.3](../18-v2-blueprint.md)

## Context

Laravel developers expect a few things from logging:
- `config/logging.ts` with channels (`single`, `daily`, `stack`, `stderr`, `slack`, `null`, custom);
- channel and settings chosen from `.env` (`LOG_CHANNEL`, `LOG_STACK`, `LOG_LEVEL`, `LOG_DAILY_DAYS`);
- files in `storage/logs/`;
- `Log::channel('x')`, `Log::stack([...])` and `Log::withContext()`.

v1's `@strutvane/logs` (RFC-0004, ADR-0015) is a separate package. Its pipeline is fast and fail-safe, but it has its own vocabulary: NDJSON files named `YYYY-MM-DD.w<id>.ndjson`, six pino-style levels, and no channels. The project lead asked (2026-11-15) for:
- logging in the main framework, like Laravel;
- file storage driven by `.env`, daily or a single file;
- the UI as a separate package.

## Decision

1. **Where the code lives.**
   - The pipeline moves into `@strutvane/framework`: context, redaction, serialisation, the bounded queue, the writer, rotation and shutdown, all kept from ADR-0015 with their tests and benchmark budgets.
   - `@strutvane/log-viewer`, renamed from `strutvane-logs`, keeps only the UI and its read API.
2. **Channels, in `config/logging.ts`:**

   | Driver | Notes |
   |---|---|
   | `single` | one file, `storage/logs/strutvane.log` |
   | `daily` | `storage/logs/strutvane-YYYY-MM-DD.log`, kept for `days` |
   | `stack` | sends to several channels |
   | `stderr` / `stdout` | for containers |
   | `slack` | critical records to a webhook; rate-limited; through the SSRF-safe HTTP client |
   | `null` | discards records |
   | `custom` | a function that returns a transport |

   Channels can be added and named freely, e.g. a `payments` channel with its own file.
3. **`.env` keys** (Laravel's names where Laravel has one):

   | Key | Default |
   |---|---|
   | `LOG_CHANNEL` | `stack` |
   | `LOG_STACK` | `daily` |
   | `LOG_LEVEL` | `debug` in local, `info` otherwise |
   | `LOG_DAILY_DAYS` | `14` |
   | `LOG_FORMAT` | `line` |
   | `LOG_MAX_FILE_SIZE` | `100mb` |
   | `LOG_PATH` | `storage/logs` |
   | `LOG_SLACK_WEBHOOK_URL` | none |
   | `LOG_DEPRECATIONS_CHANNEL` | `null` |

   The installer's production Dockerfile (ADR-0021) sets `LOG_CHANNEL=stderr` and `LOG_FORMAT=json`.
4. **Levels:** the eight RFC 5424 levels, as in Laravel: `emergency`, `alert`, `critical`, `error`, `warning`, `notice`, `info`, `debug`. The aliases `warn` → `warning`, `fatal` → `critical` and `trace` → `debug` keep the v1 `Logger` contract callers working.
5. **File format:** `line` is the default. It's readable like Laravel's, one record per line, with the context as JSON at the end:

   ```
   [2026-11-15 10:22:01.123] local.ERROR: Payment failed {"invoice":42,"requestId":"…"}
   ```

   `json` (NDJSON) is the alternative for log shippers. Newlines and ANSI codes in values are always escaped, so one record is always one line.
6. **File names keep ADR-0015's safety rules:**
   - the main process writes the plain name;
   - every additional process (queue worker, scheduler, cluster worker) writes its own file, e.g. `strutvane-2026-11-15.worker-2.log`;
   - a size cap opens a new part (`…-2.log`), and files are never renamed;
   - retention deletes whole days;
   - ordering uses `compareLogFiles`, never a plain string sort;
   - the viewer merges files by timestamp.
7. **API:**
   - `Log.info()` and the other level methods;
   - `Log.channel('payments')`, `Log.stack(['daily', 'slack'])`, `Log.build({ driver: 'single', path })`;
   - `Log.withContext()` (this request), `Log.shareContext()` (every channel) and `Log.withoutContext()`;
   - `logger()` and `report(error)` helpers.

   Request id, user id and tenant id are added automatically. Redaction is always on and can't be turned off per channel.
8. **Commands:** `log:tail` (live, filter by level and channel; works in Docker mode through forwarding), `log:list` and `log:clear [--days=N]`.

## Alternatives considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| Keep `@strutvane/logs` as a separate package | No move | Unlike Laravel; every app needs logging, and the error page and security events depend on it | The project lead asked for it in the framework |
| One shared file written by every process (Laravel's real behaviour) | Exactly Laravel | Spike 09 measured size-cap breakage in 24–25 of 28–30 files with several writers | Per-process files keep the guarantee; names stay Laravel-like |
| NDJSON as the default file format | Easiest to parse | Unreadable in a text editor; Laravel users expect lines | `json` stays one setting away |

## Consequences

- **Positive:**
  - It feels like Laravel.
  - One `.env` switch moves between `single`, `daily` and `stderr`.
  - The UI package stays optional.
- **Negative / costs we accept:**
  - The viewer must parse two formats.
  - Level names change from v1 (aliases cover it).
  - RFC-0004's file names are superseded.
- **Follow-ups:**
  - Implement in the logs code (branch `v2/channels`).
  - Move the pipeline into the framework after Phase 0.
  - Update RFC-0004's status note and the docs logging page.
  - Have the installer write `config/logging.ts` and the `.env` keys.
