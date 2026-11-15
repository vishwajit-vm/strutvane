/**
 * The question registry: ONE array, {@link QUESTIONS}, holds every installer question of
 * blueprint §2.1 (rows 1–36; row 37 "start the dev server?" is asked after setup, see main.ts).
 *
 * Each entry is data: its id, group, title, choices (with the packages a choice brings), default,
 * flag, `when` rule and whether Recommended mode asks it (★). A handful of small factories
 * (`select`, `multi`, `confirm`, `text`, `password`) turn that data into the uniform
 * {@link Question} interface, so the engine (questions.ts), the flag parser (args.ts), the help
 * text, the review screen, the "same project without questions" command, the resume file and the
 * package list all loop over the same array. There is no per-question switch anywhere.
 *
 * Defaults and "does this apply?" rules come from options.ts, which `resolveOptions` also uses,
 * so a question and the final options can never disagree.
 *
 * @module
 */
import {
  type Catalogue,
  type CatalogueEntry,
  findOffered,
  installerCatalogue,
  offeredEntries,
  popularGroups,
} from './catalogue.ts'
import { envValueProblem } from './env-file.ts'
import { sqlIdentifier } from './names.ts'
import {
  AI_PROVIDERS,
  type AnswerKey,
  type Answers,
  aiOf,
  DATABASE_LABELS,
  DEFAULT_DATABASE_PORTS,
  defaultDatabaseUser,
  isLocalHost,
  parseDatabaseUrl,
  DEFAULTS,
  DESIGNS,
  databaseOf,
  defaultActivityLog,
  defaultAdminEmail,
  defaultSampleData,
  defaultTimeZone,
  dockerByDefault,
  gitOf,
  hasPasswords,
  hasSignIn,
  hasUi,
  isCurrency,
  isEmail,
  isLocale,
  isTimeZone,
  MIN_ADMIN_PASSWORD,
  needsConnection,
  teamsNote,
  teamsOf,
  UI_LANGUAGE_CHOICES,
} from './options.ts'
import { answerOrThrow, type Choice, type Prompter } from './prompter.ts'
import { validateProjectName } from './validate-name.ts'

/** Question groups, in the order Custom mode walks through them. */
export const QUESTION_GROUPS = ['Project', 'App', 'Sign-in', 'Teams', 'Data', 'Infra', 'Features', 'Quality', 'Workflow', 'Security', 'AI', 'UI', 'Ops'] as const
/** One of {@link QUESTION_GROUPS}. */
export type QuestionGroup = (typeof QUESTION_GROUPS)[number]

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
  /** The package index for question 22 (the installer's own by default; tests pass their own). */
  readonly catalogue?: Catalogue
}

/** How a question is set from the command line. */
export interface FlagSpec {
  /** Without dashes: `db` for `--db`. */
  readonly name: string
  readonly type: 'string' | 'boolean'
  /** May be given several times (`--feature-option a=b --feature-option c=d`). */
  readonly multiple?: boolean
  /** How the flag is written in `--help`, for example `--db mysql|postgres|sqlite`. */
  readonly usage: string
  readonly help: string
  /** The default as `--help` shows it. */
  readonly defaultLabel: string
  /** Extra `npm_config_*` names npm stores this flag under, when npm renames it on the way. */
  readonly npmAliases?: readonly string[]
}

/** One question, whatever its kind. Every installer feature reads questions through this. */
export interface Question {
  readonly id: AnswerKey
  /** The row of the blueprint §2.1 table (0 for the "Recommended or Custom" opener). */
  readonly row: number
  readonly group: QuestionGroup
  /** Short name used in the review box and the "Change an answer" menu. */
  readonly title: string
  /** ★ in the blueprint: asked in Recommended mode too. */
  readonly recommended: boolean
  /**
   * Asked whenever it applies, in either mode, because an earlier answer made it necessary and it
   * has no safe default (your own database server's details, a password you chose to type).
   */
  readonly alwaysAsk: boolean
  /** `undefined` only for secrets, which come from {@link Question.secretEnv} instead of a flag. */
  readonly flag: FlagSpec | undefined
  /** For secrets: the environment variable used when there is no terminal. */
  readonly secretEnv: string | undefined
  /** Does the question apply to these answers? */
  when(answers: Answers): boolean
  /** Has the user (or a flag) answered it? */
  answered(answers: Answers): boolean
  ask(prompter: Prompter, answers: Answers, context: QuestionContext): Promise<Answers>
  /** The effective answer (the default when not answered), in words, for the review. */
  describe(answers: Answers): string
  /** Read a flag value (or a value stored in setup.json); bad values add a problem. */
  read(raw: unknown, problems: string[]): Answers
  /** The command-line words that reproduce the effective answer (`['--db', 'mysql']`). */
  flagWords(answers: Answers): readonly string[]
  /** npm packages the effective answer brings. */
  packages(answers: Answers): readonly string[]
  /** Drop parts of the answer that an earlier change made stale (default: nothing to drop). */
  tidy(answers: Answers): Answers
}

// ── Building blocks shared by the factories ──────────────────────────────────────────────────

/** The answer type of one key, without "not answered". */
type Value<K extends AnswerKey> = Exclude<Answers[K], undefined>
/** The keys whose answer is a yes/no. */
type BoolKey = { [K in AnswerKey]-?: Value<K> extends boolean ? K : never }[AnswerKey]
/** The item type of a list answer. */
type Item<K extends AnswerKey> = Value<K> extends readonly (infer E)[] ? E & string : never

/** What every question declares. */
interface Common {
  readonly row: number
  readonly group: QuestionGroup
  readonly title: string
  readonly message: string | ((answers: Answers) => string)
  readonly recommended?: boolean
  readonly alwaysAsk?: boolean
  readonly when?: (answers: Answers) => boolean
  readonly flag: string
  readonly help: string
  readonly npmAliases?: readonly string[]
}

/** A choice plus what it brings: the packages it installs and a short review wording. */
export interface OptionChoice<T extends string> extends Choice<T> {
  readonly packages?: readonly string[]
  /** Review wording when it differs from the label (labels can be long). */
  readonly short?: string
}

const always = (): boolean => true
const messageOf = (spec: Common, answers: Answers): string =>
  typeof spec.message === 'function' ? spec.message(answers) : spec.message

/** A copy of the answers with one key set. */
function put(answers: Answers, key: AnswerKey, value: unknown): Answers {
  return { ...answers, [key]: value }
}

function base(id: AnswerKey, spec: Common, flag: Omit<FlagSpec, 'name' | 'help' | 'npmAliases'>) {
  const flagSpec: FlagSpec = spec.npmAliases === undefined
    ? { name: spec.flag, help: spec.help, ...flag }
    : { name: spec.flag, help: spec.help, npmAliases: spec.npmAliases, ...flag }
  return {
    id,
    row: spec.row,
    group: spec.group,
    title: spec.title,
    recommended: spec.recommended ?? false,
    alwaysAsk: spec.alwaysAsk ?? false,
    flag: flagSpec,
    secretEnv: undefined,
    when: spec.when ?? always,
    answered: (answers: Answers) => answers[id] !== undefined,
    tidy: (answers: Answers) => answers,
  }
}

