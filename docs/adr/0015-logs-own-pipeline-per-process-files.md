# ADR-0015: `@strutvane/logs` uses its own non-blocking pipeline and file writer, per-process files, and bounded, fail-safe delivery

- **Status:** Accepted
- **Date:** 2026-11-14
- **Related:** [Spike 09 report](../../spikes/09-logger-throughput/README.md), [RFC-0004](../rfcs/0004-logs-package.md)

## Context

RFC-0004 promises zero-config logging that:
- is fast
- never blocks or crashes the host app
- never leaks secrets
- rotates and retains files safely, including when several processes write logs

Spike 09 measured each promise on Windows 11 with Node 24.21 (45 tests, 4 planted bugs all caught):

| Promise | Result |
|---|---|
| Throughput | Our own pipeline is **1.3–4× faster than pino** writing JSON to files (e.g. 814k vs 204k small records/s). Our own `FileHandle` writer is as fast as **sonic-boom** or faster. |
| Non-blocking | **+2.9 ms p99** event-loop delay under HTTP load (target < 5 ms; pino +2.4 ms). Request throughput is within ~6% of pino. A ~1 KB record per request costs any logger about ⅓ of throughput. |
| Bounded memory | A 100 MB burst added 2.3–6.6 MB of heap. Every error was kept, and dropped info records were reported later. |
| Fail-safe | Disk full, missing or invalid log directory, throwing transports, broken stderr and 12 hostile value types never reach the app. Exactly **one** warning per outage, no batch lost (it goes to stderr), and automatic recovery. |
| Rotation | Exactly-once delivery across midnight and size rollover. The live-tail reader never read a half-written line. |
| Multiple processes | One shared file with size rotation broke the size cap in **24–25 of 28–30 files**. Per-process files were perfect. |
| Shutdown | **Bug found:** an unref'd deadline timer let a stuck transport exit with code 0 instead of 143. On Windows, an external SIGTERM terminates the process instantly (0/20,000 flushed). |
| File naming | **Bug found in RFC-0004:** plain string sort puts `2026-11-14.ndjson` after `2026-11-14-17.ndjson`. |
| Redaction | Property tests found no leaked secret (JWT, Bearer, URL credentials, PEM, card numbers, sensitive keys at any depth). It costs about 1 µs per record. Newlines and ANSI codes in input always give exactly one line. |
| Search index | `node:sqlite` works with no flags: 221k lines/s ingest, < 0.1 ms filtered queries. Free text needs FTS5. |

## Decision

- **Pipeline:** record → AsyncLocalStorage context → sanitize/redact (sensitive keys plus 5 patterns) → one-line serialize (max 32 KB) → **bounded priority queue** → batched writes on `setImmediate` through **our own O_APPEND `FileHandle` writer**.
  - No sonic-boom and no pino at runtime: no logging-specific runtime dependency.
- **Bounded queue policy:** drop `trace/debug/info` before `warn/error/fatal`, and report the drop count in a later `warn` record.
- **Failure:** fall back to stderr with exactly one warning per outage, and keep retrying the primary transport.
- **Files:**
  - daily, size-capped, never renamed, with retention by file name
  - when more than one process writes (cluster, workers), each writes its own file: `YYYY-MM-DD.w<id>[-N].ndjson`
  - files are ordered by `compareLogFiles` (day → process → part), never by plain string sort
  - the viewer merges per-process files by timestamp
- **Shutdown:** flush on `SIGTERM`/`beforeExit` with a **ref'd** deadline timer, so the signal's exit code is kept. On Windows, graceful shutdown goes through the framework (`sv` and the process manager send a shutdown message), because an external SIGTERM can't be caught there.
- **Request records are compact by default:** method, route, status, duration, ids. Larger fields are opt-in.
- **Search index:** an optional `node:sqlite` index over the NDJSON files, with FTS5 for free text later.
- **CI:** benchmarks run as a CI job with budgets, so performance regressions fail the build.

## Consequences

- **Positive:** no logging runtime dependency; guarantees proven by property tests, tripwires and real child processes; faster than pino.
- **Costs:**
  - We own a performance-sensitive component, so the benchmark CI job is mandatory.
  - Windows can't flush on an external kill.
  - The viewer must merge per-process files.
