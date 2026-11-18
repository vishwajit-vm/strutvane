/**
 * `source.json`: the hub-curated list of **every** Strutvane package and repository (blueprint
 * §3.3). It is the half of the catalogue that people edit; the other half (versions, peer ranges,
 * the `strutvane` manifest block) comes from npm and is never typed by hand.
 *
 * Why a curated source at all, when blueprint §3.3 says the index is built "from the published
 * manifests": most packages are not published yet (they are planned), status changes without a
 * release ("planned" → "in development"), and the hub must decide which names are listed so a
 * squatter on npm can never appear in the installer. So the hub owns *which* packages exist and
 * *where they stand*; each package owns *what it installs* through its published manifest.
 *
 * Every entry has a `kind`:
 * - `package` / `design`: an npm package. Listed in `catalogue.json` while it is planned, in
 *   development or released; kept in the index's `history` once shelved or retired.
 * - `feature`: a retired or shelved part of the framework that never had its own npm name (the
 *   docs site's packages page explains what happened to it). Never in the installer.
 * - `repo`: a repository that is not a package (the docs site, tooling, the app skeleton). Listed
 *   only so the "every repo is in the source" drift check knows about it.
 *
 * @module
 */
import { z } from 'zod'
import { LIMITS, packageOrigin } from '../manifest/rules.ts'
import { displayText, frameworkRange, httpsUrl, idSchema } from '../manifest/schema.ts'
import { categorySchema, lineSchema, replacementSchema } from '../catalogue/index-schema.ts'

/** The source format this code reads. */
export const SOURCE_VERSION = 1

/**
 * Where a package stands, in the words the project lead uses:
 * - `planned`: on the roadmap (`phase` says when);
 * - `in-development`: being built (`since` names the framework line it targets);
 * - `released`: on npm under `latest` with a real release;
 * - `shelved`: designed, then put on hold;
 * - `retired`: replaced (`replacement` says by what).
 */
export const SOURCE_STATUSES = ['planned', 'in-development', 'released', 'shelved', 'retired'] as const
export type SourceStatus = (typeof SOURCE_STATUSES)[number]

/** Statuses whose packages are entries in `catalogue.json` (the rest go to its `history`). */
export const LISTED_STATUSES: ReadonlySet<SourceStatus> = new Set(['planned', 'in-development', 'released'])

export const SOURCE_KINDS = ['package', 'design', 'feature', 'repo'] as const
export type SourceKind = (typeof SOURCE_KINDS)[number]

/** A repository name inside the org (`strutvane-billing`), not a URL: the org is set once. */
const repoName = z
  .string()
  .max(100)
  .regex(/^[a-z0-9][a-z0-9.-]*$/, { error: 'must be a repository name inside the org, like "strutvane-billing"' })

const npmName = z
  .string()
  .max(LIMITS.displayName * 2)
  .refine((name) => packageOrigin(name) !== undefined, {
    error: 'is not a Strutvane package name (@strutvane/<name>, strutvane-<name>, strutvane or create-strutvane)',
  })

/** One package, feature or repository. */
export const sourceEntrySchema = z
  .strictObject({
    id: idSchema.describe('The catalogue id: node strut install:<id>. Designs use the short name ("crisp").'),
    name: displayText(LIMITS.displayName).describe('Display name, at most 30 characters.'),
    description: displayText(LIMITS.description).describe('One line, at most 60 characters.'),
    kind: z.enum(SOURCE_KINDS),
    npm: npmName.nullable().describe('The npm package name, or null for features and non-package repos.'),
    repo: repoName.nullable().describe('The repository in the org, or null when there is none.'),
    status: z.enum(SOURCE_STATUSES),
    phase: z.int().min(1).max(20).optional().describe('Roadmap phase (docs/14-roadmap.md, blueprint 18 §10).'),
    since: lineSchema.optional().describe('The framework line the current status started with, like 0.2.'),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe('When a retirement or shelving happened (YYYY-MM-DD).'),
    category: idSchema.optional().describe('A category id from `categories`; required while listed.'),
    tags: z.array(z.string().max(LIMITS.tag).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)).max(LIMITS.tags).default([]),
    popular: z.boolean().default(false).describe('Shown in the installer\'s short popular list.'),
    docs: httpsUrl.optional().describe('Documentation URL (https); required while listed.'),
    framework: frameworkRange.optional().describe('The framework range the package targets until it publishes its own; required while listed.'),
    note: displayText(LIMITS.deprecationMessage).optional().describe('Why it was shelved or retired; required for those.'),
    replacement: replacementSchema.optional().describe('What to use instead; required when retired.'),
  })
  .superRefine((entry, ctx) => {
    const issue = (path: string, message: string): void => {
      ctx.addIssue({ code: 'custom', path: [path], message })
    }
    const listed = LISTED_STATUSES.has(entry.status)
    const npmPackage = entry.kind === 'package' || entry.kind === 'design'
    if (npmPackage && entry.npm === null) issue('npm', `is required for a ${entry.kind}`)
    if (entry.kind === 'feature') {
      if (entry.npm !== null) issue('npm', 'must be null for a feature (it never had its own npm name)')
      if (entry.status !== 'retired' && entry.status !== 'shelved') issue('status', 'must be "retired" or "shelved" for a feature')
    }
    if (entry.kind === 'repo' && entry.repo === null) issue('repo', 'is required for a repository entry')
    if (entry.status === 'released' && !npmPackage) issue('status', '"released" applies to npm packages and designs only')
    if (listed && npmPackage) {
      if (entry.category === undefined) issue('category', 'is required while the package is listed')
      if (entry.docs === undefined) issue('docs', 'is required while the package is listed')
      if (entry.framework === undefined) issue('framework', 'is required while the package is listed')
    }
    if (entry.status === 'planned' && entry.phase === undefined && npmPackage) issue('phase', 'is required for a planned package (when is it built?)')
    if ((entry.status === 'retired' || entry.status === 'shelved') && entry.note === undefined) issue('note', `is required for a ${entry.status} entry (say why)`)
    if (entry.status === 'retired' && entry.replacement === undefined) issue('replacement', 'is required for a retired entry (say what to use instead)')
    if (entry.popular && !(listed && npmPackage)) issue('popular', 'only listed packages can be popular')
  })

