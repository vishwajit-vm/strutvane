/**
 * Does npm agree with the source? One finding per disagreement, for the `npm` check, plus the
 * manifest conformance of every published `strutvane` block (`manifest-block.ts`).
 *
 * The rules:
 * - a **released** entry's package exists on npm, with a full release under `latest` that is not
 *   a name placeholder and not deprecated;
 * - a **planned or in-development** entry has no full release yet (otherwise the source is
 *   behind: mark it released);
 * - a **listed** name that npm does not know at all is a warning: nobody holds the name yet, so
 *   anyone can take it (reserve it with `scripts/reserve-npm-names.mjs`);
 * - a **retired** package that is not deprecated on npm is a warning (the deprecation waits for
 *   its replacement to ship);
 * - the published `repository` points at the repo the source names (warning: renames redirect,
 *   but the next release should fix the link).
 *
 * @module
 */
import type { NpmPackage, NpmSnapshot } from '../live/npm.ts'
import { FRAMEWORK_PACKAGE, fullReleases } from '../source/merge.ts'
import { LISTED_STATUSES, type Source } from '../source/schema.ts'
import type { Finding } from './findings.ts'
import { checkBlock } from './manifest-block.ts'
import { compareAnyVersions, isPlaceholder } from './prerelease.ts'

/** `owner/repo` from a package.json repository URL, lower-cased, or `undefined`. */
export function githubRepoOf(url: string): string | undefined {
  const match = /github\.com[/:]([^/\s]+)\/([^/#?\s]+?)(?:\.git)?(?:[#?].*)?$/i.exec(url)
  return match === null ? undefined : `${match[1]}/${match[2]}`.toLowerCase()
}

/**
 * The framework version add-ons must accept: the newest real release under `latest`, otherwise
 * the `next` pre-release, otherwise none (then compatibility is not checked).
 */
export function currentFramework(state: NpmPackage | null): string | undefined {
  if (state === null) return undefined
  const latest = state.distTags['latest']
  if (latest !== undefined && !isPlaceholder(latest)) return latest
  const next = state.distTags['next']
  return next !== undefined && !isPlaceholder(next) ? next : undefined
}

/** Every npm-side finding. */
export function checkNpm(source: Source, npm: NpmSnapshot): Finding[] {
  const findings: Finding[] = []
  const framework = currentFramework(npm.packages[FRAMEWORK_PACKAGE] ?? null)
  for (const entry of source.packages) {
    if (entry.npm === null) continue
    const name = entry.npm
    const finding = (severity: Finding['severity'], message: string): void => {
      findings.push({ check: 'npm', severity, subject: name, message })
    }
    if (!(name in npm.packages)) {
      finding('error', 'is not in snapshots/npm.json; run the online build (node src/cli/catalogue.ts build) to record it')
      continue
    }
    const state = npm.packages[name] ?? null
    const listed = LISTED_STATUSES.has(entry.status)
    if (state === null) {
      if (entry.status === 'released') finding('error', 'is marked released but does not exist on npm')
      else if (listed) finding('warning', `does not exist on npm, so nobody holds the name yet (status ${entry.status}); reserve it`)
      continue
    }
    const releases = fullReleases(state.versions).filter((version) => state.versions[version]?.deprecated === undefined)
    const latest = state.distTags['latest']
    if (entry.status === 'released') {
      if (releases.length === 0) finding('error', `is marked released but npm has no full release (latest is ${latest ?? 'missing'})`)
      else if (latest === undefined || isPlaceholder(latest)) finding('error', `is marked released but its latest dist-tag is ${latest ?? 'missing'}, a name placeholder`)
    } else if (listed && releases.length > 0) {
      finding('error', `is marked ${entry.status} but npm already has the release ${releases[0] ?? ''}; mark it released`)
    }
    if (entry.status === 'retired' && latest !== undefined && state.versions[latest]?.deprecated === undefined) {
      finding('warning', `is retired but not deprecated on npm yet (npm deprecate ${name} "<message>" once ${entry.replacement?.packages.join(', ') ?? 'the replacement'} is released)`)
    }
    const newest = Object.keys(state.versions).sort(compareAnyVersions).reverse()
    const repository = newest.map((version) => state.versions[version]?.repository).find((url) => url !== undefined)
    if (repository !== undefined && entry.repo !== null) {
      const published = githubRepoOf(repository)
      const expected = `${source.org}/${entry.repo}`.toLowerCase()
      if (published !== expected) {
        finding('warning', `the newest release's repository is ${published ?? repository}, but the source says ${expected}; fix package.json "repository" in the next release`)
      }
    }
    // Manifest conformance of every real release that declares a strutvane block. The framework
    // compatibility rule applies only to what the dist-tags point at, and only while listed.
    const tagged = new Set(Object.values(state.distTags))
    for (const version of newest) {
      const meta = state.versions[version]
      if (meta === undefined || meta.strutvane === undefined || isPlaceholder(version)) continue
      findings.push(
        ...checkBlock(meta.strutvane, {
          name,
          version,
          peerDependencies: meta.peerDependencies,
          entry,
          frameworkVersion: listed && tagged.has(version) ? framework : undefined,
        }),
      )
    }
  }
  return findings
}