/** One choice out of a list. */
interface SelectSpec<T extends string> extends Common {
  readonly choices: readonly OptionChoice<T>[] | (() => readonly OptionChoice<T>[])
  readonly default: (answers: Answers) => T
  /** Something to say right after the answer (the teams note after the database). */
  readonly afterAnswer?: (prompter: Prompter, answers: Answers) => void
}

function select<K extends AnswerKey>(id: K, spec: SelectSpec<Value<K> & string>): Question {
  type T = Value<K> & string
  const choices = (): readonly OptionChoice<T>[] => (typeof spec.choices === 'function' ? spec.choices() : spec.choices)
  const find = (value: unknown): OptionChoice<T> | undefined => choices().find((choice) => choice.value === value)
  const effective = (answers: Answers): OptionChoice<T> => {
    const chosen = find(answers[id]) ?? find(spec.default(answers))
    if (chosen === undefined) throw new Error(`The default of ${id} is not one of its choices`)
    return chosen
  }
  const valid = () => choices().map((c) => c.value).join(', ')
  return {
    // The flag is a getter: choices may be computed from the finished registry (the opener counts
    // questions), so they must not be read while the registry array is still being built.
    ...base(id, spec, { type: 'string', usage: '', defaultLabel: '' }),
    get flag(): FlagSpec {
      return { ...base(id, spec, { type: 'string', usage: `--${spec.flag} ${choices().map((c) => c.value).join('|')}`, defaultLabel: spec.default({}) }).flag }
    },
    async ask(prompter, answers) {
      const value = answerOrThrow(
        await prompter.select({ id, message: messageOf(spec, answers), options: choices(), initialValue: effective(answers).value }),
      )
      const next = put(answers, id, value)
      spec.afterAnswer?.(prompter, next)
      return next
    },
    describe: (answers) => {
      const chosen = effective(answers)
      return chosen.short ?? chosen.label
    },
    read(raw, problems) {
      const match = find(raw)
      if (match === undefined) {
        problems.push(`--${spec.flag} "${String(raw)}" is not a choice. Use one of: ${valid()}`)
        return {}
      }
      return put({}, id, match.value)
    },
    flagWords: (answers) => [`--${spec.flag}`, effective(answers).value],
    packages: (answers) => effective(answers).packages ?? [],
  }
}

/** Yes or no. Shown as a select with two worded choices when `asSelect` is given (Docker). */
interface ConfirmSpec extends Common {
  readonly default: (answers: Answers) => boolean
  /** Packages a "yes" brings. */
  readonly packages?: readonly string[]
  /** Review wording for yes and no (default: "yes" / "no"). */
  readonly words?: readonly [string, string]
  readonly asSelect?: (answers: Answers) => { readonly yes: Choice<string>; readonly no: Choice<string> }
}

function confirm<K extends BoolKey>(id: K, spec: ConfirmSpec): Question {
  const current = (answers: Answers): boolean | undefined => {
    const raw: unknown = answers[id]
    return typeof raw === 'boolean' ? raw : undefined
  }
  const effective = (answers: Answers): boolean => current(answers) ?? spec.default(answers)
  const [yesWord, noWord] = spec.words ?? ['yes', 'no']
  return {
    ...base(id, spec, { type: 'boolean', usage: `--${spec.flag} / --no-${spec.flag}`, defaultLabel: spec.default({}) ? 'yes' : 'no' }),
    async ask(prompter, answers) {
      const message = messageOf(spec, answers)
      if (spec.asSelect !== undefined) {
        const { yes, no } = spec.asSelect(answers)
        const picked = answerOrThrow(
          await prompter.select({ id, message, options: [yes, no], initialValue: effective(answers) ? yes.value : no.value }),
        )
        return put(answers, id, picked === yes.value)
      }
      return put(answers, id, answerOrThrow(await prompter.confirm({ id, message, initialValue: effective(answers) })))
    },
    describe: (answers) => (effective(answers) ? yesWord : noWord),
    read(raw, problems) {
      if (typeof raw !== 'boolean') {
        problems.push(`--${spec.flag} takes no value: use --${spec.flag} or --no-${spec.flag}`)
        return {}
      }
      return put({}, id, raw)
    },
    flagWords: (answers) => [effective(answers) ? `--${spec.flag}` : `--no-${spec.flag}`],
    packages: (answers) => (effective(answers) ? (spec.packages ?? []) : []),
  }
}

/** Pick any number from a list (or `none`). */
interface MultiSpec<T extends string> extends Common {
  readonly choices: readonly OptionChoice<T>[]
  readonly default: (answers: Answers) => readonly T[]
  /** Accept values outside the list (any language tag); the default accepts list values only. */
  readonly parseItem?: (raw: string) => T | undefined
  /** What a value outside the list must look like, for the error message. */
  readonly itemHint?: string
}

function multi<K extends AnswerKey>(id: K, spec: MultiSpec<Item<K>>): Question {
  type T = Item<K>
  const parseItem = spec.parseItem ?? ((raw: string): T | undefined => spec.choices.find((c) => c.value === raw)?.value)
  const current = (answers: Answers): T[] | undefined => {
    const raw: unknown = answers[id]
    if (!Array.isArray(raw)) return undefined
    return raw.flatMap((item: unknown) => {
      const parsed = typeof item === 'string' ? parseItem(item) : undefined
      return parsed === undefined ? [] : [parsed]
    })
  }
  const effective = (answers: Answers): readonly T[] => current(answers) ?? spec.default(answers)
  const labelOf = (value: T): string => {
    const choice = spec.choices.find((c) => c.value === value)
    return choice?.short ?? choice?.label ?? value
  }
  const listHint = spec.itemHint ?? spec.choices.map((c) => c.value).join(', ')
  return {
    ...base(id, spec, { type: 'string', usage: `--${spec.flag} <list>|none`, defaultLabel: spec.default({}).join(',') || 'none' }),
    async ask(prompter, answers) {
      const chosen = effective(answers)
      // Values outside the list (typed with the flag) stay pickable when the answer is changed.
      const extra = chosen.filter((value) => !spec.choices.some((c) => c.value === value)).map((value) => ({ value, label: value }))
      const value = answerOrThrow(
        await prompter.multiselect({ id, message: messageOf(spec, answers), options: [...spec.choices, ...extra], initialValues: chosen }),
      )
      return put(answers, id, value)
    },
    describe: (answers) => {
      const chosen = effective(answers)
      return chosen.length === 0 ? 'none' : chosen.map(labelOf).join(', ')
    },
    read(raw, problems) {
      const items = typeof raw === 'string' ? (raw.trim() === 'none' ? [] : raw.split(',').map((p) => p.trim())) : raw
      if (!Array.isArray(items)) {
        problems.push(`--${spec.flag} needs a comma list of: ${listHint}, or none`)
        return {}
      }
      const values: T[] = []
      for (const item of items) {
        const parsed = typeof item === 'string' ? parseItem(item) : undefined
        if (parsed === undefined) {
          problems.push(`--${spec.flag} "${String(item)}" is not a choice. Use a comma list of: ${listHint}, or none`)
        } else if (!values.includes(parsed)) {
          values.push(parsed)
        }
      }
      return put({}, id, values)
    },
    flagWords: (answers) => [`--${spec.flag}`, effective(answers).join(',') || 'none'],
    packages: (answers) => [
      ...new Set(effective(answers).flatMap((value) => spec.choices.find((c) => c.value === value)?.packages ?? [])),
    ],
  }
}

