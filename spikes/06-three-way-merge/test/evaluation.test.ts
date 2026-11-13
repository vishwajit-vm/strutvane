/**
 * Library evaluation: Strutvane's merge vs raw node-diff3 vs `git merge-file`, on the tricky
 * scenarios plus a deterministic random sample. Prints a markdown table (copied into the README)
 * and asserts only Strutvane's guarantees; the other columns are evidence.
 *
 * jsdiff (`diff`) is not in the table: v9 has no three-way merge API. It is used for the dry-run
 * unified diffs instead.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import fc from 'fast-check'
import { merge as nodeDiff3Merge } from 'node-diff3'
import { describe, expect, test } from 'vitest'
import { mergeThreeWay } from '../src/merge.ts'
import { CONTROLLER_V1, CONTROLLER_V2, insertAfterLine, replaceOnce } from './fixtures/templates.ts'

interface Outcome {
  readonly status: 'clean' | 'conflict' | 'error'
  readonly text: string
}
type Engine = (base: string, ours: string, theirs: string) => Outcome

const strutvane: Engine = (base, ours, theirs) => {
  const r = mergeThreeWay({ base, ours, theirs })
  return { status: r.status === 'clean' ? 'clean' : 'conflict', text: r.text }
}

const rawNodeDiff3: Engine = (base, ours, theirs) => {
  try {
    const r = nodeDiff3Merge(ours, base, theirs, { excludeFalseConflicts: true, stringSeparator: '\n' })
    return { status: r.conflict ? 'conflict' : 'clean', text: r.result.join('\n') }
  } catch (error) {
    return { status: 'error', text: String(error) }
  }
}

const gitAvailable = spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0
const gitMergeFile: Engine = (base, ours, theirs) => {
  const dir = mkdtempSync(join(tmpdir(), 'sv-git-merge-'))
  try {
    const files = { ours: join(dir, 'ours'), base: join(dir, 'base'), theirs: join(dir, 'theirs') }
    writeFileSync(files.ours, ours)
    writeFileSync(files.base, base)
    writeFileSync(files.theirs, theirs)
    const r = spawnSync('git', ['merge-file', '-p', '--diff3', files.ours, files.base, files.theirs], { encoding: 'utf8' })
    if (r.status === null || r.status < 0) return { status: 'error', text: r.stderr }
    return { status: r.status === 0 ? 'clean' : 'conflict', text: r.stdout }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const HOOK = `  async beforeCreate(ctx) {\n    ctx.input.number ??= await nextInvoiceNumber(ctx.actor.tenantId)\n  },\n`
const withHook = insertAfterLine(CONTROLLER_V1, 'export default defineController', HOOK)

const scenarios: { name: string; base: string; ours: string; theirs: string; wantClean: boolean }[] = [
  { name: 'non-overlapping edits', base: CONTROLLER_V1, ours: withHook, theirs: CONTROLLER_V2, wantClean: true },
  {
    name: 'identical change both sides',
    base: CONTROLLER_V1,
    ours: replaceOnce(CONTROLLER_V1, 'ctx.query.update(ctx.params.id, input)', 'ctx.query.update(ctx.params.id, input, { expectedVersion: ctx.request.ifMatch })'),
    theirs: CONTROLLER_V2,
    wantClean: true,
  },
  {
    name: 'overlapping edits',
    base: CONTROLLER_V1,
    ours: replaceOnce(CONTROLLER_V1, 'ctx.query.update(ctx.params.id, input)', 'ctx.query.update(ctx.params.id, { ...input, by: 1 })'),
    theirs: CONTROLLER_V2,
    wantClean: false,
  },
  { name: 'user file is CRLF', base: CONTROLLER_V1, ours: withHook.replace(/\n/g, '\r\n'), theirs: CONTROLLER_V2, wantClean: true },
  { name: 'editor trailing whitespace', base: CONTROLLER_V1, ours: CONTROLLER_V1.replace(/\(ctx\) \{\n/g, '(ctx) {  \n'), theirs: CONTROLLER_V2, wantClean: true },
  {
    name: '__proto__ / constructor lines',
    base: 'a\n__proto__\nconstructor\nb\n',
    ours: 'a\n__proto__\nconstructor\nU\nb\n',
    theirs: 'a\n__proto__\nconstructor\nb\nT\n',
    wantClean: true,
  },
  { name: 'user file without final newline', base: CONTROLLER_V1, ours: withHook.replace(/\n$/, ''), theirs: CONTROLLER_V2, wantClean: true },
]

const norm = (t: string) => t.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
/** Every non-blank line unique to `side` (vs base) appears in `out` (ignoring trailing whitespace). */
function keepsUniqueLines(base: string, side: string, out: string): boolean {
  const strip = (l: string) => l.replace(/[ \t]+$/, '')
  const baseSet = new Set(norm(base).split('\n').map(strip))
  const outSet = new Set(norm(out).split('\n').map(strip))
  return norm(side)
    .split('\n')
    .map(strip)
    .filter((l) => l.trim() !== '' && !baseSet.has(l))
    .every((l) => outSet.has(l))
}

