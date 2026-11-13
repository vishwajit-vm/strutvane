# RFC-0002: File storage and uploads

- **Status:** **Accepted** on 2026-11-14 by the project lead (standing approval).
- **Created:** 2026-11-13
- **Affects:** `@strutvane/contracts`, `@strutvane/framework` (new `/storage` and upload pipeline), new package `@strutvane/files`, `@strutvane/ui` (upload widgets)

## Summary

Handle files the Laravel way: storage disks and upload handling are built into the framework, and richer features come as an optional package. Files are split across three layers:

1. **Contracts:** `StorageDisk`, `StoredFile` and file error codes.
2. **Framework core:**
   - a disk manager with local and in-memory drivers
   - a streaming upload pipeline that enforces limits *while bytes arrive*
   - an `UploadedFile` class with Laravel-style helpers
3. **`@strutvane/files`:**
   - cloud drivers
   - `file` / `image` / `files` model fields with validation and UI widgets
   - attachments, direct-to-cloud uploads, image variants, virus scanning, signed URLs and per-tenant quotas

## Motivation

Almost every B2B app uploads files: invoices, avatars, contracts, imports. File handling is also one of the most common sources of security bugs and outages:

- huge uploads exhausting memory
- spoofed file types
- path traversal through file names
- SVG cross-site scripting
- orphaned files and storage costs

Getting it right once, in the framework, with every failure scenario named and tested, is exactly the kind of work Strutvane should take off developers' hands.

## Design

### 1. Developer experience (what a developer writes)

```ts
// app/models/invoice.model.ts: an invoice with one PDF and up to 5 attachments
export default defineModel('Invoice', {
  number: field.string().unique(),
  pdf: field.file().accept(['application/pdf']).maxSize('10MB').required(),
  attachments: field.files().accept(['image/*', 'application/pdf']).maxSize('20MB').maxCount(5),
  logo: field.image().maxSize('2MB').dimensions({ maxWidth: 4000, maxHeight: 4000 }).variants({ thumb: [200, 200] }),
})
// That's all. Upload endpoints, validation, storage, OpenAPI docs and UI dropzones come from it.
```

```ts
// Custom code: the Laravel-like API
const file = request.file('avatar')            // UploadedFile | undefined (already size-checked)
const files = request.files('documents')       // UploadedFile[]
file.size; file.clientName; file.detectedMime   // detectedMime comes from magic bytes, not the browser
await file.store('avatars', { disk: 'public' }) // → StoredFile { disk, key, size, mime, sha256, … }

await storage.disk('s3').put('reports/2026-11.pdf', stream, { contentType: 'application/pdf' })
const url = await storage.disk('s3').temporaryUrl('reports/2026-11.pdf', { expiresIn: '5m' })
```

### 2. Responsibilities by layer

| Concern | Contracts | Framework core | `@strutvane/files` |
|---|---|---|---|
| `StorageDisk` interface (put/get as streams, delete, exists, stat, list, url, temporaryUrl) | ✅ defines | implements `local` and `memory` (tests) | implements `s3` (also R2/MinIO), `azure-blob` (managed identity), `gcs` |
| `config/filesystems.ts` disks, default disk, tenant key prefixing | | ✅ | |
| Streaming multipart parser with limits enforced during streaming | | ✅ | |
| `UploadedFile` class (magic-byte MIME detection, hashing, `store()`/`storeAs()`) | | ✅ | |
| Validation rules (`maxSize`, `accept`, `maxCount`, `dimensions`, `minSize`) as Standard Schema validators | | basic rules | image rules, magic-byte allow-lists |
| `field.file()` / `field.image()` / `field.files()` (DB column, OpenAPI, manifest, UI widget) | `FieldType` | | ✅ |
| `files` table + attachments (polymorphic), pending → committed lifecycle, orphan cleanup job | | | ✅ |
| Direct-to-cloud (presigned) uploads with a confirm step; resumable uploads for very large files | | | ✅ |
| Image variants (resize/convert via `sharp`, on the queue), EXIF/GPS stripping | | | ✅ |
| Virus-scan hook (ClamAV adapter); quarantine status | | | ✅ |
| Signed download URLs with permission check + expiry; per-tenant quotas | | | ✅ |
| Dropzone, progress, preview, reorder, retry widgets | | | `@strutvane/ui` via manifest |

### 3. The upload pipeline (framework core)

```
request ─► Content-Type multipart? ─► streaming parser
            │  limits checked WHILE streaming: max file size, max files, max total bytes,
            │  allowed field names, max parts, header size, idle timeout
            ├─ over a limit → stop reading immediately → 413 FILE_TOO_LARGE / TOO_MANY_FILES
            ├─ write each file to a temp location (never fully buffered in memory)
            ├─ sniff magic bytes → detectedMime; hash (sha256) on the fly
            ▼
        UploadedFile[] → model validation (accept/maxSize/dimensions) → 422 with per-file issues
            ▼
        store on disk (key = tenant/<resource>/<uuidv7>, never the client file name)
            ▼
        DB transaction: create/update record + file rows (status: committed)
            ▼
        always: temp files deleted (also on error, abort or timeout)
```