/** Free text with a suggested default (Enter accepts it). */
interface TextSpec<V> extends Common {
  readonly default: (answers: Answers) => V
  /** Turn typed text into a value, or `undefined` when it is not valid. */
  readonly parse: (raw: string) => V | undefined
  /** Why a value is not valid (ends the sentence "--flag "x" ..."). */
  readonly invalid: string
  /** Is a stored value (setup.json) already of the right type? */
  readonly is: (raw: unknown) => raw is V
  readonly show?: (value: V) => string
  readonly usageValue: string
  /** Optional settings: an empty answer means "not set" and is left out of the repeat command. */
  readonly optional?: boolean
}

function text<K extends AnswerKey>(id: K, spec: TextSpec<Value<K>>): Question {
  const show = spec.show ?? ((value: Value<K>) => String(value))
  const current = (answers: Answers): Value<K> | undefined => {
    const raw: unknown = answers[id]
    return spec.is(raw) ? raw : undefined
  }
  const effective = (answers: Answers): Value<K> => current(answers) ?? spec.default(answers)
  return {
    ...base(id, spec, { type: 'string', usage: `--${spec.flag} ${spec.usageValue}`, defaultLabel: '' }),
    get flag(): FlagSpec {
      return { ...base(id, spec, { type: 'string', usage: `--${spec.flag} ${spec.usageValue}`, defaultLabel: safeDefaultLabel(() => show(spec.default({}))) }).flag }
    },
    async ask(prompter, answers) {
      const fallback = show(spec.default(answers))
      const raw = answerOrThrow(
        await prompter.text({
          id,
          message: `${messageOf(spec, answers)} (Enter for ${fallback})`,
          placeholder: fallback,
          validate: (typed) => (typed.trim() === '' || spec.parse(typed.trim()) !== undefined ? undefined : `This ${spec.invalid}`),
        }),
      ).trim()
      const value = raw === '' ? spec.default(answers) : spec.parse(raw)
      return value === undefined ? answers : put(answers, id, value)
    },
    describe: (answers) => show(effective(answers)),
    read(raw, problems) {
      if (spec.is(raw) && typeof raw !== 'string') return put({}, id, raw)
      const parsed = typeof raw === 'string' ? spec.parse(raw.trim()) : undefined
      if (parsed === undefined) {
        problems.push(`--${spec.flag} "${String(raw)}" ${spec.invalid}`)
        return {}
      }
      return put({}, id, parsed)
    },
    flagWords: (answers) => {
      const shown = show(effective(answers))
      return spec.optional === true && shown === '' ? [] : [`--${spec.flag}`, shown]
    },
    packages: () => [],
  }
}

/** Some defaults depend on the machine (time zone); `--help` must still print. */
function safeDefaultLabel(compute: () => string): string {
  try {
    return compute()
  } catch {
    return ''
  }
}

/** A masked secret. Never a flag (flags end up in shell history and CI logs): an env var instead. */
interface PasswordSpec {
  readonly row: number
  readonly group: QuestionGroup
  readonly title: string
  readonly message: string
  readonly when: (answers: Answers) => boolean
  readonly env: string
  readonly minLength: number
  /**
   * An extra check with the other answers at hand: returns why the value cannot be used (it is
   * asked again), or `undefined`. May also print a warning through the prompter.
   */
  readonly check?: (value: string, answers: Answers, prompter: Prompter) => string | undefined
}

function password(id: 'dbPassword' | 'dbUrl' | 'adminPassword', spec: PasswordSpec): Question {
  return {
    id,
    row: spec.row,
    group: spec.group,
    title: spec.title,
    recommended: false,
    alwaysAsk: true,
    flag: undefined,
    secretEnv: spec.env,
    when: spec.when,
    answered: (answers) => answers[id] !== undefined,
    async ask(prompter, answers) {
      for (;;) {
        const value = answerOrThrow(await prompter.password({ id, message: spec.message }))
        // Never repeat the value: only say why it cannot be used.
        const envProblem = envValueProblem(value)
        const problem =
          value.length < spec.minLength
            ? `Please use at least ${spec.minLength} characters.`
            : envProblem !== undefined
              ? `This value ${envProblem} (it is stored in .env). Please choose another.`
              : spec.check?.(value, answers, prompter)
        if (problem === undefined) return put(answers, id, value)
        prompter.info(problem)
      }
    },
    // Never the value, not even its length.
    describe: (answers) => ((answers[id] ?? '') === '' ? 'none' : '(hidden)'),
    read: () => ({}),
    flagWords: () => [],
    packages: () => [],
    tidy: (answers) => answers,
  }
}

// ── Question 22: extra features from the catalogue, and their follow-up questions ────────────

const catalogueOf = (context: QuestionContext): Catalogue => context.catalogue ?? installerCatalogue()

/** The picked entries (or the defaults), keeping only what the catalogue offers. */
function pickedEntries(answers: Answers, catalogue: Catalogue = installerCatalogue()): CatalogueEntry[] {
  const ids = answers.features ?? DEFAULTS.features
  return offeredEntries(catalogue).filter((entry) => ids.includes(entry.id))
}

const toChoice = (entry: CatalogueEntry): Choice<string> => ({ value: entry.id, label: entry.name, hint: entry.description })

