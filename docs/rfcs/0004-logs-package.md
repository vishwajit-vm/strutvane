# RFC-0004: `@strutvane/logs`: zero-config logging with a built-in viewer

- **Status:** Draft
- **Created:** 2026-11-13
- **Affects:** `@strutvane/contracts` (`Logger`, `LogRecord`), `@strutvane/core` (default logger), `@strutvane/framework` (automatic request logging), new package **`@strutvane/logs`**, `@strutvane/auth` (viewer permissions), `@strutvane/ui` (menu link), `create-strutvane` (installed by default)
- **Inspiration:** [TraceNest](https://pypi.org/project/tracenest/) (by this project's maintainer, for Python/FastAPI). This RFC brings its developer experience to Node/TypeScript and extends it to multi-instance, multi-tenant production use.

## Summary

Install it and logging just works, with no configuration:

- Structured logs, written without blocking.
- Daily files, with size and retention limits enforced automatically.
- Secrets redacted before anything is stored.
- Every API request logged automatically.
- A built-in **log viewer** at `/_strutvane/logs` with live tail, search, filters, download and themes. The route is registered automatically, and access is safe by default.

`create-strutvane` installs it **by default** in every new app. Developers can switch it off (`sv remove logs`, or `LOGS_ENABLED=false`), and every setting can be overridden.

## Motivation

- **Without it, every team re-invents logging.** Each one picks a logger, configures transports, writes rotation and retention, redacts secrets by hand (and forgets some), and builds or buys a viewer.
- **Logging is also a common source of incidents:** leaked tokens in logs, disks filling up, blocked event loops, and log viewers left open to the internet.
- **Strutvane should handle all of that by default.** TraceNest proved the "zero friction" model for Python; this RFC applies the same approach.

## Design

### 1. Developer experience

```ts
// Anywhere in a Strutvane app (or any Node app): no setup needed.
import { log } from '@strutvane/logs'

log.info('Invoice sent', { invoiceId: inv.id, amount: inv.amount })
log.error('Payment failed', { orderId: 123, error })   // errors are serialised safely (stack, cause chain)

const billing = log.child({ module: 'billing' })       // contextual child loggers
billing.warn('Retrying charge', { attempt: 2 })
```

Every record automatically carries:
- `timestamp`, `level`, `message`
- `requestId` and `traceId` (OpenTelemetry), via the core request context
- `tenantId` and `actorId` (when auth is installed)
- `route` and `env`

In a Strutvane app, **every HTTP request is logged without any code**: method, route, status, duration, size, actor and tenant. Unhandled exceptions are logged with their stack.

**Standalone, in any Node app:**

```ts
import express from 'express'
import { logs } from '@strutvane/logs/express'   // also: /hono, /fastify, /nest
app.use(logs())   // request logging + viewer at /_strutvane/logs (local only unless configured)
```

### 2. Layers: same pattern as files ([RFC-0002](0002-file-storage-and-uploads.md))

| Layer | Provides |
|---|---|
| **contracts** | `LogLevel`, `LogRecord`, the `Logger` interface (`trace/debug/info/warn/error/fatal`, `child`, `flush`) |
| **core** | A minimal default `Logger`: structured, context-enriched, redacting, written to stdout. **Every package can always log, even without `@strutvane/logs`.** |
| **framework** | Automatic request and exception logging through the `Logger` token. It works with either the core logger or the logs package. |
| **`@strutvane/logs`** | The full logging infrastructure: high-throughput non-blocking writer, file store with rotation and retention, optional database store, OTel export, viewer UI and API, CLI commands, adapters for Express/Fastify/Hono/Nest |

### 3. Build vs. adopt

- **We own:**
  - the API
  - the pipeline: record → enrich → redact → sample → queue → transports
  - retention, the viewer, and all integrations
- **We reuse proven low-level pieces where they are the safe choice:**
  - `sonic-boom`, pino's MIT fast file writer, for append-only writes (to be confirmed by spike 09)
  - Node's built-in `node:sqlite` for the optional search index
- **Performance target, measured in spike 09 before 1.0:** within 2× of pino for JSON-to-file throughput, and zero event-loop blocking at the 99th percentile.

### 4. Storage

| Driver | When | Notes |
|---|---|---|
| `file` (default) | Single instance, development, small production | `storage/logs/YYYY-MM-DD.ndjson` (git-ignored). Size cap per day (default 30 MB, then `-1`, `-2` parts). Retention default 60 days. Optional gzip of old days. |
| `database` | **Multiple instances** (containers, autoscaling), where files are per-container and can't be viewed centrally | Uses the app's database, in a partitioned `log_records` table with retention by partition drop. The viewer reads from here. |
| `stdout` | Platforms that collect stdout (Kubernetes, Azure Container Apps, Fly) | JSON lines. The viewer is disabled, or reads from a configured store. |
| `otel` (add-on) | Existing observability stack (Grafana Loki, Datadog, Azure Monitor, …) | OTel logs export, which can run alongside any other driver |

`sv doctor` warns when the `file` driver runs with more than one instance: "logs are split across containers, so the viewer only shows this instance; use `database`".

### 5. The viewer (`/_strutvane/logs`)

- **Features:** live tail via Server-Sent Events, with auto-pause on scroll.
- **Search and filters:** level, time range, text, route, HTTP status, `traceId` (click to see the whole request), tenant, actor and module.
- **Navigation and actions:** date-based navigation, download (NDJSON/CSV, redacted) and **clear** (with confirmation, audited).
- **Display:** light, dark and high-contrast themes. Reverse-chronological order, relative times with the exact time on hover, and level badges.
- **Implementation:** a small self-contained UI (no React required) served by the package and fully accessible. A Strutvane app with `@strutvane/ui` gets a "Logs" menu entry.
- **Path** is configurable (`LOGS_VIEWER_PATH`). The default namespace `/_strutvane/` avoids clashing with app routes.

### 6. Security: the viewer is a high-value target, so it is locked down by default

| Threat | Default protection |
|---|---|
| Viewer reachable on the internet | **Off in production unless access is configured.** With `@strutvane/auth`, it requires the permissions `logs.view`, `logs.export` and `logs.clear`. Without auth, it is allowed only when `APP_ENV=local`, or with `LOGS_VIEWER_TOKEN` (random, compared in constant time) plus an optional IP allow-list. It never falls back to public access. |
| One tenant reading another's logs | Tenant admins only see records with their `tenantId`. Only platform operators (`actor.type === 'system'` or explicit permission) see everything. |
| Secrets in logs | **Redaction before storage**, so it applies to the viewer, downloads and transports alike: <br>• Keys: `authorization`, `cookie`, `set-cookie`, `password`, `token`, `secret`, `apiKey`, … <br>• Patterns: JWTs, bearer tokens, DB/Redis URLs with credentials, private keys, card numbers (Luhn) <br>• Model fields marked `sensitive()` <br>• Custom rules |
| Request/response bodies leaking PII | **Bodies are not logged by default.** It is opt-in per route, with a size cap and redaction applied. |
| Log injection (forged lines, terminal escape codes) | CR/LF, ANSI and control characters are escaped in messages, and every record is stored as structured JSON. |
| Stored XSS through log content | The viewer renders log content as text only (never HTML), behind a strict Content-Security-Policy. |
| CSRF on "clear logs" | Same-site cookies plus a CSRF token on state-changing viewer actions. The `logs.cleared` audit event records who cleared what. |
| Log flooding / disk exhaustion (DoS) | Bounded in-memory queue, max record size (default 32 KB, truncated with a marker), per-message rate limiting and sampling for `debug`. Disk quota and retention are enforced continuously. |
| Logging itself crashing the app | **Logging never throws into application code.** On disk full, permission errors or a broken transport, it falls back to stderr, emits one warning and keeps a counter of dropped records. The app keeps running. |
| Lost logs on shutdown | Flushes on `SIGTERM`/`beforeExit`, with a timeout so shutdown is never blocked forever. |

> **Logs are not the audit trail.** Audit events ([RFC-0001](0001-contracts-v0.md), auth package) are permanent business records written in the same DB transaction. Logs are operational diagnostics with limited retention. Both exist, for different purposes.

### 7. Configuration (all optional): `.env` / `.env.example`

```dotenv
LOGS_ENABLED=true
LOG_LEVEL=info                 # trace | debug | info | warn | error | fatal
LOG_FORMAT=pretty              # pretty (dev) | json (prod)
LOGS_DRIVER=file               # file | database | stdout
LOGS_PATH=storage/logs
LOGS_RETENTION_DAYS=60
LOGS_MAX_DAILY_SIZE=30MB
LOGS_REQUEST_BODIES=false
LOGS_VIEWER=true
LOGS_VIEWER_PATH=/_strutvane/logs
LOGS_VIEWER_TOKEN=             # only needed in production when @strutvane/auth is not installed
```

```ts
// config/logs.ts (generated; every option documented)
export default defineLogsConfig({
  level: env.LOG_LEVEL,
  driver: env.LOGS_DRIVER,
  redact: { keys: ['iban'], patterns: [/ACME-[0-9]{8}/g] },   // added to the built-in rules
  requests: { ignore: ['/health', '/ready'], slowThresholdMs: 1000 },
})
```

### 8. CLI

```bash
pnpm sv logs:tail [--level warn] [--route /api/v1/invoices]
pnpm sv logs:search "payment failed" --since 2h
pnpm sv logs:export --date 2026-11-13 --format csv
pnpm sv logs:clear --before 30d          # asks for confirmation; audited
pnpm sv logs:doctor                      # driver vs instance count, disk usage, retention, viewer exposure
```

### 9. Integration ([integration map](../17-integration-map.md))

| Mechanism | Connection |
|---|---|
| Container token | `Logger`. Core provides the default; `@strutvane/logs` replaces it with the full implementation. |
| Hooks | `http.onRequest` / `http.onResponse` / `errors.unhandled` (framework). The viewer route is registered through the framework router. |
| Installer `enhances` | **logs + framework:** request logging, the viewer route and `config/logs.ts`. **logs + auth:** `logs.*` permissions and tenant scoping in the viewer. **logs + ui:** "Logs" menu entry. |
| Events | `logs.cleared`, `logs.exported` (audited) |
| Default install | `create-strutvane` presets `full` and `api` include it, and it can be deselected in the prompt |

## Compatibility & migration

This is new functionality. The core default logger ships in Phase 1, so every package can log from day one. `@strutvane/logs` also ships in Phase 1 (file driver, request logging, viewer), so new apps get it by default. The database driver and OTel export come in Phase 4.

## Alternatives considered

- **Just use pino or winston:** rejected as the full answer. Neither gives a viewer, retention, request logging, tenant-aware access or default redaction. We do reuse pino's file writer where it is the safe choice.
- **Viewer always on:** rejected. It is a data-exposure risk, so it is off in production unless access is configured.
- **Name `tracenest`:** not available on npm (owned by another publisher). It also wouldn't fit the ecosystem naming rule (ADR-0001).

## Open questions

1. Should the viewer also show audit events (read-only, permission-gated) for one combined timeline?
2. Should the default retention in production be 60 days (TraceNest's default) or 30?
3. Should the `node:sqlite` search index be on by default for the `file` driver? It is faster to search, but uses more disk.
