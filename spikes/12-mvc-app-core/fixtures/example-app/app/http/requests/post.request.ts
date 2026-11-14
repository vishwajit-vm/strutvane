import { z } from 'zod'
import { FormRequest, type StandardSchema } from '#strutvane/validation'

/** The fields a client may send when writing a post. `author_id` is never one of them. */
const fields = {
  title: z.string({ error: 'Title is required.' }).trim().min(3, { error: 'Title must be at least 3 characters.' }).max(200, { error: 'Title can be at most 200 characters.' }),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { error: 'Slug may only contain lower-case letters, digits and single dashes.' }).max(255),
  body: z.string().max(50_000, { error: 'Body can be at most 50,000 characters.' }).nullable(),
  status: z.enum(['draft', 'published'], { error: 'Status must be draft or published.' }),
}

/** The create schema: title required, status defaults to draft. */
const storeSchema = z.object({ title: fields.title, slug: fields.slug.optional(), body: fields.body.optional(), status: fields.status.default('draft') })

/** The update schema: every field optional (PATCH). */
const updateSchema = z.object(fields).partial()

/** Validation for `POST /api/posts`, Laravel's StorePostRequest. */
export class StorePostRequest extends FormRequest<z.infer<typeof storeSchema>> {
  rules(): StandardSchema<z.infer<typeof storeSchema>> {
    return storeSchema
  }
}

/** Validation for `PATCH /api/posts/{post}`. */
export class UpdatePostRequest extends FormRequest<z.infer<typeof updateSchema>> {
  rules(): StandardSchema<z.infer<typeof updateSchema>> {
    return updateSchema
  }
}
