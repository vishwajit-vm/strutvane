/**
 * The field names of the catalogue manifest (format 1), taken from the Zod schema so the list can
 * never drift from it. Used to tell catalogue fields from the framework's runtime fields in a
 * shared `strutvane` block.
 *
 * @module
 */
import { manifestSchema } from './schema.ts'

/** Every top-level field of the catalogue manifest. */
export const MANIFEST_KEYS: ReadonlySet<string> = new Set(Object.keys(manifestSchema.shape))
