/**
 * `sv upgrade` for ejected files: plan → dry-run → apply (transactional) → recover.
 *
 * For every file the new template version produces, the planner decides one action:
 *
 *   unchanged         nothing to do (template unchanged, or its change is already in the file)
 *   update            clean merge: apply
 *   conflict          merge with conflict markers: apply, mark conflicted in the lock, report
 *   create            the new template version adds a file the project does not have yet
 *   skip-user-deleted the user deleted the file: never recreate it (remembered in the lock)
 *   blocked           unsafe to touch (unresolved markers, ambiguous rename, foreign file)
 *
 * `applyPlan` stages every write, writes a journal, then commits with renames. Any failure rolls
 * back what was committed. If the process dies mid-commit, `recoverUpgrade` restores the
 * pre-upgrade state from the journal.
 */
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import { createTwoFilesPatch } from 'diff'
import { z } from 'zod'
import { type Formatter, tryFormat } from './format.ts'
import type { Fs } from './fs.ts'
import { sha256 } from './hash.ts'
import { parseHeader } from './header.ts'
import { basePath, type LockEntry, type LockFile, type LockReadResult, lockPath, readBase, readLock, STATE_DIR, serializeLock } from './lock.ts'
import { type Conflict, hasConflictMarkers, type MergeResult, mergeThreeWay, mergeTwoWay } from './merge.ts'

/** One file produced by the NEW template version. */
export interface TemplateOutput {
  /** Project-relative POSIX path where the template writes this file. */
  readonly path: string
  readonly template: string
  readonly version: string
  readonly content: string
}

export type PlanAction = 'unchanged' | 'update' | 'conflict' | 'create' | 'skip-user-deleted' | 'blocked'

export interface PlanItem {
  /** The lock key (where the template originally wrote the file). */
  readonly lockKey: string
  /** Where the file is now (differs from `lockKey` if the user moved it). */
  readonly path: string
  readonly renamedFrom?: string
  readonly action: PlanAction
  readonly mode: 'three-way' | 'two-way' | 'none'
  readonly template: string
  readonly version: string
  /** Current file content (undefined if the file does not exist). */
  readonly before?: string
  /** Content after the upgrade (undefined when the file is not written). */
  readonly after?: string
  /** The raw new template output: becomes the next merge base. */
  readonly newBase: string
  readonly conflicts: readonly Conflict[]
  readonly notes: readonly string[]
}

export interface Plan {
  readonly lockStatus: LockReadResult['status']
  readonly items: readonly PlanItem[]
  readonly notes: readonly string[]
}

export interface PlanOptions {
  readonly fs: Fs
  readonly root: string
  readonly templates: readonly TemplateOutput[]
  /** The user's formatter. Applied to base + theirs only when the user's file is already formatted. */
  readonly formatter?: Formatter
  readonly ignoreTrailingWhitespace?: boolean
}

const SCAN_IGNORE = ['node_modules', '.git', STATE_DIR, 'dist', 'build', 'coverage']

/** Decide what the upgrade would do for every template output. Reads only; never writes. */
export async function planUpgrade(options: PlanOptions): Promise<Plan> {
  const { fs, root, templates } = options
  const lockRead = await readLock(fs, root)
  const lock: LockFile = lockRead.status === 'ok' ? lockRead.lock : { lockfileVersion: 1, files: {} }
  const notes: string[] = []
  if (lockRead.status === 'missing') notes.push('no .strutvane/lock.json: files with a Strutvane header are merged two-way (every difference is a conflict)')
  if (lockRead.status === 'corrupt') notes.push(`lock was corrupt (${lockRead.reason}); a copy was saved to ${lockRead.backupPath}; falling back to two-way merges`)

  const tracked = new Set(Object.keys(lock.files))
  let projectFiles: string[] | undefined
  const listProject = async () => (projectFiles ??= await fs.listFiles(root, SCAN_IGNORE))

  const items: PlanItem[] = []
  for (const t of templates) {
    items.push(await planOne(t, lock.files[t.path], { ...options, tracked, listProject }))
  }
  return { lockStatus: lockRead.status, items, notes }
}

