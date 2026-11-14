/**
 * A fake world of external programs (npm, docker, git, `node strut`) for the step runner tests.
 * Each program answers like the real one on success; a test overrides one program to fail.
 *
 * @module
 */
import type { CommandSpec } from '../../src/spawn.ts'
import { MUST_BE_IGNORED } from '../../src/steps/git.ts'
import { type FakeAnswer, fakeSpawner } from './fakes.ts'

/** Which program a call is. */
export type Program = 'npm' | 'docker' | 'git' | 'strut'

/** Per-program overrides; return `undefined` to fall back to the normal success answer. */
export type ProgramOverrides = Partial<Record<Program, (spec: CommandSpec, nth: number) => FakeAnswer>>

/** In `docker compose ... exec ... app <command>`, the command run inside the container. */
export function insideApp(spec: CommandSpec): readonly string[] | undefined {
  if (spec.args[0] !== 'compose' || !spec.args.includes('exec')) return undefined
  return spec.args.slice(spec.args.indexOf('app') + 1)
}

/** Classify a call by program (commands run inside the app container count as that program). */
export function programOf(spec: CommandSpec): Program {
  const inside = insideApp(spec)
  if (inside?.[0] === 'npm') return 'npm'
  if (inside?.[0] === 'node' && inside[1] === 'strut') return 'strut'
  if (spec.args[0]?.endsWith('npm-cli.js') === true) return 'npm'
  if (spec.args[0] === 'strut.js') return 'strut'
  if (spec.command === 'git') return 'git'
  return 'docker'
}

/** The successful answer of each real program. */
function success(spec: CommandSpec): FakeAnswer {
  const program = programOf(spec)
  if (program === 'npm') return { output: 'added 1 package in 1s' }
  if (program === 'strut') return { output: 'Migrations run (3 new, 3 total)\nAdmin created: admin@acme.test\nDatabase seeded\n' }
  if (program === 'docker' && spec.args[0] === 'info') return { output: '29.8.2\n' }
  if (program === 'git') {
    const [command, flag] = spec.args
    if (command === 'rev-parse' && flag === '--show-toplevel') return { code: 128, output: 'fatal: not a git repository' }
    if (command === 'check-ignore') return { output: `${MUST_BE_IGNORED.join('\n')}\n` }
    if (command === 'diff') return { output: '.env.example\npackage.json\npackage-lock.json\nstrut.js\n' }
  }
  return undefined
}

/**
 * A fake spawner where every program succeeds unless overridden. `nth` counts calls per program,
 * so "fail the first time, then succeed" is one line.
 *
 * @example
 * const world = fakePrograms({ npm: (_spec, nth) => (nth === 1 ? { code: 1, output: 'ECONNRESET' } : undefined) })
 */
export function fakePrograms(overrides: ProgramOverrides = {}) {
  const counts = new Map<Program, number>()
  return fakeSpawner((spec) => {
    const program = programOf(spec)
    const nth = (counts.get(program) ?? 0) + 1
    counts.set(program, nth)
    return overrides[program]?.(spec, nth) ?? success(spec)
  })
}
