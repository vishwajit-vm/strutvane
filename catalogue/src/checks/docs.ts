/**
 * Docs drift: every entry on the docs site's Packages pages has a catalogue entry, and the two
 * agree on the facts (npm name, repository, status, phase).
 *
 * The docs site (`strutvane-docs`) keeps its own package data today (`src/data/packages.json`,
 * one per-package page `versions/<line>/packages/<id>.mdx` each). Until it reads `catalogue.json`
 * directly, this check is what keeps a package from being "planned" on one page and "retired" on
 * another.
 *
 * Matching a docs entry to a source entry, in order: the same npm name; the same id; the source
 * entry's repository is `strutvane-<docs id>` (designs: docs `design-crisp` is catalogue `crisp`).
 *
 * @module
 */
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { z } from 'zod'
import { byCodeUnit } from '../graph.ts'
import { repoUrl, type Source, type SourceEntry, type SourceStatus } from '../source/schema.ts'
import type { Finding } from './findings.ts'

/** What this check reads of one docs entry. Other fields belong to the docs site. */
export const docsEntrySchema = z.looseObject({
  id: z.string().max(80),
  npm: z.string().max(214).nullable(),
  repo: z.string().max(300).nullable(),
  status: z.enum(['available', 'preview', 'in-development', 'planned', 'shelved', 'retired']),
  phase: z.int().nullable(),
})
export type DocsEntry = z.output<typeof docsEntrySchema>

/** The docs site's package data, plus the ids its per-package pages show. */
export interface DocsPackages {
  readonly entries: readonly DocsEntry[]
  /** `versions/<line>/packages/<file>.mdx` → the id passed to `<PackagePage id="…" />`. */
  readonly pages: readonly { readonly file: string; readonly id: string }[]
}

const docsFileSchema = z.looseObject({ packages: z.array(z.unknown()).max(5_000) })

/** The docs status in source words (`available` is `released`; a `preview` is still being built). */
const STATUS_FROM_DOCS: Readonly<Record<DocsEntry['status'], SourceStatus>> = {
  available: 'released',
  preview: 'in-development',
  'in-development': 'in-development',
  planned: 'planned',
  shelved: 'shelved',
  retired: 'retired',
}

/**
 * Read a `strutvane-docs` checkout. Throws when the package data is missing or malformed: a docs
 * check that silently finds nothing would pass forever.
 */
export async function readDocsPackages(docsDir: string): Promise<DocsPackages> {
  const dataFile = join(docsDir, 'src', 'data', 'packages.json')
  const raw = docsFileSchema.safeParse(JSON.parse(await readFile(dataFile, 'utf8')) as unknown)
  if (!raw.success) throw new Error(`${dataFile} has no "packages" list`)
  const entries = raw.data.packages.map((item, index) => {
    const parsed = docsEntrySchema.safeParse(item)
    if (!parsed.success) throw new Error(`${dataFile} packages[${index}] is malformed: ${parsed.error.issues[0]?.message ?? 'unknown problem'}`)
    return parsed.data
  })
  const pages: { file: string; id: string }[] = []
  const versionsDir = join(docsDir, 'versions')
  const lines = (await readdir(versionsDir, { withFileTypes: true }).catch(() => [])).filter((item) => item.isDirectory()).map((item) => item.name)
  for (const line of lines.sort(byCodeUnit)) {
    const folder = join(versionsDir, line, 'packages')
    const files = await readdir(folder).catch(() => [] as string[])
    for (const file of files.filter((name) => name.endsWith('.mdx') || name.endsWith('.md')).sort(byCodeUnit)) {
      const text = await readFile(join(folder, file), 'utf8')
      const match = /<PackagePage\s+id=["']([a-z0-9-]{1,80})["']/.exec(text)
      if (match?.[1] !== undefined) pages.push({ file: `versions/${line}/packages/${file}`, id: match[1] })
    }
  }
  return { entries, pages }
}

/** The source entry a docs entry describes, if any. */
export function matchDocsEntry(source: Source, docs: Pick<DocsEntry, 'id' | 'npm'>): SourceEntry | undefined {
  return (
    (docs.npm === null ? undefined : source.packages.find((entry) => entry.npm === docs.npm)) ??
    source.packages.find((entry) => entry.id === docs.id) ??
    source.packages.find((entry) => entry.repo === `strutvane-${docs.id}`)
  )
}

/** Every docs-side finding. */
export function checkDocs(source: Source, docs: DocsPackages): Finding[] {
  const findings: Finding[] = []
  const finding = (severity: Finding['severity'], subject: string, message: string): void => {
    findings.push({ check: 'docs', severity, subject, message })
  }
  const matched = new Set<string>()
  for (const item of docs.entries) {
    const subject = `docs:${item.id}`
    const entry = matchDocsEntry(source, item)
    if (entry === undefined) {
      finding('error', subject, `is on the docs Packages page but has no catalogue entry (npm ${item.npm ?? 'none'}); add it to source.json or remove it from the docs`)
      continue
    }
    matched.add(entry.id)
    if (item.npm !== entry.npm) finding('error', subject, `npm name is ${item.npm ?? 'null'} in the docs but ${entry.npm ?? 'null'} in the catalogue`)
    const expectedRepo = entry.repo === null ? null : repoUrl(source, entry.repo)
    if (item.repo !== expectedRepo) finding('error', subject, `repo is ${item.repo ?? 'null'} in the docs but ${expectedRepo ?? 'null'} in the catalogue`)
    if (STATUS_FROM_DOCS[item.status] !== entry.status) finding('error', subject, `status is "${item.status}" in the docs but "${entry.status}" in the catalogue`)
    if ((item.phase ?? undefined) !== entry.phase) finding('error', subject, `phase is ${item.phase ?? 'none'} in the docs but ${entry.phase ?? 'none'} in the catalogue`)
  }
  const docsIds = new Set(docs.entries.map((item) => item.id))
  for (const page of docs.pages) {
    if (!docsIds.has(page.id)) finding('error', `docs:${page.id}`, `${page.file} shows a package the docs data (src/data/packages.json) does not list`)
    else if (matchDocsEntry(source, { id: page.id, npm: docs.entries.find((item) => item.id === page.id)?.npm ?? null }) === undefined) {
      finding('error', `docs:${page.id}`, `${page.file} shows a package with no catalogue entry`)
    }
  }
  for (const entry of source.packages) {
    if (entry.kind !== 'repo' && !matched.has(entry.id)) finding('warning', entry.id, 'is in the catalogue but not on the docs Packages page')
  }
  return findings
}
