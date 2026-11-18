/**
 * Where manifests come from. The builder itself is pure ({@link buildCatalogue} in `build.ts`);
 * these readers turn the outside world into a list of {@link VersionSnapshot}s:
 *
 * - {@link readLocalPackages}: `package.json` files in folders (tests, the seed data, and a
 *   contributor checking their manifest before publishing);
 * - {@link readNpmPackages}: the npm registry, for hub CI (every version of every listed
 *   package, from the registry's per-version metadata).
 *
 * Both treat what they read as untrusted: size caps before parsing, no symlinks followed, and a
 * read failure becomes a reported problem rather than a crash.
 *
 * @module
 */
import { lstat, readdir, readFile } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { z } from 'zod'
import { LIMITS, VERSION, packageOrigin } from '../manifest/rules.ts'
import { compareVersions } from '../manifest/semver-range.ts'
import { STATUSES, categorySchema, historySchema, lineSchema } from './index-schema.ts'

/** One version of one package, as read. */
export interface VersionSnapshot {
  /** Where it came from, for messages: a file path or `npm:<name>@<version>`. */
  readonly source: string
  /** The parsed `package.json` (or the registry's per-version metadata). */
  readonly packageJson: unknown
  /** Released on npm. Unpublished snapshots describe planned packages and are never offered. */
  readonly published: boolean
  /** Conformance results for this version, when there are any (see `conformance.ts`). */
  readonly conformance?: unknown
  /** Set when the file could not be read or parsed; the builder reports it. */
  readonly readProblem?: string
  /** npm marked this version deprecated: it is left out of the version list. */
  readonly npmDeprecated?: boolean
}

// ── Hub configuration ────────────────────────────────────────────────────────────────────────

/**
 * The hub's own, curated input (`seed/hub.json`): categories in display order, the framework
 * versions released so far (or planned, before the first release), and which packages to list.
 */
export const hubConfigSchema = z.strictObject({
  hubVersion: z.literal(1),
  categories: z.array(categorySchema).min(1).max(50),
  framework: z.strictObject({ versions: z.array(z.string().regex(VERSION)).min(1).max(500) }),
  /**
   * Status per catalogue id (blueprint §3.3; docs site packages page). An id without a record is
   * "available" when released and "planned" otherwise.
   */
  lifecycle: z
    .record(
      z.string().max(40),
      z.strictObject({ status: z.enum(STATUSES), phase: z.int().min(1).max(20).optional(), since: lineSchema.optional() }),
    )
    .default({}),
  /** Retired packages (with replacements) and shelved ideas without a manifest. */
  history: z.array(historySchema).max(500).default([]),
  /** npm names hub CI reads (blueprint §3.3: "CI in the hub builds catalogue.json from the published manifests"). */
  packages: z
    .array(z.string().refine((name) => packageOrigin(name) !== undefined, { error: 'is not a Strutvane package name' }))
    .max(2_000),
})

export type HubConfig = z.output<typeof hubConfigSchema>

// ── Local folders ────────────────────────────────────────────────────────────────────────────

/** The registry state a local run pretends: which name@version pairs are released. */
export const localRegistrySchema = z.strictObject({
  note: z.string().max(500).optional(),
  published: z.record(z.string().max(60), z.array(z.string().regex(VERSION)).max(500)),
})

async function readCapped(path: string, maxBytes: number): Promise<string | { readonly problem: string }> {
  const info = await lstat(path).catch(() => undefined)
  if (info === undefined) return { problem: 'is missing' }
  if (info.isSymbolicLink()) return { problem: 'is a symbolic link (not followed, so a package cannot point the builder at another file)' }
  if (!info.isFile()) return { problem: 'is not a file' }
  if (info.size > maxBytes) return { problem: `is too large (${info.size} bytes; at most ${maxBytes})` }
  return readFile(path, 'utf8')
}

function parseJson(text: string): unknown | { readonly problem: string } {
  try {
    return JSON.parse(text) as unknown
  } catch (error) {
    return { problem: `is not valid JSON (${error instanceof Error ? error.message.slice(0, 120) : 'parse error'})` }
  }
}

const isProblem = (value: unknown): value is { readonly problem: string } =>
  typeof value === 'object' && value !== null && Object.keys(value).length === 1 && typeof (value as { problem?: unknown }).problem === 'string'

/**
 * Read every `<dir>/<folder>/package.json` (one folder per package version; folder names do not
 * matter), plus `conformance.json` next to it when present. `registry` says which versions count
 * as published; without it, nothing is.
 *
 * @param dir - folder of package folders
 * @param options.registry - the published state (see {@link localRegistrySchema})
 * @param options.relativeTo - paths in messages are shown relative to this folder
 */
