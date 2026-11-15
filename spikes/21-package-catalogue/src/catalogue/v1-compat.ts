/**
 * The bridge from spike 13's catalogue (format 1) to this one (format 2).
 *
 * - {@link toV1}: project a v2 index onto the v1 shape, field for field. It proves the "superset"
 *   claim (v1 fields are copied, never computed) and lets the old installer keep working during
 *   the switch.
 * - {@link compareWithV1}: list the exact differences between a v1 file and what format 2
 *   requires, so moving the installer's fixture over is a checklist, not a guess.
 *
 * @module
 */
import { packageOrigin } from '../manifest/rules.ts'
import { byCodeUnit } from '../graph.ts'
import { formatPath, friendlyMessage } from '../manifest/validate.ts'
import { CATALOGUE_VERSION, entrySchema, type CatalogueIndex } from './index-schema.ts'

/** Spike 13's entry shape (`src/catalogue.ts`). */
export interface V1Entry {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly category: string
  readonly popular: boolean
  readonly published: boolean
  readonly frameworkRange: string
  readonly package: string
  readonly followUps: readonly { readonly id: string; readonly label: string; readonly default: string; readonly choices: readonly { readonly value: string; readonly label: string }[] }[]
}

/** Spike 13's whole file. */
export interface V1Catalogue {
  readonly version: 1
  readonly categories: readonly { readonly id: string; readonly name: string }[]
  readonly entries: readonly V1Entry[]
}

/**
 * The v1 view of a v2 index. Only `package` kind entries in pickable categories are kept (v1 has
 * no designs or core packages). v1 follow-ups can only be single choice, so an entry with a
 * multiselect, confirm or text question is left out and named in `dropped`.
 */
export function toV1(index: CatalogueIndex): { readonly catalogue: V1Catalogue; readonly dropped: readonly string[] } {
  const pickable = new Set(index.categories.filter((category) => category.pickable).map((category) => category.id))
  const dropped: string[] = []
  const entries: V1Entry[] = []
  for (const entry of index.entries) {
    if (entry.kind !== 'package' || !pickable.has(entry.category)) continue
    if (entry.followUps.some((question) => question.type !== 'select')) {
      dropped.push(`${entry.id}: has a ${entry.followUps.find((question) => question.type !== 'select')?.type} question, which format 1 cannot express`)
      continue
    }
    entries.push({
      id: entry.id,
      name: entry.name,
      description: entry.description,
      category: entry.category,
      popular: entry.popular,
      published: entry.published,
      frameworkRange: entry.frameworkRange,
      package: entry.package,
      followUps: entry.followUps.flatMap((question) =>
        question.type === 'select'
          ? [{ id: question.id, label: question.label, default: question.default, choices: question.choices.map((choice) => ({ value: choice.value, label: choice.label })) }]
          : [],
      ),
    })
  }
  return {
    catalogue: { version: 1, categories: index.categories.filter((category) => category.pickable).map(({ id, name }) => ({ id, name })), entries },
    dropped,
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** Fields format 2 adds to every entry (all absent from format 1). */
export const V2_ENTRY_FIELDS = ['kind', 'origin', 'tags', 'docs', 'version', 'verified', 'versions', 'compatibility', 'requires', 'conflicts', 'installs', 'status'] as const

/**
 * Every difference between a format-1 file and format 2, as plain sentences, sorted.
 *
 * Entries are checked by filling the v2-only fields with neutral values (no tags, no installs,
 * a planned `docs` link) and running the full v2 entry rules, so what remains are real rule
 * differences (lengths, names, question shapes), not just "field missing".
 */
export function compareWithV1(raw: unknown): string[] {
  const differences: string[] = []
  if (!isRecord(raw)) return ['the file is not a JSON object']
  if (raw['version'] !== CATALOGUE_VERSION) differences.push(`file: "version" is ${JSON.stringify(raw['version'])}; format 2 needs ${CATALOGUE_VERSION}`)
  for (const key of Object.keys(raw)) {
    if (!['version', 'generator', 'manifestVersion', 'frameworkLines', 'categories', 'entries', 'history'].includes(key)) differences.push(`file: unknown field "${key}"`)
  }
  for (const key of ['generator', 'manifestVersion', 'frameworkLines', 'history']) {
    if (!(key in raw)) differences.push(`file: missing "${key}"`)
  }
  const categories = Array.isArray(raw['categories']) ? raw['categories'] : []
  if (categories.some((category) => isRecord(category) && !('pickable' in category))) differences.push('categories: missing "pickable" on every category')
  const entries = Array.isArray(raw['entries']) ? raw['entries'] : []
  const missing = new Set<string>()
  for (const entry of entries) {
    if (!isRecord(entry)) continue
    for (const field of V2_ENTRY_FIELDS) if (!(field in entry)) missing.add(field)
  }
  if (missing.size > 0) differences.push(`entries: every entry is missing ${[...missing].join(', ')}`)
  if (entries.some((entry) => isRecord(entry) && Array.isArray(entry['followUps']) && entry['followUps'].some((q) => isRecord(q) && !('type' in q)))) {
    differences.push('entries: follow-up questions have no "type" (format 2 says "select", "multiselect", "confirm" or "text")')
  }
  for (const entry of entries) {
    if (!isRecord(entry)) continue
    const id = typeof entry['id'] === 'string' ? entry['id'] : '?'
    const packageName = typeof entry['package'] === 'string' ? entry['package'] : ''
    const range = typeof entry['frameworkRange'] === 'string' ? entry['frameworkRange'] : ''
    const filled = {
      ...entry,
      followUps: Array.isArray(entry['followUps']) ? entry['followUps'].map((q) => (isRecord(q) ? { type: 'select', ...q } : q)) : [],
      kind: 'package',
      origin: packageOrigin(packageName) ?? 'first-party',
      tags: [],
      docs: `https://github.com/vishwajit-vm/strutvane-${id}#readme`,
      version: '0.1.0',
      verified: false,
      versions: [{ version: '0.1.0', framework: range }],
      compatibility: {},
      requires: [],
      conflicts: [],
      installs: { config: [], env: [], migrations: [], routes: [], screens: [], sidebar: [], commands: [] },
      status: entry['published'] === true ? 'available' : 'planned',
    }
    const parsed = entrySchema.safeParse(filled)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) differences.push(`entry "${id}": ${formatPath(issue.path, filled)} ${friendlyMessage(issue)}`)
    }
  }
  const [file, rest] = [differences.filter((d) => !d.startsWith('entry "')), differences.filter((d) => d.startsWith('entry "')).sort(byCodeUnit)]
  return [...file, ...rest]
}
