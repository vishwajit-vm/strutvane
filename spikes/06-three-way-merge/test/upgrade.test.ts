/**
 * End-to-end tests of the upgrade engine on real temp directories:
 * planning decisions, dry run, transactional apply, rollback, crash recovery, lock recovery.
 */
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { nodeFs } from '../src/fs.ts'
import { sha256 } from '../src/hash.ts'
import { basePath, LockFileSchema, lockPath, readLock, writeAtomic } from '../src/lock.ts'
import { applyPlan, planUpgrade, recoverUpgrade, renderDryRun, type TemplateOutput, UpgradeAbortedError } from '../src/upgrade.ts'
import { CONTROLLER_V1, CONTROLLER_V2, FORM_V1, FORM_V2, insertAfterLine, replaceOnce } from './fixtures/templates.ts'
import { eject, faultyFs, snapshot, tempProject } from './helpers.ts'

const CTRL = 'app/http/controllers/invoice.controller.ts'
const FORM = 'web/pages/invoices/form.tsx'
const v1: TemplateOutput[] = [
  { path: CTRL, template: 'framework/controller', version: '1.0.0', content: CONTROLLER_V1 },
  { path: FORM, template: 'ui/form-page', version: '1.0.0', content: FORM_V1 },
]
const v2: TemplateOutput[] = [
  { path: CTRL, template: 'framework/controller', version: '1.1.0', content: CONTROLLER_V2 },
  { path: FORM, template: 'ui/form-page', version: '1.1.0', content: FORM_V2 },
]
const USER_HOOK = `  async beforeCreate(ctx) {\n    ctx.input.number ??= await nextInvoiceNumber(ctx.actor.tenantId)\n  },\n`

let root: string
let cleanup: () => Promise<void>
beforeEach(async () => {
  ;({ root, cleanup } = await tempProject())
  await eject(root, v1)
})
afterEach(() => cleanup())

const read = (p: string) => nodeFs.readText(join(root, p))
const edit = async (p: string, fn: (s: string) => string) => nodeFs.writeText(join(root, p), fn((await read(p)) ?? ''))

