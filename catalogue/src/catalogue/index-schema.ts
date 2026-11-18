/**
 * `catalogue.json`: the one index hub CI builds from every published manifest (blueprint §3.3
 * item 2), read by the installer, `node strut add`, the docs site and the agent tools.
 *
 * **A superset of spike 13's format.** Every field the installer reads today keeps its name and
 * meaning (`id`, `name`, `description`, `category`, `popular`, `published`, `frameworkRange`,
 * `package`, `followUps`; categories `id` and `name`). Version 2 adds fields; it renames none.
 * The only change an old reader notices is `version: 2`, which is exactly what tells it to switch
 * to this library.
 *
 * Readers treat the file as untrusted input (it is downloaded): {@link parseCatalogueIndex}
 * re-runs every manifest rule on every entry and skips, never offers, an entry that fails.
 *
 * @module
 */
import { z } from 'zod'
import { DESIGN_CATEGORY, idSchema, installsSchema, manifestSchema, questionSchema } from '../manifest/schema.ts'
import { LIMITS, MANIFEST_VERSION, VERSION, packageOrigin } from '../manifest/rules.ts'
import { displayTextProblem } from '../manifest/text.ts'
import { formatPath, friendlyMessage, originProblems } from '../manifest/validate.ts'

/** The index format this code reads and writes. */
export const CATALOGUE_VERSION = 2
/** The `generator` field: tells a reader which tool wrote the file. */
export const GENERATOR = 'strutvane build-catalogue'

const line = z.string().regex(/^(?:0|[1-9]\d{0,8})\.(?:0|[1-9]\d{0,8})$/, { error: 'must be a framework line like 0.2' })
const version = z.string().regex(VERSION, { error: 'must be a full version like 0.2.0' })
const shortText = (max: number) =>
  z
    .string()
    .max(max)
    .superRefine((value, ctx) => {
      const problem = displayTextProblem(value, max)
      if (problem !== undefined) ctx.addIssue({ code: 'custom', message: problem })
    })

/** A group in the picker, curated by the hub (`seed/hub.json`), in display order. */
export const categorySchema = z.strictObject({
  id: idSchema,
  name: shortText(LIMITS.displayName),
  pickable: z.boolean().describe('false for categories never offered in pickers (core packages, designs).'),
})

/**
 * Where a listed package stands (hub-curated, so it can change without a package release):
 * - `available`: released on npm (`latest`);
 * - `preview`: released on the `next` dist-tag only;
 * - `in-development`: being built for a named framework line (`since`);
 * - `planned`: on the roadmap (`phase`);
 * - `shelved`: designed, then put on hold.
 * Retired packages are not entries at all; they live in the index's `history`.
 */
export const STATUSES = ['available', 'preview', 'in-development', 'planned', 'shelved'] as const
export type PackageStatus = (typeof STATUSES)[number]

/** A framework release line such as `0.2`. */
export const lineSchema = line

/** What replaces a retired package. */
export const replacementSchema = z.strictObject({
  packages: z.array(z.string().max(60)).min(1).max(5).describe('npm names to use instead (each must be listed in the catalogue).'),
  import: z
    .string()
    .max(80)
    .regex(/^@strutvane\/[a-z0-9-]+(?:\/[a-z0-9<>-]+)*$/, { error: 'must be an import path like @strutvane/framework/<name>' })
    .optional()
    .describe('The new import path, e.g. @strutvane/framework/<name>.'),
  note: shortText(LIMITS.deprecationMessage),
})

/**
 * A package that is no longer (or not yet) listed: retired with a replacement, or a shelved idea
 * without a manifest. Kept in the index so the docs site can explain what happened to it.
 */
export const historySchema = z
  .strictObject({
    package: z.string().max(60),
    name: shortText(LIMITS.displayName),
    status: z.enum(['retired', 'shelved']),
    since: line.optional().describe('The framework line where this took effect.'),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('When it happened (YYYY-MM-DD).'),
    note: shortText(LIMITS.deprecationMessage),
    replacement: replacementSchema.optional(),
  })
  .superRefine((item, ctx) => {
    if (item.status === 'retired' && item.replacement === undefined) {
      ctx.addIssue({ code: 'custom', path: ['replacement'], message: 'is required for a retired package (say what to use instead)' })
    }
    if (packageOrigin(item.package) === undefined) ctx.addIssue({ code: 'custom', path: ['package'], message: 'is not a Strutvane package name' })
  })

export type HistoryItem = z.output<typeof historySchema>

/** One published (or, before the first release, planned) version and the framework range it declares. */
export const versionEntrySchema = z.strictObject({
  version,
  framework: z.string().max(100),
})

