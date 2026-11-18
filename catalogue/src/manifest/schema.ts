/**
 * The `strutvane` block every package declares in its `package.json` (blueprint §3.3 item 1),
 * as a Zod schema. The JSON Schema in `schema/` is generated from it (`npm run generate-schema`)
 * for editor autocompletion; **this file is the authority**, because some rules (secret words,
 * safe patterns, cross-field checks) cannot be expressed in JSON Schema.
 *
 * Every object is strict: an unknown field is an error, never ignored. That is how a typo
 * (`popluar`), a field from a newer format, or a smuggled hook (`postinstall`) is caught.
 *
 * @example A minimal manifest
 * ```json
 * "strutvane": {
 *   "manifestVersion": 1,
 *   "id": "tags",
 *   "displayName": "Tags",
 *   "description": "Tag any record and filter by tags",
 *   "category": "content",
 *   "kind": "package",
 *   "docs": "https://github.com/vishwajit-vm/strutvane-tags#readme",
 *   "framework": "^0.2"
 * }
 * ```
 *
 * @module
 */
import { z } from 'zod'
import { parsePattern, matchesPattern } from './safe-pattern.ts'
import { findSecretWord } from './secret-words.ts'
import { isSupportedRange } from './semver-range.ts'
import { displayTextProblem } from './text.ts'
import {
  COMMAND_NAME,
  ENV_KEY,
  ICON_NAME,
  ID,
  ID_MAX,
  LIMITS,
  MANIFEST_VERSION,
  MIGRATION_NAME,
  ROUTE_PATH,
  SCREEN_PATH,
  SECRET_ENV_KEY,
  TAG,
  VERSION,
  relativePathProblem,
  urlProblem,
} from './rules.ts'

/** The category every design uses, and only designs use (blueprint §5.1). */
export const DESIGN_CATEGORY = 'design'

// ── Building blocks ──────────────────────────────────────────────────────────────────────────

/** A catalogue id (package, question or choice value). */
export const idSchema = z
  .string()
  .max(ID_MAX)
  .regex(ID, { error: 'must be lower-case words joined by single dashes, starting with a letter (like "media-library")' })

/** Human text shown in a terminal or web page: one plain, visible line (see `text.ts`). */
export const displayText = (max: number) =>
  z
    .string()
    .max(max)
    .superRefine((value, ctx) => {
      const problem = displayTextProblem(value, max)
      if (problem !== undefined) ctx.addIssue({ code: 'custom', message: problem })
    })

/** Text a question shows. On top of {@link displayText}: it must not ask for a credential. */
const questionText = (max: number) =>
  displayText(max).superRefine((value, ctx) => {
    const word = findSecretWord(value)
    if (word !== undefined) ctx.addIssue({ code: 'custom', message: secretMessage(word) })
  })

const secretMessage = (word: string): string =>
  `asks for a secret ("${word}"). The installer never asks for keys, secrets, tokens or passwords; ` +
  'list the value under installs.env with "secret": true so the developer types it into .env later'

export const httpsUrl = z
  .string()
  .max(LIMITS.url)
  .superRefine((value, ctx) => {
    const problem = urlProblem(value)
    if (problem !== undefined) ctx.addIssue({ code: 'custom', message: problem })
  })

export const relativePath = z
  .string()
  .max(120)
  .superRefine((value, ctx) => {
    const problem = relativePathProblem(value)
    if (problem !== undefined) ctx.addIssue({ code: 'custom', message: problem })
  })

export const frameworkRange = z
  .string()
  .max(100)
  .refine(isSupportedRange, {
    error: 'is not a range the installer understands (use forms like "^0.2", ">=0.2.0 <0.4.0" or "^0.2 || ^0.3"; no pre-releases)',
  })

// ── Questions ────────────────────────────────────────────────────────────────────────────────

/** A question id: also checked for credential words, since ids show up as flag names. */
const questionId = idSchema.superRefine((value, ctx) => {
  const word = findSecretWord(value)
  if (word !== undefined) ctx.addIssue({ code: 'custom', message: secretMessage(word) })
})

