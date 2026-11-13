/**
 * Formatter reflow, with the real Biome 2.6.7 CLI and a real biome.json in a temp project.
 *
 * Scenario: the template emits a long line; the user ran Biome, which wrapped it over several
 * lines; the next template version changes one value inside that long line.
 *   - Without the formatter step, the reflowed region conflicts (both sides changed it).
 *   - With the formatter step, base and theirs are formatted like the user's file: clean merge.
 */
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { createBiomeCliFormatter, type Formatter, tryFormat } from '../src/format.ts'
import { nodeFs } from '../src/fs.ts'
import { mergeThreeWay } from '../src/merge.ts'
import { planUpgrade } from '../src/upgrade.ts'
import { eject, tempProject } from './helpers.ts'

const biomeBin = createRequire(import.meta.url).resolve('@biomejs/biome/bin/biome')
const HEADER = '// @strutvane-template framework/list-config@1.0.0 (ejected: this file is yours to edit)\n'
const BASE = `${HEADER}export const config = defineListConfig({ name: 'invoices', pageSize: 25, sortBy: 'createdAt', direction: 'desc', include: ['customer'] })\n`
const THEIRS = BASE.replace('@1.0.0', '@1.1.0').replace('pageSize: 25', 'pageSize: 50')

let root: string
let cleanup: () => Promise<void>
let biome: Formatter
beforeEach(async () => {
  ;({ root, cleanup } = await tempProject())
  // The USER's formatter config: 80 columns, single quotes, no semicolons.
  await nodeFs.writeText(
    join(root, 'biome.json'),
    JSON.stringify({ formatter: { lineWidth: 80, indentStyle: 'space' }, javascript: { formatter: { quoteStyle: 'single', semicolons: 'asNeeded' } } }),
  )
  biome = createBiomeCliFormatter({ cwd: root, biomeBin })
})
afterEach(() => cleanup())

describe('formatter reflow', () => {
  test('without formatting: conflict; with formatting base + theirs: clean, and the template change lands', async () => {
    const formattedBase = await biome.format(BASE, 'config.ts')
    expect(formattedBase).not.toBe(BASE) // Biome really reflowed the long line
    const ours = `${formattedBase}\nexport const extra = true\n` // user ran Biome and added code

    const raw = mergeThreeWay({ base: BASE, ours, theirs: THEIRS })
    expect(raw.status).toBe('conflicted')

    const smart = mergeThreeWay({ base: formattedBase, ours, theirs: await biome.format(THEIRS, 'config.ts') })
    expect(smart.status).toBe('clean')
    expect(smart.text).toContain('pageSize: 50')
    expect(smart.text).toContain('export const extra = true')
  })

  test('planUpgrade applies the formatter only when the user file is already formatted', async () => {
    const path = 'app/config.ts'
    await eject(root, [{ path, template: 'framework/list-config', version: '1.0.0', content: BASE }])
    const formatted = await biome.format(BASE, path)
    await nodeFs.writeText(join(root, path), `${formatted}\nexport const extra = true\n`)
    const plan = await planUpgrade({ fs: nodeFs, root, templates: [{ path, template: 'framework/list-config', version: '1.1.0', content: THEIRS }], formatter: biome })
    expect(plan.items[0]).toMatchObject({ action: 'update', mode: 'three-way' })
    expect(plan.items[0]?.after).toContain('pageSize: 50')
  })

  test('formatter failures are fail-soft: original text plus a note', async () => {
    const outcome = await tryFormat(biome, 'export const = = broken(', 'broken.ts')
    expect(outcome.formatted).toBe(false)
    expect(outcome.text).toBe('export const = = broken(')
    expect(outcome.note).toMatch(/biome could not format broken\.ts/)
  })

  test('a missing formatter binary is fail-soft too', async () => {
    const missing = createBiomeCliFormatter({ cwd: root, biomeBin: join(root, 'does-not-exist.js') })
    const outcome = await tryFormat(missing, BASE, 'config.ts')
    expect(outcome).toMatchObject({ formatted: false, text: BASE })
  })
})
