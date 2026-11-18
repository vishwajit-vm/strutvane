/**
 * Build `catalogue.json` from package manifests (blueprint §3.3 item 2).
 *
 * Properties, and why each matters:
 * - **Pure:** snapshots in, index out. No clock, no network, no file system (readers live in
 *   `sources.ts`), so the same input always gives byte-identical output, and CI can diff it.
 * - **Deterministic:** entries sorted by id, lists sorted where order carries no meaning, keys
 *   written in a fixed order, no timestamps. Input order never matters.
 * - **Fail closed:** one invalid manifest stops the whole build with {@link CatalogueBuildError},
 *   naming every package and every problem. A half-built catalogue would silently drop a package
 *   from every installer in the world.
 * - **Verified is earned:** only a conformance results file for that exact version, with every
 *   required kit passed, sets `verified` (`conformance.ts`).
 *
 * @module
 */
import { type Manifest } from '../manifest/schema.ts'
import { validatePackageJson, type ValidPackage } from '../manifest/validate.ts'
import { compareVersions, frameworkLine, satisfiesRange } from '../manifest/semver-range.ts'
import { MANIFEST_VERSION } from '../manifest/rules.ts'
import { byCodeUnit, findCycle } from '../graph.ts'
import { conformanceVerdict } from './conformance.ts'
import { CATALOGUE_VERSION, GENERATOR, statusProblem, type CatalogueEntry, type CatalogueIndex, type PackageStatus } from './index-schema.ts'
import type { HubConfig, VersionSnapshot } from './sources.ts'

/** One reason the build failed. */
export interface BuildProblem {
  /** The npm name, or the source when the name could not be read. */
  readonly package: string
  /** Where the manifest came from (file path or `npm:name@version`). */
  readonly source: string
  /** Path inside package.json, when the problem is about one field. */
  readonly path: string
  readonly message: string
}

/** The build failed; `message` is ready to print, `problems` is the structured list. */
export class CatalogueBuildError extends Error {
  readonly problems: readonly BuildProblem[]
  constructor(problems: readonly BuildProblem[]) {
    super(formatBuildProblems(problems))
    this.name = 'CatalogueBuildError'
    this.problems = problems
  }
}

/** A successful build. */
export interface BuildResult {
  readonly index: CatalogueIndex
  /** Things worth knowing that do not stop the build (e.g. "no compatible framework line"). */
  readonly warnings: readonly string[]
}

interface PackageVersions {
  readonly name: string
  readonly versions: { readonly valid: ValidPackage; readonly snapshot: VersionSnapshot }[]
}

/**
 * Build the index, or throw {@link CatalogueBuildError} listing every problem.
 *
 * @example
 * const { index } = buildCatalogue(await readLocalPackages('seed/manifests'), hub)
 * await writeFile('catalogue.json', serializeCatalogue(index))
 */
