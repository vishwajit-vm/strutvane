/**
 * The organisation's repositories, live (`gh repo list`) or recorded (`snapshots/repos.json`).
 *
 * Why the GitHub CLI and not the REST API directly: `gh` is on every GitHub-hosted runner and on
 * the maintainers' machines, it handles authentication (`GH_TOKEN` in CI, the keyring locally) and
 * paging, so no token ever passes through this code.
 *
 * @module
 */
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { z } from 'zod'
import { byCodeUnit } from '../graph.ts'

const run = promisify(execFile)

/** One repository, as the catalogue needs it. */
export const repoSchema = z.strictObject({
  name: z.string().max(100),
  archived: z.boolean(),
})
export type Repo = z.output<typeof repoSchema>

/** The recorded list. */
export const repoSnapshotSchema = z.strictObject({
  snapshotVersion: z.literal(1),
  org: z.string().max(39),
  repos: z.array(repoSchema).max(5_000),
})
export type RepoSnapshot = z.output<typeof repoSnapshotSchema>

/** Lists an org's repositories. Injected, so tests never call GitHub. */
export type ListRepos = (org: string) => Promise<readonly Repo[]>

const ghAnswerSchema = z.array(z.looseObject({ name: z.string(), isArchived: z.boolean() })).max(5_000)

/**
 * `gh repo list <org>` (public and private repos the token can see; archived included). Fails
 * loudly when `gh` is missing, not signed in, or answers something unexpected.
 */
export const listReposWithGh: ListRepos = async (org) => {
  const { stdout } = await run('gh', ['repo', 'list', org, '--limit', '5000', '--json', 'name,isArchived'], {
    timeout: 60_000,
    maxBuffer: 16 * 1024 * 1024,
    windowsHide: true,
  })
  const parsed = ghAnswerSchema.safeParse(JSON.parse(stdout) as unknown)
  if (!parsed.success) throw new Error('gh repo list answered with something that is not a repository list')
  return parsed.data.map((repo) => ({ name: repo.name, archived: repo.isArchived }))
}

/** A recorded snapshot, repos sorted by name so the file only changes when the org does. */
export async function readRepos(org: string, list: ListRepos): Promise<RepoSnapshot> {
  const repos = [...(await list(org))].sort((a, b) => byCodeUnit(a.name, b.name))
  return { snapshotVersion: 1, org, repos }
}