const entryShape = z.strictObject({
  // ── v1 fields: same names, same meaning as spike 13's index ──
  id: idSchema,
  name: shortText(LIMITS.displayName).describe('The manifest displayName.'),
  description: shortText(LIMITS.description),
  category: idSchema,
  popular: z.boolean(),
  published: z.boolean().describe('false until the package has a release on npm. Unpublished entries are never offered.'),
  frameworkRange: z.string().max(100).describe('The framework range of the latest version (the manifest "framework").'),
  package: z.string().max(60).describe('The npm package name.'),
  followUps: z.array(questionSchema).max(LIMITS.questions).describe('The manifest "questions", in order.'),
  // ── v2 additions ──
  kind: z.enum(['package', 'design']),
  origin: z.enum(['first-party', 'community']),
  tags: z.array(z.string().max(LIMITS.tag)).max(LIMITS.tags),
  docs: z.string().max(LIMITS.url),
  version: version.describe('The latest version (published, or the planned one when unpublished).'),
  verified: z.boolean().describe('true only when the conformance results for this version say every kit passed.'),
  versions: z.array(versionEntrySchema).max(50).describe('Newest first. The resolver picks the newest one whose range fits the framework.'),
  compatibility: z.record(line, version).describe('Framework line → newest compatible package version (for the docs site).'),
  requires: z.array(idSchema).max(LIMITS.relations),
  conflicts: z.array(idSchema).max(LIMITS.relations),
  installs: installsSchema,
  deprecated: z
    .strictObject({ message: z.string().max(LIMITS.deprecationMessage), replacedBy: idSchema.optional(), since: version.optional() })
    .optional(),
  // ── lifecycle (hub-curated, for the docs site's packages page) ──
  status: z.enum(STATUSES),
  phase: z.int().min(1).max(20).optional().describe('Roadmap phase (docs/14-roadmap.md).'),
  since: line.optional().describe('The framework line the package first ships with.'),
  // ── hub additions (catalogue tool, 2026-11-18); optional, so format 2 readers are unaffected ──
  repo: z
    .string()
    .max(LIMITS.url)
    .regex(/^https:\/\/github\.com\/[A-Za-z0-9-]+\/[a-z0-9][a-z0-9.-]*$/, { error: 'must be a GitHub repository URL' })
    .optional()
    .describe('The repository URL, from the hub source.'),
})

/** One package in the index. */
export type CatalogueEntry = z.output<typeof entryShape>
/** One category. */
export type CatalogueCategory = z.output<typeof categorySchema>

/**
 * The manifest an entry was built from, so the entry can be checked by exactly the same rules.
 */
export function entryToManifestInput(entry: CatalogueEntry): z.input<typeof manifestSchema> {
  return {
    manifestVersion: MANIFEST_VERSION,
    id: entry.id,
    displayName: entry.name,
    description: entry.description,
    category: entry.category,
    tags: entry.tags,
    kind: entry.kind,
    popular: entry.popular,
    docs: entry.docs,
    framework: entry.frameworkRange,
    installs: entry.installs,
    questions: entry.followUps,
    requires: entry.requires,
    conflicts: entry.conflicts,
    ...(entry.deprecated === undefined ? {} : { deprecated: entry.deprecated }),
  }
}

/** Manifest field names → index field names, for error paths. */
const RENAMED: Readonly<Record<string, string>> = { displayName: 'name', framework: 'frameworkRange', questions: 'followUps' }

/** An entry: its own structure, then every manifest rule on what it says. */
export const entrySchema = entryShape.superRefine((entry, ctx) => {
  const manifest = manifestSchema.safeParse(entryToManifestInput(entry))
  if (!manifest.success) {
    for (const issue of manifest.error.issues) {
      const [head, ...rest] = issue.path
      const path = [typeof head === 'string' ? (RENAMED[head] ?? head) : head, ...rest].filter((part) => part !== undefined)
      ctx.addIssue({ code: 'custom', path: path as PropertyKey[] as (string | number)[], message: friendlyMessage(issue) })
    }
    return
  }
  const origin = packageOrigin(entry.package)
  if (origin === undefined) {
    ctx.addIssue({ code: 'custom', path: ['package'], message: 'is not a Strutvane package name (@strutvane/<name> or strutvane-<name>)' })
    return
  }
  if (origin !== entry.origin) ctx.addIssue({ code: 'custom', path: ['origin'], message: `must be "${origin}" for ${entry.package}` })
  for (const problem of originProblems(entry.package, origin, manifest.data)) {
    ctx.addIssue({ code: 'custom', path: [RENAMED[problem.path] ?? problem.path], message: problem.message })
  }
  if (entry.versions.length === 0) ctx.addIssue({ code: 'custom', path: ['versions'], message: 'is empty' })
  if (entry.versions[0]?.version !== entry.version) ctx.addIssue({ code: 'custom', path: ['versions'], message: 'must start with the latest version' })
  const problem = statusProblem(entry.status, entry.published)
  if (problem !== undefined) ctx.addIssue({ code: 'custom', path: ['status'], message: problem })
})