export function buildCatalogue(snapshots: readonly VersionSnapshot[], hub: HubConfig): BuildResult {
  const problems: BuildProblem[] = []
  const warnings: string[] = []
  const categoryIds = new Set(hub.categories.map((category) => category.id))

  // 1. Validate every snapshot on its own.
  const byName = new Map<string, PackageVersions['versions']>()
  for (const snapshot of snapshots) {
    if (snapshot.readProblem !== undefined) {
      problems.push({ package: snapshot.source, source: snapshot.source, path: '', message: snapshot.readProblem })
      continue
    }
    const result = validatePackageJson(snapshot.packageJson)
    if (!result.ok) {
      // A published version without any manifest is an old release from before the catalogue:
      // skipped, not fatal. Every other invalid manifest is fatal.
      const onlyMissing = result.problems.length === 1 && result.problems[0]?.path === 'strutvane' && result.problems[0].message.startsWith('is missing')
      if (onlyMissing && snapshot.published) {
        warnings.push(`${snapshot.source}: no strutvane manifest; that version is not listed`)
        continue
      }
      for (const problem of result.problems) {
        problems.push({ package: result.name ?? snapshot.source, source: snapshot.source, path: problem.path, message: problem.message })
      }
      continue
    }
    if (snapshot.npmDeprecated === true) {
      warnings.push(`${snapshot.source}: deprecated on npm; that version is not listed`)
      continue
    }
    byName.set(result.name, [...(byName.get(result.name) ?? []), { valid: result, snapshot }])
  }

  // 2. Per package: which versions count, and do they agree with each other?
  const packages: { readonly name: string; readonly latest: ValidPackage; readonly snapshot: VersionSnapshot; readonly listed: ValidPackage[]; readonly published: boolean }[] = []
  for (const [name, all] of [...byName].sort(([a], [b]) => byCodeUnit(a, b))) {
    const published = all.filter((version) => version.snapshot.published)
    const listed = published.length > 0 ? published : all
    const fail = (message: string, source = listed[0]?.snapshot.source ?? name): void => {
      problems.push({ package: name, source, path: '', message })
    }
    if (published.length === 0 && all.length > 1) {
      fail(`is found ${all.length} times (${all.map((version) => version.snapshot.source).join(', ')}) and none is published; keep one working copy`)
      continue
    }
    const versions = new Set<string>()
    for (const version of listed) {
      if (versions.has(version.valid.version)) fail(`has version ${version.valid.version} twice`, version.snapshot.source)
      versions.add(version.valid.version)
    }
    listed.sort((a, b) => compareVersions(b.valid.version, a.valid.version))
    const newest = listed[0]
    if (newest === undefined) continue
    for (const older of listed.slice(1)) {
      // The id is what strutvane.json stores and what people type; it must never change between
      // releases, or upgrading would orphan every app's answers.
      if (older.valid.manifest.id !== newest.valid.manifest.id) {
        fail(`changed its id from "${older.valid.manifest.id}" (${older.valid.version}) to "${newest.valid.manifest.id}" (${newest.valid.version}); ids are permanent (deprecate the old release on npm to retire it)`)
      }
      if (older.valid.manifest.kind !== newest.valid.manifest.kind) fail(`changed its kind between ${older.valid.version} and ${newest.valid.version}`)
    }
    packages.push({ name, latest: newest.valid, snapshot: newest.snapshot, listed: listed.map((version) => version.valid), published: published.length > 0 })
  }

  // 3. Across packages: ids, categories, relations, collisions.
  const owners = new Map<string, string[]>()
  for (const entry of packages) owners.set(entry.latest.manifest.id, [...(owners.get(entry.latest.manifest.id) ?? []), entry.name])
  for (const [id, names] of owners) {
    if (names.length > 1) {
      for (const name of names) {
        problems.push({ package: name, source: sourceOf(packages, name), path: 'strutvane.id', message: `"${id}" is also used by ${names.filter((other) => other !== name).join(', ')}; catalogue ids are unique` })
      }
    }
  }
  const manifests = new Map(packages.map((entry) => [entry.latest.manifest.id, entry] as const))
  for (const entry of packages) {
    const { manifest } = entry.latest
    const report = (path: string, message: string): void => {
      problems.push({ package: entry.name, source: entry.snapshot.source, path, message })
    }
    if (!categoryIds.has(manifest.category)) {
      report('strutvane.category', `"${manifest.category}" is not a hub category (one of: ${[...categoryIds].join(', ')})`)
    }
    for (const field of ['requires', 'conflicts'] as const) {
      for (const id of manifest[field]) if (!manifests.has(id)) report(`strutvane.${field}`, `"${id}" is not in the catalogue`)
    }
    const replacedBy = manifest.deprecated?.replacedBy
    if (replacedBy !== undefined && !manifests.has(replacedBy)) report('strutvane.deprecated.replacedBy', `"${replacedBy}" is not in the catalogue`)
  }
  const cycle = findCycle(manifests.keys(), (id) => manifests.get(id)?.latest.manifest.requires ?? [])
  if (cycle !== undefined) {
    const first = manifests.get(cycle[0] ?? '')
    problems.push({
      package: first?.name ?? cycle[0] ?? '',
      source: first?.snapshot.source ?? '',
      path: 'strutvane.requires',
      message: `requirements go round in a circle: ${cycle.join(' → ')}. Packages must not require each other; move the shared part into the framework`,
    })
  }
  problems.push(...collisions(packages.map((entry) => ({ name: entry.name, source: entry.snapshot.source, manifest: entry.latest.manifest }))))
  problems.push(...lifecycleProblems(packages, hub))

  if (problems.length > 0) throw new CatalogueBuildError(problems)

  // 4. Write the entries.
  const lines = frameworkLines(hub.framework.versions)
  const entries: CatalogueEntry[] = packages
    .map((entry) => {
      const { manifest, version, name, origin } = entry.latest
      const versions = entry.listed.map((listed) => ({ version: listed.version, framework: listed.manifest.framework }))
      const compatibility: Record<string, string> = {}
      for (const { line, latest } of lines) {
        const match = versions.find((candidate) => satisfiesRange(latest, candidate.framework))
        if (match !== undefined) compatibility[line] = match.version
      }
      if (Object.keys(compatibility).length === 0) warnings.push(`${name}: no version works with a known framework line (${lines.map((l) => l.line).join(', ')})`)
      const verdict = conformanceVerdict(entry.snapshot.conformance, { name, version, kind: manifest.kind, framework: manifest.framework })
      if (!verdict.verified && entry.snapshot.conformance !== undefined) warnings.push(`${name}@${version}: not verified (${verdict.reason})`)
      const lifecycle = hub.lifecycle[manifest.id]
      return toEntry(manifest, {
        name,
        origin,
        version,
        published: entry.published,
        verified: verdict.verified,
        versions,
        compatibility,
        status: lifecycle?.status ?? defaultStatus(entry.published),
        ...(lifecycle?.phase === undefined ? {} : { phase: lifecycle.phase }),
        ...(lifecycle?.since === undefined ? {} : { since: lifecycle.since }),
      })
    })
    .sort((a, b) => byCodeUnit(a.id, b.id))

  // A package that works with a framework line but requires one that does not yet cannot be
  // installed on that line. Not fatal (the requirement may simply not be released yet), but the
  // hub should know before people hit it.
  const compatibilityOf = new Map(entries.map((entry) => [entry.id, entry.compatibility] as const))
  for (const entry of entries) {
    for (const line of Object.keys(entry.compatibility)) {
      for (const need of entry.requires) {
        if (compatibilityOf.get(need)?.[line] === undefined) {
          warnings.push(`${entry.package}: works with framework ${line} but requires "${need}", which has no version for ${line} yet`)
        }
      }
    }
  }

  const index: CatalogueIndex = {
    version: CATALOGUE_VERSION,
    generator: GENERATOR,
    manifestVersion: MANIFEST_VERSION,
    frameworkLines: lines,
    categories: hub.categories.map((category) => ({ id: category.id, name: category.name, pickable: category.pickable })),
    entries,
    history: [...hub.history].sort((a, b) => byCodeUnit(a.package, b.package)),
  }
  return { index, warnings: warnings.sort(byCodeUnit) }
}