interface PlanContext extends PlanOptions {
  readonly tracked: ReadonlySet<string>
  readonly listProject: () => Promise<string[]>
}

async function planOne(t: TemplateOutput, entry: LockEntry | undefined, ctx: PlanContext): Promise<PlanItem> {
  const { fs, root } = ctx
  const common = { lockKey: t.path, template: t.template, version: t.version, newBase: t.content }
  const notes: string[] = []

  if (entry?.status === 'deleted-by-user') {
    return { ...common, path: t.path, action: 'skip-user-deleted', mode: 'none', conflicts: [], notes: ['you deleted this file earlier; it will not be recreated'] }
  }

  let path = t.path
  let renamedFrom: string | undefined
  let current = await fs.readText(join(root, t.path))

  if (current === undefined) {
    if (!entry) return { ...common, path, action: 'create', mode: 'none', after: t.content, conflicts: [], notes: ['new file in this template version'] }
    // The user moved/renamed or deleted the file. Look for its header elsewhere.
    const candidates: string[] = []
    for (const file of await ctx.listProject()) {
      if (ctx.tracked.has(file)) continue
      const text = await fs.readText(join(root, file))
      if (text !== undefined && parseHeader(text)?.template === entry.template) candidates.push(file)
    }
    if (candidates.length > 1) {
      return { ...common, path, action: 'blocked', mode: 'none', conflicts: [], notes: [`file is missing and ${candidates.length} files claim to be ${entry.template}: ${candidates.join(', ')}; move all but one or delete the extra header`] }
    }
    const found = candidates[0]
    if (found === undefined) {
      return { ...common, path, action: 'skip-user-deleted', mode: 'none', conflicts: [], notes: ['file not found: treated as deleted by you; it will not be recreated'] }
    }
    renamedFrom = t.path
    path = found
    current = await fs.readText(join(root, found))
    notes.push(`you moved this file to ${found}; merging there`)
  }
  if (current === undefined) throw new Error(`unreachable: ${path} vanished during planning`)

  if (hasConflictMarkers(current)) {
    return { ...common, path, ...(renamedFrom ? { renamedFrom } : {}), action: 'blocked', mode: 'none', before: current, conflicts: [], notes: ['file still contains conflict markers from a previous upgrade; resolve them, then re-run'] }
  }
  if (!entry && parseHeader(current)?.template !== t.template) {
    return { ...common, path, action: 'blocked', mode: 'none', before: current, conflicts: [], notes: ['a file you created already exists at this path and was not generated by this template; move it, then re-run'] }
  }

  // Resolve the merge base.
  let base: string | undefined
  if (entry) {
    const b = await readBase(fs, root, t.path, entry)
    if (b.status === 'ok') base = b.content
    else notes.push(b.status === 'missing' ? 'merge base missing (.strutvane/base): falling back to two-way merge' : 'merge base was modified (hash mismatch): falling back to two-way merge')
  }

  // Optional formatter step: only when the user's file is already in the formatter's style.
  let theirs = t.content
  if (ctx.formatter && base !== undefined) {
    const oursFmt = await tryFormat(ctx.formatter, current, path)
    if (oursFmt.formatted && oursFmt.text === current) {
      const [bf, tf] = await Promise.all([tryFormat(ctx.formatter, base, path), tryFormat(ctx.formatter, theirs, path)])
      base = bf.text
      theirs = tf.text
      for (const n of [bf.note, tf.note]) if (n) notes.push(n)
    } else if (oursFmt.note) notes.push(oursFmt.note)
  }

  const mergeOptions = {
    ...(ctx.ignoreTrailingWhitespace === undefined ? {} : { ignoreTrailingWhitespace: ctx.ignoreTrailingWhitespace }),
    labels: { ours: 'yours', base: `${t.template}@${entry?.templateVersion ?? '?'} (original)`, theirs: `${t.template}@${t.version} (new)` },
  }
  const result: MergeResult = base !== undefined ? mergeThreeWay({ base, ours: current, theirs }, mergeOptions) : mergeTwoWay({ ours: current, theirs }, mergeOptions)
  notes.push(...result.notes)

  const action: PlanAction = result.status === 'conflicted' ? 'conflict' : result.text === current ? 'unchanged' : 'update'
  return {
    ...common,
    path,
    ...(renamedFrom ? { renamedFrom } : {}),
    action,
    mode: result.mode,
    before: current,
    ...(action === 'unchanged' ? {} : { after: result.text }),
    conflicts: result.conflicts,
    notes,
  }
}