describe('plan + apply', () => {
  test('clean merge: applies, advances the base and lock, and a second run is a no-op', async () => {
    await edit(CTRL, (s) => insertAfterLine(s, 'export default defineController', USER_HOOK))
    const plan = await planUpgrade({ fs: nodeFs, root, templates: v2 })
    expect(plan.items.map((i) => [i.path, i.action, i.mode])).toEqual([
      [CTRL, 'update', 'three-way'],
      [FORM, 'update', 'three-way'], // untouched by the user → becomes exactly v2
    ])
    const result = await applyPlan({ fs: nodeFs, root, plan })
    expect(result).toEqual({ written: [CTRL, FORM], conflicted: [] })

    const ctrl = (await read(CTRL)) ?? ''
    expect(ctrl).toContain('nextInvoiceNumber')
    expect(ctrl).toContain('async restore(ctx)')
    expect(await read(FORM)).toBe(FORM_V2)
    expect(await nodeFs.readText(basePath(root, CTRL))).toBe(CONTROLLER_V2)
    const lock = await readLock(nodeFs, root)
    expect(lock.status === 'ok' && lock.lock.files[CTRL]).toMatchObject({ templateVersion: '1.1.0', baseSha256: sha256(CONTROLLER_V2), conflicted: false })

    const again = await planUpgrade({ fs: nodeFs, root, templates: v2 })
    expect(again.items.every((i) => i.action === 'unchanged')).toBe(true)
    expect(await nodeFs.exists(join(root, '.strutvane/staging'))).toBe(false)
  })

  test('conflict: writes markers, marks the lock, and blocks the next run until resolved', async () => {
    await edit(CTRL, (s) => replaceOnce(s, 'ctx.query.update(ctx.params.id, input)', 'ctx.query.update(ctx.params.id, { ...input, updatedBy: ctx.actor.id })'))
    const plan = await planUpgrade({ fs: nodeFs, root, templates: v2 })
    const item = plan.items.find((i) => i.path === CTRL)
    expect(item?.action).toBe('conflict')
    expect(item?.conflicts[0]?.kind).toBe('both-modified')
    const result = await applyPlan({ fs: nodeFs, root, plan })
    expect(result.conflicted).toEqual([CTRL])
    expect(await read(CTRL)).toContain('<<<<<<< yours')
    const lock = await readLock(nodeFs, root)
    expect(lock.status === 'ok' && lock.lock.files[CTRL]?.conflicted).toBe(true)

    const again = await planUpgrade({ fs: nodeFs, root, templates: v2 })
    expect(again.items.find((i) => i.path === CTRL)).toMatchObject({ action: 'blocked' })
  })

  test('user deleted the file: never recreated, remembered in the lock', async () => {
    await nodeFs.remove(join(root, CTRL))
    const plan = await planUpgrade({ fs: nodeFs, root, templates: v2 })
    expect(plan.items.find((i) => i.lockKey === CTRL)?.action).toBe('skip-user-deleted')
    await applyPlan({ fs: nodeFs, root, plan })
    expect(await read(CTRL)).toBeUndefined()
    const lock = await readLock(nodeFs, root)
    expect(lock.status === 'ok' && lock.lock.files[CTRL]?.status).toBe('deleted-by-user')
    const again = await planUpgrade({ fs: nodeFs, root, templates: v2 })
    expect(again.items.find((i) => i.lockKey === CTRL)?.action).toBe('skip-user-deleted')
  })

  test('user moved the file: found by its header, merged in place, lock + base follow it', async () => {
    const moved = 'app/http/billing/invoices.ts'
    await nodeFs.writeText(join(root, moved), insertAfterLine(CONTROLLER_V1, 'export default defineController', USER_HOOK))
    await nodeFs.remove(join(root, CTRL))
    const plan = await planUpgrade({ fs: nodeFs, root, templates: v2 })
    expect(plan.items.find((i) => i.lockKey === CTRL)).toMatchObject({ action: 'update', path: moved, renamedFrom: CTRL })
    await applyPlan({ fs: nodeFs, root, plan })
    expect(await read(moved)).toContain('async restore(ctx)')
    expect(await read(CTRL)).toBeUndefined()
    const lock = await readLock(nodeFs, root)
    expect(lock.status === 'ok' && Object.keys(lock.lock.files).sort()).toEqual([moved, FORM].sort())
    expect(await nodeFs.exists(basePath(root, CTRL))).toBe(false)
    expect(await nodeFs.readText(basePath(root, moved))).toBe(CONTROLLER_V2)
  })

  test('ambiguous move (two files claim the template) is blocked, not guessed', async () => {
    await nodeFs.writeText(join(root, 'a/one.ts'), CONTROLLER_V1)
    await nodeFs.writeText(join(root, 'b/two.ts'), CONTROLLER_V1)
    await nodeFs.remove(join(root, CTRL))
    const plan = await planUpgrade({ fs: nodeFs, root, templates: v2 })
    expect(plan.items.find((i) => i.lockKey === CTRL)?.action).toBe('blocked')
  })

  test('a foreign file at a template path (no lock entry, no header) is blocked', async () => {
    const extra: TemplateOutput = { path: 'app/policies/invoice.policy.ts', template: 'auth/policy', version: '1.1.0', content: '// @strutvane-template auth/policy@1.1.0\nexport default {}\n' }
    await nodeFs.writeText(join(root, extra.path), 'export const mine = true\n')
    const plan = await planUpgrade({ fs: nodeFs, root, templates: [...v2, extra] })
    expect(plan.items.find((i) => i.path === extra.path)?.action).toBe('blocked')
  })

  test('a file new in this template version is created', async () => {
    const extra: TemplateOutput = { path: 'app/policies/invoice.policy.ts', template: 'auth/policy', version: '1.1.0', content: '// @strutvane-template auth/policy@1.1.0\nexport default {}\n' }
    const plan = await planUpgrade({ fs: nodeFs, root, templates: [...v2, extra] })
    expect(plan.items.find((i) => i.path === extra.path)?.action).toBe('create')
    await applyPlan({ fs: nodeFs, root, plan })
    expect(await read(extra.path)).toBe(extra.content)
  })
})