/** The index entry, with keys in a fixed order and order-free lists sorted. */
function toEntry(
  manifest: Manifest,
  extra: {
    readonly name: string
    readonly origin: CatalogueEntry['origin']
    readonly version: string
    readonly published: boolean
    readonly verified: boolean
    readonly versions: CatalogueEntry['versions']
    readonly compatibility: Record<string, string>
    readonly status: PackageStatus
    readonly phase?: number
    readonly since?: string
  },
): CatalogueEntry {
  return {
    id: manifest.id,
    name: manifest.displayName,
    description: manifest.description,
    category: manifest.category,
    popular: manifest.popular,
    published: extra.published,
    frameworkRange: manifest.framework,
    package: extra.name,
    followUps: manifest.questions,
    kind: manifest.kind,
    origin: extra.origin,
    tags: [...manifest.tags].sort(byCodeUnit),
    docs: manifest.docs,
    version: extra.version,
    verified: extra.verified,
    versions: extra.versions,
    compatibility: extra.compatibility,
    requires: [...manifest.requires].sort(byCodeUnit),
    conflicts: [...manifest.conflicts].sort(byCodeUnit),
    installs: manifest.installs,
    ...(manifest.deprecated === undefined ? {} : { deprecated: manifest.deprecated }),
    status: extra.status,
    ...(extra.phase === undefined ? {} : { phase: extra.phase }),
    ...(extra.since === undefined ? {} : { since: extra.since }),
  }
}

/** Without a hub record: released means available, otherwise it is on the roadmap. */
const defaultStatus = (published: boolean): PackageStatus => (published ? 'available' : 'planned')

/**
 * The hub's lifecycle data must agree with the packages: every record names a listed package,
 * statuses match the release state, history never lists a package that is still listed, and
 * every replacement exists.
 */
function lifecycleProblems(
  packages: readonly { readonly name: string; readonly latest: ValidPackage; readonly snapshot: VersionSnapshot; readonly published: boolean }[],
  hub: HubConfig,
): BuildProblem[] {
  const problems: BuildProblem[] = []
  const hubProblem = (path: string, message: string): void => {
    problems.push({ package: 'hub.json', source: 'hub.json', path, message })
  }
  const byId = new Map(packages.map((entry) => [entry.latest.manifest.id, entry] as const))
  const names = new Set(packages.map((entry) => entry.name))
  for (const id of Object.keys(hub.lifecycle).sort(byCodeUnit)) {
    if (!byId.has(id)) hubProblem(`lifecycle.${id}`, `"${id}" is not a package in the catalogue`)
  }
  for (const entry of packages) {
    const status = hub.lifecycle[entry.latest.manifest.id]?.status ?? defaultStatus(entry.published)
    const problem = statusProblem(status, entry.published)
    if (problem !== undefined) problems.push({ package: entry.name, source: 'hub.json', path: `lifecycle.${entry.latest.manifest.id}.status`, message: problem })
  }
  const seen = new Set<string>()
  hub.history.forEach((item, index) => {
    if (seen.has(item.package)) hubProblem(`history[${index}]`, `lists ${item.package} twice`)
    seen.add(item.package)
    if (names.has(item.package)) hubProblem(`history[${index}]`, `${item.package} is still listed in the catalogue; a ${item.status} package must not be`)
    for (const replacement of item.replacement?.packages ?? []) {
      if (!names.has(replacement)) hubProblem(`history[${index}].replacement`, `${replacement} is not in the catalogue, so it cannot replace ${item.package}`)
    }
  })
  return problems
}

