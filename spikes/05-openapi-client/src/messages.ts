/**
 * A minimal message catalog (RFC-0003 §2). The real implementation uses ICU MessageFormat, per
 * locale, with field/resource/app overrides; this spike proves the mechanics: stable codes, a
 * catalog lookup, `{attribute}` filled from the field label, `{param}` from issue params.
 *
 * @module
 */

/** English defaults, keyed by stable issue code. */
const EN: Readonly<Record<string, string>> = {
  required: '{attribute} is required.',
  invalid_type: '{attribute} must be a {expected}.',
  too_small: '{attribute} must be at least {min}.',
  too_big: '{attribute} must be at most {max}.',
  too_short: '{attribute} must be at least {min} characters.',
  too_long: '{attribute} must be at most {max} characters.',
  invalid_value: '{attribute} must be one of: {values}.',
  invalid_format: '{attribute} must be a valid {format}.',
  unknown_field: '{attribute} is not a known field.',
  unknown_parameter: 'Unknown query parameter "{name}".',
  filter_not_allowed: '{attribute} cannot be filtered.',
  operator_not_allowed: '{attribute} does not support the "{operator}" filter.',
  invalid_filter_value: '{attribute}: invalid value for "{operator}".',
  sort_not_allowed: '{attribute} cannot be sorted.',
  invalid_page_size: 'Page size must be between 1 and {max}.',
  invalid_cursor: 'The page cursor is invalid or expired.',
  conflicting_pagination: 'Use either page[cursor] or page[number], not both.',
  invalid: '{attribute} is invalid.',
}

/** Render a message for `code`. Unknown codes fall back to the generic `invalid` message. */
export function renderMessage(
  code: string,
  params: Readonly<Record<string, string | number | boolean>>,
  attribute: string,
): string {
  const template = EN[code] ?? EN.invalid ?? '{attribute} is invalid.'
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    if (key === 'attribute') return attribute
    const value = params[key]
    return value === undefined ? match : String(value)
  })
}

/** Is `code` known to the catalog? (Used by tests to keep codes and messages in sync.) */
export function hasMessage(code: string): boolean {
  return Object.hasOwn(EN, code)
}