const featuresQuestion: Question = {
  id: 'features',
  row: 22,
  group: 'Features',
  title: 'Extra features',
  recommended: false,
  alwaysAsk: false,
  flag: {
    name: 'features',
    type: 'string',
    usage: '--features <ids>|none',
    help: 'Extra packages by catalogue id (node strut add lists them)',
    defaultLabel: DEFAULTS.features.join(','),
  },
  secretEnv: undefined,
  when: always,
  answered: (answers) => answers.features !== undefined,
  async ask(prompter, answers, context) {
    const catalogue = catalogueOf(context)
    const offered = offeredEntries(catalogue)
    const current = answers.features ?? DEFAULTS.features
    // Step 1: the short popular list, grouped by category (never all 100+ packages at once).
    const groups = new Map(popularGroups(catalogue, offered).map((group) => [group.category.name, group.entries.map(toChoice)]))
    const popular = answerOrThrow(
      await prompter.groupMultiselect({
        id: 'features',
        message: 'Extra features? (popular first; space to toggle, enter to confirm)',
        groups,
        initialValues: current.filter((id) => offered.some((e) => e.id === id && e.popular)),
      }),
    )
    // Step 2 (optional): type to search everything else in the catalogue.
    const rest = offered.filter((entry) => !entry.popular)
    let more: string[] = []
    if (rest.length > 0) {
      const search = answerOrThrow(
        await prompter.confirm({ id: 'featuresSearch', message: `Search the full catalogue for more? (${rest.length} more packages)`, initialValue: false }),
      )
      if (search) {
        more = answerOrThrow(
          await prompter.search({
            id: 'featuresMore',
            message: 'Type to search, space to pick, enter when done',
            placeholder: 'for example: tags',
            options: rest.map(toChoice),
            initialValues: current.filter((id) => rest.some((e) => e.id === id)),
          }),
        )
      } else {
        more = current.filter((id) => rest.some((e) => e.id === id))
      }
    }
    // A new pick means new follow-up questions: drop follow-up answers of packages no longer picked.
    return featureOptionsQuestion.tidy({ ...answers, features: [...popular, ...more] })
  },
  describe: (answers) => {
    const entries = pickedEntries(answers)
    return entries.length === 0 ? 'none' : entries.map((e) => e.name).join(', ')
  },
  read(raw, problems) {
    const items = typeof raw === 'string' ? (raw.trim() === 'none' ? [] : raw.split(',').map((p) => p.trim())) : raw
    if (!Array.isArray(items) || !items.every((item): item is string => typeof item === 'string' && /^[a-z][a-z0-9-]{0,39}$/.test(item))) {
      problems.push('--features needs a comma list of package ids (for example log-viewer,billing), or none')
      return {}
    }
    // Whether each id is offered is checked by resolveOptions, against the same catalogue.
    return { features: [...new Set(items)] }
  },
  flagWords: (answers) => [`--features`, pickedEntries(answers).map((e) => e.id).join(',') || 'none'],
  packages: (answers) => pickedEntries(answers).map((e) => e.package),
  tidy: (answers) => answers,
}

/** The follow-up keys (`<id>.<question>`) of the picked features. */
function followUpKeys(answers: Answers, catalogue?: Catalogue): string[] {
  return pickedEntries(answers, catalogue).flatMap((entry) => entry.followUps.map((f) => `${entry.id}.${f.id}`))
}

const featureOptionsQuestion: Question = {
  id: 'featureOptions',
  row: 22,
  group: 'Features',
  title: 'Feature options',
  recommended: false,
  // Asked whenever a picked package declares questions, in either mode: the pick was the user's.
  alwaysAsk: true,
  flag: {
    name: 'feature-option',
    type: 'string',
    multiple: true,
    usage: '--feature-option <id>.<question>=<value>',
    help: "A picked package's own question, e.g. billing.provider=paddle",
    defaultLabel: "package's default",
  },
  secretEnv: undefined,
  when: (answers) => followUpKeys(answers).length > 0,
  answered: (answers) => followUpKeys(answers).every((key) => answers.featureOptions?.[key] !== undefined),
  async ask(prompter, answers, context) {
    const options: Record<string, string> = { ...answers.featureOptions }
    for (const entry of pickedEntries(answers, catalogueOf(context))) {
      for (const followUp of entry.followUps) {
        const key = `${entry.id}.${followUp.id}`
        if (options[key] !== undefined) continue
        options[key] = answerOrThrow(
          await prompter.select({ id: key, message: followUp.label, options: followUp.choices, initialValue: followUp.default }),
        )
      }
    }
    return { ...answers, featureOptions: options }
  },
  describe: (answers) => {
    const lines = pickedEntries(answers).flatMap((entry) =>
      entry.followUps.map((f) => `${entry.id}.${f.id}=${answers.featureOptions?.[`${entry.id}.${f.id}`] ?? f.default}`),
    )
    return lines.length === 0 ? 'none' : lines.join(', ')
  },
  read(raw, problems) {
    // From flags: ['billing.provider=paddle', ...]; from setup.json: { 'billing.provider': 'paddle' }.
    const pairs: [string, unknown][] = Array.isArray(raw)
      ? raw.map((item: unknown) => {
          const textItem = String(item)
          const at = textItem.indexOf('=')
          return at < 0 ? [textItem, undefined] : [textItem.slice(0, at), textItem.slice(at + 1)]
        })
      : typeof raw === 'object' && raw !== null
        ? Object.entries(raw)
        : []
    const options: Record<string, string> = {}
    for (const [key, value] of pairs) {
      if (!/^[a-z][a-z0-9-]{0,39}\.[a-z][a-z0-9-]{0,39}$/.test(key) || typeof value !== 'string' || !/^[a-z][a-z0-9-]{0,39}$/.test(value)) {
        problems.push(`--feature-option "${key}${typeof value === 'string' ? `=${value}` : ''}" must look like <id>.<question>=<value>, e.g. billing.provider=paddle`)
      } else {
        options[key] = value
      }
    }
    return { featureOptions: options }
  },
  flagWords: (answers) =>
    pickedEntries(answers).flatMap((entry) =>
      entry.followUps.flatMap((f) => ['--feature-option', `${entry.id}.${f.id}=${answers.featureOptions?.[`${entry.id}.${f.id}`] ?? f.default}`]),
    ),
  packages: () => [],
  tidy(answers) {
    if (answers.featureOptions === undefined) return answers
    const keep = new Set(followUpKeys(answers))
    return { ...answers, featureOptions: Object.fromEntries(Object.entries(answers.featureOptions).filter(([key]) => keep.has(key))) }
  },
}

// ── The project name ──────────────────────────────────────────────────────────────────────────

const nameQuestion: Question = {
  id: 'name',
  row: 1,
  group: 'Project',
  title: 'Name',
  recommended: true,
  alwaysAsk: false,
  flag: { name: 'name', type: 'string', usage: '--name <name>', help: 'Project name (or give it first: my-app)', defaultLabel: '' },
  secretEnv: undefined,
  when: always,
  answered: (answers) => answers.name !== undefined,
  async ask(prompter, answers, context) {
    const value = await prompter.text({
      id: 'name',
      message: 'What is the name of your project?',
      placeholder: 'my-app',
      validate: (raw) => validateProjectName(raw.trim())[0] ?? context.targetProblem(raw.trim()),
    })
    return { ...answers, name: answerOrThrow(value).trim() }
  },
  describe: (answers) => answers.name ?? '',
  read: (raw, problems) => {
    if (typeof raw === 'string') return { name: raw }
    problems.push('--name needs a value')
    return {}
  },
  // The name is the positional argument of the command, not a flag.
  flagWords: () => [],
  packages: () => [],
  tidy: (answers) => answers,
}