/** Human-readable dry run: a summary line per file plus unified diffs. Writes nothing. */
export function renderDryRun(plan: Plan): string {
  const out: string[] = [...plan.notes.map((n) => `note: ${n}`)]
  for (const item of plan.items) {
    const where = item.renamedFrom ? `${item.renamedFrom} → ${item.path}` : item.path
    const extra = item.conflicts.length > 0 ? `, ${item.conflicts.length} conflict(s)` : ''
    out.push(`${item.action.padEnd(17)} ${where} [${item.mode}${extra}]`)
    for (const n of item.notes) out.push(`    ${n}`)
    if (item.after !== undefined) out.push(createTwoFilesPatch(item.path, item.path, item.before ?? '', item.after, 'current', 'after upgrade'))
  }
  return out.join('\n')
}

// ---------------------------------------------------------------------------------------------
// Apply (transactional)
// ---------------------------------------------------------------------------------------------

/** One staged file operation. `content: null` deletes the target. */
interface Op {
  readonly target: string
  readonly content: string | null
}

const JournalSchema = z.object({
  version: z.literal(1),
  ops: z.array(z.object({ index: z.number().int().nonnegative(), target: z.string().min(1), hadOriginal: z.boolean() })),
})

export class UpgradeAbortedError extends Error {
  /** True when every committed change was rolled back successfully. */
  readonly rolledBack: boolean

  constructor(message: string, rolledBack: boolean, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'UpgradeAbortedError'
    this.rolledBack = rolledBack
  }
}

export interface ApplyResult {
  readonly written: readonly string[]
  readonly conflicted: readonly string[]
}

function stagingRoot(root: string): string {
  return join(root, STATE_DIR, 'staging')
}

/** Turn a plan into concrete file operations plus the next lock (written last). */
function opsFor(root: string, plan: Plan, lock: LockFile): { ops: Op[]; written: string[]; conflicted: string[] } {
  const ops: Op[] = []
  const written: string[] = []
  const conflicted: string[] = []
  const files: Record<string, LockEntry> = { ...lock.files }

  for (const item of plan.items) {
    if (item.action === 'blocked') continue
    if (item.after !== undefined) {
      ops.push({ target: join(root, item.path), content: item.after })
      written.push(item.path)
    }
    if (item.action === 'conflict') conflicted.push(item.path)
    // The new template output becomes the merge base, stored under the file's CURRENT path.
    if (item.renamedFrom) {
      delete files[item.renamedFrom]
      ops.push({ target: basePath(root, item.renamedFrom), content: null })
    }
    ops.push({ target: basePath(root, item.path), content: item.newBase })
    files[item.path] = {
      template: item.template,
      templateVersion: item.version,
      baseSha256: sha256(item.newBase),
      status: item.action === 'skip-user-deleted' ? 'deleted-by-user' : 'active',
      conflicted: item.action === 'conflict',
    }
  }
  ops.push({ target: lockPath(root), content: serializeLock({ lockfileVersion: 1, files }) })
  return { ops, written, conflicted }
}

/**
 * Apply a plan as one transaction: stage everything, write a journal, commit with renames.
 * On failure, committed operations are rolled back; if even that fails, the journal stays so
 * {@link recoverUpgrade} can finish the job on the next run.
 */