/** Framework lines (`0.2`), oldest first, each with its newest known version. */
export function frameworkLines(versions: readonly string[]): { line: string; latest: string }[] {
  const latest = new Map<string, string>()
  for (const version of versions) {
    const line = frameworkLine(version)
    if (line === undefined) continue
    const current = latest.get(line)
    if (current === undefined || compareVersions(version, current) > 0) latest.set(line, version)
  }
  return [...latest]
    .map(([line, newest]) => ({ line, latest: newest }))
    .sort((a, b) => compareVersions(`${a.line}.0`, `${b.line}.0`))
}

/**
 * Two packages that can be installed together must not write the same file, register the same
 * route or command, publish the same migration, or own the same screen. Packages that declare a
 * conflict with each other, and designs (only one is ever installed), are exempt.
 */
function collisions(packages: readonly { readonly name: string; readonly source: string; readonly manifest: Manifest }[]): BuildProblem[] {
  const claims = new Map<string, { readonly name: string; readonly source: string; readonly manifest: Manifest }[]>()
  for (const entry of packages) {
    const { installs } = entry.manifest
    const keys = [
      ...installs.config.map((path) => `the file ${path}`),
      ...installs.migrations.map((name) => `the migration ${name}`),
      ...installs.commands.map((command) => `the command ${command.name}`),
      ...installs.routes.map((route) => `the route ${route.method} ${route.path}`),
      ...installs.screens.map((screen) => `the screen ${screen.path}`),
    ]
    for (const key of new Set(keys)) claims.set(key, [...(claims.get(key) ?? []), entry])
  }
  const problems: BuildProblem[] = []
  for (const [what, claimants] of [...claims].sort(([a], [b]) => byCodeUnit(a, b))) {
    for (let i = 0; i < claimants.length; i += 1) {
      for (let j = i + 1; j < claimants.length; j += 1) {
        const a = claimants[i]
        const b = claimants[j]
        if (a === undefined || b === undefined) continue
        const exclusive =
          a.manifest.conflicts.includes(b.manifest.id) ||
          b.manifest.conflicts.includes(a.manifest.id) ||
          (a.manifest.kind === 'design' && b.manifest.kind === 'design')
        if (!exclusive) {
          problems.push({
            package: a.name,
            source: a.source,
            path: 'strutvane.installs',
            message: `${b.name} also installs ${what}; rename one, or declare a conflict if they can never be installed together`,
          })
        }
      }
    }
  }
  return problems
}

const sourceOf = (packages: readonly { readonly name: string; readonly snapshot: VersionSnapshot }[], name: string): string =>
  packages.find((entry) => entry.name === name)?.snapshot.source ?? name

/**
 * The text a person reads when the build fails: a summary, then problems grouped by package.
 */
export function formatBuildProblems(problems: readonly BuildProblem[]): string {
  const groups = new Map<string, BuildProblem[]>()
  for (const problem of problems) {
    const key = `${problem.package}${problem.source !== problem.package ? ` (${problem.source})` : ''}`
    groups.set(key, [...(groups.get(key) ?? []), problem])
  }
  const count = groups.size
  const lines = [`The catalogue was not built: ${count} ${count === 1 ? 'package has' : 'packages have'} problems. Nothing was written.`, '']
  for (const [label, list] of [...groups].sort(([a], [b]) => byCodeUnit(a, b))) {
    lines.push(`  ${label}`)
    for (const problem of list) lines.push(`    - ${problem.path === '' ? '' : `${problem.path}: `}${problem.message}`)
    lines.push('')
  }
  return lines.join('\n').trimEnd()
}

/**
 * The index as text: two-space JSON with a final newline. Always use this to write the file, so
 * the bytes (not just the data) are deterministic.
 */
export function serializeCatalogue(index: CatalogueIndex): string {
  return `${JSON.stringify(index, null, 2)}\n`
}
