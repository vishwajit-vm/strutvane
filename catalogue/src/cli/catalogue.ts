/**
 * The catalogue command line.
 *
 * ```text
 * node src/cli/catalogue.ts build                     # read npm, record snapshots/npm.json, write catalogue.json
 * node src/cli/catalogue.ts build --offline --check   # PR CI: replay snapshots/npm.json; fail if catalogue.json is stale
 * node src/cli/catalogue.ts check --docs <dir>        # read the org's repos (gh), record snapshots/repos.json, run every check
 * node src/cli/catalogue.ts check --offline --docs <dir>
 * node src/cli/catalogue.ts check-manifest <package.json> [--framework 0.2.0-next.1]
 * ```
 *
 * Exit codes: 0 done; 1 problems found (source, build or checks; nothing written on a failed
 * build); 2 `--check` found `catalogue.json` out of date; 3 bad arguments or an unreadable input.
 *
 * @module
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { CatalogueBuildError, serializeCatalogue } from '../catalogue/build.ts'
import { checkBlock } from '../checks/manifest-block.ts'
import { checkDocs, readDocsPackages } from '../checks/docs.ts'
import { formatFindings, type Finding } from '../checks/findings.ts'
import { checkNpm } from '../checks/npm-state.ts'
import { checkRepos } from '../checks/repos.ts'
import { fetchPackumentOverHttp, npmSnapshotSchema, readNpm, serializeSnapshot, type NpmSnapshot } from '../live/npm.ts'
import { listReposWithGh, readRepos, repoSnapshotSchema, type RepoSnapshot } from '../live/repos.ts'
import { buildFromSource, FRAMEWORK_PACKAGE } from '../source/merge.ts'
import { parseSource, type Source } from '../source/schema.ts'

const root = resolve(import.meta.dirname, '../..')

/** Thrown for exit code 3 (bad input); printed without a stack. */
class UsageError extends Error {}

const out = (text: string): void => {
  process.stdout.write(text.endsWith('\n') ? text : `${text}\n`)
}
const err = (text: string): void => {
  process.stderr.write(text.endsWith('\n') ? text : `${text}\n`)
}

async function readJson(path: string, what: string): Promise<unknown> {
  let text: string
  try {
    text = await readFile(path, 'utf8')
  } catch {
    throw new UsageError(`${what} (${path}) is missing`)
  }
  try {
    return JSON.parse(text) as unknown
  } catch {
    throw new UsageError(`${what} (${path}) is not valid JSON`)
  }
}

/** Write only when the bytes change, so an unchanged nightly run leaves git clean. */
async function writeIfChanged(path: string, text: string): Promise<boolean> {
  const current = await readFile(path, 'utf8').catch(() => undefined)
  if (current === text) return false
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, text, 'utf8')
  return true
}

async function loadSource(path: string): Promise<Source> {
  const result = parseSource(await readJson(path, 'source.json'))
  if (!result.ok) {
    err(`source.json has problems; nothing was built:\n${result.problems.map((p) => `  - ${p.path}: ${p.message}`).join('\n')}`)
    process.exit(1)
  }
  return result.source
}

/** Every npm name the catalogue reads: all source packages plus the framework. */
const npmNames = (source: Source): string[] => [
  ...new Set([FRAMEWORK_PACKAGE, ...source.packages.flatMap((entry) => (entry.npm === null ? [] : [entry.npm]))]),
]

async function loadNpm(source: Source, path: string, offline: boolean): Promise<NpmSnapshot> {
  if (offline) {
    const parsed = npmSnapshotSchema.safeParse(await readJson(path, 'The npm snapshot'))
    if (!parsed.success) throw new UsageError(`The npm snapshot (${path}) is malformed: ${parsed.error.issues[0]?.message ?? 'unknown problem'}`)
    return parsed.data
  }
  const snapshot = await readNpm(npmNames(source), fetchPackumentOverHttp())
  const changed = await writeIfChanged(path, serializeSnapshot(snapshot))
  out(`${changed ? 'Updated' : 'Unchanged:'} ${relative(path)} (${Object.keys(snapshot.packages).length} npm names read)`)
  return snapshot
}

async function loadRepos(source: Source, path: string, offline: boolean): Promise<RepoSnapshot> {
  if (offline) {
    const parsed = repoSnapshotSchema.safeParse(await readJson(path, 'The repo snapshot'))
    if (!parsed.success) throw new UsageError(`The repo snapshot (${path}) is malformed: ${parsed.error.issues[0]?.message ?? 'unknown problem'}`)
    return parsed.data
  }
  const snapshot = await readRepos(source.org, listReposWithGh)
  const changed = await writeIfChanged(path, serializeSnapshot(snapshot))
  out(`${changed ? 'Updated' : 'Unchanged:'} ${relative(path)} (${snapshot.repos.length} repositories in ${source.org})`)
  return snapshot
}