export async function applyPlan(options: { readonly fs: Fs; readonly root: string; readonly plan: Plan }): Promise<ApplyResult> {
  const { fs, root, plan } = options
  if (await fs.exists(stagingRoot(root))) {
    throw new UpgradeAbortedError('a previous upgrade was interrupted: run recovery first (sv upgrade --recover)', true)
  }
  const lockRead = await readLock(fs, root)
  const lock: LockFile = lockRead.status === 'ok' ? lockRead.lock : { lockfileVersion: 1, files: {} }
  const { ops, written, conflicted } = opsFor(root, plan, lock)

  const tx = join(stagingRoot(root), `${Date.now()}-${randomBytes(4).toString('hex')}`)
  const journal: z.infer<typeof JournalSchema> = { version: 1, ops: [] }

  // 1. Stage new contents and back up originals. Nothing in the project changes yet.
  for (const [index, op] of ops.entries()) {
    if (op.content !== null) await fs.writeText(join(tx, 'staged', String(index)), op.content)
    const original = await fs.readText(op.target)
    if (original !== undefined) await fs.writeText(join(tx, 'backup', String(index)), original)
    journal.ops.push({ index, target: op.target, hadOriginal: original !== undefined })
  }
  await fs.writeText(join(tx, 'journal.json'), JSON.stringify(journal))

  // 2. Commit.
  let committed = 0
  try {
    for (const [index, op] of ops.entries()) {
      if (op.content === null) await fs.remove(op.target)
      else await fs.rename(join(tx, 'staged', String(index)), op.target)
      committed++
    }
  } catch (error) {
    try {
      await restore(fs, tx, journal.ops.slice(0, committed))
      await fs.remove(tx)
      await removeIfEmpty(fs, stagingRoot(root))
    } catch (rollbackError) {
      throw new UpgradeAbortedError('upgrade failed and automatic rollback failed; run sv upgrade --recover', false, { cause: rollbackError })
    }
    throw new UpgradeAbortedError(`upgrade failed and was rolled back: ${error instanceof Error ? error.message : String(error)}`, true, { cause: error })
  }

  // 3. Done: drop the staging area.
  await fs.remove(tx)
  await removeIfEmpty(fs, stagingRoot(root))
  return { written, conflicted }
}

/**
 * Restore the pre-upgrade state from any interrupted transaction (idempotent).
 * Returns how many interrupted transactions were rolled back.
 */
export async function recoverUpgrade(options: { readonly fs: Fs; readonly root: string }): Promise<number> {
  const { fs, root } = options
  const staging = stagingRoot(root)
  if (!(await fs.exists(staging))) return 0
  const journals = (await fs.listFiles(staging, [])).filter((f) => f.endsWith('/journal.json'))
  for (const j of journals) {
    const tx = join(staging, j.slice(0, -'/journal.json'.length))
    const raw = await fs.readText(join(staging, j))
    const journal = JournalSchema.parse(JSON.parse(raw ?? 'null'))
    await restore(fs, tx, journal.ops)
    await fs.remove(tx)
  }
  await fs.remove(staging)
  return journals.length
}

/** Put every listed target back to its backed-up state (or remove it if it did not exist). */
async function restore(fs: Fs, tx: string, ops: z.infer<typeof JournalSchema>['ops']): Promise<void> {
  for (const op of [...ops].reverse()) {
    if (op.hadOriginal) {
      const backup = await fs.readText(join(tx, 'backup', String(op.index)))
      if (backup === undefined) throw new Error(`backup missing for ${op.target}`)
      await fs.writeText(op.target, backup)
    } else {
      await fs.remove(op.target)
    }
  }
}

async function removeIfEmpty(fs: Fs, dir: string): Promise<void> {
  if ((await fs.exists(dir)) && (await fs.listFiles(dir, [])).length === 0) await fs.remove(dir)
}
