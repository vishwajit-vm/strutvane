/**
 * Merge `source.json` with the npm snapshot into the inputs of the (pure) builder: one
 * {@link VersionSnapshot} per listed version and the {@link HubConfig}.
 *
 * Rules, and why:
 * - **Only full releases count as published.** Pre-releases (`0.2.0-next.0`) and name
 *   placeholders (`0.0.0-reserved.0`) are never offered by the installer.
 * - **A real manifest wins.** A release whose `strutvane` block has `manifestVersion` is passed to
 *   the builder as published (the runtime keys `compat`, `commands`, … are set aside first; they
 *   are checked by `checks/conformance.ts`). Every manifest rule then applies to it.
 * - **Otherwise the source speaks for the package.** A release without a catalogue manifest, or a
 *   package with no release at all, gets a manifest made from its source entry (name, description,
 *   category, docs, …, with nothing installed and no questions). Its framework range comes from,
 *   in order: `strutvane.compat`, `peerDependencies["@strutvane/framework"]`, the source.
 * - **A package with no full release** is listed with one working copy, version `0.0.0`, marked
 *   unpublished (the installer offers it only with `--preview-catalogue`).
 *
 * @module
 */
import { buildCatalogue, type BuildResult } from '../catalogue/build.ts'
import type { HubConfig, VersionSnapshot } from '../catalogue/sources.ts'
import { hubConfigSchema } from '../catalogue/sources.ts'
import type { HistoryItem, PackageStatus } from '../catalogue/index-schema.ts'
import { MANIFEST_VERSION, VERSION } from '../manifest/rules.ts'
import { isSupportedRange } from '../manifest/semver-range.ts'
import type { NpmSnapshot, NpmVersion } from '../live/npm.ts'
import { compareAnyVersions } from '../checks/prerelease.ts'
import { LISTED_STATUSES, repoUrl, type Source, type SourceEntry, type SourceStatus } from './schema.ts'

/** The keys of the framework's runtime `strutvane` block (console/project/contributions.ts). */
export const RUNTIME_KEYS: ReadonlySet<string> = new Set(['allowConsole', 'commands', 'compat', 'installer', 'migrations', 'templates'])

/** The version an unpublished working copy is listed with. */
export const UNPUBLISHED_VERSION = '0.0.0'

/** The npm name every framework range refers to. */
export const FRAMEWORK_PACKAGE = '@strutvane/framework'

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** The catalogue status for a source status (only listed statuses reach this). */
export function indexStatus(status: SourceStatus): PackageStatus {
  if (status === 'released') return 'available'
  if (status === 'in-development' || status === 'planned' || status === 'shelved') return status
  return 'planned'
}

/** Does this `strutvane` block carry a catalogue manifest (format 1)? */
export const hasCatalogueManifest = (block: unknown): block is Record<string, unknown> => isRecord(block) && 'manifestVersion' in block

/** The catalogue part of a block: everything except the framework's runtime keys. */
export function catalogueKeys(block: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(block).filter(([key]) => !RUNTIME_KEYS.has(key)))
}

/** The framework range one release declares, or `undefined` when it declares none we understand. */
export function declaredFrameworkRange(meta: NpmVersion): string | undefined {
  const block = meta.strutvane
  const compat = isRecord(block) ? block['compat'] : undefined
  if (typeof compat === 'string' && isSupportedRange(compat)) return compat
  const peer = meta.peerDependencies?.[FRAMEWORK_PACKAGE]
  if (peer !== undefined && isSupportedRange(peer)) return peer
  return undefined
}

/** A catalogue manifest made from a source entry. */
export function manifestFromSource(entry: SourceEntry, framework: string): Record<string, unknown> {
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
    framework,
  }
}

/** Full, non-placeholder releases of a package, newest first. */
export function fullReleases(versions: Readonly<Record<string, NpmVersion>>): string[] {
  return Object.keys(versions)
    .filter((version) => VERSION.test(version) && version !== '0.0.0')
    .sort(compareAnyVersions)
    .reverse()
}

/** The source entries that become `catalogue.json` entries. */
export const listedEntries = (source: Source): SourceEntry[] =>
  source.packages.filter((entry) => (entry.kind === 'package' || entry.kind === 'design') && LISTED_STATUSES.has(entry.status) && entry.npm !== null)

