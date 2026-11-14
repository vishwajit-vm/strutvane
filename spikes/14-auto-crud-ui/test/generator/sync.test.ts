/**
 * `ui:sync` end to end on real folders: scaffold once, never overwrite, `auto()` follows new
 * columns, explicit lists are reported instead of rewritten, dropped columns are flagged.
 */
import { existsSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { planUiSync } from '../../src/generator/plan.ts'
import { formatReport } from '../../src/generator/report.ts'
import { parseLock } from '../../src/generator/render.ts'
import { runUiSync, SyncError } from '../../src/generator/sync.ts'
import type { ResourceUi } from '../../src/shared/define-ui.ts'
import { resolveResourceUi } from '../../src/shared/resolve-ui.ts'
import type { AppMetadata } from '../../src/shared/metadata.ts'
import {
  blogAfterDroppingSubtitle,
  blogBeforeNewColumns,
  blogToday,
  cleanupApps,
  commentsResource,
  EXAMPLE_ROOT,
  makeApp,
  readAppFile,
  stringField,
  withField,
  withoutResource,
  withResource,
  writeAppFile,
  writeMetadata,
} from './helpers.ts'

afterEach(cleanupApps)

/** What a developer might turn the scaffolded posts file into: everything still auto(). */
const CUSTOM_POSTS = `import { auto, defineResourceUi } from '#strutvane/ui'

// My edits: grouped, meta hidden from the form, status first.
export default defineResourceUi('posts', {
  columns: auto(),
  form: auto({ except: ['meta'], order: ['status'] }),
  navigation: { icon: 'file-text', group: 'Content', sort: 1 },
  label: { singular: 'Article', plural: 'Articles' },
})
`

/** The tags file after the developer took full control of the columns. */
const CUSTOM_TAGS = `import { auto, defineResourceUi } from '#strutvane/ui'

export default defineResourceUi('tags', {
  columns: ['name', 'position'],
  form: auto(),
})
`

/** Load an owned file the way the app does (a real import of the TypeScript module). */
async function loadOwned(root: string, path: string): Promise<ResourceUi> {
  const module = (await import(`${pathToFileURL(join(root, path)).href}?t=${Date.now()}`)) as { default: ResourceUi }
  return module.default
}

function resourceOf(metadata: AppMetadata, table: string) {
  const resource = metadata.resources.find((candidate) => candidate.table === table)
  if (resource === undefined) throw new Error(`test setup: no ${table}`)
  return resource
}

describe('first sync', () => {
  it('scaffolds one owned file per table, plus the registry and the lock', () => {
    const root = makeApp(blogBeforeNewColumns())
    const { report, written } = runUiSync(root)

    expect(report.scaffolded).toEqual(['resources/ui/users.ui.ts', 'resources/ui/posts.ui.ts', 'resources/ui/categories.ui.ts', 'resources/ui/tags.ui.ts'])
    expect(written).toEqual([...report.scaffolded, '.strutvane/ui.gen.ts', '.strutvane/ui.lock.json'])
    const posts = readAppFile(root, 'resources/ui/posts.ui.ts')
    expect(posts).toContain("defineResourceUi('posts', {")
    expect(posts).toContain('columns: auto(),')
    expect(posts).toContain('form: auto(),')
    // The comment shows what auto() means today, so defaults are visible before overriding them.
    expect(posts).toContain(' * - columns: title, slug, price, status, author_id, featured, published_on, created_at')
  })

  it('a second sync with no migration in between writes nothing', () => {
    const root = makeApp(blogToday())
    runUiSync(root)
    const again = runUiSync(root)
    expect(again.written).toEqual([])
    expect(formatReport(again.report)).toBe('ui:sync: screens are up to date.')
  })

  it('a dry run reports the plan and writes nothing', () => {
    const root = makeApp(blogToday())
    const { report, written } = runUiSync(root, { dryRun: true })
    expect(report.scaffolded).toHaveLength(4)
    expect(written).toEqual([])
    expect(existsSync(join(root, 'resources'))).toBe(false)
    expect(existsSync(join(root, '.strutvane', 'ui.gen.ts'))).toBe(false)
  })
})

describe('adding columns after the developer customised the files', () => {
  async function customiseThenMigrate() {
    const root = makeApp(blogBeforeNewColumns())
    runUiSync(root)
    writeAppFile(root, 'resources/ui/posts.ui.ts', CUSTOM_POSTS)
    writeAppFile(root, 'resources/ui/tags.ui.ts', CUSTOM_TAGS)
    // The next migrate adds posts.subtitle, posts.category_id and tags.color.
    const migrated = withField(blogToday(), 'tags', stringField('color', 'Color'))
    writeMetadata(root, migrated)
    return { root, migrated, result: runUiSync(root) }
  }

  it("keeps the developer's edits byte for byte", async () => {
    const { root, result } = await customiseThenMigrate()
    expect(readAppFile(root, 'resources/ui/posts.ui.ts')).toBe(CUSTOM_POSTS)
    expect(readAppFile(root, 'resources/ui/tags.ui.ts')).toBe(CUSTOM_TAGS)
    expect(result.written).toEqual(['.strutvane/ui.gen.ts', '.strutvane/ui.lock.json'])
    expect(result.report.scaffolded).toEqual([])
  })

  it('shows the new columns where auto() is used, with the edits still applied', async () => {
    const { root, migrated, result } = await customiseThenMigrate()
    const posts = resolveResourceUi(resourceOf(migrated, 'posts'), (await loadOwned(root, 'resources/ui/posts.ui.ts')).config)

    expect(posts.columns.map((field) => field.name)).toEqual(expect.arrayContaining(['subtitle', 'category_id']))
    expect(posts.formFields.map((field) => field.name)).toContain('subtitle')
    expect(posts.formFields.map((field) => field.name)).not.toContain('meta') // the edit survived
    expect(posts.formFields[0]?.name).toBe('status') // the order edit survived
    expect(posts.label.plural).toBe('Articles')
    expect(posts.navigation).toMatchObject({ group: 'Content', sort: 1 })

    expect(result.report.addedAutomatically).toContainEqual({ table: 'posts', file: 'resources/ui/posts.ui.ts', list: 'columns', field: 'subtitle' })
    expect(result.report.addedAutomatically).toContainEqual({ table: 'posts', file: 'resources/ui/posts.ui.ts', list: 'form', field: 'category_id' })
  })

  it('never rewrites an explicit list: the new column is reported instead', async () => {
    const { root, migrated, result } = await customiseThenMigrate()
    const tags = resolveResourceUi(resourceOf(migrated, 'tags'), (await loadOwned(root, 'resources/ui/tags.ui.ts')).config)

    expect(tags.columns.map((field) => field.name)).toEqual(['name', 'position'])
    expect(tags.formFields.map((field) => field.name)).toContain('color') // form is still auto()
    expect(result.report.notInExplicitList).toEqual([{ table: 'tags', file: 'resources/ui/tags.ui.ts', list: 'columns', field: 'color' }])
    expect(formatReport(result.report)).toContain(
      "! New column tags.color (columns) is NOT shown: resources/ui/tags.ui.ts lists columns explicitly. Add 'color' to that list if you want it.",
    )
  })

  it('updates the typed registry with the new field names', async () => {
    const { root } = await customiseThenMigrate()
    const gen = readAppFile(root, '.strutvane/ui.gen.ts')
    expect(gen).toContain("tags: 'id' | 'name' | 'position' | 'color'")
    expect(gen).toMatch(/posts: [^\n]*'subtitle' \| 'category_id'/)
  })
})

describe('removing columns and tables', () => {
  it('reports names an owned file still uses after the column was dropped', () => {
    const root = makeApp(blogToday())
    runUiSync(root)
    writeAppFile(root, 'resources/ui/posts.ui.ts', "import { defineResourceUi } from '#strutvane/ui'\n\nexport default defineResourceUi('posts', { columns: ['title', 'subtitle'] })\n")
    writeMetadata(root, blogAfterDroppingSubtitle())

    const { report } = runUiSync(root)
    expect(report.missingFields).toEqual([{ table: 'posts', file: 'resources/ui/posts.ui.ts', list: 'columns', field: 'subtitle' }])
    expect(formatReport(report)).toContain("x resources/ui/posts.ui.ts still names 'subtitle' in columns, but posts no longer has it.")
    expect(readAppFile(root, '.strutvane/ui.gen.ts')).not.toContain("'subtitle'")
  })

  it('keeps the owned file of a dropped table and says it is orphaned', () => {
    const root = makeApp(blogToday())
    runUiSync(root)
    writeMetadata(root, withoutResource(blogToday(), 'tags'))
    const { report } = runUiSync(root)
    expect(report.orphanedOwnedFiles).toEqual(['resources/ui/tags.ui.ts'])
    expect(existsSync(join(root, 'resources/ui/tags.ui.ts'))).toBe(true)
    expect(readAppFile(root, '.strutvane/ui.gen.ts')).not.toContain('tagsUi')
  })
})

describe('owned files are never overwritten', () => {
  it('scaffolds only the new table when one is added later', () => {
    const root = makeApp(blogToday())
    runUiSync(root)
    writeAppFile(root, 'resources/ui/posts.ui.ts', CUSTOM_POSTS)
    writeMetadata(root, withResource(blogToday(), commentsResource()))

    const { report } = runUiSync(root)
    expect(report.scaffolded).toEqual(['resources/ui/comments.ui.ts'])
    expect(readAppFile(root, 'resources/ui/posts.ui.ts')).toBe(CUSTOM_POSTS)
    expect(readdirSync(join(root, 'resources/ui')).sort()).toEqual(['categories.ui.ts', 'comments.ui.ts', 'posts.ui.ts', 'tags.ui.ts', 'users.ui.ts'])
  })

  it('does not overwrite an owned file even when the lock is lost', () => {
    const root = makeApp(blogToday())
    runUiSync(root)
    writeAppFile(root, 'resources/ui/posts.ui.ts', CUSTOM_POSTS)
    rmSync(join(root, '.strutvane/ui.lock.json'))

    const { report } = runUiSync(root)
    expect(readAppFile(root, 'resources/ui/posts.ui.ts')).toBe(CUSTOM_POSTS)
    expect(report.scaffolded).toEqual([])
  })

  it('does not recreate an owned file the developer deleted; it reports it', () => {
    const root = makeApp(blogToday())
    runUiSync(root)
    rmSync(join(root, 'resources/ui/tags.ui.ts'))

    const { report } = runUiSync(root)
    expect(report.missingOwnedFiles).toEqual(['resources/ui/tags.ui.ts'])
    expect(existsSync(join(root, 'resources/ui/tags.ui.ts'))).toBe(false)
    expect(readAppFile(root, '.strutvane/ui.gen.ts')).not.toContain('tagsUi')
  })

  it('treats a damaged lock as missing instead of failing', () => {
    expect(parseLock('{ not json')).toBeUndefined()
    expect(parseLock('{"version":2,"resources":{}}')).toBeUndefined()
    expect(parseLock('{"version":1,"resources":{"posts":[1]}}')).toBeUndefined()
    expect(parseLock('{"version":1,"resources":{"posts":["id"]}}')).toEqual({ version: 1, resources: { posts: ['id'] } })
  })
})

describe('output is deterministic and portable', () => {
  it('produces identical bytes for identical input, LF only, with no machine paths', () => {
    const input = { metadata: blogToday(), lock: undefined, ownedSources: new Map<string, string>() }
    const first = planUiSync(input)
    const second = planUiSync(input)
    expect([...first.machineWrites]).toEqual([...second.machineWrites])
    for (const text of [...first.machineWrites.values(), ...first.ownedWrites.values()]) {
      expect(text).not.toContain('\r')
      expect(text).not.toContain(EXAMPLE_ROOT)
      expect(text.endsWith('\n')).toBe(true)
    }
  })

  it('the committed example app is exactly what ui:sync produces', () => {
    const result = runUiSync(EXAMPLE_ROOT, { dryRun: true })
    const sources = new Map(['categories', 'posts', 'tags', 'users'].map((name) => [`resources/ui/${name}.ui.ts`, readAppFile(EXAMPLE_ROOT, `resources/ui/${name}.ui.ts`)]))
    const plan = planUiSync({ metadata: blogToday(), lock: parseLock(readAppFile(EXAMPLE_ROOT, '.strutvane/ui.lock.json')), ownedSources: sources })
    expect(result.report.scaffolded).toEqual([])
    for (const [path, text] of plan.machineWrites) expect(readAppFile(EXAMPLE_ROOT, path)).toBe(text)
  })
})

describe('friendly failures', () => {
  it('explains what to run when resources.json is missing or wrong', () => {
    const root = makeApp(blogToday())
    rmSync(join(root, '.strutvane/resources.json'))
    expect(() => runUiSync(root)).toThrow(new SyncError(`There is no .strutvane/resources.json in ${root}. Run \`sv migrate\` first; it writes that file.`))

    writeAppFile(root, '.strutvane/resources.json', '{"version":2}')
    expect(() => runUiSync(root)).toThrow(/This is not a Strutvane resources.json/)

    writeAppFile(root, '.strutvane/resources.json', '{oops')
    expect(() => runUiSync(root)).toThrow(/is not valid JSON. Run `sv migrate` again/)
  })
})
