/**
 * Generate the JSON Schemas in `schema/` from the Zod schemas.
 *
 * Why both: Zod is the authority (it also checks secret words, safe patterns and cross-field
 * rules, which JSON Schema cannot express). The JSON Schema gives package authors completion and
 * inline errors in their editor (`"$schema"` in package.json is not allowed by npm, so editors
 * map it via settings; see the README). A test fails when the committed files drift.
 *
 * @module
 */
import { z } from 'zod'
import { manifestSchema } from './manifest/schema.ts'
import { catalogueIndexSchema } from './catalogue/index-schema.ts'

/** File name → JSON text, for `schema/`. */
export function generateSchemas(): Record<string, string> {
  const manifest = z.toJSONSchema(manifestSchema, { io: 'input', unrepresentable: 'any' })
  const index = z.toJSONSchema(catalogueIndexSchema, { io: 'output', unrepresentable: 'any' })
  const write = (title: string, description: string, schema: object): string =>
    `${JSON.stringify({ title, description, ...schema }, null, 2)}\n`
  return {
    'strutvane-manifest.v1.schema.json': write(
      'Strutvane package manifest (format 1)',
      'The "strutvane" block in a package.json. Generated from src/manifest/schema.ts; the Zod schema is the authority.',
      manifest,
    ),
    'catalogue.v2.schema.json': write(
      'Strutvane catalogue index (format 2)',
      'catalogue.json built by hub CI. Generated from src/catalogue/index-schema.ts; the Zod schema is the authority.',
      index,
    ),
  }
}
