/**
 * `npm run generate-schema`: write `schema/*.json` from the Zod schemas.
 *
 * @module
 */
import { writeFile } from 'node:fs/promises'
import { generateSchemas } from '../json-schema.ts'

const folder = new URL('../../schema/', import.meta.url)
for (const [name, text] of Object.entries(generateSchemas())) {
  await writeFile(new URL(name, folder), text, 'utf8')
  process.stdout.write(`wrote schema/${name}\n`)
}