const choiceSchema = z
  .strictObject({
    value: idSchema.describe('Stored in strutvane.json and used as the flag value (--feature-option <pkg>.<question>=<value>).'),
    label: displayText(LIMITS.label).describe('What the developer sees.'),
    hint: displayText(LIMITS.label).optional().describe('A dim hint next to the label.'),
  })
  .describe('One choice of a select or multiselect question.')

/**
 * Ask a question only when an earlier question of the same package has a given answer, e.g.
 * "Stripe Tax?" only when the provider is Stripe. Declarative, so nothing runs to decide it.
 */
const whenSchema = z
  .union([
    z.strictObject({
      question: idSchema.describe('An earlier question of this package.'),
      equals: z.union([z.string().max(LIMITS.textAnswer), z.boolean()]).describe('Ask only when that answer equals this.'),
    }),
    z.strictObject({
      question: idSchema.describe('An earlier multiselect question of this package.'),
      includes: idSchema.describe('Ask only when that answer includes this choice.'),
    }),
  ])
  .describe('Ask this question only when an earlier answer matches.')

const questionBase = {
  id: questionId.describe('Unique within the package. Answers are stored as <package id>.<question id>.'),
  label: questionText(LIMITS.label).describe('The question, e.g. "Billing: which payment provider?".'),
  help: questionText(LIMITS.help).optional().describe('One line of extra help under the question.'),
  when: whenSchema.optional(),
}

const selectQuestionSchema = z.strictObject({
  ...questionBase,
  type: z.literal('select'),
  choices: z.array(choiceSchema).min(2).max(LIMITS.choices),
  default: idSchema.describe('The value of one of the choices (used by --yes and CI).'),
})

const multiselectQuestionSchema = z.strictObject({
  ...questionBase,
  type: z.literal('multiselect'),
  choices: z.array(choiceSchema).min(2).max(LIMITS.choices),
  default: z.array(idSchema).max(LIMITS.choices).describe('Values of the choices picked by default (may be empty).'),
  min: z.int().min(0).max(LIMITS.choices).optional().describe('Fewest choices allowed (default 0).'),
  max: z.int().min(1).max(LIMITS.choices).optional().describe('Most choices allowed (default: all).'),
})

const confirmQuestionSchema = z.strictObject({
  ...questionBase,
  type: z.literal('confirm'),
  default: z.boolean(),
})

const textQuestionSchema = z.strictObject({
  ...questionBase,
  type: z.literal('text'),
  default: z.string().max(LIMITS.textAnswer).optional().describe('Must match the pattern. Leave out to require an answer.'),
  placeholder: questionText(LIMITS.label).optional(),
  maxLength: z.int().min(1).max(LIMITS.textAnswer).describe('Longest answer accepted (at most 200).'),
  pattern: z
    .strictObject({
      regex: z
        .string()
        .max(200)
        .superRefine((value, ctx) => {
          const parsed = parsePattern(value)
          if (!parsed.ok) ctx.addIssue({ code: 'custom', message: `${parsed.reason}` })
        })
        .describe('A pattern in the safe subset: ^, single characters/escapes/[classes] with ? * + {n,m}, then $. No groups or alternatives.'),
      message: displayText(LIMITS.label).describe('Shown when the answer does not match, e.g. "Use lower-case letters and dashes".'),
    })
    .describe('Every text answer is checked against a pattern; free-form text is never accepted unchecked.'),
})

/**
 * A declarative follow-up question. There is deliberately no `password` type and no "masked"
 * option: the installer never asks for secrets.
 */
export const questionSchema = z
  .discriminatedUnion('type', [selectQuestionSchema, multiselectQuestionSchema, confirmQuestionSchema, textQuestionSchema])
  .describe('A follow-up question asked after the package is picked. Data only: nothing runs to ask it.')

// ── What a package installs ──────────────────────────────────────────────────────────────────

const envKeySchema = z
  .strictObject({
    key: z.string().max(64).regex(ENV_KEY, { error: 'must be UPPER_SNAKE_CASE (like STRIPE_WEBHOOK_SECRET)' }),
    description: displayText(LIMITS.envDescription).describe('Written as a comment above the key in .env.example.'),
    secret: z.boolean().describe('true: written empty to .env, never given a value in .env.example, redacted in logs.'),
    example: z.string().max(100).optional().describe('A safe example value for .env.example. Not allowed for secrets.'),
  })
  .describe('One .env key the package reads.')