// ── The registry ──────────────────────────────────────────────────────────────────────────────

const isString = (raw: unknown): raw is string => typeof raw === 'string'
const isNumber = (raw: unknown): raw is number => typeof raw === 'number'
const nonEmpty = (raw: string): string | undefined => (raw === '' || /[\s'"`\\]/.test(raw) ? undefined : raw)
/** A file path (sockets, CA files): no quotes, no line breaks. */
const pathValue = (raw: string): string | undefined => (/^[^\0\r\n'"`]{1,1024}$/.test(raw) ? raw : undefined)
/** The connection is given as a URL (the user typed "url" for the host). */
const viaUrl = (answers: Answers): boolean => answers.dbHost === 'url'
/** The connection is given as separate host, port, name and user answers. */
const byHost = (answers: Answers): boolean => needsConnection(answers) && !viaUrl(answers)

/** Shown when a local server is used without a password (XAMPP's default root has none). */
export const EMPTY_LOCAL_PASSWORD_WARNING =
  'No database password: fine for XAMPP/WAMP/MAMP/Laragon on this computer, but set one before anyone else can reach this server.'

/** The connection questions only exist when the database is a server the user runs. */
const serverOf = (answers: Answers): 'mysql' | 'postgres' => (databaseOf(answers) === 'postgres' ? 'postgres' : 'mysql')

/** "Recommended" counts the ★ questions after the opener, so the label never goes stale. */
function modeChoices(): readonly OptionChoice<'recommended' | 'custom'>[] {
  const quick = QUESTIONS.filter((q) => q.recommended && q.id !== 'name' && q.id !== 'mode').length
  const all = new Set(QUESTIONS.filter((q) => q.row > 1).map((q) => q.row)).size
  return [
    { value: 'recommended', label: `Recommended   ${quick} quick questions, sensible defaults for the rest`, short: 'Recommended' },
    { value: 'custom', label: `Custom        Choose everything (about ${all} questions, grouped)`, short: 'Custom' },
  ]
}

/**
 * Every question, in the order they are asked (blueprint §2.1). The opener ("Recommended or
 * Custom?") comes right after the name, because its wording uses the name.
 */
export const QUESTIONS: readonly Question[] = [
  nameQuestion,
  select('mode', {
    row: 0, group: 'Project', title: 'Setup', recommended: true, flag: 'mode',
    help: 'Recommended: 7 questions; custom: every question',
    message: (a) => `How do you want to set up ${a.name ?? 'your project'}?`,
    choices: modeChoices,
    default: () => DEFAULTS.mode,
  }),
  select('stack', {
    row: 2, group: 'App', title: 'Stack', recommended: true, flag: 'stack',
    help: 'Full app (API + admin UI) or API only',
    message: 'What are you building?',
    choices: [
      { value: 'full', label: 'Full app (API + admin UI)', short: 'Full app: API + React UI' },
      { value: 'api', label: 'API only' },
    ],
    default: () => DEFAULTS.stack,
  }),
  select('design', {
    row: 3, group: 'App', title: 'Design', recommended: true, flag: 'design', when: hasUi,
    help: 'Look of the React UI (a design package)',
    message: 'Which design should your app use?',
    // Straight from DESIGNS: a new design package appears here without code changes.
    choices: DESIGNS.map(({ value, label, packageName }) => ({ value, label, packages: [packageName], short: `${value} (${packageName})` })),
    default: () => DEFAULTS.design,
  }),
  select('ui', {
    row: 4, group: 'App', title: 'UI starter', flag: 'ui', when: hasUi,
    help: 'Admin screens from your models, or a blank React app',
    message: 'Which React UI starter?',
    choices: [
      { value: 'admin', label: 'Admin screens from your models', packages: ['@strutvane/ui'], short: 'admin screens' },
      { value: 'blank', label: 'Blank React app', packages: ['@strutvane/ui'], short: 'blank React + Vite' },
    ],
    default: () => DEFAULTS.ui,
  }),
  select('auth', {
    row: 5, group: 'Sign-in', title: 'Sign-in', recommended: true, flag: 'sign-in',
    help: 'Email + password, email link only, or no sign-in',
    message: 'How do people sign in?',
    // Every mode brings @strutvane/auth: without sign-in it still guards the API with tokens.
    choices: [
      { value: 'email', label: 'Email and password', packages: ['@strutvane/auth'], short: 'Email + password' },
      { value: 'magic-link', label: 'Email link only (passwordless)', packages: ['@strutvane/auth'], short: 'Email link (passwordless)' },
      { value: 'none', label: 'No sign-in (the API then requires API tokens)', packages: ['@strutvane/auth'], short: 'No sign-in (API needs tokens)' },
    ],
    default: () => DEFAULTS.auth,
  }),
  multi('security', {
    row: 6, group: 'Sign-in', title: 'Sign-in security', flag: 'security', when: hasSignIn,
    help: '2fa,verification,passkeys,registration',
    message: 'Extra sign-in security? (space to toggle, enter to confirm)',
    choices: [
      { value: '2fa', label: 'Two-factor (authenticator app + recovery codes)', short: '2FA' },
      { value: 'verification', label: 'Email verification', short: 'email verification' },
      { value: 'passkeys', label: 'Passkeys', short: 'passkeys' },
      { value: 'registration', label: 'Public registration (off = invited accounts only)', short: 'public registration' },
    ],
    default: () => DEFAULTS.security,
  }),
  multi('social', {
    row: 7, group: 'Sign-in', title: 'Social login', flag: 'social', when: hasSignIn,
    help: 'google,microsoft,github,apple',
    message: 'Social login? (space to toggle, enter for none)',
    choices: [
      { value: 'google', label: 'Google', packages: ['@strutvane/social-login'] },
      { value: 'microsoft', label: 'Microsoft', packages: ['@strutvane/social-login'] },
      { value: 'github', label: 'GitHub', packages: ['@strutvane/social-login'] },
      { value: 'apple', label: 'Apple', packages: ['@strutvane/social-login'] },
    ],
    default: () => DEFAULTS.social,
  }),
  confirm('sso', {
    row: 8, group: 'Sign-in', title: 'Enterprise SSO', flag: 'sso', when: teamsOf,
    help: 'SAML/OIDC + SCIM for your customers (needs teams)',
    message: 'Enterprise SSO for your customers? (SAML/OIDC + SCIM)',
    packages: ['@strutvane/sso'],
    default: () => DEFAULTS.sso,
  }),
  select('apiAccess', {
    row: 9, group: 'Sign-in', title: 'API access', flag: 'api', when: hasSignIn,
    help: 'Personal access tokens, an OAuth 2.1 server, or none',
    message: 'API access for other apps?',
    choices: [
      { value: 'tokens', label: 'Personal access tokens', packages: ['@strutvane/auth'], short: 'personal access tokens' },
      { value: 'oauth', label: 'OAuth 2.1 server', packages: ['@strutvane/oauth-server'], short: 'OAuth 2.1 server' },
      { value: 'none', label: 'None', short: 'none' },
    ],
    default: () => DEFAULTS.apiAccess,
  }),
  select('roles', {
    row: 10, group: 'Sign-in', title: 'Starting roles', flag: 'roles', when: hasSignIn,
    help: 'basic: admin + member; extended: + manager, viewer',
    message: 'Starting roles?',
    choices: [
      { value: 'basic', label: 'Admin + member', short: 'admin, member' },
      { value: 'extended', label: 'Admin + manager + member + viewer', short: 'admin, manager, member, viewer' },
    ],
    default: () => DEFAULTS.roles,
  }),
  confirm('teams', {
    row: 11, group: 'Teams', title: 'Teams', recommended: true, flag: 'teams', when: hasSignIn,
    help: 'Teams (each customer company sees its data)',
    message: 'Teams? (each customer company sees only its own data)',
    default: () => DEFAULTS.teams,
  }),
  select('tenantResolver', {
    row: 12, group: 'Teams', title: 'Team from', flag: 'tenant', when: teamsOf,
    help: 'How a request picks its team: switcher or subdomain',
    message: 'How does a request pick its team?',
    choices: [
      { value: 'switcher', label: 'Team switcher in the app', short: 'team switcher' },
      { value: 'subdomain', label: 'Subdomain (acme.yourapp.com)', short: 'subdomain' },
    ],
    default: () => DEFAULTS.tenantResolver,
  }),
  select('database', {
    row: 13, group: 'Data', title: 'Database', recommended: true, flag: 'db',
    help: 'Database (PostgreSQL pre-selected with teams)',
    message: 'Which database?',
    choices: [
      { value: 'mysql', label: 'MySQL', hint: 'recommended', short: DATABASE_LABELS.mysql },
      { value: 'postgres', label: 'PostgreSQL', hint: 'adds row-level security for teams', short: DATABASE_LABELS.postgres },
      { value: 'sqlite', label: 'SQLite', hint: 'zero setup, a single file', short: DATABASE_LABELS.sqlite },
    ],
    // Teams pre-select PostgreSQL (row-level security); MySQL stays one keypress away.
    default: databaseOf,
    // Say right away what teams mean on this database, so the choice is an informed one.
    afterAnswer: (prompter, answers) => {
      const note = teamsNote(teamsOf(answers), databaseOf(answers))
      if (note !== undefined) prompter.info(note)
    },
  }),
  confirm('docker', {
    row: 14, group: 'Data', title: 'Docker', recommended: true, flag: 'docker',
    help: 'Everything in Docker (app, database, Mailpit), like Sail',
    message: 'Set up with Docker or without Docker?',
    words: ['yes: everything runs in containers', 'no: the app runs on this computer'],
    asSelect: (answers) => ({
      yes: { value: 'docker', label: 'With Docker', hint: `app, ${DATABASE_LABELS[databaseOf(answers)]} and Mailpit in containers (like Sail)` },
      no: { value: 'host', label: 'Without Docker', hint: 'the app runs on this computer' },
    }),
    // Docker mode is pre-selected only when Docker is installed and running (never required).
    default: (answers) => dockerByDefault(databaseOf(answers)) && answers.dockerAvailable !== false,
  }),
  text('dbHost', {
    row: 15, group: 'Data', title: 'Database host', flag: 'db-host', alwaysAsk: true, when: needsConnection,
    help: 'Your own server: XAMPP, WAMP, MAMP, Laragon, Postgres.app, remote', usageValue: '<host>',
    message: 'Database host (your own server; type url to paste a connection URL instead)',
    default: () => '127.0.0.1', parse: nonEmpty, is: isString, invalid: 'is not a host name or IP address',
  }),
  // A connection URL is a secret (it holds the password): masked, never a flag (STRUT_DB_URL in CI).
  password('dbUrl', {
    row: 15, group: 'Data', title: 'Database URL', when: (a) => needsConnection(a) && viaUrl(a), env: 'STRUT_DB_URL', minLength: 1,
    message: 'Connection URL, e.g. mysql://user:password@host:3306/my_app (hidden; saved only in .env)',
    check: (value, answers) => {
      const parsed = parseDatabaseUrl(value)
      if (typeof parsed === 'string') return `That URL cannot be used: ${parsed}.`
      return parsed.database === serverOf(answers) ? undefined : `That URL is for ${DATABASE_LABELS[parsed.database]}, but you chose ${DATABASE_LABELS[serverOf(answers)]}.`
    },
  }),
  text('dbPort', {
    row: 15, group: 'Data', title: 'Database port', flag: 'db-port', alwaysAsk: true, when: byHost,
    help: 'Its port (MySQL/MariaDB 3306, MAMP 8889, PostgreSQL 5432)', usageValue: '<port>',
    message: 'Database port',
    default: (answers) => DEFAULT_DATABASE_PORTS[serverOf(answers)],
    parse: (raw) => (/^\d{1,5}$/.test(raw) ? Number(raw) : undefined),
    is: isNumber,
    invalid: 'is not a port number (1 to 65535)',
  }),
  text('dbName', {
    row: 15, group: 'Data', title: 'Database name', flag: 'db-name', alwaysAsk: true, when: byHost,
    help: 'Its database (created when missing, if allowed)', usageValue: '<name>',
    message: 'Database name (created if it does not exist yet)', default: (answers) => sqlIdentifier(answers.name ?? 'app'), parse: nonEmpty, is: isString, invalid: 'is not a database name',
  }),
  text('dbUser', {
    row: 15, group: 'Data', title: 'Database user', flag: 'db-user', alwaysAsk: true, when: byHost,
    help: 'Its user: root (MySQL/MariaDB) or postgres (password: asked, or STRUT_DB_PASSWORD)', usageValue: '<user>',
    message: 'Database user', default: (answers) => defaultDatabaseUser(databaseOf(answers)), parse: nonEmpty, is: isString, invalid: 'is not a database user',
  }),
  password('dbPassword', {
    row: 15, group: 'Data', title: 'Database password', when: byHost, env: 'STRUT_DB_PASSWORD', minLength: 0,
    message: 'Database password (empty is fine for a local XAMPP/WAMP/MAMP root; saved only in .env)',
    check: (value, answers, prompter) => {
      if (value !== '') return undefined
      if (!isLocalHost(answers.dbHost ?? '127.0.0.1')) return 'A database server on another computer needs a password. Please type it.'
      prompter.info(EMPTY_LOCAL_PASSWORD_WARNING)
      return undefined
    },
  }),
  text('dbSocket', {
    row: 15, group: 'Data', title: 'Database socket', flag: 'db-socket', when: byHost, optional: true,
    help: 'A Unix socket or named pipe instead of host:port', usageValue: '<path>',
    message: 'Socket or named pipe instead of host and port (usually none)', default: () => '', parse: pathValue, is: isString, invalid: 'is not a plain file path',
  }),
  select('dbSslMode', {
    row: 15, group: 'Data', title: 'Database TLS', flag: 'db-sslmode', when: needsConnection,
    help: 'disable, prefer, require, verify-ca or verify-full',
    message: 'Encrypt the connection to your database (TLS)?',
    choices: [
      { value: 'prefer', label: 'Prefer: use TLS when the server offers it', short: 'prefer' },
      { value: 'disable', label: 'Disable (only for a server on this computer)', short: 'disable' },
      { value: 'require', label: 'Require TLS', short: 'require' },
      { value: 'verify-ca', label: 'Require TLS and check the certificate authority', short: 'verify-ca' },
      { value: 'verify-full', label: 'Require TLS, check the authority and the host name', short: 'verify-full' },
    ],
    default: () => 'prefer',
  }),
  text('dbSslCa', {
    row: 15, group: 'Data', title: 'Database CA file', flag: 'db-ssl-ca', when: (a) => needsConnection(a) && (a.dbSslMode ?? 'prefer').startsWith('verify'), optional: true,
    help: 'The CA certificate for verify-ca / verify-full', usageValue: '<path>',
    message: "The server's CA certificate file (Enter for the system's)", default: () => '', parse: pathValue, is: isString, invalid: 'is not a plain file path',
  }),
  text('adminEmail', {
    row: 16, group: 'Data', title: 'First admin', flag: 'admin-email', when: hasSignIn,
    help: 'The first admin account', usageValue: '<email>',
    message: "First admin's email",
    default: (answers) => defaultAdminEmail(answers.name),
    parse: (raw) => (isEmail(raw) ? raw : undefined),
    is: isString,
    invalid: 'is not a valid email address',
  }),
  select('adminPasswordMode', {
    row: 16, group: 'Data', title: 'Admin password', flag: 'admin-password', when: hasPasswords,
    help: 'generate (shown once) or type (STRUT_ADMIN_PASSWORD in CI)',
    message: "The first admin's password?",
    choices: [
      { value: 'generate', label: 'Generate one and show it once', short: 'generated, shown once' },
      { value: 'type', label: 'Let me type it (masked)', short: 'typed (masked)' },
    ],
    default: () => DEFAULTS.adminPasswordMode,
  }),
  password('adminPassword', {
    row: 16, group: 'Data', title: 'Admin password (typed)', env: 'STRUT_ADMIN_PASSWORD', minLength: MIN_ADMIN_PASSWORD,
    when: (answers) => hasPasswords(answers) && (answers.adminPasswordMode ?? DEFAULTS.adminPasswordMode) === 'type',
    message: `Admin password (at least ${MIN_ADMIN_PASSWORD} characters; never saved to a file)`,
  }),
  confirm('sampleData', {
    row: 17, group: 'Data', title: 'Sample data', flag: 'sample-data',
    help: 'Sample records (default: yes for the admin starter)',
    message: 'Add sample data so the screens are not empty?',
    default: defaultSampleData,
  }),
  select('cache', {
    row: 18, group: 'Infra', title: 'Cache, queue, sessions', flag: 'cache-store',
    help: 'database (no extra service) or redis',
    message: 'Cache, queue and sessions?',
    choices: [
      { value: 'database', label: 'Database (no extra service)', short: 'database' },
      { value: 'redis', label: 'Redis', packages: ['@strutvane/redis'], short: 'Redis' },
    ],
    default: () => DEFAULTS.cache,
  }),
  select('storage', {
    row: 19, group: 'Infra', title: 'File storage', flag: 'storage',
    help: 'local disk or S3-compatible',
    message: 'File storage?',
    choices: [
      { value: 'local', label: 'Local disk', short: 'local disk' },
      { value: 's3', label: 'S3-compatible', packages: ['@strutvane/files'], short: 'S3-compatible' },
    ],
    default: () => DEFAULTS.storage,
  }),
  select('mailer', {
    row: 20, group: 'Infra', title: 'Production mailer', flag: 'mailer',
    help: 'later, smtp, resend, postmark or ses',
    message: 'Production mailer? (development always uses the inbox)',
    choices: [
      { value: 'later', label: 'Decide later', short: 'decide later' },
      { value: 'smtp', label: 'SMTP' },
      { value: 'resend', label: 'Resend' },
      { value: 'postmark', label: 'Postmark' },
      { value: 'ses', label: 'Amazon SES' },
    ],
    default: () => DEFAULTS.mailer,
  }),
  text('locale', {
    row: 21, group: 'Infra', title: 'Language', flag: 'locale', usageValue: '<tag>',
    help: 'App language (en, de, pt-BR, ...)',
    message: 'App language', default: () => DEFAULTS.locale, parse: (raw) => (isLocale(raw) ? raw : undefined), is: isString,
    invalid: 'is not a language tag (for example en, de or pt-BR)',
  }),
  text('timezone', {
    row: 21, group: 'Infra', title: 'Time zone', flag: 'timezone', usageValue: '<zone>',
    help: 'Time zone (default: this computer)',
    message: 'Time zone', default: () => defaultTimeZone(), parse: (raw) => (isTimeZone(raw) ? raw : undefined), is: isString,
    invalid: 'is not a time zone this computer knows (for example Europe/Berlin or UTC)',
  }),
  text('currency', {
    row: 21, group: 'Infra', title: 'Currency', flag: 'currency', usageValue: '<code>',
    help: 'Currency (USD, EUR, INR, ...)',
    message: 'Currency', default: () => DEFAULTS.currency, parse: (raw) => (isCurrency(raw) ? raw : undefined), is: isString,
    invalid: 'is not a 3-letter currency code (for example USD or EUR)',
  }),
  featuresQuestion,
  featureOptionsQuestion,
  select('testing', {
    row: 23, group: 'Quality', title: 'Tests', flag: 'testing',
    help: 'vitest, vitest-playwright or none',
    message: 'Which tests do you want?',
    choices: [
      { value: 'vitest', label: 'Vitest (unit + feature tests)', short: 'Vitest' },
      { value: 'vitest-playwright', label: 'Vitest + Playwright browser tests', packages: ['@strutvane/browser-testing'], short: 'Vitest + Playwright' },
      { value: 'none', label: 'No tests for now', short: 'none' },
    ],
    default: () => DEFAULTS.testing,
  }),
  confirm('agents', {
    row: 24, group: 'Quality', title: 'AI assistants', recommended: true, flag: 'agents',
    help: 'AGENTS.md, skills and local docs for AI coding assistants',
    message: 'Set up AI coding assistants? (AGENTS.md, skills, local docs MCP)',
    packages: ['@strutvane/agent-tools'],
    default: () => DEFAULTS.agents,
  }),
  confirm('git', {
    row: 25, group: 'Workflow', title: 'Git', flag: 'git',
    help: 'Create a git repository with a first commit',
    message: 'Create a git repository with a first commit?',
    default: () => DEFAULTS.git,
  }),
  confirm('ci', {
    row: 25, group: 'Workflow', title: 'CI workflow', flag: 'ci-workflow', when: gitOf,
    help: 'A GitHub Actions workflow that runs your tests',
    message: 'Add a GitHub Actions CI workflow?',
    default: () => DEFAULTS.ci,
  }),
  select('securityProfile', {
    row: 26, group: 'Security', title: 'Security profile', flag: 'security-profile',
    help: 'standard, or strict (admin 2FA, 8 h sessions, CSP)',
    message: 'Security profile?',
    choices: [
      { value: 'standard', label: 'Standard', short: 'standard' },
      { value: 'strict', label: 'Strict: admin 2FA, breached-password check, 8 h sessions, CSP', short: 'strict' },
    ],
    default: () => DEFAULTS.securityProfile,
  }),
  confirm('activityLog', {
    row: 27, group: 'Security', title: 'Activity history', flag: 'activity-log',
    help: 'Record who changed what (default: yes with teams)',
    message: 'Record who changed what on every record? (activity history)',
    packages: ['@strutvane/activity-log'],
    default: defaultActivityLog,
  }),
  confirm('ai', {
    row: 28, group: 'AI', title: 'AI features', flag: 'ai',
    help: 'AI features inside your app (settings go in .env later)',
    message: 'AI features inside your app? (provider settings go in .env later)',
    packages: ['@strutvane/ai'],
    default: () => DEFAULTS.ai,
  }),
  select('aiProvider', {
    row: 28, group: 'AI', title: 'AI provider', flag: 'ai-provider', when: aiOf,
    help: 'anthropic, openai, google or ollama',
    message: 'Which AI provider first? (you finish its setup in .env)',
    choices: AI_PROVIDERS.map(({ value, label, envKey }) => ({ value, label, hint: `.env: ${envKey}` })),
    default: () => DEFAULTS.aiProvider,
  }),
  confirm('mcpServer', {
    row: 29, group: 'AI', title: 'MCP server', flag: 'mcp-server',
    help: 'Let AI agents use your app (under your policies)',
    message: 'Let AI agents use your app safely? (MCP server, your policies and teams)',
    packages: ['@strutvane/mcp-server'],
    default: () => DEFAULTS.mcpServer,
  }),
  multi('uiLanguages', {
    row: 30, group: 'UI', title: 'UI languages', flag: 'ui-languages', when: hasUi,
    help: 'Languages for the UI (any tag: en,de,pt-BR)',
    message: 'Languages for the UI? (space to toggle; any other with --ui-languages)',
    choices: UI_LANGUAGE_CHOICES,
    parseItem: (raw) => (isLocale(raw) ? raw : undefined),
    itemHint: 'language tags such as en, de, pt-BR',
    default: () => DEFAULTS.uiLanguages,
  }),
  select('appearance', {
    row: 31, group: 'UI', title: 'Appearance', flag: 'appearance', when: hasUi,
    help: 'system, light or dark',
    message: 'Default appearance?',
    choices: [
      { value: 'system', label: 'Follow the system', short: 'follow the system' },
      { value: 'light', label: 'Light', short: 'light' },
      { value: 'dark', label: 'Dark', short: 'dark' },
    ],
    default: () => DEFAULTS.appearance,
  }),
  confirm('pwa', {
    row: 32, group: 'UI', title: 'Installable app', flag: 'pwa', when: hasUi,
    help: 'PWA: home-screen icon and offline page',
    message: 'Installable app? (PWA: home-screen icon, offline page)',
    packages: ['@strutvane/ui'],
    default: () => DEFAULTS.pwa,
  }),
  confirm('liveUpdates', {
    row: 33, group: 'UI', title: 'Live updates', flag: 'live-updates', when: hasUi,
    help: 'Tables refresh when others change data',
    message: 'Live updates? (tables refresh when others change data)',
    packages: ['@strutvane/realtime'],
    default: () => DEFAULTS.liveUpdates,
  }),
  select('monitoring', {
    row: 34, group: 'Ops', title: 'Monitoring', flag: 'monitoring',
    help: 'none, or otel (OpenTelemetry export + health page)',
    message: 'Monitoring?',
    choices: [
      { value: 'none', label: 'None', short: 'none' },
      { value: 'otel', label: 'OpenTelemetry export, plus a health page', packages: ['@strutvane/observability', '@strutvane/health'], short: 'OpenTelemetry + health page' },
    ],
    default: () => DEFAULTS.monitoring,
  }),
  select('deploy', {
    row: 35, group: 'Ops', title: 'Deploy to', flag: 'deploy',
    help: 'later, node (VPS, Railway, Render) or kubernetes',
    message: 'Where will you deploy? (writes a deploy recipe and the /up route)',
    choices: [
      { value: 'later', label: 'Decide later', short: 'decide later' },
      { value: 'node', label: 'Any Node host (VPS, Railway, Render)', short: 'a Node host' },
      // Opt-in only (ADR-0021): the one choice that writes a committed Dockerfile.
      { value: 'docker', label: 'Docker image (Kubernetes, Fly, Cloud Run, ECS)', short: 'Docker image (Dockerfile)' },
    ],
    default: () => DEFAULTS.deploy,
  }),
  confirm('editor', {
    row: 36, group: 'Workflow', title: 'Editor setup', flag: 'editor',
    help: 'VS Code settings, extensions, format on save',
    message: 'Editor setup? (VS Code settings, recommended extensions, format on save)',
    default: () => DEFAULTS.editor,
  }),
  confirm('devContainer', {
    row: 36, group: 'Workflow', title: 'Dev container', flag: 'dev-container',
    help: 'Committed .devcontainer/ for Codespaces (ADR-0021)',
    message: 'Add a dev container for Codespaces? (committed .devcontainer/)',
    default: () => DEFAULTS.devContainer,
  }),
]

/**
 * The question for an answer key.
 *
 * @example
 * questionFor('database')?.title // 'Database'
 */
export function questionFor(id: AnswerKey): Question | undefined {
  return QUESTIONS.find((question) => question.id === id)
}

/**
 * Every package these (complete or partial) answers bring: the framework first, then the rest
 * sorted, each once. Read from the registry's data, never from a hard-coded list.
 *
 * @example
 * projectPackages(answersOf(options)) // ['@strutvane/framework', '@strutvane/agent-tools', ...]
 */
export function projectPackages(answers: Answers): string[] {
  const picked = QUESTIONS.filter((q) => q.when(answers)).flatMap((q) => q.packages(answers))
  return ['@strutvane/framework', ...[...new Set(picked)].filter((p) => p !== '@strutvane/framework').sort()]
}

/** Is this catalogue id offered right now? (Re-exported for the args check.) */
export const isOfferedFeature = (id: string): boolean => findOffered(id) !== undefined
