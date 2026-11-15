/**
 * Generated files: golden copies, determinism, and the "stays in sync after migrate" promise,
 * proven with the real TypeScript compiler.
 */
import { spawnSync } from 'node:child_process'
import { cpSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { afterAll, describe, expect, test } from 'vitest'
import { buildArtifacts, writeArtifacts } from '../src/generate/artifacts.ts'
import { BLOG_ROOT, cleanupTempDirs, makeTempDir, migrationSource, replayApp, SPIKE_ROOT } from './helpers.ts'

afterAll(cleanupTempDirs)

const TSC = createRequire(import.meta.url).resolve('typescript/bin/tsc')

function tsc(project: string): { status: number | null; output: string } {
  const result = spawnSync(process.execPath, [TSC, '--noEmit', '-p', join(project, 'tsconfig.json')], { encoding: 'utf8' })
  return { status: result.status, output: `${result.stdout}${result.stderr}` }
}

describe('golden files', () => {
  test('the committed fixtures/blog/.strutvane output is exactly what the generator produces', async () => {
    const files = buildArtifacts(await replayApp(BLOG_ROOT))
    expect([...files.keys()]).toEqual([
      '.strutvane/resources.json',
      '.strutvane/sql/migrations.mariadb.sql',
      '.strutvane/sql/migrations.mysql.sql',
      '.strutvane/sql/migrations.postgres.sql',
      '.strutvane/sql/migrations.sqlite.sql',
      '.strutvane/sql/schema.mariadb.sql',
      '.strutvane/sql/schema.mysql.sql',
      '.strutvane/sql/schema.postgres.sql',
      '.strutvane/sql/schema.sqlite.sql',
      '.strutvane/types/models.d.ts',
    ])
    for (const [path, content] of files) {
      // If this fails after an intended change, run `npm run generate` and review the diff.
      expect(readFileSync(join(BLOG_ROOT, path), 'utf8').replace(/\r\n/g, '\n'), path).toBe(content)
    }
  })

  test('output is deterministic and portable: same bytes twice, LF only, no machine paths', async () => {
    const first = buildArtifacts(await replayApp(BLOG_ROOT))
    const second = buildArtifacts(await replayApp(BLOG_ROOT))
    expect([...second]).toEqual([...first])
    for (const content of first.values()) {
      expect(content).not.toContain('\r')
      expect(content).not.toContain(SPIKE_ROOT)
      expect(content).not.toMatch(/[A-Z]:\\/)
    }
  })

  test('writeArtifacts only touches files whose content changed', async () => {
    const app = makeTempDir('write')
    const files = buildArtifacts(await replayApp(BLOG_ROOT))
    expect(writeArtifacts(app, files)).toHaveLength(10)
    expect(writeArtifacts(app, files)).toEqual([])
  })

  test('the CLI script works in plain Node and reports that nothing changed', () => {
    const result = spawnSync(process.execPath, [join(SPIKE_ROOT, 'scripts', 'generate.ts'), BLOG_ROOT], { encoding: 'utf8' })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Replayed 7 migrations into 4 tables.')
    expect(result.stdout).toContain('Everything was already up to date.')
  })

  test('the CLI prints a friendly error for a broken migration and exits 1', () => {
    const app = makeTempDir('broken')
    cpSync(join(BLOG_ROOT, 'database'), join(app, 'database'), { recursive: true })
    writeFileSync(join(app, 'database', 'migrations', '2026_01_08_000000_typo.ts'), migrationSource("schema.table('post', (t) => { t.string('x').nullable() })", ''))
    const result = spawnSync(process.execPath, [join(SPIKE_ROOT, 'scripts', 'generate.ts'), app], { encoding: 'utf8' })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('[UNKNOWN_TABLE] in 2026_01_08_000000_typo.ts: There is no table "post"')
    expect(result.stderr).toContain('Hint: Known tables: users, posts, categories, tags.')
  })
})

describe('types stay in sync with migrations (real tsc)', () => {
  test('after a migration renames and drops columns, regenerated types turn stale code into compile errors', async () => {
    const app = makeTempDir('sync')
    cpSync(join(BLOG_ROOT, 'database'), join(app, 'database'), { recursive: true })
    cpSync(join(BLOG_ROOT, 'app'), join(app, 'app'), { recursive: true })
    writeFileSync(join(app, 'tsconfig.json'), JSON.stringify({ extends: '../../tsconfig.json', include: ['app', 'consumer.ts', '.strutvane/types/*.d.ts'] }))
    writeFileSync(
      join(app, 'consumer.ts'),
      `import { Post } from './app/models/post.ts'
export function summary(post: Post): string {
  return [post.title, post.subtitle ?? '', post.content ?? ''].join(' ')
}
`,
    )
    writeArtifacts(app, buildArtifacts(await replayApp(app)))
    const before = tsc(app)
    expect(before.output).toBe('')
    expect(before.status).toBe(0)

    // A new migration, like `sv make:migration tidy_posts_table` would start it.
    writeFileSync(
      join(app, 'database', 'migrations', '2026_01_08_000000_tidy_posts_table.ts'),
      migrationSource(
        "schema.table('posts', (t) => { t.dropColumn('subtitle'); t.renameColumn('content', 'body_html') })",
        "schema.table('posts', (t) => { t.renameColumn('body_html', 'content'); t.string('subtitle').nullable() })",
      ),
    )
    // Before `sv migrate` regenerates, the stale types still compile: this is why migrate must regenerate.
    expect(tsc(app).status).toBe(0)

    writeArtifacts(app, buildArtifacts(await replayApp(app)))
    const after = tsc(app)
    expect(after.status).not.toBe(0)
    expect(after.output).toContain("consumer.ts(3,28): error TS2339: Property 'subtitle' does not exist on type 'Post'.")
    expect(after.output).toContain("consumer.ts(3,49): error TS2339: Property 'content' does not exist on type 'Post'.")
  })
})
