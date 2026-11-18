/**
 * Validate a whole `package.json`: its name, version and framework peer, and the `strutvane`
 * block inside it. Returns friendly problems instead of throwing, so the builder can report every
 * problem of every package at once.
 *
 * Order of checks, and why:
 * 1. shape and size guards on the raw JSON (cheap, and they protect the later steps);
 * 2. fields that look executable (clearer message than "unknown field");
 * 3. the Zod schema (structure, field rules, cross-field rules);
 * 4. rules that need the package name (first-party vs community, designs).
 *
 * @module
 */
import { z } from 'zod'
import { findExecutableFields } from './executable-keys.ts'
import { type Manifest, manifestSchema } from './schema.ts'
import { LIMITS, VERSION, type Origin, designNameOf, packageOrigin } from './rules.ts'

/** One problem, with the path inside `package.json` it refers to. */
export interface ManifestProblem {
  /** e.g. `strutvane.questions[1] ("api-key").label`; empty for the file as a whole. */
  readonly path: string
  readonly message: string
}

/** A package that passed every check. */
export interface ValidPackage {
  readonly ok: true
  readonly name: string
  readonly version: string
  readonly origin: Origin
  readonly manifest: Manifest
}

/** A package that did not, with every problem found. */
export interface InvalidPackage {
  readonly ok: false
  /** The `name` field when it could be read, for messages. */
  readonly name: string | undefined
  readonly problems: readonly ManifestProblem[]
}

export type PackageValidation = ValidPackage | InvalidPackage

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** How deep a JSON value nests (objects and arrays). Stops counting past `limit`. */
function depthOf(value: unknown, limit: number, depth = 0): number {
  if (depth > limit || typeof value !== 'object' || value === null) return depth
  let deepest = depth
  for (const inner of Object.values(value)) deepest = Math.max(deepest, depthOf(inner, limit, depth + 1))
  return deepest
}

/**
 * Check one parsed `package.json`.
 *
 * @example
 * const result = validatePackageJson(JSON.parse(text))
 * if (!result.ok) for (const p of result.problems) console.error(`${p.path}: ${p.message}`)
 */
export function validatePackageJson(packageJson: unknown): PackageValidation {
  if (!isRecord(packageJson)) return invalid(undefined, '', 'is not a JSON object')
  const name = typeof packageJson['name'] === 'string' ? packageJson['name'] : undefined
  const problems: ManifestProblem[] = []
  const report = (path: string, message: string): void => {
    problems.push({ path, message })
  }

  // Name and version: who is this, and is it a name we list at all?
  const origin = name === undefined ? undefined : packageOrigin(name)
  if (name === undefined) report('name', 'is missing')
  else if (origin === undefined) {
    report('name', `"${name.slice(0, 80)}" is not a Strutvane package name: use @strutvane/<name> (first-party) or strutvane-<name> (community)`)
  }
  const version = packageJson['version']
  if (typeof version !== 'string' || !VERSION.test(version)) {
    report('version', 'must be a full release version like 0.2.0 (pre-releases are not listed)')
  }

  const block = packageJson['strutvane']
  if (block === undefined) {
    report('strutvane', 'is missing: every listed package declares a "strutvane" block in package.json')
    return invalid(name, problems)
  }
  // Size and depth before anything walks the block.
  let size: number
  try {
    size = Buffer.byteLength(JSON.stringify(block) ?? '', 'utf8')
  } catch {
    report('strutvane', 'is not plain JSON data')
    return invalid(name, problems)
  }
  if (size > LIMITS.manifestBytes) {
    report('strutvane', `is too large (${size} bytes; at most ${LIMITS.manifestBytes}). Keep long docs on the docs page`)
    return invalid(name, problems)
  }
  if (depthOf(block, LIMITS.depth + 1) > LIMITS.depth) {
    report('strutvane', `nests deeper than ${LIMITS.depth} levels`)
    return invalid(name, problems)
  }

  const executable = findExecutableFields(block)
  for (const field of executable) {
    report(
      `strutvane.${field.path}`,
      'looks like code to run. Manifests are data only and nothing runs before install; put install logic in your package\'s installer steps',
    )
  }
  const executableKeys = new Set(executable.map((field) => field.key))

  const parsed = manifestSchema.safeParse(block)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      // Already reported, more clearly, as "looks like code to run".
      if (issue.code === 'unrecognized_keys' && issue.keys.every((key) => executableKeys.has(key))) continue
      report(formatPath(['strutvane', ...issue.path], packageJson), friendlyMessage(issue))
    }
    return invalid(name, problems)
  }
  const manifest = parsed.data
  if (name !== undefined && origin !== undefined) {
    for (const problem of originProblems(name, origin, manifest)) report(`strutvane.${problem.path}`, problem.message)
  }

  // The framework peer range lives in two places; they must agree or npm and the catalogue would
  // disagree about compatibility.
  const peers = packageJson['peerDependencies']
  if (isRecord(peers) && peers['@strutvane/framework'] !== undefined && peers['@strutvane/framework'] !== manifest.framework) {
    report(
      'strutvane.framework',
      `is "${manifest.framework}" but peerDependencies["@strutvane/framework"] is "${String(peers['@strutvane/framework'])}"; they must be the same`,
    )
  }

  if (problems.length > 0 || name === undefined || origin === undefined || typeof version !== 'string') return invalid(name, problems)
  return { ok: true, name, version, origin, manifest }
}

