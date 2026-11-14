/**
 * The interactive questions, in Laravel's order, plus the review screen ("Create it / Change an
 * answer / Cancel").
 *
 * Each question is a small object: when it applies, how to ask it, and how to show its answer in
 * the review. The review's "Change an answer" re-asks one question, drops answers that no longer
 * apply (for example the Docker answer after switching to SQLite) and asks any question that newly
 * applies. That replaces Laravel Prompts' Ctrl+U "go back", which clack does not have.
 *
 * @module
 */
import {
  type Answers,
  type AnswerKey,
  type AuthFeature,
  type AuthMode,
  DATABASE_LABELS,
  type Database,
  DEFAULTS,
  defaultDatabase,
  DEFAULT_DATABASE_PORTS,
  type Design,
  DESIGNS,
  designInfo,
  dockerByDefault,
  resolveOptions,
  type Stack,
  type TestSetup,
  type UiStarter,
  teamsNote,
} from './options.ts'
import { answerOrThrow, CancelledError, type Choice, type Prompter } from './prompter.ts'
import { sqlIdentifier } from './names.ts'
import { validateProjectName } from './validate-name.ts'

/**
 * What the questions need besides the prompter.
 *
 * @example
 * const context: QuestionContext = { cwd: process.cwd(), targetProblem: () => undefined }
 */
export interface QuestionContext {
  /** Where the project folder will be created. */
  readonly cwd: string
  /** Why a folder name cannot be used (exists and is not empty), or `undefined` if it can. */
  readonly targetProblem: (name: string) => string | undefined
}

/** One question: when it applies, how to ask it, and how its answer reads in the review. */
interface Question {
  readonly key: AnswerKey
  /** Short name used in the review box and the "Change an answer" menu. */
  readonly title: string
  readonly applies: (answers: Answers) => boolean
  readonly ask: (prompter: Prompter, answers: Answers, context: QuestionContext) => Promise<Answers>
  readonly describe: (answers: Answers) => string
}

// Effective values: the answer if given, else the default. Small helpers keep `applies` readable.
const stackOf = (a: Answers): Stack => a.stack ?? DEFAULTS.stack
const authOf = (a: Answers): AuthMode => a.auth ?? DEFAULTS.auth
const databaseOf = (a: Answers): Database => a.database ?? defaultDatabase(a.teams ?? DEFAULTS.teams)
const yesNo = (value: boolean): string => (value ? 'yes' : 'no')

const STACK_CHOICES: readonly Choice<Stack>[] = [
  { value: 'full', label: 'Full-stack app (API + React UI)' },
  { value: 'api', label: 'API only' },
]

const UI_CHOICES: readonly Choice<UiStarter>[] = [
  { value: 'admin', label: 'Admin app', hint: 'React screens generated from your models' },
  { value: 'blank', label: 'Blank React + Vite app' },
]

// Straight from DESIGNS: a new design package appears in the question without code changes here.
const DESIGN_CHOICES: readonly Choice<Design>[] = DESIGNS.map(({ value, label }) => ({ value, label }))

const AUTH_CHOICES: readonly Choice<AuthMode>[] = [
  { value: 'email', label: 'Email + password' },
  { value: 'none', label: 'No sign-in' },
]

const FEATURE_CHOICES: readonly Choice<AuthFeature>[] = [
  { value: 'registration', label: 'Public registration', hint: 'off = invited accounts only' },
  { value: 'verification', label: 'Email verification' },
  { value: '2fa', label: 'Two-factor authentication (2FA)' },
]

const DATABASE_CHOICES: readonly Choice<Database>[] = [
  { value: 'mysql', label: 'MySQL', hint: 'recommended' },
  { value: 'postgres', label: 'PostgreSQL', hint: 'adds row-level security for teams' },
  { value: 'sqlite', label: 'SQLite', hint: 'zero setup, a single file' },
]

const TESTING_CHOICES: readonly Choice<TestSetup>[] = [
  { value: 'vitest', label: 'Vitest (unit + feature tests)' },
  { value: 'vitest-playwright', label: 'Vitest + Playwright browser tests' },
  { value: 'none', label: 'No tests for now' },
]

