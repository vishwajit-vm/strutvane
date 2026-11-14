/**
 * The static reader of owned files: it must classify auto() and explicit lists exactly, and say
 * "could not read" (never guess) for anything else.
 */
import { describe, expect, it } from 'vitest'
import { readOwnedFile } from '../../src/generator/owned-reader.ts'

const file = (settings: string): string => `import { auto, defineResourceUi } from '#strutvane/ui'\n\nexport default defineResourceUi('posts', ${settings})\n`

describe('readOwnedFile', () => {
  it('reads auto(), auto with options, explicit lists and absent properties', () => {
    const shape = readOwnedFile('posts.ui.ts', file(`{ columns: auto(), form: auto({ except: ['meta'], order: ['title'] }) }`))
    expect(shape.resource).toBe('posts')
    expect(shape.selections.columns).toEqual({ kind: 'auto', except: [], order: [] })
    expect(shape.selections.form).toEqual({ kind: 'auto', except: ['meta'], order: ['title'] })
    expect(shape.selections.filters).toEqual({ kind: 'default' })
    expect(shape.problems).toEqual([])
  })

  it('reads explicit lists, also through `as const` and `satisfies`', () => {
    const shape = readOwnedFile('posts.ui.ts', `import { defineResourceUi } from '#strutvane/ui'\nexport default defineResourceUi('posts', { columns: ['title', 'status'] as const, 'form': ['title'] }) satisfies object\n`)
    expect(shape.selections.columns).toEqual({ kind: 'explicit', fields: ['title', 'status'] })
    expect(shape.selections.form).toEqual({ kind: 'explicit', fields: ['title'] })
  })

  it('reports (never guesses) a list it cannot read statically, with the line number', () => {
    const source = `import { defineResourceUi } from '#strutvane/ui'\nconst shown = ['title']\nexport default defineResourceUi('posts', {\n  columns: shown,\n  form: [...shown, 'status'],\n})\n`
    const shape = readOwnedFile('posts.ui.ts', source)
    expect(shape.selections.columns).toEqual({ kind: 'unreadable', line: 4 })
    expect(shape.selections.form).toEqual({ kind: 'unreadable', line: 5 })
    expect(shape.problems[0]).toBe('posts.ui.ts:4: `columns` is not auto(...) or a list of field names, so ui:sync skipped its checks.')
  })

  it('explains a file without the expected default export, or with a syntax error', () => {
    expect(readOwnedFile('posts.ui.ts', 'export const x = 1\n').problems).toEqual([
      'posts.ui.ts has no `export default defineResourceUi(...)`, so ui:sync cannot tell which columns it shows.',
    ])
    expect(readOwnedFile('posts.ui.ts', 'export default defineResourceUi(\n').problems[0]).toMatch(/^posts.ui.ts has a syntax error/)
  })

  it('treats auto() with a non-literal option as unreadable', () => {
    const shape = readOwnedFile('posts.ui.ts', file(`{ columns: auto({ except: hidden }) }`))
    expect(shape.selections.columns.kind).toBe('unreadable')
  })
})