const routeSchema = z.strictObject({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
  path: z.string().max(120).regex(ROUTE_PATH, { error: 'must be a path starting with "/" (like /api/_charts/metrics/:name)' }),
})

const screenSchema = z.strictObject({
  path: z.string().max(120).regex(SCREEN_PATH, { error: 'must be a path starting with "/" (like /billing)' }),
  title: displayText(LIMITS.displayName),
})

const sidebarSchema = z.strictObject({
  label: displayText(LIMITS.displayName),
  path: z.string().max(120).regex(SCREEN_PATH, { error: 'must be a path starting with "/"' }),
  group: displayText(LIMITS.displayName).optional(),
  icon: z.string().max(41).regex(ICON_NAME, { error: 'must be an icon name like "credit-card"' }).optional(),
})

const commandSchema = z.strictObject({
  name: z.string().max(60).regex(COMMAND_NAME, { error: 'must look like "billing:sync" (lower-case words and colons)' }),
  description: displayText(LIMITS.envDescription),
})

/**
 * What `node strut install:<id>` will add, declared up front so the review screen, the docs
 * site and collision checks can show it without running anything.
 */
export const installsSchema = z
  .strictObject({
    config: z.array(relativePath).max(LIMITS.installsPerKind).default([]).describe('Config files written, e.g. config/billing.ts.'),
    env: z.array(envKeySchema).max(LIMITS.installsPerKind).default([]),
    migrations: z
      .array(z.string().max(80).regex(MIGRATION_NAME, { error: 'must be snake_case (like create_subscriptions_table)' }))
      .max(LIMITS.installsPerKind)
      .default([])
      .describe('Migrations published into database/migrations/.'),
    routes: z.array(routeSchema).max(LIMITS.installsPerKind).default([]),
    screens: z.array(screenSchema).max(LIMITS.installsPerKind).default([]),
    sidebar: z.array(sidebarSchema).max(LIMITS.sidebar).default([]),
    commands: z.array(commandSchema).max(LIMITS.installsPerKind).default([]).describe('node strut commands the package adds.'),
  })
  .describe('Everything the package installs. Used for the review screen, docs and collision checks.')

// ── The manifest ─────────────────────────────────────────────────────────────────────────────

const deprecatedSchema = z
  .strictObject({
    message: displayText(LIMITS.deprecationMessage).describe('Why, and what to do instead.'),
    replacedBy: idSchema.optional().describe('The catalogue id to use instead.'),
    since: z.string().regex(VERSION, { error: 'must be a full version like 0.4.0' }).optional(),
  })
  .describe('Present when the package should no longer be picked. Deprecated packages are hidden from pickers.')

const manifestShape = z.strictObject({
  manifestVersion: z.literal(MANIFEST_VERSION, {
    error: `must be ${MANIFEST_VERSION} (this builder reads manifest format ${MANIFEST_VERSION}; upgrade the builder for newer formats)`,
  }),
  id: idSchema.describe('What people type: node strut install:<id>. Unique in the catalogue.'),
  displayName: displayText(LIMITS.displayName).describe('Short name shown in pickers, e.g. "Media library".'),
  description: displayText(LIMITS.description).describe('One line shown next to the name.'),
  category: idSchema.describe('A category id from the hub (operations, data, back-office, …).'),
  tags: z.array(z.string().max(LIMITS.tag).regex(TAG, { error: 'must be lower-case words joined by dashes' })).max(LIMITS.tags).default([]),
  kind: z.enum(['package', 'design']).describe('"design" for UI designs (blueprint §5.1), otherwise "package".'),
  popular: z.boolean().default(false).describe('Shown in the short popular list. First-party only.'),
  docs: httpsUrl.describe('Documentation page (https).'),
  framework: frameworkRange.describe('The @strutvane/framework versions this release supports, e.g. "^0.2".'),
  installs: installsSchema.default({ config: [], env: [], migrations: [], routes: [], screens: [], sidebar: [], commands: [] }),
  questions: z.array(questionSchema).max(LIMITS.questions).default([]).describe('Follow-up questions, asked in this order.'),
  requires: z.array(idSchema).max(LIMITS.relations).default([]).describe('Catalogue ids installed together with this one.'),
  conflicts: z.array(idSchema).max(LIMITS.relations).default([]).describe('Catalogue ids that cannot be installed together with this one.'),
  deprecated: deprecatedSchema.optional(),
})