describe('library evaluation', () => {
  const engines: [string, Engine][] = [['strutvane (node-diff3 + normalisation)', strutvane], ['node-diff3 raw', rawNodeDiff3]]
  if (gitAvailable) engines.push(['git merge-file --diff3', gitMergeFile])

  test('tricky scenarios', () => {
    const rows: string[] = ['| Scenario | ' + engines.map(([n]) => n).join(' | ') + ' |', '|---|' + engines.map(() => '---').join('|') + '|']
    for (const s of scenarios) {
      const cells = engines.map(([name, engine]) => {
        const r = engine(s.base, s.ours, s.theirs)
        const correct = r.status !== 'error' && (r.status === 'clean') === s.wantClean
        const keeps = keepsUniqueLines(s.base, s.ours, r.text)
        const eolOk = !s.ours.includes('\r\n') || r.text.replace(/\r\n/g, '').indexOf('\n') === -1
        if (name.startsWith('strutvane')) {
          expect(correct, `${s.name}: wrong status ${r.status}`).toBe(true)
          expect(keeps, `${s.name}: user line lost`).toBe(true)
          expect(eolOk, `${s.name}: line endings changed`).toBe(true)
        }
        const mark = correct && keeps && eolOk ? '✅' : '❌'
        const why = [!correct && `${r.status}`, !keeps && 'lost user lines', !eolOk && 'EOL changed'].filter(Boolean).join(', ')
        return `${mark} ${r.status}${why && !correct ? '' : ''}${why ? ` (${why})` : ''}`
      })
      rows.push(`| ${s.name} (want ${s.wantClean ? 'clean' : 'conflict'}) | ${cells.join(' | ')} |`)
    }
    console.log(`\n${rows.join('\n')}\n`)
  })

  test.skipIf(!gitAvailable)('random sample: agreement with git merge-file and user-line safety', () => {
    const COMMON = ['}', '', '  return x', '{']
    const linesArb = fc.array(fc.oneof(fc.constantFrom(...COMMON), fc.nat({ max: 30 }).map((n) => `l${n}`)), { maxLength: 20 })
    const editArb = fc.array(fc.tuple(fc.constantFrom('ins', 'del', 'rep'), fc.double({ min: 0, max: 1, noNaN: true })), { maxLength: 3 })
    const apply = (lines: string[], edits: [string, number][], tag: string) => {
      const r = [...lines]
      edits.forEach(([k, at], i) => {
        const p = Math.min(r.length, Math.floor(at * (r.length + 1)))
        if (k === 'ins') r.splice(p, 0, `${tag}${i}`)
        else if (k === 'del') r.splice(p, 1)
        else r.splice(p, 1, `${tag}${i}`)
      })
      return r
    }
    const samples = fc.sample(fc.tuple(linesArb, editArb, editArb), { seed: 42, numRuns: 200 })
    let agree = 0
    let svConflictGitClean = 0
    let svCleanGitConflict = 0
    let svLost = 0
    let gitLost = 0
    for (const [base, eo, et] of samples) {
      const j = (l: string[]) => (l.length ? `${l.join('\n')}\n` : '')
      const b = j(base)
      const o = j(apply(base, eo, 'U'))
      const t = j(apply(base, et, 'T'))
      const sv = strutvane(b, o, t)
      const g = gitMergeFile(b, o, t)
      if (sv.status === g.status) agree++
      else if (sv.status === 'conflict') svConflictGitClean++
      else svCleanGitConflict++
      if (!keepsUniqueLines(b, o, sv.text)) svLost++
      if (!keepsUniqueLines(b, o, g.text)) gitLost++
    }
    console.log(`\nrandom sample (n=200, seed 42): status agreement ${agree}/200; strutvane conflict & git clean: ${svConflictGitClean}; strutvane clean & git conflict: ${svCleanGitConflict}; user lines lost: strutvane ${svLost}, git ${gitLost}\n`)
    expect(svLost).toBe(0)
  })
})
