/**
 * Small builders for source entries, sources and npm snapshots.
 */
import type { NpmPackage, NpmSnapshot, NpmVersion } from '../src/live/npm.ts'
import { parseSource, type Source } from '../src/source/schema.ts'

/** A listed first-party package entry for `id`. */
export function entry(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id,
    name: id.slice(0, 1).toUpperCase() + id.slice(1).replaceAll('-', ' '),
    description: `The ${id} package`,
    kind: 'package',
    npm: `@strutvane/${id}`,
    repo: `strutvane-${id}`,
    status: 'planned',
    phase: 3,
    category: 'data',
    docs: `https://github.com/vishwajit-vm/strutvane-${id}#readme`,
    framework: '^0.2',
    ...extra,
  }
}

/** The framework entry every realistic source has. */
export const frameworkEntry = (extra: Record<string, unknown> = {}): Record<string, unknown> =>
  entry('framework', { category: 'core', status: 'in-development', phase: 1, since: '0.2', ...extra })

/** A raw source document (not yet parsed). */
export function rawSource(packages: readonly Record<string, unknown>[], extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    sourceVersion: 1,
    org: 'vishwajit-vm',
    categories: [
      { id: 'data', name: 'Data', pickable: true },
      { id: 'operations', name: 'Operations', pickable: true },
      { id: 'design', name: 'Designs', pickable: false },
      { id: 'core', name: 'Core', pickable: false },
    ],
    framework: { lines: ['0.2', '0.3'] },
    packages,
    ...extra,
  }
}

/** A parsed source; throws with every problem when it is invalid. */
export function source(packages: readonly Record<string, unknown>[], extra: Record<string, unknown> = {}): Source {
  const result = parseSource(rawSource(packages, extra))
  if (!result.ok) throw new Error(result.problems.map((p) => `${p.path}: ${p.message}`).join('\n'))
  return result.source
}

/** One npm package: the given versions, `latest` on the newest full release unless set. */
export function npmPackage(versions: Record<string, NpmVersion>, distTags: Record<string, string> = {}): NpmPackage {
  return { distTags: { latest: '0.0.0-reserved.0', ...distTags }, versions: { '0.0.0-reserved.0': {}, ...versions } }
}

/** An npm snapshot; every source name not given is "reserved only". */
export function npm(src: Source, packages: Record<string, NpmPackage | null> = {}): NpmSnapshot {
  const all: Record<string, NpmPackage | null> = { '@strutvane/framework': npmPackage({}) }
  for (const item of src.packages) if (item.npm !== null) all[item.npm] = npmPackage({})
  return { snapshotVersion: 1, registry: 'https://registry.npmjs.org', packages: { ...all, ...packages } }
}
