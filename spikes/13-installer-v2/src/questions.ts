/**
 * The question engine: asks what the registry (question-registry.ts) says, in order, then shows
 * the review screen ("Create it / Change an answer / Cancel").
 *
 * Recommended mode asks only the ★ questions (plus the ones an earlier answer made necessary,
 * such as your own database server's details); every other question takes its default, and the
 * review still lists it, so nothing is hidden. Custom mode asks everything, group by group.
 *
 * "Change an answer" re-asks one question, drops answers that no longer apply (for example the
 * connection details after switching to SQLite) and asks any question that newly applies. That
 * replaces Laravel Prompts' Ctrl+U "go back", which clack does not have.
 *
 * @module
 */
import { type AnswerKey, type Answers, DEFAULTS, resolveOptions, teamsNote } from './options.ts'
import { answerOrThrow, CancelledError, type Prompter } from './prompter.ts'
import { QUESTION_GROUPS, QUESTIONS, type Question, type QuestionContext } from './question-registry.ts'

export type { QuestionContext } from './question-registry.ts'

/** Recommended or Custom: the answer, or the default. */
const modeOf = (answers: Answers) => answers.mode ?? DEFAULTS.mode

/** Should this question be asked now? */
function shouldAsk(question: Question, answers: Answers): boolean {
  if (!question.when(answers) || question.answered(answers)) return false
  return question.recommended || question.alwaysAsk || modeOf(answers) === 'custom'
}

/**
 * Ask every question that applies, is still unanswered and belongs to the chosen mode (answers
 * given as flags are kept). Throws {@link CancelledError} when the user cancels.
 *
 * Why several passes: a later answer can switch on an earlier question (teams, row 11, makes
 * enterprise SSO, row 8, apply). The loop asks newly applying questions until nothing is left,
 * so the result never depends on where a question sits in the list.
 *
 * @example
 * const answers = await askMissing({ name: 'my-app', database: 'sqlite' }, prompter, context)
 */
export async function askMissing(given: Answers, prompter: Prompter, context: QuestionContext): Promise<Answers> {
  let answers = given
  let lastGroup: string | undefined
  for (let pass = 0; pass < QUESTIONS.length; pass++) {
    let asked = false
    for (const question of QUESTIONS) {
      // Re-checked every time: an earlier answer (e.g. "No sign-in") can switch later ones off.
      if (!shouldAsk(question, answers)) continue
      if (modeOf(answers) === 'custom' && question.group !== lastGroup && question.group !== 'Project') {
        prompter.info(`── ${question.group} ──`)
      }
      lastGroup = question.group
      answers = await question.ask(prompter, answers, context)
      asked = true
    }
    if (!asked) break
  }
  return answers
}

/**
 * Drop answers whose question no longer applies (for example `docker` after choosing SQLite), and
 * let each question tidy its own stale parts (follow-up answers of an unpicked package).
 *
 * Why: a stale answer would otherwise turn into a conflict ("SQLite needs no Docker") after the
 * user changed an earlier answer in the review.
 *
 * @example
 * pruneAnswers({ database: 'sqlite', dbHost: 'x', docker: false }) // { database: 'sqlite', docker: false }
 */
export function pruneAnswers(answers: Answers): Answers {
  let pruned = answers
  for (const question of QUESTIONS) {
    if (!question.when(pruned) && pruned[question.id] !== undefined) {
      pruned = withoutKey(pruned, question.id)
    } else {
      pruned = question.tidy(pruned)
    }
  }
  return pruned
}

/** The title column of the review box. */
const TITLE_WIDTH = 24

/**
 * The review box lines: the folder, then every question that applies (answered or default),
 * grouped, plus the teams note when relevant. Secrets show as "(hidden)".
 *
 * @example
 * reviewLines({ name: 'my-app' }, 'C:/code')[0] // 'Folder                  C:\\code\\my-app'
 */
export function reviewLines(answers: Answers, cwd: string): string[] {
  const options = resolveOptions(answers, cwd)
  const lines = [`${'Folder'.padEnd(TITLE_WIDTH)}${options.directory}`]
  for (const group of QUESTION_GROUPS) {
    const shown = QUESTIONS.filter((q) => q.group === group && q.id !== 'name' && q.when(answers))
    if (shown.length === 0) continue
    lines.push('', group)
    for (const question of shown) lines.push(`${question.title.padEnd(TITLE_WIDTH)}${question.describe(answers)}`)
  }
  const note = teamsNote(options.teams, options.database)
  if (note !== undefined) lines.push('', note)
  return lines
}

/**
 * Show the review box and loop until the user creates the project or cancels.
 * Returns the final answers; throws {@link CancelledError} on "Cancel".
 *
 * @example
 * const final = await review(answers, prompter, context)
 */
export async function review(answers: Answers, prompter: Prompter, context: QuestionContext): Promise<Answers> {
  let current = answers
  for (;;) {
    prompter.note('Review', reviewLines(current, context.cwd))
    const decision = answerOrThrow(
      await prompter.select({
        id: 'review',
        message: 'Create the project?',
        options: [
          { value: 'create', label: 'Create it' },
          { value: 'change', label: 'Change an answer' },
          { value: 'cancel', label: 'Cancel' },
        ],
        initialValue: 'create',
      }),
    )
    if (decision === 'create') return current
    if (decision === 'cancel') throw new CancelledError()
    current = await changeOne(current, prompter, context)
  }
}

/** Ask which answer to change (any that applies, defaults included), re-ask it, then settle. */
async function changeOne(answers: Answers, prompter: Prompter, context: QuestionContext): Promise<Answers> {
  const applicable = QUESTIONS.filter((q) => q.when(answers))
  const key = answerOrThrow(
    await prompter.select<AnswerKey>({
      id: 'change',
      message: 'Which answer do you want to change?',
      options: applicable.map((q) => ({ value: q.id, label: `${q.title}: ${q.describe(answers)}`.slice(0, 74) })),
      initialValue: 'database',
    }),
  )
  const question = QUESTIONS.find((q) => q.id === key)
  if (question === undefined) return answers
  const changed = await question.ask(prompter, withoutKey(answers, key), context)
  return askMissing(pruneAnswers(changed), prompter, context)
}

/** A copy of `answers` without one key (so the question counts as unanswered). */
function withoutKey(answers: Answers, key: AnswerKey): Answers {
  const copy: { -readonly [K in AnswerKey]?: Answers[K] } = { ...answers }
  delete copy[key]
  return copy
}
