/**
 * The real {@link Prompter}, built on `@clack/prompts` (runs natively in Windows Terminal, unlike
 * Laravel Prompts on native Windows PHP).
 *
 * @module
 */
import * as clack from '@clack/prompts'
import { CANCEL, type Choice, type Prompter } from './prompter.ts'

/**
 * Convert our choices to clack options. clack's `Option` type is a conditional type; our
 * {@link Choice} has the same shape, so we copy fields explicitly instead of casting.
 */
function toClackOptions<T extends string>(choices: readonly Choice<T>[]): clack.Option<T>[] {
  return choices.map((choice) => {
    const option: { value: T; label: string; hint?: string } = { value: choice.value, label: choice.label }
    if (choice.hint !== undefined) option.hint = choice.hint
    return option
  }) as clack.Option<T>[] // safe: `{ value, label, hint? }` is the non-primitive branch of Option<T>
}

/**
 * The `@clack/prompts` implementation of {@link Prompter}.
 *
 * @example
 * const answers = await askMissing(given, clackPrompter, context)
 */
export const clackPrompter: Prompter = {
  async text(question) {
    const value = await clack.text({
      message: question.message,
      placeholder: question.placeholder,
      validate: (raw) => question.validate(raw ?? ''),
    })
    return clack.isCancel(value) ? CANCEL : value
  },
  async password(question) {
    const value = await clack.password({ message: question.message })
    return clack.isCancel(value) ? CANCEL : value
  },
  async select(question) {
    const value = await clack.select({
      message: question.message,
      options: toClackOptions(question.options),
      initialValue: question.initialValue,
    })
    return clack.isCancel(value) ? CANCEL : value
  },
  async multiselect(question) {
    const value = await clack.multiselect({
      message: question.message,
      options: toClackOptions(question.options),
      initialValues: [...question.initialValues],
      required: false,
    })
    return clack.isCancel(value) ? CANCEL : value
  },
  async confirm(question) {
    const value = await clack.confirm({ message: question.message, initialValue: question.initialValue })
    return clack.isCancel(value) ? CANCEL : value
  },
  note(title, lines) {
    clack.note(lines.join('\n'), title)
  },
  info(message) {
    clack.log.info(message)
  },
}