/**
 * Rules that depend on who publishes the package. Paths are relative to the `strutvane` block.
 * Exported for the index parser, which re-checks every entry it downloads.
 */
export function originProblems(name: string, origin: Origin, manifest: Manifest): ManifestProblem[] {
  const problems: ManifestProblem[] = []
  const report = (path: string, message: string): void => {
    problems.push({ path, message })
  }
  const design = designNameOf(name)
  if (manifest.kind === 'design') {
    if (design === undefined) report('kind', 'is "design" but designs are named @strutvane/design-<name> or strutvane-design-<name>')
    else if (manifest.id !== design) report('id', `must be "${design}" for ${name} (the part after "design-")`)
  } else if (design !== undefined) {
    report('kind', `must be "design" for ${name}`)
  }
  if (origin === 'community') {
    // A community package cannot take a first-party-looking id: its id is its own name.
    const own = name.slice('strutvane-'.length)
    if (manifest.kind !== 'design' && manifest.id !== own) report('id', `must be "${own}" for the community package ${name}`)
    // "Popular" is curated by the hub, never self-declared.
    if (manifest.popular) report('popular', 'can only be set by first-party packages (the hub curates the popular list)')
  }
  return problems
}

function invalid(name: string | undefined, problems: ManifestProblem[]): InvalidPackage
function invalid(name: string | undefined, path: string, message: string): InvalidPackage
function invalid(name: string | undefined, problems: ManifestProblem[] | string, message?: string): InvalidPackage {
  return { ok: false, name, problems: typeof problems === 'string' ? [{ path: problems, message: message ?? '' }] : problems }
}

/**
 * `['strutvane', 'questions', 1, 'label']` → `strutvane.questions[1] ("api-key").label`. Ids are
 * added for questions, choices and env keys, because "question 2" is hard to find in a file.
 */
export function formatPath(path: readonly PropertyKey[], root: unknown): string {
  let text = ''
  let node: unknown = root
  for (const part of path) {
    if (typeof part === 'number') {
      text += `[${part}]`
      node = Array.isArray(node) ? node[part] : undefined
      const label = isRecord(node) ? (node['id'] ?? node['value'] ?? node['key']) : undefined
      if (typeof label === 'string' && label.length <= 40) text += ` ("${label}")`
    } else {
      text += text === '' ? String(part) : `.${String(part)}`
      node = isRecord(node) ? node[String(part)] : undefined
    }
  }
  return text
}

/** Zod's issue, in plain words. Custom issues already carry friendly text. */
export function friendlyMessage(issue: z.core.$ZodIssue): string {
  switch (issue.code) {
    case 'unrecognized_keys':
      return `has an unknown field${issue.keys.length > 1 ? 's' : ''} ${issue.keys.map((key) => `"${key.slice(0, 40)}"`).join(', ')}. ` +
        'Manifests accept only documented fields (check the spelling, or the manifest format version)'
    case 'invalid_type':
      return issue.input === undefined ? 'is missing' : `should be ${article(issue.expected)}`
    case 'too_big':
      return issue.origin === 'array' ? `has too many items (at most ${String(issue.maximum)})` : issue.origin === 'string' ? `is too long (at most ${String(issue.maximum)} characters)` : `is too large (at most ${String(issue.maximum)})`
    case 'too_small':
      return issue.origin === 'array' ? `needs at least ${String(issue.minimum)} items` : issue.origin === 'string' ? 'is empty' : `is too small (at least ${String(issue.minimum)})`
    case 'invalid_value':
      // A schema-provided message (e.g. for manifestVersion) is already friendly.
      if (!issue.message.startsWith('Invalid')) return issue.message
      return `should be one of: ${issue.values.map((value) => JSON.stringify(value)).join(', ')}`
    case 'invalid_union':
      return 'does not match any allowed form (check the field names)'
    default:
      return issue.message
  }
}

const article = (expected: string): string => {
  if (expected === 'array') return 'a list'
  if (expected === 'object') return 'an object'
  if (expected === 'boolean') return 'true or false'
  if (expected === 'int' || expected === 'number') return 'a number'
  return `a ${expected}`
}
