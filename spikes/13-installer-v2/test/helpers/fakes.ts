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
 * A prompter that answers from a script keyed by question id and records what was asked.
 * An unexpected question fails the test with a clear message.
 *
 * @example
 * const { prompter, asked } = scriptedPrompter({ name: 'my-app', review: 'create' })
 */
export function scriptedPrompter(script: Script) {
  const queues = new Map<string, unknown[]>(
    Object.entries(script).map(([id, value]) => [id, Array.isArray(value) && id !== 'features' ? [...value] : [value]]),
  )
  const asked: string[] = []
  const notes: { title: string; lines: readonly string[] }[] = []
  const infos: string[] = []
  const next = (id: string): unknown => {
    asked.push(id)
    const queue = queues.get(id)
    if (queue === undefined || queue.length === 0) throw new Error(`Unexpected question "${id}" (asked so far: ${asked.join(', ')})`)
    // Keep the last answer for repeated questions (e.g. review shown twice).
    return queue.length > 1 ? queue.shift() : queue[0]
  }
  const prompter: Prompter = {
    text: async (q) => {
      const value = next(q.id)
      if (value === CANCEL) return CANCEL
      const text = String(value)
      const problem = q.validate(text)
      if (problem !== undefined) throw new Error(`Validation refused "${text}": ${problem}`)
      return text
    },
    password: async (q) => {
      const value = next(q.id)
      return value === CANCEL ? CANCEL : String(value)
    },
    select: async <T extends string>(q: { id: string; options: readonly { value: T }[] }) => {
      const value = next(q.id)
      if (value === CANCEL) return CANCEL
      const match = q.options.find((option) => option.value === value)
      if (match === undefined) throw new Error(`"${String(value)}" is not an option of ${q.id}`)
      return match.value
    },
    multiselect: async <T extends string>(q: { id: string; options: readonly { value: T }[] }): Promise<T[] | Cancel> => {
      const value = next(q.id)
      if (value === CANCEL) return CANCEL
      const wanted = Array.isArray(value) ? value : []
      return q.options.filter((option) => wanted.includes(option.value)).map((option) => option.value)
    },
    confirm: async (q) => {
      const value = next(q.id)
      return value === CANCEL ? CANCEL : value === true
    },
    note: (title, lines) => notes.push({ title, lines }),
    info: (message) => infos.push(message),
  }
  return { prompter, asked, notes, infos }
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
    ...overrides,
  }
  return { environment, output: () => output }
}