/**
 * Status and release state must agree: "available" without a release would send people to an
 * npm page that does not exist; "planned" with a release hides a real package.
 */
export function statusProblem(status: PackageStatus, published: boolean): string | undefined {
  if ((status === 'available' || status === 'preview') && !published) return `is "${status}" but the package has no release on npm`
  if (status !== 'available' && status !== 'preview' && published) return `is "${status}" but the package is released on npm (use "available" or "preview")`
  return undefined
}

/** The whole file. Entries are checked one by one (see {@link parseCatalogueIndex}). */
export const catalogueIndexSchema = z.strictObject({
  version: z.literal(CATALOGUE_VERSION),
  generator: z.literal(GENERATOR),
  manifestVersion: z.literal(MANIFEST_VERSION),
  frameworkLines: z
    .array(z.strictObject({ line, latest: version }))
    .max(100)
    .describe('Known framework release lines, oldest first, each with its newest version.'),
  categories: z.array(categorySchema).min(1).max(50),
  entries: z.array(entrySchema).max(2_000),
  history: z.array(historySchema).max(500).describe('Retired and shelved packages, sorted by package name.'),
})

/** A whole, valid index. */
export type CatalogueIndex = z.output<typeof catalogueIndexSchema>

/** The index file as a whole is unusable. */
export class CatalogueIndexError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CatalogueIndexError'
  }
}

/** The parsed index plus the entries that were skipped and why. */
export interface ParsedIndex {
  readonly index: CatalogueIndex
  readonly skipped: readonly string[]
}

/** Largest index accepted (bytes of JSON). 2,000 entries at ~4 KiB each, with room to spare. */
export const MAX_INDEX_BYTES = 16 * 1024 * 1024

/**
 * Read a downloaded `catalogue.json`. Throws {@link CatalogueIndexError} when the file as a whole
 * is unusable (wrong version, wrong shape, too big). A single bad entry is skipped, with its
 * reason in `skipped`: one broken package must not take the whole picker down.
 *
 * @example
 * const { index, skipped } = parseCatalogueIndex(await (await fetch(url)).text())
 */
export function parseCatalogueIndex(input: string | unknown): ParsedIndex {
  let raw: unknown = input
  if (typeof input === 'string') {
    if (Buffer.byteLength(input, 'utf8') > MAX_INDEX_BYTES) throw new CatalogueIndexError('The catalogue index is too large.')
    try {
      raw = JSON.parse(input)
    } catch {
      throw new CatalogueIndexError('The catalogue index is not valid JSON.')
    }
  }
  const head = catalogueIndexSchema.extend({ entries: z.array(z.unknown()).max(2_000) }).safeParse(raw)
  if (!head.success) {
    const version = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>)['version'] : undefined
    if (version !== CATALOGUE_VERSION) {
      throw new CatalogueIndexError(`The catalogue index has format version ${JSON.stringify(version)}; this reader understands ${CATALOGUE_VERSION}.`)
    }
    const first = head.error.issues[0]
    throw new CatalogueIndexError(`The catalogue index is malformed: ${first === undefined ? 'unknown problem' : `${formatPath(first.path, raw) || '(file)'} ${friendlyMessage(first)}`}.`)
  }
  const categories = new Set(head.data.categories.map((category) => category.id))
  if (categories.size !== head.data.categories.length) throw new CatalogueIndexError('The catalogue index lists a category twice.')
  const entries: CatalogueEntry[] = []
  const skipped: string[] = []
  const seen = new Set<string>()
  head.data.entries.forEach((rawEntry, position) => {
    const parsed = entrySchema.safeParse(rawEntry)
    const label = typeof rawEntry === 'object' && rawEntry !== null && typeof (rawEntry as Record<string, unknown>)['id'] === 'string'
      ? String((rawEntry as Record<string, unknown>)['id']).slice(0, 40)
      : `entry ${position}`
    if (!parsed.success) {
      const first = parsed.error.issues[0]
      skipped.push(`${label}: ${first === undefined ? 'invalid' : `${formatPath(first.path, rawEntry)} ${friendlyMessage(first)}`}`)
    } else if (!categories.has(parsed.data.category)) {
      skipped.push(`${label}: unknown category "${parsed.data.category}"`)
    } else if (parsed.data.kind === 'design' && parsed.data.category !== DESIGN_CATEGORY) {
      skipped.push(`${label}: designs must be in the "${DESIGN_CATEGORY}" category`)
    } else if (seen.has(parsed.data.id)) {
      skipped.push(`${label}: duplicate id`)
    } else {
      seen.add(parsed.data.id)
      entries.push(parsed.data)
    }
  })
  return { index: { ...head.data, entries }, skipped }
}