const relative = (path: string): string => path.replace(`${root}${path.includes('\\') ? '\\' : '/'}`, '').replaceAll('\\', '/')

async function build(args: readonly string[]): Promise<number> {
  const { values } = parseArgs({
    args: [...args],
    options: {
      offline: { type: 'boolean', default: false },
      check: { type: 'boolean', default: false },
      source: { type: 'string', default: 'source.json' },
      out: { type: 'string', default: 'catalogue.json' },
      'npm-snapshot': { type: 'string', default: 'snapshots/npm.json' },
    },
    strict: true,
  })
  const source = await loadSource(resolve(root, values.source))
  const npm = await loadNpm(source, resolve(root, values['npm-snapshot']), values.offline)
  let text: string
  try {
    const { index, warnings } = buildFromSource(source, npm)
    for (const warning of warnings) err(`note: ${warning}`)
    text = serializeCatalogue(index)
    const outPath = resolve(root, values.out)
    if (values.check) {
      const current = await readFile(outPath, 'utf8').catch(() => '')
      if (current !== text) {
        err(`${values.out} is out of date with source.json and the npm snapshot. Run: node src/cli/catalogue.ts build --offline`)
        return 2
      }
      out(`${values.out} is up to date (${index.entries.length} packages, ${index.history.length} in history).`)
      return 0
    }
    const changed = await writeIfChanged(outPath, text)
    out(`${changed ? 'Wrote' : 'Unchanged:'} ${values.out}: ${index.entries.length} packages (${index.entries.filter((e) => e.published).length} published), ${index.history.length} in history.`)
    return 0
  } catch (error) {
    if (error instanceof CatalogueBuildError) {
      err(error.message)
      return 1
    }
    throw error
  }
}

async function check(args: readonly string[]): Promise<number> {
  const { values } = parseArgs({
    args: [...args],
    options: {
      offline: { type: 'boolean', default: false },
      docs: { type: 'string' },
      source: { type: 'string', default: 'source.json' },
      'npm-snapshot': { type: 'string', default: 'snapshots/npm.json' },
      'repos-snapshot': { type: 'string', default: 'snapshots/repos.json' },
    },
    strict: true,
  })
  const source = await loadSource(resolve(root, values.source))
  // npm is always read from the snapshot here: the online `build` refreshes it first, so build
  // and check judge the very same registry state.
  const npm = await loadNpm(source, resolve(root, values['npm-snapshot']), true)
  const repos = await loadRepos(source, resolve(root, values['repos-snapshot']), values.offline)
  const findings: Finding[] = [...checkNpm(source, npm), ...checkRepos(source, repos)]
  if (values.docs === undefined) {
    out('docs check skipped (pass --docs <strutvane-docs checkout> to run it)')
  } else {
    findings.push(...checkDocs(source, await readDocsPackages(resolve(process.cwd(), values.docs))))
  }
  out(formatFindings(findings))
  return findings.some((finding) => finding.severity === 'error') ? 1 : 0
}

async function checkManifest(args: readonly string[]): Promise<number> {
  const { values, positionals } = parseArgs({
    args: [...args],
    options: { framework: { type: 'string' } },
    allowPositionals: true,
    strict: true,
  })
  const file = positionals[0]
  if (file === undefined || positionals.length > 1) throw new UsageError('usage: check-manifest <package.json> [--framework <version>]')
  const raw = await readJson(resolve(process.cwd(), file), 'package.json')
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new UsageError(`${file} is not a JSON object`)
  const pkg = raw as Record<string, unknown>
  const name = typeof pkg['name'] === 'string' ? pkg['name'] : '(no name)'
  const version = typeof pkg['version'] === 'string' ? pkg['version'] : '(no version)'
  if (pkg['strutvane'] === undefined) {
    out(`${name}@${version} has no strutvane block; nothing to check.`)
    return 0
  }
  const peers = pkg['peerDependencies']
  const peerDependencies =
    typeof peers === 'object' && peers !== null && !Array.isArray(peers)
      ? Object.fromEntries(Object.entries(peers).filter((pair): pair is [string, string] => typeof pair[1] === 'string'))
      : undefined
  const findings = checkBlock(pkg['strutvane'], { name, version, peerDependencies, frameworkVersion: values.framework })
  out(formatFindings(findings))
  return findings.some((finding) => finding.severity === 'error') ? 1 : 0
}

const [command, ...rest] = process.argv.slice(2)
try {
  const code =
    command === 'build' ? await build(rest) : command === 'check' ? await check(rest) : command === 'check-manifest' ? await checkManifest(rest) : undefined
  if (code === undefined) throw new UsageError('usage: catalogue.ts <build|check|check-manifest> [options] (see README.md)')
  process.exitCode = code
} catch (error) {
  if (error instanceof UsageError || (error instanceof TypeError && 'code' in error && String(error.code).startsWith('ERR_PARSE_ARGS'))) {
    err(error.message)
    process.exitCode = 3
  } else {
    err(`The catalogue command failed: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 3
  }
}