const STACK_LABELS: Readonly<Record<Stack, string>> = { full: 'Full-stack: API + React UI', api: 'API only' }
const UI_LABELS: Readonly<Record<UiStarter, string>> = { admin: 'admin screens', blank: 'blank React + Vite' }
const FEATURE_LABELS: Readonly<Record<AuthFeature, string>> = {
  registration: 'registration',
  verification: 'email verification',
  '2fa': '2FA',
}
const TESTING_LABELS: Readonly<Record<TestSetup, string>> = {
  vitest: 'Vitest',
  'vitest-playwright': 'Vitest + Playwright',
  none: 'none',
}

const dockerOf = (a: Answers): boolean => a.docker ?? dockerByDefault(databaseOf(a))
/** Connection questions apply only without Docker and with a server database. */
const needsConnection = (a: Answers): boolean => !dockerOf(a) && databaseOf(a) !== 'sqlite'
/** The server database (only called when {@link needsConnection} is true). */
const serverOf = (a: Answers): 'mysql' | 'postgres' => (databaseOf(a) === 'postgres' ? 'postgres' : 'mysql')

/** One free-text connection question with a suggested default (Enter accepts it). */
function connectionText(
  key: 'dbHost' | 'dbPort' | 'dbName' | 'dbUser',
  title: string,
  message: string,
  suggestion: (answers: Answers) => string,
): Question {
  return {
    key,
    title,
    applies: needsConnection,
    ask: async (prompter, answers) => {
      const fallback = suggestion(answers)
      const raw = answerOrThrow(
        await prompter.text({
          id: key,
          message: `${message} (Enter for ${fallback})`,
          placeholder: fallback,
          validate: (value) => (key === 'dbPort' && value.trim() !== '' && !/^\d{1,5}$/.test(value.trim()) ? 'Use a port number from 1 to 65535' : undefined),
        }),
      ).trim()
      const value = raw === '' ? fallback : raw
      return key === 'dbPort' ? { ...answers, dbPort: Number(value) } : { ...answers, [key]: value }
    },
    describe: (a) => String(a[key] ?? suggestion(a)),
  }
}