describe('missing or damaged state', () => {
  test('missing base → two-way merge with every difference reported', async () => {
    await edit(CTRL, (s) => insertAfterLine(s, 'export default defineController', USER_HOOK))
    await nodeFs.remove(basePath(root, CTRL))
    const plan = await planUpgrade({ fs: nodeFs, root, templates: v2 })
    const item = plan.items.find((i) => i.path === CTRL)
    expect(item).toMatchObject({ action: 'conflict', mode: 'two-way' })
    expect(item?.notes.join(' ')).toContain('merge base missing')
    expect(item?.after).toContain('nextInvoiceNumber')
  })

  test('tampered base (hash mismatch) → two-way merge, never a wrong three-way merge', async () => {
    await nodeFs.writeText(basePath(root, CTRL), `${CONTROLLER_V1}// tampered\n`)
    const plan = await planUpgrade({ fs: nodeFs, root, templates: v2 })
    const item = plan.items.find((i) => i.path === CTRL)
    expect(item?.mode).toBe('two-way')
    expect(item?.notes.join(' ')).toContain('hash mismatch')
  })

  test('corrupt lock (bad JSON) → backed up, reported, files with headers merged two-way', async () => {
    await nodeFs.writeText(lockPath(root), '{ this is not json')
    const plan = await planUpgrade({ fs: nodeFs, root, templates: v2 })
    expect(plan.lockStatus).toBe('corrupt')
    expect(plan.notes.join(' ')).toContain('corrupt')
    expect((await nodeFs.listFiles(join(root, '.strutvane'), [])).some((f) => f.startsWith('lock.json.corrupt-'))).toBe(true)
    expect(plan.items.find((i) => i.path === CTRL)?.mode).toBe('two-way')
  })

  test('lock with a path-traversal key fails schema validation (treated as corrupt)', async () => {
    await nodeFs.writeText(lockPath(root), JSON.stringify({ lockfileVersion: 1, files: { '../../etc/passwd': { template: 'x', templateVersion: '1.0.0', baseSha256: 'a'.repeat(64) } } }))
    expect((await readLock(nodeFs, root)).status).toBe('corrupt')
    expect(LockFileSchema.safeParse({ lockfileVersion: 1, files: { 'C:/x': {} } }).success).toBe(false)
  })

  test('missing lock → headered files merged two-way; next apply rebuilds lock and bases', async () => {
    await nodeFs.remove(lockPath(root))
    const plan = await planUpgrade({ fs: nodeFs, root, templates: v2 })
    expect(plan.lockStatus).toBe('missing')
    expect(plan.items.map((i) => i.mode)).toEqual(['two-way', 'two-way'])
    await applyPlan({ fs: nodeFs, root, plan })
    const lock = await readLock(nodeFs, root)
    expect(lock.status).toBe('ok')
    expect(await nodeFs.readText(basePath(root, CTRL))).toBe(CONTROLLER_V2)
  })

  test('atomic writes leave no temp files behind', async () => {
    await writeAtomic(nodeFs, lockPath(root), '{}\n')
    expect((await nodeFs.listFiles(join(root, '.strutvane'), [])).filter((f) => f.includes('.tmp-'))).toEqual([])
  })
})

describe('dry run and transactions', () => {
  test('dry run shows actions and unified diffs and writes nothing', async () => {
    await edit(CTRL, (s) => insertAfterLine(s, 'export default defineController', USER_HOOK))
    const before = await snapshot(root)
    const text = renderDryRun(await planUpgrade({ fs: nodeFs, root, templates: v2 }))
    expect(text).toContain(`update            ${CTRL} [three-way]`)
    expect(text).toContain('+  async restore(ctx) {')
    expect(await snapshot(root)).toEqual(before)
  })

  test('a failure mid-commit rolls every change back', async () => {
    await edit(CTRL, (s) => insertAfterLine(s, 'export default defineController', USER_HOOK))
    const before = await snapshot(root)
    const plan = await planUpgrade({ fs: nodeFs, root, templates: v2 })
    const error = await applyPlan({ fs: faultyFs(3), root, plan }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(UpgradeAbortedError)
    expect((error as UpgradeAbortedError).rolledBack).toBe(true)
    expect(await snapshot(root)).toEqual(before)
  })

  test('a crash mid-commit leaves a journal; apply refuses; recovery restores everything', async () => {
    await edit(CTRL, (s) => insertAfterLine(s, 'export default defineController', USER_HOOK))
    const before = await snapshot(root)
    const plan = await planUpgrade({ fs: nodeFs, root, templates: v2 })
    const error = await applyPlan({ fs: faultyFs(3, { dieAfterFailure: true }), root, plan }).catch((e: unknown) => e)
    expect((error as UpgradeAbortedError).rolledBack).toBe(false)
    expect(await nodeFs.exists(join(root, '.strutvane/staging'))).toBe(true)

    await expect(applyPlan({ fs: nodeFs, root, plan })).rejects.toThrow(/interrupted/)
    expect(await recoverUpgrade({ fs: nodeFs, root })).toBe(1)
    expect(await snapshot(root)).toEqual(before)
    expect(await recoverUpgrade({ fs: nodeFs, root })).toBe(0) // idempotent
  })
})
