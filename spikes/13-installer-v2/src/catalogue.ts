/**
 * The package catalogue index (blueprint §3.3): one JSON file listing every official package, so
 * question 22 ("extra features") never hard-codes a package name. A new package appears in the
 * installer by being added to the index, with no installer change.
 *
 * In the product the installer downloads the index that hub CI builds from the published package
 * manifests; the spike reads a fixture (`src/data/catalogue.json`). Either way the file is
 * untrusted input: every field is checked, a bad entry is skipped (never offered), and only
 * entries that are **published** and **compatible** with the framework being installed are shown.
 *
 * Follow-up questions are **declarative** (a label, choices and a default): nothing from a
 * package runs before it is installed.
 *
 * @module
 */
import { readFileSync } from 'node:fs'
import { satisfiesRange } from './semver-range.ts'

/**
 * The framework version this installer installs. Catalogue entries whose `frameworkRange` does not
 * include it are not offered.
 */
export const INSTALLED_FRAMEWORK_VERSION = '0.1.0'

/** One choice of a follow-up question. */
export interface FollowUpChoice {
  readonly value: string
  readonly label: string
}

/** A package's own question, asked after it is picked (for example billing: Stripe or Paddle?). */
export interface FollowUpQuestion {
  readonly id: string
  readonly label: string
  readonly choices: readonly FollowUpChoice[]
  readonly default: string
}

/** A group of packages in the picker ("Operations", "Money", ...), in display order. */
export interface CatalogueCategory {
  readonly id: string
  readonly name: string
}

/** One package in the index. */
export interface CatalogueEntry {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly category: string
  /** Shown in the short "popular" list; everything else is reached by typing to search. */
  readonly popular: boolean
  /** Unpublished entries (announced, not released yet) are never offered. */
  readonly published: boolean
  /** The framework versions this package works with, as a semver range (`^0.1`). */
  readonly frameworkRange: string
  /** The npm package the pick installs. */
  readonly package: string
  readonly followUps: readonly FollowUpQuestion[]
}

/** The whole index. */
export interface Catalogue {
  readonly categories: readonly CatalogueCategory[]
  readonly entries: readonly CatalogueEntry[]
}

/** The index itself is unusable (not the expected shape). */
export class CatalogueError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CatalogueError'
  }
}

const ID = /^[a-z][a-z0-9-]{0,39}$/
/**
 * First-party `@strutvane/<name>` or community `strutvane-<name>` (blueprint §3.3). The strict
 * shape matters: the name becomes a folder and a package.json key, so `..`, slashes or a foreign
 * scope must never get through.
 */
const PACKAGE = /^(@strutvane\/[a-z0-9][a-z0-9-]{0,49}|strutvane-[a-z0-9][a-z0-9-]{0,49})$/

/** Words that mean "a credential". Follow-up questions containing them are refused. */
export const SECRET_WORDS = /\b(api[\s_-]?keys?|secrets?|tokens?|passwords?|passphrases?|credentials?|private[\s_-]?keys?)\b/i

/** Label limits keep every line within 74 characters in an 80-column terminal. */
const MAX_NAME = 30
const MAX_DESCRIPTION = 60
const MAX_LABEL = 74

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const shortText = (value: unknown, max: number): value is string =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= max && !/[\r\n\t\0]/.test(value)

/**
 * Check the raw JSON and keep every valid entry. Throws {@link CatalogueError} only when the file
 * as a whole is unusable; a single bad entry is skipped and its reason reported in `skipped`.
 *
 * @example
 * const { catalogue, skipped } = parseCatalogue(JSON.parse(text))
 */
export function parseCatalogue(raw: unknown): { readonly catalogue: Catalogue; readonly skipped: readonly string[] } {
  if (!isRecord(raw) || raw['version'] !== 1) throw new CatalogueError('The catalogue index has an unknown version.')
  const rawCategories = raw['categories']
  const rawEntries = raw['entries']
  if (!Array.isArray(rawCategories) || !Array.isArray(rawEntries)) {
    throw new CatalogueError('The catalogue index has no categories or entries list.')
  }
  const categories: CatalogueCategory[] = []
  for (const category of rawCategories) {
    if (!isRecord(category) || typeof category['id'] !== 'string' || !ID.test(category['id']) || !shortText(category['name'], MAX_NAME)) {
      throw new CatalogueError('The catalogue index has a malformed category.')
    }
    categories.push({ id: category['id'], name: category['name'] })
  }
  const known = new Set(categories.map((c) => c.id))
  const seen = new Set<string>()
  const entries: CatalogueEntry[] = []
  const skipped: string[] = []
  rawEntries.forEach((rawEntry, index) => {
    const result = parseEntry(rawEntry, known)
    if (typeof result === 'string') {
      skipped.push(`entry ${index}: ${result}`)
    } else if (seen.has(result.id)) {
      skipped.push(`entry ${index}: duplicate id "${result.id}"`)
    } else {
      seen.add(result.id)
      entries.push(result)
    }
  })
  return { catalogue: { categories, entries }, skipped }
}