/** The questions, in the order they are asked. */
const QUESTIONS: readonly Question[] = [
  {
    key: 'name',
    title: 'Name',
    applies: () => true,
    ask: async (prompter, answers, context) => {
      const value = await prompter.text({
        id: 'name',
        message: 'What is the name of your project?',
        placeholder: 'my-app',
        validate: (raw) => validateProjectName(raw.trim())[0] ?? context.targetProblem(raw.trim()),
      })
      return { ...answers, name: answerOrThrow(value).trim() }
    },
    describe: (a) => a.name ?? '',
  },
  {
    key: 'stack',
    title: 'Stack',
    applies: () => true,
    ask: async (prompter, answers) => {
      const value = await prompter.select({
        id: 'stack',
        message: 'What are you building?',
        options: STACK_CHOICES,
        initialValue: DEFAULTS.stack,
      })
      return { ...answers, stack: answerOrThrow(value) }
    },
    describe: (a) => STACK_LABELS[stackOf(a)],
  },
  {
    key: 'ui',
    title: 'UI',
    applies: (a) => stackOf(a) === 'full',
    ask: async (prompter, answers) => {
      const value = await prompter.select({
        id: 'ui',
        message: 'Which React UI starter?',
        options: UI_CHOICES,
        initialValue: DEFAULTS.ui,
      })
      return { ...answers, ui: answerOrThrow(value) }
    },
    describe: (a) => `React, ${UI_LABELS[a.ui ?? DEFAULTS.ui]}`,
  },
  {
    // Asked right after the UI starter: the design only exists where there is a React UI.
    key: 'design',
    title: 'Design',
    applies: (a) => stackOf(a) === 'full',
    ask: async (prompter, answers) => {
      const value = await prompter.select({
        id: 'design',
        message: 'Which design for the React UI? (switch any time later)',
        options: DESIGN_CHOICES,
        initialValue: DEFAULTS.design,
      })
      return { ...answers, design: answerOrThrow(value) }
    },
    // Name and package, so the review says exactly what will be installed.
    describe: (a) => {
      const design = a.design ?? DEFAULTS.design
      return `${design} (${designInfo(design).packageName})`
    },
  },
  {
    key: 'auth',
    title: 'Sign-in',
    applies: () => true,
    ask: async (prompter, answers) => {
      const value = await prompter.select({
        id: 'auth',
        message: 'How should people sign in?',
        options: AUTH_CHOICES,
        initialValue: DEFAULTS.auth,
      })
      return { ...answers, auth: answerOrThrow(value) }
    },
    describe: (a) => (authOf(a) === 'email' ? 'Email + password' : 'No sign-in'),
  },
  {
    key: 'features',
    title: 'Sign-in features',
    applies: (a) => authOf(a) === 'email',
    ask: async (prompter, answers) => {
      const value = await prompter.multiselect({
        id: 'features',
        message: 'Which sign-in features? (space to toggle, enter to confirm)',
        options: FEATURE_CHOICES,
        initialValues: DEFAULTS.features,
      })
      return { ...answers, features: answerOrThrow(value) }
    },
    describe: (a) => {
      const features = a.features ?? DEFAULTS.features
      return features.length === 0 ? 'none' : features.map((f) => FEATURE_LABELS[f]).join(', ')
    },
  },
  {
    key: 'teams',
    title: 'Teams',
    applies: (a) => authOf(a) === 'email',
    ask: async (prompter, answers) => {
      const value = await prompter.confirm({
        id: 'teams',
        message: 'Teams? (each customer company sees only its own data)',
        initialValue: DEFAULTS.teams,
      })
      return { ...answers, teams: answerOrThrow(value) }
    },
    describe: (a) => yesNo(a.teams ?? DEFAULTS.teams),
  },
  {
    key: 'database',
    title: 'Database',
    applies: () => true,
    ask: async (prompter, answers) => {
      const value = answerOrThrow(
        await prompter.select({
          id: 'database',
          message: 'Which database?',
          options: DATABASE_CHOICES,
          // Teams pre-select PostgreSQL (row-level security); MySQL stays one keypress away.
          initialValue: databaseOf(answers),
        }),
      )
      // Say right away what teams mean on this database, so the choice is an informed one.
      const note = teamsNote(answers.teams ?? DEFAULTS.teams, value)
      if (note !== undefined) prompter.info(note)
      return { ...answers, database: value }
    },
    describe: (a) => DATABASE_LABELS[databaseOf(a)],
  },
  {
    key: 'docker',
    title: 'Docker',
    applies: () => true,
    ask: async (prompter, answers) => {
      const value = await prompter.select({
        id: 'docker',
        message: 'Set up with Docker or without Docker?',
        options: [
          { value: 'docker', label: 'With Docker', hint: `app, ${DATABASE_LABELS[databaseOf(answers)]} and Mailpit in containers (like Sail)` },
          { value: 'host', label: 'Without Docker', hint: 'the app runs on this computer' },
        ],
        initialValue: dockerByDefault(databaseOf(answers)) ? 'docker' : 'host',
      })
      return { ...answers, docker: answerOrThrow(value) === 'docker' }
    },
    describe: (a) => (dockerOf(a) ? 'yes: everything runs in containers' : 'no: the app runs on this computer'),
  },
  connectionText('dbHost', 'Database host', 'Database host (your server)', () => '127.0.0.1'),
  connectionText('dbPort', 'Database port', 'Database port', (a) => String(DEFAULT_DATABASE_PORTS[serverOf(a)])),
  connectionText('dbName', 'Database name', 'Database name', (a) => sqlIdentifier(a.name ?? 'app')),
  connectionText('dbUser', 'Database user', 'Database user', (a) => sqlIdentifier(a.name ?? 'app')),
  {
    key: 'dbPassword',
    title: 'Database password',
    applies: needsConnection,
    ask: async (prompter, answers) => {
      const value = answerOrThrow(await prompter.password({ id: 'dbPassword', message: 'Database password (saved only in .env)' }))
      return { ...answers, dbPassword: value }
    },
    describe: (a) => ((a.dbPassword ?? '') === '' ? 'none' : '(hidden)'),
  },
  {
    key: 'testing',
    title: 'Tests',
    applies: () => true,
    ask: async (prompter, answers) => {
      const value = await prompter.select({
        id: 'testing',
        message: 'Which tests do you want?',
        options: TESTING_CHOICES,
        initialValue: DEFAULTS.testing,
      })
      return { ...answers, testing: answerOrThrow(value) }
    },
    describe: (a) => TESTING_LABELS[a.testing ?? DEFAULTS.testing],
  },
  {
    key: 'git',
    title: 'Git',
    applies: () => true,
    ask: async (prompter, answers) => {
      const value = await prompter.confirm({
        id: 'git',
        message: 'Create a git repository with a first commit?',
        initialValue: DEFAULTS.git,
      })
      return { ...answers, git: answerOrThrow(value) }
    },
    describe: (a) => yesNo(a.git ?? DEFAULTS.git),
  },
]

