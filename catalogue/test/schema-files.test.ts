import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { generateSchemas } from '../src/json-schema.ts'
import { root } from './helpers.ts'

interface ManifestJsonSchema {
  readonly additionalProperties: boolean
  readonly properties: { readonly questions: { readonly items: { readonly oneOf: readonly { readonly properties: { readonly type: { readonly const: string } } }[] } } }
}

describe('generated JSON Schemas', () => {
  it('match the committed files in schema/ (run npm run generate-schema after changing a Zod schema)', async () => {
    for (const [name, text] of Object.entries(generateSchemas())) {
      expect([name, await readFile(new URL(`schema/${name}`, root), 'utf8')]).toEqual([name, text])
    }
  })

  it('refuse unknown fields and list exactly the four question types', () => {
    const manifest = JSON.parse(generateSchemas()['strutvane-manifest.v1.schema.json'] ?? '{}') as ManifestJsonSchema
    expect(manifest.additionalProperties).toBe(false)
    expect(manifest.properties.questions.items.oneOf.map((option) => option.properties.type.const)).toEqual(['select', 'multiselect', 'confirm', 'text'])
  })
})