export async function readLocalPackages(
  dir: string,
  options: { readonly registry?: z.input<typeof localRegistrySchema>; readonly relativeTo?: string } = {},
): Promise<VersionSnapshot[]> {
  const registry = localRegistrySchema.parse(options.registry ?? { published: {} })
  const folders = (await readdir(dir, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
    .map((entry) => entry.name)
    .sort()
  const snapshots: VersionSnapshot[] = []
  for (const folder of folders) {
    const file = join(dir, folder, 'package.json')
    const source = relative(options.relativeTo ?? process.cwd(), file).replaceAll('\\', '/')
    const text = await readCapped(file, LIMITS.packageJsonBytes)
    if (typeof text !== 'string') {
      snapshots.push({ source, packageJson: undefined, published: false, readProblem: `package.json ${text.problem}` })
      continue
    }
    const packageJson = parseJson(text)
    if (isProblem(packageJson)) {
      snapshots.push({ source, packageJson: undefined, published: false, readProblem: `package.json ${packageJson.problem}` })
      continue
    }
    const record = typeof packageJson === 'object' && packageJson !== null ? (packageJson as Record<string, unknown>) : {}
    const name = typeof record['name'] === 'string' ? record['name'] : ''
    const version = typeof record['version'] === 'string' ? record['version'] : ''
    const published = registry.published[name]?.includes(version) ?? false
    const conformanceText = await readCapped(join(dir, folder, 'conformance.json'), 64 * 1024)
    const conformance = typeof conformanceText === 'string' ? parseJson(conformanceText) : undefined
    snapshots.push({ source, packageJson, published, ...(conformance === undefined ? {} : { conformance }) })
  }
  return snapshots
}

// ── The npm registry ─────────────────────────────────────────────────────────────────────────

/** The part of an npm packument (`GET /<name>`) the builder reads. */
const packumentSchema = z.looseObject({
  name: z.string(),
  versions: z.record(z.string(), z.looseObject({ deprecated: z.string().optional() })),
})

/** Fetches and parses JSON; injected so tests never touch the network. */
export type FetchJson = (url: string) => Promise<unknown>

/**
 * Read every version of every named package from the npm registry.
 *
 * npm stores each version's `package.json` fields (custom fields such as `strutvane` included) in
 * the packument's `versions` map *(npm behaviour; verified for standard fields, custom fields
 * unverified as of 2026-11-15)*, so no tarball needs downloading. Only the newest 50 versions are
 * read; older ones cannot be the newest compatible version for a supported framework line.
 *
 * @example
 * const snapshots = await readNpmPackages(hub.packages, { fetchJson: async (url) => (await fetch(url)).json() })
 */
export async function readNpmPackages(
  names: readonly string[],
  options: {
    readonly fetchJson: FetchJson
    readonly registry?: string
    readonly conformanceFor?: (name: string, version: string) => Promise<unknown>
  },
): Promise<VersionSnapshot[]> {
  const registry = (options.registry ?? 'https://registry.npmjs.org').replace(/\/+$/, '')
  const snapshots: VersionSnapshot[] = []
  for (const name of [...new Set(names)].sort()) {
    const source = `npm:${name}`
    if (packageOrigin(name) === undefined) {
      snapshots.push({ source, packageJson: undefined, published: false, readProblem: `"${name}" is not a Strutvane package name` })
      continue
    }
    let raw: unknown
    try {
      // Scoped names keep the "@" and encode the "/" (npm registry convention).
      raw = await options.fetchJson(`${registry}/${name.replace('/', '%2f')}`)
    } catch (error) {
      snapshots.push({ source, packageJson: undefined, published: false, readProblem: `could not be read from npm (${error instanceof Error ? error.message.slice(0, 120) : 'error'})` })
      continue
    }
    const packument = packumentSchema.safeParse(raw)
    if (!packument.success || packument.data.name !== name) {
      snapshots.push({ source, packageJson: undefined, published: false, readProblem: 'the npm registry answer is not a package document for this name' })
      continue
    }
    const versions = Object.keys(packument.data.versions)
      .filter((version) => VERSION.test(version))
      .sort(compareVersions)
      .reverse()
      .slice(0, 50)
    for (const version of versions) {
      const packageJson = packument.data.versions[version]
      const conformance = options.conformanceFor === undefined ? undefined : await options.conformanceFor(name, version)
      snapshots.push({
        source: `npm:${name}@${version}`,
        packageJson,
        published: true,
        npmDeprecated: typeof packageJson?.deprecated === 'string',
        ...(conformance === undefined ? {} : { conformance }),
      })
    }
  }
  return snapshots
}
