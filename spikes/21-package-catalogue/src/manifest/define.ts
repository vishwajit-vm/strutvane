/**
 * Typed helpers for writing manifests and questions in TypeScript (tests, generators, the
 * `new-package-repo` skill). They catch at compile time what the validator would catch at build
 * time: a select default that is not one of its choices, a text question without a pattern, a
 * question type that does not exist (`password`).
 *
 * They return plain data; nothing here runs at install time.
 *
 * @module
 */
import type { ManifestInput, Question } from './schema.ts'

/** One choice, keeping its value as a literal type. */
export interface ChoiceInput<V extends string> {
  readonly value: V
  readonly label: string
  readonly hint?: string
}

/** At least two items: a "choice" between fewer is not a question. */
export type AtLeastTwo<T> = readonly [T, T, ...T[]]

/** Fields every question has. */
export interface QuestionBaseInput {
  readonly id: string
  readonly label: string
  readonly help?: string
  readonly when?: { readonly question: string; readonly equals: string | boolean } | { readonly question: string; readonly includes: string }
}

type SelectQuestion = Extract<Question, { type: 'select' }>
type MultiselectQuestion = Extract<Question, { type: 'multiselect' }>
type ConfirmQuestion = Extract<Question, { type: 'confirm' }>
type TextQuestion = Extract<Question, { type: 'text' }>

/**
 * A single-choice question. `default` must be one of the choice values (checked by the compiler).
 *
 * @example
 * selectQuestion({
 *   id: 'provider', label: 'Billing: which payment provider?',
 *   choices: [{ value: 'stripe', label: 'Stripe' }, { value: 'paddle', label: 'Paddle' }],
 *   default: 'stripe',
 * })
 */
export function selectQuestion<const V extends string>(
  question: QuestionBaseInput & { readonly choices: AtLeastTwo<ChoiceInput<V>>; readonly default: NoInfer<V> },
): SelectQuestion {
  return { ...question, type: 'select', choices: [...question.choices] }
}

/** A multiple-choice question. Every default must be a choice value. */
export function multiselectQuestion<const V extends string>(
  question: QuestionBaseInput & {
    readonly choices: AtLeastTwo<ChoiceInput<V>>
    readonly default: readonly NoInfer<V>[]
    readonly min?: number
    readonly max?: number
  },
): MultiselectQuestion {
  return { ...question, type: 'multiselect', choices: [...question.choices], default: [...question.default] }
}

/** A yes/no question. */
export function confirmQuestion(question: QuestionBaseInput & { readonly default: boolean }): ConfirmQuestion {
  return { ...question, type: 'confirm' }
}

/**
 * A short text answer. A pattern is required: packages never receive unchecked free text.
 */
export function textQuestion(
  question: QuestionBaseInput & {
    readonly maxLength: number
    readonly pattern: { readonly regex: string; readonly message: string }
    readonly default?: string
    readonly placeholder?: string
  },
): TextQuestion {
  return { ...question, type: 'text' }
}

/**
 * Identity function that gives a manifest literal its type (and editor completion).
 *
 * @example
 * export default defineManifest({ manifestVersion: 1, id: 'tags', … })
 */
export function defineManifest<const M extends ManifestInput>(
  // Generic inference skips TypeScript's excess-property check; this restores it, so a typo or a
  // code-like field (`postinstall`) is a compile error, as it is a validation error.
  manifest: M & Record<Exclude<keyof M, keyof ManifestInput>, never>,
): M {
  return manifest
}

/**
 * The answer type of a question: text for `select` and `text`, a list for `multiselect`, a
 * boolean for `confirm`.
 */
export type AnswerOf<Q extends Question> = Q extends { readonly type: 'select' | 'text' }
  ? string
  : Q extends { readonly type: 'multiselect' }
    ? readonly string[]
    : Q extends { readonly type: 'confirm' }
      ? boolean
      : never

/** Any answer value. */
export type AnswerValue = AnswerOf<Question>