export type SourceEntry = z.output<typeof sourceEntrySchema>

/** The whole file. */
export const sourceSchema = z.strictObject({
  $schema: z.string().max(200).optional(),
  sourceVersion: z.literal(SOURCE_VERSION, { error: `must be ${SOURCE_VERSION} (this tool reads source format ${SOURCE_VERSION})` }),
  org: z
    .string()
    .max(39)
    .regex(/^[a-z0-9][a-z0-9-]*$/i)
    .describe('The GitHub organisation that owns every repo.'),
  categories: z.array(categorySchema).min(1).max(50).describe('Picker groups, in display order.'),
  framework: z
    .strictObject({
      lines: z
        .array(lineSchema)
        .min(1)
        .max(100)
        .describe('Framework lines on the roadmap (like 0.2). Released framework versions from npm are added automatically.'),
    })
    .describe('Framework release lines the compatibility table is computed for.'),
  packages: z.array(sourceEntrySchema).min(1).max(2_000),
})

export type Source = z.output<typeof sourceSchema>

/** One problem with the source as a whole (duplicates, unknown categories, …). */
export interface SourceProblem {
  readonly path: string
  readonly message: string
}

/**
 * Parse `source.json` and run the checks that span entries. Returns the parsed source or every
 * problem at once (fail closed: nothing is built from a source with problems).
 *
 * @example
 * const result = parseSource(JSON.parse(await readFile('source.json', 'utf8')))
 * if (!result.ok) for (const p of result.problems) process.stderr.write(`${p.path}: ${p.message}\n`)
 */
export function parseSource(raw: unknown): { readonly ok: true; readonly source: Source } | { readonly ok: false; readonly problems: readonly SourceProblem[] } {
  const parsed = sourceSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      problems: parsed.error.issues.map((issue) => ({ path: issue.path.map(String).join('.'), message: issue.message })),
    }
  }
  const source = parsed.data
  const problems: SourceProblem[] = []
  const categories = new Set(source.categories.map((category) => category.id))
  if (categories.size !== source.categories.length) problems.push({ path: 'categories', message: 'lists a category id twice' })
  const ids = new Map<string, number>()
  const npm = new Map<string, number>()
  source.packages.forEach((entry, index) => {
    const at = `packages.${index} (${entry.id})`
    const earlierId = ids.get(entry.id)
    if (earlierId !== undefined) problems.push({ path: at, message: `id "${entry.id}" is also used by packages.${earlierId}` })
    ids.set(entry.id, index)
    if (entry.npm !== null) {
      const earlierNpm = npm.get(entry.npm)
      if (earlierNpm !== undefined) problems.push({ path: at, message: `npm name ${entry.npm} is also used by packages.${earlierNpm}` })
      npm.set(entry.npm, index)
    }
    if (entry.category !== undefined && !categories.has(entry.category)) {
      problems.push({ path: `${at}.category`, message: `"${entry.category}" is not one of the categories (${[...categories].join(', ')})` })
    }
  })
  const listedNpm = new Set(
    source.packages.filter((entry) => LISTED_STATUSES.has(entry.status) && entry.npm !== null).map((entry) => entry.npm),
  )
  source.packages.forEach((entry, index) => {
    for (const replacement of entry.replacement?.packages ?? []) {
      if (!listedNpm.has(replacement)) {
        problems.push({ path: `packages.${index} (${entry.id}).replacement`, message: `${replacement} is not a listed package, so it cannot replace ${entry.id}` })
      }
    }
  })
  return problems.length > 0 ? { ok: false, problems } : { ok: true, source }
}

/** The GitHub URL of a repository in the source's org. */
export const repoUrl = (source: Pick<Source, 'org'>, repo: string): string => `https://github.com/${source.org}/${repo}`