/**
 * The builder's inputs.
 *
 * @example
 * const { snapshots, hub } = mergeSource(source, npmSnapshot)
 * const { index } = buildCatalogue(snapshots, hub)
 */
export function mergeSource(source: Source, npm: NpmSnapshot): { readonly snapshots: VersionSnapshot[]; readonly hub: HubConfig } {
  const snapshots: VersionSnapshot[] = []
  for (const entry of listedEntries(source)) {
    const name = entry.npm ?? ''
    const fallbackRange = entry.framework ?? '*'
    const state = npm.packages[name] ?? null
    const releases = state === null ? [] : fullReleases(state.versions)
    let usable = 0
    for (const version of releases) {
      const meta = state?.versions[version] ?? {}
      const block = meta.strutvane
      const packageJson = hasCatalogueManifest(block)
        ? { name, version, ...(meta.peerDependencies === undefined ? {} : { peerDependencies: meta.peerDependencies }), strutvane: catalogueKeys(block) }
        : { name, version, strutvane: manifestFromSource(entry, declaredFrameworkRange(meta) ?? fallbackRange) }
      const deprecated = meta.deprecated !== undefined
      if (!deprecated) usable += 1
      snapshots.push({ source: `npm:${name}@${version}`, packageJson, published: true, npmDeprecated: deprecated })
    }
    if (usable === 0) {
      snapshots.push({
        source: `source.json#${entry.id}`,
        packageJson: { name, version: UNPUBLISHED_VERSION, strutvane: manifestFromSource(entry, fallbackRange) },
        published: false,
      })
    }
  }

  const frameworkState = npm.packages[FRAMEWORK_PACKAGE] ?? null
  const frameworkVersions = [
    ...source.framework.lines.map((line) => `${line}.0`),
    ...(frameworkState === null ? [] : fullReleases(frameworkState.versions)),
  ]
  const lifecycle: Record<string, { status: PackageStatus; phase?: number; since?: string }> = {}
  for (const entry of listedEntries(source)) {
    lifecycle[entry.id] = {
      status: indexStatus(entry.status),
      ...(entry.phase === undefined ? {} : { phase: entry.phase }),
      ...(entry.since === undefined ? {} : { since: entry.since }),
    }
  }
  const history: HistoryItem[] = source.packages
    .filter((entry) => (entry.kind === 'package' || entry.kind === 'design') && entry.npm !== null && !LISTED_STATUSES.has(entry.status))
    .map((entry) => ({
      package: entry.npm ?? '',
      name: entry.name,
      status: entry.status === 'retired' ? 'retired' : 'shelved',
      ...(entry.since === undefined ? {} : { since: entry.since }),
      ...(entry.date === undefined ? {} : { date: entry.date }),
      note: entry.note ?? '',
      ...(entry.replacement === undefined ? {} : { replacement: entry.replacement }),
    }))
  const hub = hubConfigSchema.parse({
    hubVersion: 1,
    categories: source.categories,
    framework: { versions: frameworkVersions },
    lifecycle,
    history,
    packages: [],
  })
  return { snapshots, hub }
}

/**
 * Build `catalogue.json` from the source and the npm snapshot: {@link mergeSource}, then the pure
 * builder, then the hub's own additions (each entry's repository URL). Throws
 * `CatalogueBuildError` listing every problem; nothing is half-built.
 *
 * @example
 * const { index, warnings } = buildFromSource(source, npmSnapshot)
 * await writeFile('catalogue.json', serializeCatalogue(index))
 */
export function buildFromSource(source: Source, npm: NpmSnapshot): BuildResult {
  const { snapshots, hub } = mergeSource(source, npm)
  const result = buildCatalogue(snapshots, hub)
  const repos = new Map(listedEntries(source).map((entry) => [entry.npm ?? '', entry.repo] as const))
  const entries = result.index.entries.map((entry) => {
    const repo = repos.get(entry.package)
    return repo === undefined || repo === null ? entry : { ...entry, repo: repoUrl(source, repo) }
  })
  return { index: { ...result.index, entries }, warnings: result.warnings }
}
