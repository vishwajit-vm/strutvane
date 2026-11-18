/**
 * Repository drift: every Strutvane repository in the org is in `source.json`, and every repo the
 * source names exists.
 *
 * Which repos count: names starting with `strutvane-`, plus `create-strutvane` (the installer).
 * Other repos in the org (the hub itself, `.github`, unrelated projects) are not packages.
 *
 * Why both directions: a repo created without a source entry never reaches the installer or the
 * docs; a source entry pointing at a repo that was renamed or deleted sends readers to a 404.
 *
 * @module
 */
import type { RepoSnapshot } from '../live/repos.ts'
import type { Source } from '../source/schema.ts'
import type { Finding } from './findings.ts'

/** Is this repository one the catalogue must know about? */
export const isTrackedRepo = (name: string): boolean => name.startsWith('strutvane-') || name === 'create-strutvane'

/** Every repo-side finding. */
export function checkRepos(source: Source, snapshot: RepoSnapshot): Finding[] {
  const findings: Finding[] = []
  const finding = (severity: Finding['severity'], subject: string, message: string): void => {
    findings.push({ check: 'repos', severity, subject, message })
  }
  if (snapshot.org.toLowerCase() !== source.org.toLowerCase()) {
    finding('error', snapshot.org, `the repo list is for ${snapshot.org}, but source.json says the org is ${source.org}`)
    return findings
  }
  const repos = new Map(snapshot.repos.map((repo) => [repo.name, repo] as const))
  const users = new Map<string, typeof source.packages>()
  for (const entry of source.packages) {
    if (entry.repo === null) continue
    users.set(entry.repo, [...(users.get(entry.repo) ?? []), entry])
  }
  for (const repo of snapshot.repos) {
    if (isTrackedRepo(repo.name) && !users.has(repo.name)) {
      finding('error', repo.name, `is a repository in ${source.org} but no source.json entry names it; add one (kind "repo" if it is not a package)`)
    }
  }
  for (const [name, entries] of [...users].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const repo = repos.get(name)
    const ids = entries.map((entry) => entry.id).join(', ')
    if (repo === undefined) {
      finding('error', name, `is named by ${ids} but does not exist in ${source.org} (renamed or deleted?)`)
      continue
    }
    const active = entries.filter((entry) => entry.status !== 'retired' && entry.status !== 'shelved')
    if (repo.archived && active.length > 0) {
      finding('error', name, `is archived, but ${active.map((entry) => `${entry.id} is ${entry.status}`).join(', ')}; unarchive it or retire the entry`)
    }
    if (!repo.archived && active.length === 0 && entries.every((entry) => entry.status === 'retired')) {
      finding('warning', name, `only retired entries (${ids}) use it; archive the repository once its replacement has shipped`)
    }
  }
  return findings
}
