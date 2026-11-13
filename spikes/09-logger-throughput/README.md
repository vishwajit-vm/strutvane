# Spike 09: Logger throughput, non-blocking and fail-safe guarantees (RFC-0004)

**Question:** can Strutvane's own logging pipeline, as designed in [RFC-0004](../../docs/rfcs/0004-logs-package.md), be all of the following?
- fast enough (within 2× of pino)
- non-blocking under HTTP load
- crash-proof
- memory-bounded
- correct across rotation, retention, multiple processes and shutdown
- leak-proof (no secrets in output)

The pipeline is record → context (AsyncLocalStorage) → redact → serialize → bounded queue → file.

**Answer: yes, with design changes for RFC-0004.**
- **Don't adopt sonic-boom.** Our own writer is as fast.
- **Multiple processes get per-process files.**
- **Log files must be sorted by a proper comparator.**
- **The shutdown path needs a live deadline timer.**
- **The default request log record should be compact.**

Two real bugs and three weak tests were found and fixed along the way, listed below.

## Answers

| # | Question | Answer | Evidence |
|---|---|---|---|
| 1 | Throughput within 2× of pino? | **Yes.** Our pipeline needs 0.25–0.79× of pino's time (i.e. it is 1.3–4× faster) writing JSON to a file, with and without redaction. Our own `FileHandle` writer is as fast as sonic-boom or faster. | Throughput table below; `test/throughput.test.ts` asserts ≤ 2× |
| 2 | Event loop stays responsive? | **Yes.** It adds **+2.6–2.9 ms p99** under ~22–35k req/s while logging a ~1 KB redacted record per request; the target was < 5 ms. pino under the same load: +2.4 ms. Request throughput matches pino within ~6%. | Event-loop table below; `test/event-loop.test.ts` |
| 3 | Never throws, app keeps running? | **Yes.** Covered: disk full (ENOSPC), log directory replaced by a file (then auto-recovery), directory deleted at runtime, sync-throwing or rejecting transports, a broken stderr, and 12 hostile value types. Exactly **one** warning per outage, even across many failed retries. Nothing is lost: batches go to stderr. | `test/fail-safe.test.ts` (9 tests) |
| 4 | Memory bounded under a burst? | **Yes.** A burst of 100,000 records of about 1 KB each (roughly 100 MB if unbounded) added **2.3–6.6 MB** of heap. The queue peak never exceeded its cap (1,000). All 1,000 errors were kept, 99,000 info records were dropped, and the drops were reported in later `warn` records. | `test/bounded.test.ts` (5 tests) |
| 5 | Rotation and retention correct, tail never reads torn lines? | **Yes.** 20,000 lines crossing midnight produced 36 files, with every line exactly once, in the right day file and under the size cap. A concurrent live-tail reader saw every line once with 0 parse errors, and it holds back half-written lines. Retention deletes only old Strutvane files. | `test/rotation.test.ts` (8 tests, both writers) |
| 6 | Multiple processes, one directory? | **Use per-process files.** **Shared file:** O_APPEND batches up to 256 KB stayed whole on Windows (0 torn lines in 80,000), **but** with size rotation, **24–25 of 28–30 files overshot the cap**, because each process tracks the size alone. **Tagged files:** `YYYY-MM-DD.w<id>.ndjson` was perfect, with 0 torn lines and 0 oversized files. | `test/multiprocess.test.ts` (3 tests, real child processes) |
| 7 | Shutdown flushes within a timeout; a hung transport can't block? | **Yes, after a fix.** 20,000 queued records were all flushed with exit code 143. A process that simply ends flushes everything (`beforeExit`). A hung transport exits at the deadline (300 ms deadline; about 400 ms including process start-up). **On Windows, an external SIGTERM is TerminateProcess and loses everything (0/20,000)**, so Windows needs framework-driven shutdown. | `test/shutdown.test.ts` (4 tests, plus 1 Linux-only) |
| 8 | No secret ever written; one call = one line? | **Yes.** Property tests (300 runs by default; 2,000 runs pass) hide JWTs, Bearer tokens, URL credentials, PEM keys and Luhn-valid card numbers anywhere in strings and messages. Any value under a sensitive key at any depth is redacted. **Tripwires:** disabling any one of the 5 rules lets the property find a leak. CR/LF/U+2028/ANSI/NUL injection always gives exactly one line, and the message round-trips exactly. Redaction costs about **1 µs** per medium record (3.2 µs walk+redact vs 2.3 µs safe walk vs 0.7 µs raw `JSON.stringify`). | `test/redaction.test.ts` (12 tests) |
| 9 | `node:sqlite` as a search index? | **Viable, no flags needed on Node 24.21.** It ingests 221,000 lines/s. Level, time and traceId queries take **< 0.1 ms** over 200,000 lines. A free-text substring search takes 64 ms (scan), so use FTS5 later. | `bench/sqlite-index.ts`, `test/sqlite-index.test.ts` |