type ManifestShape = z.output<typeof manifestShape>
type Issue = { readonly path: (string | number)[]; readonly message: string }

/** Cross-field rules of one manifest (each returns friendly issues; none throws). */
function manifestIssues(manifest: ManifestShape): Issue[] {
  const issues: Issue[] = []
  const add = (path: (string | number)[], message: string): void => {
    issues.push({ path, message })
  }

  duplicates(manifest.tags).forEach((tag) => add(['tags'], `lists "${tag}" twice`))
  questionIssues(manifest.questions, add)
  installIssues(manifest.installs, add)

  // Relations: unique, never self, never both "requires" and "conflicts".
  for (const field of ['requires', 'conflicts'] as const) {
    duplicates(manifest[field]).forEach((id) => add([field], `lists "${id}" twice`))
    if (manifest[field].includes(manifest.id)) add([field], `lists the package itself ("${manifest.id}")`)
  }
  for (const id of manifest.requires) {
    if (manifest.conflicts.includes(id)) add(['conflicts'], `"${id}" is both required and in conflict`)
  }
  if (manifest.deprecated?.replacedBy === manifest.id) add(['deprecated', 'replacedBy'], 'points at the package itself')

  // Designs are a different kind of package (blueprint §5.1): their own category, and they only
  // change how the app looks, so they never add tables, routes, commands or env keys.
  if (manifest.kind === 'design') {
    if (manifest.category !== DESIGN_CATEGORY) add(['category'], `must be "${DESIGN_CATEGORY}" for a design`)
    const { env, migrations, routes, screens, sidebar, commands } = manifest.installs
    const extra = { env, migrations, routes, screens, sidebar, commands }
    for (const [field, list] of Object.entries(extra)) {
      if (list.length > 0) add(['installs', field], 'must be empty for a design (designs only change how the app looks)')
    }
  } else if (manifest.category === DESIGN_CATEGORY) {
    add(['category'], `"${DESIGN_CATEGORY}" is only for designs (set "kind": "design")`)
  }
  return issues
}

function questionIssues(questions: ManifestShape['questions'], add: (path: (string | number)[], message: string) => void): void {
  const seen = new Map<string, ManifestShape['questions'][number]>()
  questions.forEach((question, index) => {
    const at = (...rest: (string | number)[]): (string | number)[] => ['questions', index, ...rest]
    if (seen.has(question.id)) add(at('id'), `"${question.id}" is used by two questions`)
    if (question.type === 'select' || question.type === 'multiselect') {
      const values = question.choices.map((choice) => choice.value)
      duplicates(values).forEach((value) => add(at('choices'), `has two choices with the value "${value}"`))
      if (question.type === 'select' && !values.includes(question.default)) {
        add(at('default'), `"${question.default}" is not one of the choices (${values.join(', ')})`)
      }
      if (question.type === 'multiselect') {
        question.default.filter((value) => !values.includes(value)).forEach((value) => add(at('default'), `"${value}" is not one of the choices`))
        duplicates(question.default).forEach((value) => add(at('default'), `lists "${value}" twice`))
        const min = question.min ?? 0
        const max = question.max ?? values.length
        if (min > max) add(at('min'), 'is larger than max')
        if (max > values.length) add(at('max'), `is larger than the number of choices (${values.length})`)
        if (question.default.length < min || question.default.length > max) {
          add(at('default'), `picks ${question.default.length} choices, outside min ${min} and max ${max}`)
        }
      }
    }
    if (question.type === 'text') {
      const parsed = parsePattern(question.pattern.regex)
      if (question.default !== undefined) {
        if (question.default.length > question.maxLength) add(at('default'), `is longer than maxLength (${question.maxLength})`)
        else if (parsed.ok && !matchesPattern(parsed.pattern, question.default)) add(at('default'), 'does not match the pattern')
      }
    }
    const when = question.when
    if (when !== undefined) {
      const target = seen.get(when.question)
      if (target === undefined) {
        add(at('when', 'question'), `"${when.question}" is not an earlier question of this package`)
      } else if ('includes' in when) {
        const wanted = when.includes
        if (target.type !== 'multiselect') add(at('when'), '"includes" only works with a multiselect question; use "equals"')
        else if (!target.choices.some((choice) => choice.value === wanted)) {
          add(at('when', 'includes'), 'is not one of that question\'s choices')
        }
      } else {
        const expected = when.equals
        if (target.type === 'multiselect') add(at('when'), '"equals" does not work with a multiselect question; use "includes"')
        else if (target.type === 'confirm' && typeof expected !== 'boolean') add(at('when', 'equals'), 'must be true or false for a confirm question')
        else if (target.type !== 'confirm' && typeof expected !== 'string') add(at('when', 'equals'), 'must be text for this question')
        else if (target.type === 'select' && !target.choices.some((choice) => choice.value === expected)) {
          add(at('when', 'equals'), 'is not one of that question\'s choices')
        }
      }
    }
    if (!seen.has(question.id)) seen.set(question.id, question)
  })
}

