# RFC-0003: Errors, validation messages and form error handling

- **Status:** **Accepted** on 2026-11-14 by the project lead (standing approval).
- **Created:** 2026-11-13
- **Amended:** 2026-11-18: every code is lowercase `snake_case`, and every issue carries a required `field` member (framework 0.2; see the [changelog](#changelog))
- **Affects:** `@strutvane/contracts` (`Problem` gains structured `issues`), `@strutvane/core` (error classes and message catalog), `@strutvane/framework` (error handler, validation), `@strutvane/ui` (form error handling), every future package (registers its error codes and messages)

## Summary

Strutvane uses **one error model from the database to the form field**:

- Every failure becomes an RFC 9457 `Problem` with a stable `code` in lowercase `snake_case` (`not_found`, `validation_failed`).
- Validation failures carry structured `issues` (path, field, code, params, message).
- Messages come from **catalogs**, like Laravel's `lang/en/validation.php`. They can be overridden per field, per resource and per app, and translated per locale.
- The UI reads the same codes and catalogs, so a message reads the same whether it came from the server or from client-side pre-validation.
- Every failure category a form can hit is named, with defined behaviour.

## Motivation

Forms are where users meet errors. Inconsistent errors produce support tickets and lost data:

- different wording on client and server
- a raw `500` with no explanation
- a validation message stuck at the top instead of under the field
- the user's typing lost after a session expires

We want error handling to be **organised, reusable and complete by default**, so app developers rarely write error code at all.

## Design

### 1. The error model (contracts)

```ts
interface ValidationIssue {
  readonly path: readonly (string | number)[]   // ['lines', 2, 'amount']; [] = whole form
  readonly field: string                         // the same location, dotted: 'lines.2.amount'; '' = whole form
  readonly code: string                          // stable: 'too_small', 'required', 'unique', 'file_too_large'
  readonly params?: Readonly<Record<string, string | number | boolean>>  // { min: 0 }
  readonly message: string                       // already rendered in the request locale
}

interface Problem {            // existing (RFC-0001), plus:
  readonly code: string                          // lowercase snake_case: 'validation_failed'
  readonly issues?: readonly ValidationIssue[]   // structured, machine-readable
  readonly fieldErrors?: …                        // kept: convenience map derived from issues
}
```

**Codes are lowercase `snake_case`** everywhere: problem codes, issue codes, and the codes packages and apps register ([decision #68, #123](../../spikes/CONSISTENCY-2026-11-15.md)). Framework 0.1 used `SCREAMING_SNAKE_CASE` problem codes (`NOT_FOUND`); framework 0.2 renamed every one of them. For the whole 0.2 line the framework still accepts an old name wherever code passes one in (`new StrutvaneError('NOT_FOUND')`, the error registry), maps it to the new one and prints one deprecation warning per name; an app's own uppercase code is accepted with a warning too. The window closes in 0.3. The rename table is `LEGACY_ERROR_CODES` in `@strutvane/framework/core`, and the upgrade guide lists it. On the wire a 0.2 server always sends the lowercase names of well-known codes. Clients compare well-known codes exactly and key catalogues by the lowercase code (`ui.problem.code.not_found`).

**Every issue carries both `path` and `field`** ([decision #69](../../spikes/CONSISTENCY-2026-11-15.md)). `field` is `path` joined with dots, the key of `fieldErrors` and of most form libraries, so a simple client can place a message without joining the path itself. The server always derives it from `path`; callers never pass it (`new ValidationError([{ path: ['email'], code: 'unique' }])`). `path` stays the source of truth, because `field` is ambiguous for a key that contains a dot or looks like an index (`{ "a.b": … }`). A client reads `path` first and falls back to `field` when `path` is missing or malformed ([decision #118](../../spikes/CONSISTENCY-2026-11-15.md)); `@strutvane/ui` does exactly that, and rebuilds `field` from the winning `path` so the two never disagree.

**Example response** (`422`, `Accept-Language: en`):

```json
{
  "type": "https://strutvane.dev/errors/validation",
  "title": "Validation failed",
  "status": 422,
  "code": "validation_failed",
  "traceId": "4bf92f35…",
  "issues": [
    { "path": ["amount"], "field": "amount", "code": "too_small", "params": { "min": 0 }, "message": "Amount must be at least 0." },
    { "path": ["dueDate"], "field": "dueDate", "code": "date_before_field", "params": { "other": "Issue date" }, "message": "Due date must be after Issue date." },
    { "path": ["attachments", 1], "field": "attachments.1", "code": "file_too_large", "params": { "max": "20 MB" }, "message": "File 2 is larger than 20 MB." }
  ],
  "fieldErrors": { "amount": ["Amount must be at least 0."], "dueDate": ["Due date must be after Issue date."], "attachments.1": ["File 2 is larger than 20 MB."] }
}
```

### 2. Message catalogs (core)

```ts
// lang/en/validation.ts (generated in the app; package defaults ship inside each package)
export default defineMessages('en', {
  required: '{attribute} is required.',
  too_small: '{attribute} must be at least {min}.',
  unique: 'This {attribute} is already taken.',
  file_too_large: '{attribute} is larger than {max}.',
})
```

| Feature | How |
|---|---|
| Placeholders | ICU MessageFormat (`{min}`, plurals, number/date formatting per locale) |
| `{attribute}` | The field's `label` from the model, e.g. "Due date", never the raw key `dueDate` |
| Override order (first match wins) | 1. field-level `field.decimal().messages({ too_small: '…' })` → 2. resource-level → 3. app `lang/<locale>/*.ts` → 4. package defaults → 5. built-in English |
| Locale | User preference, then `Accept-Language`, then app default. Missing translations fall back to English and are logged in development. |
| Completeness | `sv lang:check` lists missing or unused keys per locale. CI can fail on missing keys. |
| Client side | The UI ships the same catalogs and renders `code + params` locally, so client pre-checks and server errors read identically. |

### 3. Throwing errors (core): a few reusable classes

```ts
throw new ValidationError([{ path: ['email'], code: 'unique' }])        // → 422
throw new DomainError('invoice_already_paid', { number: invoice.number }) // → 409/422, business rule
throw new NotFoundError('invoice')                                        // → 404
throw new ForbiddenError()                                                 // → 403 (or 404 to hide existence)
throw new ConflictError('stale_record', { currentVersion })               // → 409, optimistic locking
// Anything else (bugs, driver errors) → 500 internal_error, with details logged and never sent.
```

- **One error handler** in the framework maps every error to a `Problem`, renders messages and attaches `traceId`. It also logs with context: tenant, actor and route, with secrets redacted.
- **Each package registers its error codes and default messages** in a central registry. The docs site generates the error reference from it, so every code is documented.

### 4. Every failure a form can hit, and what happens

| # | Category | Status / code | Server behaviour | UI behaviour |
|---|---|---|---|---|
| 1 | Field validation | 422 `validation_failed` | All issues returned at once, not just the first | Message under each field, the first invalid field focused, `aria-describedby` for screen readers, a summary at the top for long forms |
| 2 | Cross-field rule (end after start) | 422 | Issue on the most relevant field. `path: []` means form-level | Shown on that field, or in the form banner |
| 3 | Business rule ("invoice already paid") | 409/422 domain code | Rendered from the catalog | Banner with the message. The form stays editable. |
| 4 | Duplicate (unique) | 422 `unique` | DB unique violations are caught and translated, never leaked as SQL errors | Under the field |
| 5 | File problems | 413/422 file codes ([RFC-0002](0002-file-storage-and-uploads.md)) | Per-file issues (`path: ['attachments', 1]`) | On the specific file in the dropzone, with retry/remove |
| 6 | Not signed in / session expired | 401 `unauthenticated` | — | **The draft is kept**: re-login in a modal, then resubmit. The user loses nothing. |
| 7 | Not allowed | 403 `forbidden` | Reason logged, not exposed | Message, no retry button. Fields the user can't edit are already hidden or read-only via the manifest. |
| 8 | Record deleted meanwhile | 404 `not_found` | — | "This record no longer exists", with a link back to the list |
| 9 | Edited by someone else | 409 `stale_record` | Optimistic locking via `version` | Show what changed. Options: reload, or overwrite (if permitted) |
| 10 | Too many requests | 429 `rate_limited` + `Retry-After` | — | Automatic retry after the wait, with a countdown |
| 11 | Payload too large | 413 `payload_too_large` | Rejected before parsing | Clear message with the limit |
| 12 | Network down / timeout | — | Mutations carry an **idempotency key**, so a retry never creates duplicates | Draft autosaved locally. "You're offline", then retry when back. |
| 13 | Server bug | 500 `internal_error` | Full details in logs only | Friendly message and a **reference code (traceId)** to give support. The form keeps its values. |
| 14 | Dependency down (DB, storage, email) | 503 `service_unavailable` + `Retry-After` | Circuit breaker, no half-saved data | "Temporarily unavailable, your changes are kept", then retry |
| 15 | Bulk action partly fails | 207-style result | Per-item `{ id, ok, problem? }` | Summary: "18 updated, 2 failed", with details per row |
| 16 | Unexpected response shape | — | — | Treated as #13. Never crashes the page. |

### 5. Success and info messages

Successes use the same catalog mechanism (`lang/en/messages.ts`): "Invoice created.", "3 invoices deleted, Undo". The UI shows them as accessible toasts.

### 6. Reusability: where each piece lives

| Piece | Package |
|---|---|
| `ValidationIssue`, `Problem`, `ProblemCode` | contracts |
| Error classes, message catalog, ICU formatting, locale negotiation, error-code registry | core |
| Error handler, validation (Zod issues → `ValidationIssue`), DB error translation (unique, FK, not-null) | framework |
| Form error mapping, focus management, draft autosave, retry/backoff, offline handling, toasts | ui |
| Package-specific codes and default messages (files, auth, …) | each package, registered at boot |

## Contracts changes (after acceptance)

- Add `ValidationIssue`.
- Add `issues` to `Problem`.
- Extend `ProblemCode` with `unauthenticated`, `forbidden`, `not_found`, `stale_record`, `service_unavailable`, and the file codes from RFC-0002 (uppercase in 0.1, renamed in 0.2).
- Non-breaking: `fieldErrors` stays as a derived convenience map.
- Framework 0.2 (breaking, pre-1.0 minor): every `ProblemCode` and every other framework code is lowercase `snake_case`, and `ValidationIssue.field` is required.

## Alternatives considered

- **Plain strings only (`fieldErrors: string[]`):** rejected. Clients can't re-render messages per locale, highlight array items or react to specific codes.
- **Error messages hard-coded in validators:** rejected. They can't be translated or overridden, and client and server would drift apart.
- **Exposing exception messages to clients:** rejected. They leak internals and are a security risk.

## Open questions

1. Should 409 or 422 be the default for domain-rule violations? (Proposal: 409 for state conflicts, 422 for "valid input but not allowed by a rule".)
2. Should the default locale list for generated apps be `en` only, or also `hi`?
3. Should the draft autosave live in `localStorage` (simple) or IndexedDB (large forms, files)?

## Changelog

- 2026-11-13: created.
- 2026-11-14: accepted.
- 2026-11-18: amended for framework 0.2. Every code is lowercase `snake_case`, with the old uppercase names accepted with a deprecation warning until 0.3 ([decision #123](../../spikes/CONSISTENCY-2026-11-15.md), after #68). `ValidationIssue` gains a required `field` member, the dotted form of `path` ([decision #69](../../spikes/CONSISTENCY-2026-11-15.md)); clients read `path` first (#118). Examples, the failure table and the contracts list now use the lowercase codes.