**Suite:** `tsc --noEmit` is clean. `vitest run`: **44 passed, 1 skipped (Linux-only real SIGTERM), 9 files**, identical in two consecutive full runs.

## Evidence

**Machine:** Windows 11 (10.0.26200), Intel i7-13620H × 16, Node 24.21.0, NVMe SSD. This is a shared developer machine with antivirus enabled, so absolute numbers vary by ±30%; compare rows, not machines.

### Q1: Throughput (`node bench/throughput.ts`, median of 3 after one discarded warm-up run)

Both loggers add the same AsyncLocalStorage request context to every record (pino via `mixin`), and both yield to the event loop every 1,000 records (like a server). Time runs from the first call until every byte is handed to the OS.

| record | redaction | implementation | records | time | records/s | MB/s | time vs pino |
|---|---|---|---|---|---|---|---|
| small | no | pino | 200,000 | 979 ms | 204,270 | 41.5 | 1.00× |
| small | no | strutvane-own | 200,000 | 246 ms | 813,504 | 168.3 | 0.25× |
| small | no | strutvane-sonic | 200,000 | 258 ms | 776,319 | 160.6 | 0.26× |
| small | yes | pino | 200,000 | 1,299 ms | 153,953 | 31.3 | 1.00× |
| small | yes | strutvane-own | 200,000 | 667 ms | 299,909 | 62.0 | 0.51× |
| small | yes | strutvane-sonic | 200,000 | 710 ms | 281,722 | 58.3 | 0.55× |
| medium | no | pino | 50,000 | 699 ms | 71,546 | 69.6 | 1.00× |
| medium | no | strutvane-own | 50,000 | 331 ms | 150,959 | 147.4 | 0.47× |
| medium | no | strutvane-sonic | 50,000 | 367 ms | 136,223 | 133.0 | 0.53× |
| medium | yes | pino | 50,000 | 932 ms | 53,621 | 47.0 | 1.00× |
| medium | yes | strutvane-own | 50,000 | 692 ms | 72,251 | 63.5 | 0.74× |
| medium | yes | strutvane-sonic | 50,000 | 740 ms | 67,565 | 59.4 | 0.79× |

**How to read this:**
- **Why we win this micro-benchmark:** one 256 KB write per event-loop turn, versus sonic-boom's ≤ 16 KB writes.
- **pino can't be tuned to match it.** Giving pino larger buffers (`minLength` 64 KB / `maxWrite` 256 KB) made it **14× slower** (about 14,000 records/s). Its default-like settings are its best.
- **pino's redaction is cheaper per feature.** It redacts *configured paths only*. Ours scans every string for 5 secret patterns *and* matches sensitive key names at any depth, which is stronger protection.
- **End to end (Q2), the two are at parity.** Don't market "4× faster than pino".

### Q2: Event loop under HTTP load (`node bench/event-loop.ts`)

Separate processes run the server and the load generator. 64 keep-alive connections for 5 s, median of 3 by p99. Each request logs one ~1 KB redacted record.

| logging | req/s | p50 | p99 | max | p99 added vs none | errors |
|---|---|---|---|---|---|---|
| none | 35,301 | 1 ms | 1.37 ms | 16.1 ms | 0.00 ms | 0 |
| strutvane | 23,152 | 2.18 ms | 4.28 ms | 16.66 ms | 2.91 ms | 0 |
| pino | 24,567 | 1.84 ms | 3.75 ms | 16.96 ms | 2.38 ms | 0 |

**Finding:** logging a ~1 KB record per request at this rate (about 23 MB/s of logs) costs **any** logger roughly a third of request throughput. → The default request record must be compact (method, route, status, duration, ids: about 250 B), with headers and bodies opt-in. That matches RFC-0004's "bodies off by default" rule and extends it to headers.

### Q9: `node:sqlite` index (`node bench/sqlite-index.ts`, 200,000 lines, 23.1 MB)