/**
 * Ask every question that applies and has no answer yet (answers given as flags are kept).
 * Throws {@link CancelledError} when the user cancels.
 *
 * @example
 * const answers = await askMissing({ name: 'my-app', database: 'sqlite' }, prompter, context)
 * // asks stack, ui, design, auth, features, teams, testing, git (not name, database or docker)
 */
export async function askMissing(
  given: Answers,
  prompter: Prompter,
  context: QuestionContext,
): Promise<Answers> {
  let answers = given
  for (const question of QUESTIONS) {
    // Re-checked on every loop: an earlier answer (e.g. "No sign-in") can switch later ones off.
    if (question.applies(answers) && answers[question.key] === undefined) {
      answers = await question.ask(prompter, answers, context)
    }
  }
  return answers
}

/**
 * Drop answers whose question no longer applies (for example `docker` after choosing SQLite).
 *
 * Why: a stale answer would otherwise turn into a conflict ("SQLite needs no Docker") after the
 * user changed an earlier answer in the review.
 *
 * @example
 * pruneAnswers({ database: 'sqlite', docker: true }) // { database: 'sqlite' }
 */
export function pruneAnswers(answers: Answers): Answers {
  let pruned = answers
  for (const question of QUESTIONS) {
    if (!question.applies(pruned) && pruned[question.key] !== undefined) {
      pruned = withoutKey(pruned, question.key)
    }
  }
  return pruned
}

/**
 * The review box lines: one line per question that applies, plus the teams note when relevant.
 *
 * @example
 * reviewLines({ name: 'my-app' }, 'C:/code')[0] // 'Folder            C:\\code\\my-app'
 */
export function reviewLines(answers: Answers, cwd: string): string[] {
  const options = resolveOptions(answers, cwd)
  const lines = [`${'Folder'.padEnd(18)}${options.directory}`]
  for (const question of QUESTIONS) {
    if (question.key === 'name' || !question.applies(answers)) continue
    lines.push(`${question.title.padEnd(18)}${question.describe(answers)}`)
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
export async function review(
  answers: Answers,
  prompter: Prompter,
  context: QuestionContext,
): Promise<Answers> {
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

/** Ask which answer to change, re-ask it, then settle whatever that change affects. */
async function changeOne(answers: Answers, prompter: Prompter, context: QuestionContext): Promise<Answers> {
  const applicable = QUESTIONS.filter((q) => q.applies(answers))
  const key = answerOrThrow(
    await prompter.select<AnswerKey>({
      id: 'change',
      message: 'Which answer do you want to change?',
      options: applicable.map((q) => ({ value: q.key, label: `${q.title}: ${q.describe(answers)}` })),
      initialValue: 'database',
    }),
  )
  const question = QUESTIONS.find((q) => q.key === key)
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
