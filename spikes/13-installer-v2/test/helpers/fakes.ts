/**
 * Test doubles: a scripted prompter, a programmable fake spawner, a reporter that records lines,
 * and a complete fake {@link InstallerEnvironment} in a temporary folder.
 *
 * @module
 */
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { InstallerEnvironment } from '../../src/main.ts'
import { CANCEL, type Cancel, type Prompter } from '../../src/prompter.ts'
import { plainReporter } from '../../src/reporter.ts'
import type { CommandResult, CommandSpec, Spawner } from '../../src/spawn.ts'

/** What a scripted prompter answers for one question id: a value, or a queue of values. */
export type Script = object

/**
 * Answers for every Recommended-mode (★) question. Spread first in a script so a test only states
 * what it cares about; answers for questions that are never asked are simply unused.
 */
export const RECOMMENDED_ANSWERS = Object.freeze({
  mode: 'recommended',
  stack: 'full',
  design: 'crisp',
  auth: 'email',
  teams: false,
  database: 'mysql',
  docker: 'docker',
  agents: true,
})

/** An answer for every question Custom mode can ask (the prompter ignores unused ones). */
export const CUSTOM_ANSWERS = Object.freeze({
  ...RECOMMENDED_ANSWERS,
  name: 'my-app',
  mode: 'custom',
  ui: 'admin',
  security: ['2fa', 'verification'],
  social: [],
  sso: false,
  apiAccess: 'tokens',
  roles: 'basic',
  tenantResolver: 'switcher',
  adminEmail: '',
  adminPasswordMode: 'generate',
  sampleData: true,
  cache: 'database',
  storage: 'local',
  mailer: 'later',
  locale: '',
  timezone: 'UTC',
  currency: '',
  features: ['log-viewer'],
  featuresSearch: false,
  testing: 'vitest',
  git: true,
  ci: true,
  securityProfile: 'standard',
  activityLog: false,
  ai: false,
  mcpServer: false,
  uiLanguages: ['en'],
  appearance: 'system',
  pwa: false,
  liveUpdates: false,
  monitoring: 'none',
  deploy: 'later',
  editor: true,
  devContainer: false,
})

/** Question ids whose answer is a list (an array in the script is the answer, not a queue). */
const LIST_ANSWERS = new Set(['features', 'featuresMore', 'security', 'social', 'uiLanguages'])

/**
 * A prompter that answers from a script keyed by question id and records what was asked (ids and
 * the exact wording, so tests can check that nothing ever asks for a secret).
 * An unexpected question fails the test with a clear message. For list questions an array is the
 * answer; for every other id an array is a queue of answers (e.g. review: ['change', 'create']).
 *
 * @example
 * const { prompter, asked } = scriptedPrompter({ name: 'my-app', review: 'create' })
 */
export function scriptedPrompter(script: Script) {
  const queues = new Map<string, unknown[]>(
    Object.entries(script).map(([id, value]) => [id, Array.isArray(value) && !LIST_ANSWERS.has(id) ? [...value] : [value]]),
  )
  const asked: string[] = []
  const messages: string[] = []
  /** What kind of prompt each question was (free text and passwords are where a secret could be typed). */
  const prompts: { id: string; kind: string; message: string }[] = []
  const notes: { title: string; lines: readonly string[] }[] = []
  const infos: string[] = []
  const next = (id: string, message: string, kind = 'choice'): unknown => {
    asked.push(id)
    messages.push(message)
    prompts.push({ id, kind, message })
    const queue = queues.get(id)
    if (queue === undefined || queue.length === 0) throw new Error(`Unexpected question "${id}" (asked so far: ${asked.join(', ')})`)
    // Keep the last answer for repeated questions (e.g. review shown twice).
    return queue.length > 1 ? queue.shift() : queue[0]
  }
  /** Every choice label must fit an 80-column terminal (74 characters, the Laravel Prompts rule). */
  const checkLabels = (id: string, options: readonly { label?: string }[]) => {
    for (const option of options) {
      if ((option.label ?? '').length > 74) throw new Error(`Label longer than 74 characters in ${id}: ${option.label ?? ''}`)
    }
  }
  const pick = <T extends string>(id: string, value: unknown, options: readonly { value: T; label?: string }[]): T[] | Cancel => {
    checkLabels(id, options)
    if (value === CANCEL) return CANCEL
    const wanted: unknown[] = Array.isArray(value) ? value : []
    for (const item of wanted) {
      if (!options.some((option) => option.value === item)) throw new Error(`"${String(item)}" is not an option of ${id}`)
    }
    return options.filter((option) => wanted.includes(option.value)).map((option) => option.value)
  }
  const prompter: Prompter = {
    text: async (q) => {
      const value = next(q.id, q.message, 'text')
      if (value === CANCEL) return CANCEL
      const text = String(value)
      const problem = q.validate(text)
      if (problem !== undefined) throw new Error(`Validation refused "${text}": ${problem}`)
      return text
    },
    password: async (q) => {
      const value = next(q.id, q.message, 'password')
      return value === CANCEL ? CANCEL : String(value)
    },
    select: async <T extends string>(q: { id: string; message: string; options: readonly { value: T; label?: string }[] }) => {
      checkLabels(q.id, q.options)
      const value = next(q.id, q.message)
      if (value === CANCEL) return CANCEL
      const match = q.options.find((option) => option.value === value)
      if (match === undefined) throw new Error(`"${String(value)}" is not an option of ${q.id}`)
      return match.value
    },
    multiselect: async <T extends string>(q: { id: string; message: string; options: readonly { value: T }[] }): Promise<T[] | Cancel> =>
      pick(q.id, next(q.id, q.message), q.options),
    groupMultiselect: async <T extends string>(q: {
      id: string
      message: string
      groups: ReadonlyMap<string, readonly { value: T }[]>
    }): Promise<T[] | Cancel> => pick(q.id, next(q.id, q.message), [...q.groups.values()].flat()),
    search: async <T extends string>(q: { id: string; message: string; options: readonly { value: T }[] }): Promise<T[] | Cancel> =>
      pick(q.id, next(q.id, q.message), q.options),
    confirm: async (q) => {
      const value = next(q.id, q.message)
      return value === CANCEL ? CANCEL : value === true
    },
    note: (title, lines) => notes.push({ title, lines }),
    info: (message) => infos.push(message),
  }
  return { prompter, asked, messages, prompts, notes, infos }
}