| query | time | rows |
|---|---|---|
| level = error, newest 100 | 0.10 ms | 100 |
| time window (1 hour), newest 100 | 0.09 ms | 100 |
| traceId (all lines of one request) | 0.03 ms | 5 |
| text "payment failed" (substring scan) | 64.43 ms | 201 |

Ingest took 905 ms, which is 221,068 lines/s.

### Tests that prove the tests work (mutation checks)

Each mutation re-introduces a real failure, and each must be caught (it was), then reverted:

| Mutation | Caught by |
|---|---|
| M1: warn on every failure instead of once per outage | fail-safe ("persistent outage … exactly ONE warning"). **It survived the first version of the suite** (see Findings), so a new test was added. |
| M2: drop important records like low ones | bounded (3 tests fail) |
| M3: let a batch mix two days | rotation (2 tests fail) |
| M4: `unref()` the shutdown deadline timer | shutdown ("hung transport", 1 fails) |
| Disable each of the 5 redaction rules | `redaction.test.ts` tripwires (permanent tests) |

## Findings (bugs and weak tests, all fixed)

1. **Bug: the shutdown exit code was lost with a hung transport.** A never-settling promise doesn't keep Node alive, and the deadline timer was `unref`'d. Node exited on its own after 90 ms with **code 0**, so orchestrators would see a clean exit instead of 143. **Fix:** a ref'd deadline timer that forces `exit(128+signal)`. A test asserts the code is 143 *and* that the deadline was waited for.
2. **Bug in the RFC's naming: plain string sorting breaks log order.** `2026-11-14.ndjson` (part 0) sorts *after* `2026-11-14-17.ndjson`, because `.` > `-`, and `-10` sorts before `-2`. **Fix:** `compareLogFiles` (day, then tag, then part *number*), which the viewer and tooling must use.
3. **Weak test M1:** "exactly one warning" only passed because the 30 s retry interval meant the primary was never retried. Fixed with a 5 ms retry interval and a persistent outage, which asserts more than 5 failures, 1 warning and 0 lost.
4. **Weak test (rotation):** the first version let the producer overflow the queue. The drops were correct and fully reported (12,464 written + 7,536 dropped = 20,000), but the test was about rotation. It now uses a large queue and asserts `dropped === 0`. As a side effect, this confirmed Q4's accounting on a real overflow.
5. **False positive in a property test:** fast-check deliberately favours repetitive strings, so one sample's password appeared inside another sample's (kept) username. The check is now per line, against that line's own secret.
6. **Source-file trap:** literal U+2028/U+2029 characters in TypeScript source are line terminators and broke the build. They are now built from char codes.

## Design (what `@strutvane/logs` should adopt)

```
log.info(msg, fields)                      ← synchronous, never throws (one try/catch around everything)
  └ record {time, level, msg, …bindings, …ALS context, …fields}   (reserved keys protected: _time/_level/_msg)
  └ redaction on : sanitize walk (keys + 5 patterns + safety) → serialize (1 line, ≤ maxRecordBytes)
    redaction off: native JSON.stringify fast path; falls back to the safe walk only if it throws
  └ BoundedQueue (records + bytes caps; LOW dropped first, IMPORTANT kept; per-level drop counts; FIFO order)
        ↓ setImmediate batching, one batch in flight, batch never mixes UTC days
  └ Transport: rotatingFileTransport(dir, maxFileBytes, retentionDays, tag) → FileHandle 'a' writer
        ├ failure → stderr fallback (ONE warning per outage), batch kept, primary retried after retryPrimaryMs
        └ new day / new part = NEW file (never rename/truncate) → live tail never sees a file change under it
```

**Module map:**
- `src/record.ts`, `context.ts`, `redact.ts`, `serialize.ts`, `queue.ts`
- `transports/file.ts`, `transports/stderr.ts`
- `rotate.ts`, `logger.ts`, `shutdown.ts`, `sqlite-index.ts`

## Limits and risks

- **macOS/Linux not run here.** The real-SIGTERM test exists, but is skipped on Windows. On Linux, deleting the log directory while a file is open silently writes to an unlinked inode; reopening on rotation recovers. Run the suite in CI on all three operating systems before 1.0.
- **Network file systems** (NFS, SMB, Azure Files): O_APPEND atomicity is not guaranteed there. This is one more reason for per-process files and the database driver in multi-instance deployments.
- **Card-number redaction has false positives.** Any 13–19 digit Luhn-valid number *inside a string* is redacted (about 10% of random numeric ids). Numeric fields are never scanned. Documented as fail-safe, with a future allow-list for named fields.
- **Pattern redaction can't catch arbitrary secrets** (a random API key under an innocent key name inside free text). Key-name redaction and "no bodies/headers by default" are the main defences, which is why defaults matter.
- **`node:sqlite`** is still marked as under active development in Node 24. Keep the index optional and rebuildable from NDJSON.
- **Benchmarks are single-machine.** Re-run them on Linux CI hardware before quoting numbers publicly.