/** One entry, or the reason it is unusable. */
function parseEntry(raw: unknown, categories: ReadonlySet<string>): CatalogueEntry | string {
  if (!isRecord(raw)) return 'not an object'
  const { id, name, description, category, popular, published, frameworkRange } = {
    id: raw['id'],
    name: raw['name'],
    description: raw['description'],
    category: raw['category'],
    popular: raw['popular'],
    published: raw['published'],
    frameworkRange: raw['frameworkRange'],
  }
  if (typeof id !== 'string' || !ID.test(id)) return 'bad id'
  if (!shortText(name, MAX_NAME)) return `${id}: bad name`
  if (!shortText(description, MAX_DESCRIPTION)) return `${id}: bad description`
  if (typeof category !== 'string' || !categories.has(category)) return `${id}: unknown category`
  if (typeof popular !== 'boolean' || typeof published !== 'boolean') return `${id}: popular/published must be true or false`
  if (!shortText(frameworkRange, 100)) return `${id}: bad frameworkRange`
  const packageName = raw['package']
  if (typeof packageName !== 'string' || !PACKAGE.test(packageName)) return `${id}: bad package name`
  const followUps = parseFollowUps(raw['followUps'])
  if (typeof followUps === 'string') return `${id}: ${followUps}`
  return { id, name, description, category, popular, published, frameworkRange, package: packageName, followUps }
}

/** Declarative follow-up questions: an optional list of simple single-choice questions. */
function parseFollowUps(raw: unknown): FollowUpQuestion[] | string {
  if (raw === undefined) return []
  if (!Array.isArray(raw) || raw.length > 5) return 'followUps must be a list of at most 5 questions'
  const questions: FollowUpQuestion[] = []
  for (const question of raw) {
    if (!isRecord(question) || typeof question['id'] !== 'string' || !ID.test(question['id'])) return 'follow-up with a bad id'
    if (!shortText(question['label'], MAX_LABEL)) return `follow-up ${question['id']}: bad label`
    // The installer never asks for a credential (they would end up in shell history, CI logs or
    // strutvane.json). A package that tries is skipped as a whole: its keys belong in .env.
    if (SECRET_WORDS.test(question['label']) || SECRET_WORDS.test(question['id'])) return `follow-up ${question['id']}: asks for a secret`
    const rawChoices = question['choices']
    if (!Array.isArray(rawChoices) || rawChoices.length < 2 || rawChoices.length > 10) return `follow-up ${question['id']}: needs 2 to 10 choices`
    const choices: FollowUpChoice[] = []
    for (const choice of rawChoices) {
      if (!isRecord(choice) || typeof choice['value'] !== 'string' || !ID.test(choice['value']) || !shortText(choice['label'], MAX_LABEL)) {
        return `follow-up ${question['id']}: bad choice`
      }
      choices.push({ value: choice['value'], label: choice['label'] })
    }
    const fallback = question['default']
    if (typeof fallback !== 'string' || !choices.some((c) => c.value === fallback)) return `follow-up ${question['id']}: default is not a choice`
    questions.push({ id: question['id'], label: question['label'], choices, default: fallback })
  }
  return questions
}

/**
 * The entries the installer may offer: published, and compatible with the framework version
 * being installed. Order is kept from the index.
 *
 * @example
 * offeredEntries(catalogue).some((e) => !e.published) // false
 */
export function offeredEntries(catalogue: Catalogue, frameworkVersion: string = INSTALLED_FRAMEWORK_VERSION): CatalogueEntry[] {
  return catalogue.entries.filter((entry) => entry.published && satisfiesRange(frameworkVersion, entry.frameworkRange))
}

/**
 * The popular entries, grouped by category in the index's category order (empty groups left out).
 *
 * @example
 * popularGroups(catalogue)[0] // { category: { id: 'operations', name: 'Operations' }, entries: [...] }
 */
export function popularGroups(catalogue: Catalogue, offered: readonly CatalogueEntry[] = offeredEntries(catalogue)) {
  return catalogue.categories
    .map((category) => ({ category, entries: offered.filter((e) => e.popular && e.category === category.id) }))
    .filter((group) => group.entries.length > 0)
}

let bundled: Catalogue | undefined

/**
 * The catalogue the installer uses: the spike's fixture, read and checked once.
 *
 * Why a fixture: the real index is published by hub CI (blueprint §3.3); downloading it is a
 * network step the spike does not need to prove the question flow.
 */
export function installerCatalogue(): Catalogue {
  if (bundled === undefined) {
    const text = readFileSync(new URL('./data/catalogue.json', import.meta.url), 'utf8')
    bundled = parseCatalogue(JSON.parse(text)).catalogue
  }
  return bundled
}

/**
 * Find an offered entry by id.
 *
 * @example
 * findOffered('billing')?.package // '@strutvane/billing'
 */
export function findOffered(id: string, catalogue: Catalogue = installerCatalogue()): CatalogueEntry | undefined {
  return offeredEntries(catalogue).find((entry) => entry.id === id)
}