### 4. Every failure scenario, named and handled

| Scenario | Handling | Error code / status |
|---|---|---|
| File larger than allowed | Stop reading at the limit (don't wait for the whole body) | `FILE_TOO_LARGE` 413 (request) / 422 (field) |
| Too many files / total too large | Stop reading | `TOO_MANY_FILES` 413 |
| Empty file | Reject unless `minSize(0)` | `FILE_EMPTY` 422 |
| Wrong type, or a renamed `.exe` posing as `.pdf` | Trust the magic bytes, not the extension or browser MIME. Mismatch → reject | `FILE_TYPE_NOT_ALLOWED` 422 |
| Corrupt or unreadable image | Decode check with a pixel limit (decompression-bomb guard) | `FILE_CORRUPT` 422 |
| Image too big in pixels | `dimensions()` rule plus a global pixel cap | `IMAGE_DIMENSIONS_INVALID` 422 |
| Malicious file name (`../../etc/passwd`, control characters, very long Unicode) | Never used as a storage key. Display name sanitized and NFC-normalized | — |
| SVG / HTML with scripts | Not allowed by default. If allowed: served with `Content-Disposition: attachment` and a sandbox CSP | — |
| Photo with GPS location in EXIF | Stripped by default (privacy) | — |
| Client disconnects mid-upload | Abort parsing, delete temp files, no DB writes | `UPLOAD_INCOMPLETE` (logged) |
| Slow-drip upload (slowloris) | Idle and total timeouts | 408 |
| Storage provider down or throttling | Retries with backoff and jitter, then fail cleanly. Temp files cleaned. No half-saved record | `STORAGE_UNAVAILABLE` 503 (with `Retry-After`) |
| File stored, but the DB transaction fails | The file is left `pending`. The cleanup job deletes pending files older than N hours | — |
| Record deleted while files remain | Files are soft-deleted with the record and purged after retention. Reference-counted when shared | — |
| Tenant A guesses tenant B's file URL | Keys prefixed by tenant + RLS on the `files` table. Private by default. Downloads go through a permission check or short-lived signed URLs | `NOT_FOUND` 404 (never 403, to avoid confirming existence) |
| Signed URL leaked | Short expiry (default 5 minutes), bound to the method | — |
| Quota exceeded | Checked before accepting | `QUOTA_EXCEEDED` 422 |
| Virus found | Quarantine. Never served. Audit event | `FILE_INFECTED` 422 |
| Virus scanner down | Configurable: fail closed (default) or accept as `pending-scan` and hide until scanned | `SCAN_UNAVAILABLE` 503 |
| Same file uploaded twice | Optional sha256 dedupe per tenant | — |
| Two users replace the same file at once | Optimistic locking on the record (`version`) | `CONFLICT` 409 |
| Windows paths, case-insensitive file systems (local disk) | Keys are lowercase UUIDs with `/` separators. Each driver normalizes them | — |

### 5. Configuration

```ts
// config/filesystems.ts (generated)
export default defineFilesystemsConfig({
  default: env.FILESYSTEM_DISK,             // 'local' in dev
  disks: {
    local:  { driver: 'local', root: 'storage/app', visibility: 'private' },
    public: { driver: 'local', root: 'storage/app/public', visibility: 'public', url: '/storage' },
    s3:     { driver: 's3', bucket: env.S3_BUCKET, region: env.S3_REGION },           // @strutvane/files
    azure:  { driver: 'azure-blob', account: env.AZURE_STORAGE_ACCOUNT, container: env.AZURE_STORAGE_CONTAINER, auth: 'managed-identity' },
  },
  uploads: { maxFileSize: '25MB', maxFiles: 10, maxTotalSize: '100MB', tempDir: 'storage/tmp' },
})
```

The installer adds `FILESYSTEM_DISK`, `S3_*` and `AZURE_STORAGE_*` to `.env` and `.env.example`.

## Contracts changes (to `@strutvane/contracts`, after acceptance)

- `StorageDisk`, `PutOptions`, `StoredFile`, `FileVisibility`
- File-related `ProblemCode`s from the table above

## Compatibility & migration

This is new functionality, so there are no breaking changes. The framework's core upload pipeline ships in Phase 1, together with the first forms. `@strutvane/files` ships in Phase 3, together with the UI widgets.

## Alternatives considered

- **Everything in a separate package:** rejected. Upload limits must be enforced inside the HTTP layer, and almost every app needs local storage.
- **Everything in the framework core:** rejected. Cloud SDKs and image processing are heavy and must stay optional.
- **Buffering uploads in memory:** rejected. A single large upload can exhaust memory.

## Open questions

1. Should resumable uploads use the tus protocol, or S3-native multipart only?
2. What should the default retention be for soft-deleted files? (Proposal: 30 days.)
3. Should image variants be generated eagerly (queue) or lazily on first request?