## Recommendations for `@strutvane/logs` (changes to RFC-0004)

1. **Don't depend on sonic-boom.** The own `FileHandle` writer (O_APPEND, partial-write loop) is as fast or faster, has clearer error semantics, and means one dependency fewer. Keep the `FileWriter` interface so it can be swapped.
2. **Multi-process: per-process tagged files** (`YYYY-MM-DD.w<id>.ndjson`) whenever more than one process can write (cluster, PM2, replicas on a shared volume). The viewer merges files by `time`. A single process keeps untagged names.
3. **Use `compareLogFiles` everywhere files are listed** (viewer, export, retention reports).
4. **Shutdown:** `@strutvane/core` owns signals and calls `logger.flush(deadline)` with a **ref'd** deadline timer. Document that **Windows can't flush on an external kill**, so Windows services must stop through the framework's shutdown endpoint or service stop hook.
5. **Default request record is compact** (about 250 B: method, route, status, duration, ids). Headers and bodies are opt-in per route, with redaction.
6. **Queue defaults:** 10,000 records / 16 MB, with drop reporting as implemented. Expose `stats()` to `sv logs:doctor`.
7. **Search index:** optional `node:sqlite` index (level/time/traceId indexes). Add FTS5 for text search when available. NDJSON stays the source of truth.

## Suggested ADR

> **ADR-00XX: `@strutvane/logs` uses its own non-blocking pipeline and file writer, per-process files, and bounded, fail-safe delivery**
>
> **Context:** RFC-0004 needs zero-config logging that is fast, never blocks or crashes the host app, never leaks secrets, and rotates and retains files safely, including with several processes. Spike 09 measured:
> - The own pipeline is 1.3–4× faster than pino writing files, and on par with pino under HTTP load (+2.9 ms p99).
> - Memory stays bounded under bursts (2–7 MB for a 100 MB burst).
> - Exactly one warning per outage, with no lost batches.
> - Exactly-once rotation, and a torn-line-free live tail.
> - Shared files with size rotation break the size cap (24/28 files), while per-process files don't.
> - String file ordering is wrong.
> - An unref'd shutdown timer loses the signal exit code.
>
> **Decision:**
> - **Pipeline:** record → ALS context → sanitize/redact (keys + 5 patterns) → one-line serialize (≤ 32 KB) → bounded priority queue → setImmediate-batched writes through our own O_APPEND `FileHandle` writer.
> - **Transport failure:** stderr fallback with one warning per outage, retrying the primary.
> - **Files:** daily + size-capped, never renamed, with retention by name. Per-process `.w<id>` files when more than one writer exists. `compareLogFiles` ordering.
> - **Shutdown:** flush with a ref'd deadline.
> - **Request records:** compact by default.
> - **Index:** optional `node:sqlite`.
>
> **Consequences:**
> - (+) No logging-specific runtime dependency.
> - (+) Guarantees are proven by tests: property-based tests, tripwires, mutation checks and real child processes.
> - (−) We own a performance-sensitive component, so benchmarks become a CI job.
> - (−) Windows can't flush on an external kill.
> - (−) The viewer must merge per-process files.

## Run it

```bash
cd spikes/09-logger-throughput
corepack pnpm@12.18.0 install
corepack pnpm@12.18.0 run typecheck
corepack pnpm@12.18.0 test                                  # 44 tests (+1 Linux-only)
PROPERTY_RUNS=2000 corepack pnpm@12.18.0 exec vitest run test/redaction.test.ts
node bench/throughput.ts                                    # Q1 table (RUNS=3 SMALL=200000 MEDIUM=50000)
node bench/event-loop.ts                                    # Q2 table (RUNS=3 DURATION=5000 CONCURRENCY=64)
node bench/sqlite-index.ts                                  # Q9 table (LINES=200000)
```

**Pinned versions:**
- typescript 6.0.3
- vitest 5.1.0
- pino 10.4.0 (comparison only)
- sonic-boom 5.0.2 (comparison only)
- fast-check 4.10.2
- @types/node 24.19.2
