/**
 * Small builders for test packages, snapshots and hub configs.
 */
import { readFile } from 'node:fs/promises'
import { buildCatalogue } from '../src/catalogue/build.ts'
import type { CatalogueIndex } from '../src/catalogue/index-schema.ts'
import { hubConfigSchema, type HubConfig, type VersionSnapshot } from '../src/catalogue/sources.ts'
import type { ManifestInput } from '../src/manifest/schema.ts'

export const root = new URL('../', import.meta.url)

/** A valid first-party package.json for `id`, with manifest overrides. */
export function pkg(
  id: string,
  manifest: Partial<Record<keyof ManifestInput, unknown>> & Record<string, unknown> = {},
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    name: `@strutvane/${id}`,
    version: '0.1.0',
    strutvane: {
      manifestVersion: 1,
      id,
      displayName: id.slice(0, 1).toUpperCase() + id.slice(1).replaceAll('-', ' '),
      description: `The ${id} package`,
      category: 'data',
      kind: 'package',
      docs: `https://github.com/vishwajit-vm/strutvane-${id}#readme`,
      framework: '^0.2',
      ...manifest,
    },
    ...extra,
  }
}

/** A snapshot of a package.json. */
export function snap(packageJson: Record<string, unknown>, options: { published?: boolean; conformance?: unknown; npmDeprecated?: boolean } = {}): VersionSnapshot {
  return {
    source: `test:${String(packageJson['name'])}@${String(packageJson['version'])}`,
    packageJson,
    published: options.published ?? false,
    ...(options.conformance === undefined ? {} : { conformance: options.conformance }),
    ...(options.npmDeprecated === undefined ? {} : { npmDeprecated: options.npmDeprecated }),
  }
}

/** A hub with a few categories and framework lines 0.1 and 0.2. */
export const testHub: HubConfig = hubConfigSchema.parse({
  hubVersion: 1,
  categories: [
    { id: 'operations', name: 'Operations', pickable: true },
    { id: 'data', name: 'Data', pickable: true },
    { id: 'money', name: 'Money', pickable: true },
    { id: 'design', name: 'Designs', pickable: false },
    { id: 'core', name: 'Core', pickable: false },
  ],
  framework: { versions: ['0.1.0', '0.1.3', '0.2.0', '0.2.4'] },
  packages: [],
})

/** Build an index from package.json objects (all published unless said otherwise). */
export function indexOf(packages: readonly Record<string, unknown>[], published = true): CatalogueIndex {
  return buildCatalogue(packages.map((packageJson) => snap(packageJson, { published })), testHub).index
}

/** Passing conformance results for a package version. */
export function passing(name: string, version: string, kits: Record<string, string> = {}): unknown {
  return {
    conformanceVersion: 1,
    package: name,
    version,
    framework: '0.2.4',
    kits: { 'installer-protocol': 'passed', security: 'passed', typecheck: 'passed', ...kits },
  }
}

/** The committed seed index. */
export async function seedIndex(): Promise<CatalogueIndex> {
  return JSON.parse(await readFile(new URL('test/fixtures/seed/catalogue.json', root), 'utf8')) as CatalogueIndex
}

/** Fisher-Yates with a seeded random, for deterministic shuffles inside property tests. */
export function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    const a = copy[i] as T
    copy[i] = copy[j] as T
    copy[j] = a
  }
  return copy
}
