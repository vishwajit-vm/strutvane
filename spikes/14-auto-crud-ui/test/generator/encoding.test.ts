/**
 * Generated code must stay valid whatever text the metadata carries, and metadata that would make
 * the generator write outside its folder or emit broken code is refused at the door.
 *
 * Today `resources.json` is machine-written and its names are validated SQL identifiers (spike 10),
 * so these are defence in depth: the label is free text an owner can override, and the file is
 * read from disk, where anything can end up.
 */
import ts from 'typescript'
import { describe, expect, it } from 'vitest'
import { renderGenFile, renderOwnedFile } from '../../src/generator/render.ts'
import { MetadataError, parseAppMetadata, type AppMetadata } from '../../src/shared/metadata.ts'
import { blogToday } from './helpers.ts'

/** TypeScript syntax errors in `source` (no type checking): what would break the build. */
function syntaxErrors(source: string): string[] {
  const file = ts.createSourceFile('x.ts', source, ts.ScriptTarget.ESNext, true)
  const diagnostics = (file as unknown as { parseDiagnostics: readonly ts.Diagnostic[] }).parseDiagnostics
  return diagnostics.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'))
}

/** A field to copy, without a non-null assertion. */
function firstField(resource: AppMetadata['resources'][number]): AppMetadata['resources'][number]['fields'][number] {
  const field = resource.fields[0]
  if (field === undefined) throw new Error('no fields')
  return field
}

function withPosts(change: (posts: AppMetadata['resources'][number]) => AppMetadata['resources'][number]): AppMetadata {
  const metadata = blogToday()
  return { ...metadata, resources: metadata.resources.map((resource) => (resource.table === 'posts' ? change(resource) : resource)) }
}

describe('generated code encoding', () => {
  it('a label with "*/" or a line break cannot end the doc comment early', () => {
    for (const plural of ['Posts */ export const x = 1 /*', 'Posts\n */ oops', 'A \u2028 B']) {
      const posts = withPosts((resource) => ({ ...resource, label: { ...resource.label, plural } })).resources.find((resource) => resource.table === 'posts')
      if (posts === undefined) throw new Error('no posts')
      expect(syntaxErrors(renderOwnedFile(posts)), plural).toEqual([])
    }
  })

  it('names with quotes or backslashes are emitted as valid string literals', () => {
    const metadata = withPosts((resource) => ({ ...resource, fields: [...resource.fields, { ...firstField(resource), name: "it's \\ \"odd\"" }] }))
    const source = renderGenFile(metadata, [])
    expect(syntaxErrors(source)).toEqual([])
    expect(source).toContain(JSON.stringify("it's \\ \"odd\"").slice(1, -1).replace(/\\"/g, '"').replace(/'/g, "\\'"))
  })
})

describe('parseAppMetadata refuses names the generator cannot use safely', () => {
  const bad: readonly [string, (resource: AppMetadata['resources'][number]) => AppMetadata['resources'][number]][] = [
    ['a route that leaves the folder', (resource) => ({ ...resource, route: '../../../src/evil' })],
    ['a route with a slash', (resource) => ({ ...resource, route: 'a/b' })],
    ['a table that is not an identifier', (resource) => ({ ...resource, table: "posts'; --" })],
    ['a field that is not an identifier', (resource) => ({ ...resource, fields: [{ ...firstField(resource), name: 'a b' }] })],
  ]
  it.each(bad)('%s', (_name, change) => {
    expect(() => parseAppMetadata(JSON.parse(JSON.stringify(withPosts(change))))).toThrow(MetadataError)
  })

  it('accepts the real metadata', () => {
    expect(() => parseAppMetadata(JSON.parse(JSON.stringify(blogToday())))).not.toThrow()
  })
})