/** A fake program's answer. */
export type FakeAnswer = Partial<CommandResult> | undefined

/**
 * A fake spawner: `handler` answers each call (default: success with no output); every call is
 * recorded so tests can check exactly what would have run.
 *
 * @example
 * const fake = fakeSpawner((spec) => (spec.command === 'docker' ? { notFound: true, code: -1 } : undefined))
 */
export function fakeSpawner(handler: (spec: CommandSpec, call: number) => FakeAnswer = () => undefined) {
  const calls: CommandSpec[] = []
  const spawn: Spawner = async (spec) => {
    calls.push(spec)
    const answer = handler(spec, calls.length)
    return { code: answer?.code ?? 0, output: answer?.output ?? '', notFound: answer?.notFound ?? false }
  }
  return { spawn, calls }
}

/** A short, readable name for a recorded call: `npm ci`, `docker info`, `git commit`, `strut migrate`. */
export function describeCall(spec: CommandSpec): string {
  const args = spec.args
  if (args[0] === 'compose' && args.includes('exec')) {
    const inside = args.slice(args.indexOf('app') + 1)
    return `app: ${inside[0] === 'node' ? `strut ${inside[2] ?? ''}` : `${inside[0] ?? ''} ${inside[1] ?? ''}`}`.trim()
  }
  if (args[0]?.endsWith('npm-cli.js') === true) return `npm ${args[1] ?? ''}`
  if (args[0] === 'strut.js') return `strut ${args[1] ?? ''}`
  const first = args[0] === 'compose' ? `compose ${args.find((a) => ['up', 'down', 'logs'].includes(a)) ?? args[1] ?? ''}` : (args[0] ?? '')
  return `${spec.command} ${first}`.trim()
}

/** A fresh temporary folder. */
export function tempFolder(prefix = 's13-'): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

/** The npm-cli.js path the fake environment pretends to have. */
export const FAKE_NPM_CLI = join('C:', 'nodejs', 'node_modules', 'npm', 'bin', 'npm-cli.js')

/** The node path the fake environment pretends to have. */
export const FAKE_NODE = join('C:', 'nodejs', 'node.exe')

/**
 * A complete fake environment in `cwd`, with everything overridable.
 *
 * @example
 * const env = fakeEnvironment({ argv: ['my-app', '--yes'], cwd: tempFolder() })
 * const code = await main(env.environment)
 */
export function fakeEnvironment(overrides: Partial<InstallerEnvironment> & { readonly cwd: string }) {
  let output = ''
  let secret = 0
  const write = (text: string) => {
    output += text
  }
  const environment: InstallerEnvironment = {
    argv: [],
    env: {},
    interactiveTerminal: false,
    nodeVersion: '24.21.0',
    execPath: FAKE_NODE,
    resumeWith: [FAKE_NODE, 'cli.ts', '--resume'],
    out: write,
    prompter: scriptedPrompter({}).prompter,
    reporter: () => plainReporter(write, () => 0),
    spawn: fakeSpawner().spawn,
    isPortFree: async () => true,
    npmCli: () => FAKE_NPM_CLI,
    sleep: async () => {},
    now: () => new Date('2026-11-14T10:00:00.000Z'),
    // Deterministic, long enough to pass the "not a placeholder" check (43+ characters).
    generateSecret: () => `secret-${String(++secret).padStart(3, '0')}-${'x'.repeat(40)}`,
    generatePassword: () => 'Abcd-Efgh-Jkmn-Pqrs',
    hostUser: undefined,
    // No jitter: a moved port is always the next free one, so tests can name it.
    random: () => 0,
    ...overrides,
  }
  return { environment, output: () => output }
}
