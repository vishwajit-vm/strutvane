/**
 * Proof with the real TypeScript compiler (not a mock): after `ui:sync`, an owned file that names
 * a dropped column fails to compile, while `auto()` files keep compiling.
 */
import { join } from 'node:path'
import ts from 'typescript'
import { afterEach, describe, expect, it } from 'vitest'
import { runUiSync } from '../../src/generator/sync.ts'
import { blogAfterDroppingSubtitle, blogToday, cleanupApps, makeApp, SPIKE_ROOT, writeAppFile, writeMetadata } from './helpers.ts'

afterEach(cleanupApps)

/** Compile an app's generated registry and owned files with the spike's own compiler settings. */
function compile(root: string, ownedFiles: readonly string[]): ts.Diagnostic[] {
  const config = ts.getParsedCommandLineOfConfigFile(join(SPIKE_ROOT, 'tsconfig.json'), {}, { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => undefined })
  if (config === undefined) throw new Error('test setup: could not read tsconfig.json')
  const files = [join(root, '.strutvane', 'ui.gen.ts'), ...ownedFiles.map((file) => join(root, file))]
  const program = ts.createProgram(files, { ...config.options, types: [] })
  return [...ts.getPreEmitDiagnostics(program)]
}

/** Diagnostics as "file:message" lines, easy to read in a failing assertion. */
function describeDiagnostics(diagnostics: readonly ts.Diagnostic[]): string[] {
  return diagnostics.map((diagnostic) => `${diagnostic.file?.fileName.split('/').at(-1) ?? '?'}: TS${diagnostic.code} ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`)
}

const EXPLICIT_POSTS = `import { auto, defineResourceUi } from '#strutvane/ui'

export default defineResourceUi('posts', {
  columns: ['title', 'subtitle', 'status'],
  form: auto({ except: ['meta'] }),
})
`

describe('owned files are type-checked against the schema', () => {
  it('compiles while the column exists, and fails with TS2322 once a migration drops it', () => {
    const root = makeApp(blogToday())
    runUiSync(root)
    writeAppFile(root, 'resources/ui/posts.ui.ts', EXPLICIT_POSTS)
    const owned = ['resources/ui/posts.ui.ts', 'resources/ui/tags.ui.ts', 'resources/ui/users.ui.ts', 'resources/ui/categories.ui.ts']
    expect(describeDiagnostics(compile(root, owned))).toEqual([])

    writeMetadata(root, blogAfterDroppingSubtitle())
    runUiSync(root)
    const errors = describeDiagnostics(compile(root, owned))
    expect(errors).toHaveLength(1)
    expect(errors[0]).toMatch(/^posts\.ui\.ts: TS2322 Type '"subtitle"' is not assignable to type /)
  })

  it('rejects unknown resources, unknown fields in auto() options and unknown icons', () => {
    const root = makeApp(blogToday())
    runUiSync(root)
    writeAppFile(
      root,
      'resources/ui/posts.ui.ts',
      `import { auto, defineResourceUi } from '#strutvane/ui'

export default defineResourceUi('posts', {
  form: auto({ except: ['nope'] }),
  navigation: { icon: 'reciept' },
  defaultSort: '-nope',
})
export const other = defineResourceUi('invoices', {})
`,
    )
    const errors = describeDiagnostics(compile(root, ['resources/ui/posts.ui.ts']))
    expect(errors).toEqual([
      expect.stringMatching(/TS2322 Type '"nope"' is not assignable/),
      expect.stringMatching(/TS2820 Type '"reciept"' is not assignable to type 'IconName \| undefined'. Did you mean '"receipt"'\?/),
      expect.stringMatching(/TS2322 Type '"-nope"' is not assignable/),
      expect.stringMatching(/TS2345 Argument of type '"invoices"' is not assignable to parameter of type 'ResourceName'/),
    ])
  })

  it('never exposes hidden columns: `password` is not a field name of users', () => {
    const root = makeApp(blogToday())
    runUiSync(root)
    writeAppFile(root, 'resources/ui/users.ui.ts', `import { defineResourceUi } from '#strutvane/ui'\nexport default defineResourceUi('users', { columns: ['name', 'password'] })\n`)
    expect(describeDiagnostics(compile(root, ['resources/ui/users.ui.ts']))).toEqual([expect.stringMatching(/TS2322 Type '"password"' is not assignable/)])
  })
})
