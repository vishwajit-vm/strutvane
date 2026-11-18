/**
 * Live npm data, and the recorded copy of it (`snapshots/npm.json`) that `--offline` replays.
 *
 * Why a recorded copy: pull-request CI must be deterministic and must not depend on the registry
 * being up. The nightly online build fetches the registry, keeps only the fields the catalogue
 * reads (dist-tags, and per version: `deprecated`, `peerDependencies`, the `strutvane` block and
 * `repository`), and writes them here. Offline runs read the same file, so a PR sees exactly the
 * npm state the last nightly saw.
 *
 * Everything read from the registry is untrusted: the packument is shape-checked, only the named
 * package is accepted, and the per-version data is reduced to the four fields above.
 *
 * @module
 */
import { z } from 'zod'
import { byCodeUnit } from '../graph.ts'
import { packageOrigin } from '../manifest/rules.ts'
import { compareAnyVersions } from '../checks/prerelease.ts'

/** What the catalogue keeps of one published version. */
export const npmVersionSchema = z.strictObject({
  deprecated: z.string().max(1_000).optional(),
  peerDependencies: z.record(z.string().max(214), z.string().max(200)).optional(),
  strutvane: z.unknown().optional(),
  repository: z.string().max(300).optional(),
})
export type NpmVersion = z.output<typeof npmVersionSchema>

/** What the catalogue keeps of one package. `null` in the snapshot means "not on npm" (HTTP 404). */
export const npmPackageSchema = z.strictObject({
  distTags: z.record(z.string().max(64), z.string().max(64)),
  versions: z.record(z.string().max(64), npmVersionSchema),
})
export type NpmPackage = z.output<typeof npmPackageSchema>

/** The recorded registry state. */
export const npmSnapshotSchema = z.strictObject({
  snapshotVersion: z.literal(1),
  registry: z.string().max(200),
  packages: z.record(z.string().max(214), npmPackageSchema.nullable()),
})
export type NpmSnapshot = z.output<typeof npmSnapshotSchema>

/** At most this many versions are kept per package, newest first. */
export const MAX_VERSIONS = 50

/** The registry the nightly job reads. */
export const NPM_REGISTRY = 'https://registry.npmjs.org'

/** The answer of one registry request: a parsed JSON body, or "this package does not exist". */
export type RegistryAnswer = { readonly status: 'found'; readonly body: unknown } | { readonly status: 'missing' }

/** Fetches one packument. Injected, so tests never touch the network. */
export type FetchPackument = (url: string) => Promise<RegistryAnswer>

const packumentSchema = z.looseObject({
  name: z.string(),
  'dist-tags': z.record(z.string(), z.string()).optional(),
  versions: z.record(z.string(), z.looseObject({})).optional(),
})

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

/** `repository` may be a string or `{ type, url }`; keep the URL only. */
function repositoryOf(value: unknown): string | undefined {
  if (typeof value === 'string') return value.slice(0, 300)
  if (isRecord(value) && typeof value['url'] === 'string') return value['url'].slice(0, 300)
  return undefined
}

/** Peer ranges, keeping only string values. */
function peersOf(value: unknown): Record<string, string> | undefined {
  if (!isRecord(value)) return undefined
  const peers: Record<string, string> = {}
  for (const key of Object.keys(value).sort(byCodeUnit)) {
    const range = value[key]
    if (typeof range === 'string') peers[key.slice(0, 214)] = range.slice(0, 200)
  }
  return peers
}

/**
 * Reduce a registry packument to what the catalogue keeps. Throws when the answer is not a
 * packument for `name` (a registry, proxy or attacker answering for another package).
 */
export function reducePackument(name: string, raw: unknown): NpmPackage {
  const parsed = packumentSchema.safeParse(raw)
  if (!parsed.success || parsed.data.name !== name) throw new Error(`the npm registry answer is not a package document for ${name}`)
  const distTags: Record<string, string> = {}
  const tags = parsed.data['dist-tags'] ?? {}
  for (const tag of Object.keys(tags).sort(byCodeUnit)) {
    const version = tags[tag]
    if (version !== undefined) distTags[tag] = version
  }
  const all = parsed.data.versions ?? {}
  const kept = Object.keys(all).sort(compareAnyVersions).reverse().slice(0, MAX_VERSIONS)
  const versions: Record<string, NpmVersion> = {}
  for (const version of kept) {
    const meta = all[version] ?? {}
    const deprecated = meta['deprecated']
    const peers = peersOf(meta['peerDependencies'])
    const repository = repositoryOf(meta['repository'])
    versions[version] = {
      ...(typeof deprecated === 'string' ? { deprecated: deprecated.slice(0, 1_000) } : {}),
      ...(peers === undefined ? {} : { peerDependencies: peers }),
      ...(meta['strutvane'] === undefined ? {} : { strutvane: meta['strutvane'] }),
      ...(repository === undefined ? {} : { repository }),
    }
  }
  return { distTags, versions }
}

/**
 * Read every named package from the registry. A package npm does not know is recorded as `null`.
 * A network or registry failure throws: a half-read registry must never become a catalogue that
 * silently "un-releases" packages (fail closed).
 *
 * @example
 * const snapshot = await readNpm(['@strutvane/framework'], fetchPackumentOverHttp())
 */
export async function readNpm(names: readonly string[], fetchPackument: FetchPackument, registry = NPM_REGISTRY): Promise<NpmSnapshot> {
  const packages: Record<string, NpmPackage | null> = {}
  const sorted = [...new Set(names)].sort(byCodeUnit)
  for (const name of sorted) {
    if (packageOrigin(name) === undefined) throw new Error(`"${name}" is not a Strutvane package name; refusing to ask the registry for it`)
    // Scoped names keep the "@" and encode the "/" (npm registry convention).
    const answer = await fetchPackument(`${registry}/${name.replace('/', '%2f')}`)
    packages[name] = answer.status === 'missing' ? null : reducePackument(name, answer.body)
  }
  return { snapshotVersion: 1, registry, packages }
}

/**
 * The real registry over HTTPS: 20-second timeout per request, two retries on network errors and
 * 5xx answers, 404 means "not on npm". Anything else throws.
 */
export function fetchPackumentOverHttp(options: { readonly timeoutMs?: number; readonly retries?: number } = {}): FetchPackument {
  const timeoutMs = options.timeoutMs ?? 20_000
  const retries = options.retries ?? 2
  return async (url) => {
    let lastError: unknown
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const response = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(timeoutMs) })
        if (response.status === 404) return { status: 'missing' }
        if (response.ok) return { status: 'found', body: (await response.json()) as unknown }
        lastError = new Error(`HTTP ${response.status} from ${url}`)
        if (response.status < 500) break
      } catch (error) {
        lastError = error
      }
    }
    throw new Error(`could not read ${url}: ${lastError instanceof Error ? lastError.message : String(lastError)}`)
  }
}

/** The snapshot as text: two-space JSON with a final newline, keys already sorted. */
export function serializeSnapshot(snapshot: unknown): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`
}