function installIssues(installs: ManifestShape['installs'], add: (path: (string | number)[], message: string) => void): void {
  duplicates(installs.config).forEach((path) => add(['installs', 'config'], `lists "${path}" twice`))
  duplicates(installs.migrations).forEach((name) => add(['installs', 'migrations'], `lists "${name}" twice`))
  duplicates(installs.env.map((env) => env.key)).forEach((key) => add(['installs', 'env'], `lists ${key} twice`))
  duplicates(installs.routes.map((route) => `${route.method} ${route.path}`)).forEach((route) => add(['installs', 'routes'], `lists ${route} twice`))
  duplicates(installs.screens.map((screen) => screen.path)).forEach((path) => add(['installs', 'screens'], `lists ${path} twice`))
  duplicates(installs.sidebar.map((entry) => entry.path)).forEach((path) => add(['installs', 'sidebar'], `lists ${path} twice`))
  duplicates(installs.commands.map((command) => command.name)).forEach((name) => add(['installs', 'commands'], `lists ${name} twice`))
  installs.env.forEach((env, index) => {
    if (!env.secret && SECRET_ENV_KEY.test(env.key)) {
      add(['installs', 'env', index, 'secret'], `${env.key} looks like a credential; set "secret": true so it never gets a value in .env.example`)
    }
    if (env.secret && env.example !== undefined) {
      add(['installs', 'env', index, 'example'], `${env.key} is secret, so it must not have an example value (it would land in .env.example)`)
    }
  })
}

/** Values that appear more than once, each reported once, in first-seen order. */
function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>()
  const repeated = new Set<string>()
  for (const value of values) {
    if (seen.has(value)) repeated.add(value)
    seen.add(value)
  }
  return [...repeated]
}

/**
 * The `strutvane` block: structure, field rules and cross-field rules.
 */
export const manifestSchema = manifestShape.superRefine((manifest, ctx) => {
  for (const issue of manifestIssues(manifest)) ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message })
})

/** A validated manifest, with defaults filled in (every list present). */
export type Manifest = z.output<typeof manifestSchema>
/** What an author writes: lists and `popular` may be left out. */
export type ManifestInput = z.input<typeof manifestSchema>
/** One follow-up question. */
export type Question = z.output<typeof questionSchema>
/** The question types. `password` is deliberately not one of them. */
export type QuestionType = Question['type']
/** One choice of a select or multiselect question. */
export type Choice = z.output<typeof choiceSchema>
/** What the package installs, every list present. */
export type Installs = z.output<typeof installsSchema>
/** One `.env` key. */
export type EnvKey = Installs['env'][number]
/** `package` or `design`. */
export type PackageKind = Manifest['kind']
