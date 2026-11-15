/**
 * Check the answers to a plan's follow-up questions, fill in defaults, and skip questions whose
 * `when` condition is not met. Used for `--yes`/CI runs, `--feature-option` flags and the
 * interactive prompts alike, so every path accepts exactly the same answers.
 *
 * Text answers are matched with the linear-time matcher (`safe-pattern.ts`), never with
 * `new RegExp(pattern)`: the pattern comes from a package, the answer from a person.
 *
 * @module
 */
import type { AnswerValue } from '../manifest/define.ts'
import { matchesPattern, parsePattern } from '../manifest/safe-pattern.ts'
import type { Question } from '../manifest/schema.ts'
import type { InstallPlan } from './plan.ts'

/** The checked answers, keyed `<package id>.<question id>`, plus anything wrong. */
export interface ResolvedAnswers {
  readonly answers: Readonly<Record<string, AnswerValue>>
  /** Keys of questions skipped because their `when` did not match. */
  readonly skipped: readonly string[]
  readonly problems: readonly string[]
}

/**
 * Resolve answers for every question in the plan.
 *
 * `given` may hold real values or the strings a command line produces: `"true"`/`"false"` (or
 * `"yes"`/`"no"`) for confirm questions, and comma-separated values for multiselect.
 *
 * @example
 * resolveAnswers(plan, { 'billing.provider': 'paddle' }).answers['billing.provider'] // 'paddle'
 */
export function resolveAnswers(plan: InstallPlan, given: Readonly<Record<string, unknown>> = {}): ResolvedAnswers {
  const answers: Record<string, AnswerValue> = {}
  const skipped: string[] = []
  const problems: string[] = []
  const known = new Set<string>(plan.questions.map((planned) => planned.key))
  for (const key of Object.keys(given).sort()) {
    if (!known.has(key)) problems.push(`${key} is not a question of the packages being installed`)
  }
  for (const { key, packageId, question } of plan.questions) {
    const when = question.when
    if (when !== undefined) {
      const earlier = answers[`${packageId}.${when.question}`]
      const met = 'includes' in when ? Array.isArray(earlier) && earlier.includes(when.includes) : earlier === when.equals
      if (!met) {
        skipped.push(key)
        continue
      }
    }
    const raw = Object.hasOwn(given, key) ? given[key] : undefined
    const result = checkAnswer(question, raw)
    if (typeof result === 'object' && result !== null && 'problem' in result) problems.push(`${key}: ${result.problem}`)
    else answers[key] = result
  }
  return { answers, skipped, problems }
}

/** One answer (or the default when `raw` is undefined), or the problem with it. */
export function checkAnswer(question: Question, raw: unknown): AnswerValue | { readonly problem: string } {
  switch (question.type) {
    case 'select': {
      const value = raw ?? question.default
      const values = question.choices.map((choice) => choice.value)
      return typeof value === 'string' && values.includes(value) ? value : { problem: `must be one of: ${values.join(', ')}` }
    }
    case 'multiselect': {
      const value = raw === undefined ? question.default : typeof raw === 'string' ? raw.split(',').map((part) => part.trim()).filter(Boolean) : raw
      if (!Array.isArray(value) || !value.every((item): item is string => typeof item === 'string')) return { problem: 'must be a list of choices' }
      const values = question.choices.map((choice) => choice.value)
      const unknown = value.filter((item) => !values.includes(item))
      if (unknown.length > 0) return { problem: `${unknown.join(', ')} ${unknown.length === 1 ? 'is not a choice' : 'are not choices'} (choose from ${values.join(', ')})` }
      if (new Set(value).size !== value.length) return { problem: 'lists a choice twice' }
      const min = question.min ?? 0
      const max = question.max ?? values.length
      if (value.length < min || value.length > max) return { problem: `pick between ${min} and ${max} choices` }
      // Store in the question's own order, so the answer never depends on typing order.
      return values.filter((item) => value.includes(item))
    }
    case 'confirm': {
      const value = raw ?? question.default
      if (typeof value === 'boolean') return value
      if (value === 'true' || value === 'yes') return true
      if (value === 'false' || value === 'no') return false
      return { problem: 'must be yes or no' }
    }
    case 'text': {
      const value = raw ?? question.default
      if (value === undefined) return { problem: 'needs an answer' }
      if (typeof value !== 'string') return { problem: 'must be text' }
      if ([...value].length > question.maxLength) return { problem: `is longer than ${question.maxLength} characters` }
      const parsed = parsePattern(question.pattern.regex)
      // An index that passed validation always has a safe pattern; if not, refuse (fail closed).
      if (!parsed.ok || !matchesPattern(parsed.pattern, value)) return { problem: question.pattern.message }
      return value
    }
  }
}
