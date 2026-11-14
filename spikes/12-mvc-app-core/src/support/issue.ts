/**
 * The validation issue shape shared by HTTP errors, form requests and list-query parsing. It
 * lives in `support` so the database layer can report issues without importing `http`.
 */

/**
 * One thing wrong with one field.
 *
 * @example
 * const issue: Issue = { field: 'title', code: 'too_small', message: 'Title must be at least 3 characters.' }
 */
export interface Issue {
  /** The field path (`title`, `tags.0`), or `''` for the request as a whole. */
  readonly field: string
  /** A stable code clients can match on. */
  readonly code: string
  /** A friendly sentence for a person. */
  readonly message: string
}
