/**
 * Message catalog (RFC-0003 §2), minimal version: `{param}` placeholders, `{attribute}` = the
 * field label. Shared by client-side validation and the fake server, so a message reads the same
 * wherever it was produced. The real package will use ICU MessageFormat and per-locale catalogs.
 */

export type MessageCatalog = Readonly<Record<string, string>>

/** Default English catalog. Keys are stable issue/problem codes. */
export const defaultMessages: MessageCatalog = Object.freeze({
  required: '{attribute} is required.',
  too_small: '{attribute} must be at least {min}.',
  too_big: '{attribute} must be at most {max}.',
  too_short: '{attribute} must be at least {min} characters.',
  too_long: '{attribute} must be at most {max} characters.',
  invalid_enum: '{attribute} must be one of: {values}.',
  invalid_date: '{attribute} must be a valid date.',
  invalid_number: '{attribute} must be a number.',
  invalid_format: '{attribute} has an invalid format.',
  unique: 'This {attribute} is already taken.',
  date_before_field: '{attribute} must be on or after {other}.',
  unknown: '{attribute} is invalid.',
})

/**
 * Render a message from a catalog. Unknown codes fall back to `unknown` (never throw in the UI),
 * and unknown placeholders are left visible so missing params are noticed in development.
 */
export function formatMessage(
  catalog: MessageCatalog,
  code: string,
  params: Readonly<Record<string, string | number | boolean>> = {},
): string {
  const template = catalog[code] ?? catalog.unknown ?? '{attribute} is invalid.'
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    key in params ? String(params[key]) : whole,
  )
}
