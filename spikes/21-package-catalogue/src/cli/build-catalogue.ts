/**
 * `npm run build-catalogue`: build `catalogue.json` (blueprint §3.3 item 2).
 *
 * ```text
 * node src/cli/build-catalogue.ts                 # seed data → seed/catalogue.json
 * node src/cli/build-catalogue.ts --check         # fail when seed/catalogue.json is out of date (CI)
 * node src/cli/build-catalogue.ts --npm --out x   # hub CI: read every hub package from npm
 * ```
 *
 * Exit codes: 0 built (or up to date), 1 invalid manifests (nothing written), 2 `--check` found
 * the committed file out of date, 3 bad arguments or unreadable hub config.
 *
 * @module
 */
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { buildCatalogue, CatalogueBuildError, serializeCatalogue } from '../catalogue/build.ts'
import { hubConfigSchema, localRegistrySchema, readLocalPackages, readNpmPackages } from '../catalogue/sources.ts'

const root = resolve(import.meta.dirname, '../..')
const parse = () =>
  parseArgs({
    options: {
      hub: { type: 'string', default: 'seed/hub.json' },
      packages: { type: 'string', default: 'seed/manifests' },
      registry: { type: 'string', default: 'seed/registry.json' },
      out: { type: 'string', default: 'seed/catalogue.json' },
      check: { type: 'boolean', default: false },
      npm: { type: 'boolean', default: false },
    },
    strict: true,
  })
let parsed: ReturnType<typeof parse>
try {
  parsed = parse()
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exit(3)
}
const { values } = parsed

const readJson = async (path: string): Promise<unknown> => JSON.parse(await readFile(resolve(root, path), 'utf8')) as unknown
const hub = hubConfigSchema.safeParse(await readJson(values.hub).catch(() => undefined))
if (!hub.success) {
  process.stderr.write(`${values.hub} is missing or malformed: ${hub.error.issues[0]?.message ?? 'unknown problem'}\n`)
  process.exit(3)
}

const snapshots = values.npm
  ? await readNpmPackages(hub.data.packages, {
      fetchJson: async (url) => {
        const response = await fetch(url, { headers: { accept: 'application/json' } })
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json() as Promise<unknown>
      },
    })
  : await readLocalPackages(resolve(root, values.packages), {
      registry: localRegistrySchema.parse(await readJson(values.registry)),
      relativeTo: root,
    })

try {
  const { index, warnings } = buildCatalogue(snapshots, hub.data)
  for (const warning of warnings) process.stderr.write(`note: ${warning}\n`)
  const text = serializeCatalogue(index)
  const outPath = resolve(root, values.out)
  if (values.check) {
    const current = await readFile(outPath, 'utf8').catch(() => '')
    if (current !== text) {
      process.stderr.write(`${values.out} is out of date. Run: npm run build-catalogue\n`)
      process.exit(2)
    }
    process.stdout.write(`${values.out} is up to date (${index.entries.length} packages).\n`)
  } else {
    await writeFile(outPath, text, 'utf8')
    process.stdout.write(`Wrote ${values.out}: ${index.entries.length} packages, ${index.entries.filter((e) => e.published).length} published.\n`)
  }
} catch (error) {
  if (error instanceof CatalogueBuildError) {
    process.stderr.write(`${error.message}\n`)
    process.exit(1)
  }
  throw error
}
