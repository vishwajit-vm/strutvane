/**
 * "Manifests are data, never code" (blueprint §3.3 item 1: "No code runs to read it").
 *
 * The strict schema already refuses every unknown field, but a field that *looks like code to
 * run* deserves its own, clearer message: it usually means someone expected the installer to run
 * a hook, and the answer is "use the installer protocol inside your package instead".
 *
 * This scan runs before the schema on the raw JSON, at every depth, so a `postinstall` hidden
 * three levels down in `installs` is named precisely.
 *
 * @module
 */

/**
 * Field names that mean "run this". Compared folded (lower case, no `-` or `_`). `installs`,
 * `requires` and `commands` are real manifest fields and are deliberately not here; their
 * singular look-alikes are.
 */
const EXECUTABLE_KEYS: ReadonlySet<string> = new Set([
  'script',
  'scripts',
  'run',
  'exec',
  'execute',
  'command',
  'cmd',
  'shell',
  'sh',
  'bash',
  'powershell',
  'preinstall',
  'install',
  'postinstall',
  'prepare',
  'hook',
  'hooks',
  'handler',
  'handlers',
  'callback',
  'action',
  'eval',
  'code',
  'js',
  'javascript',
  'function',
  'fn',
  'lambda',
  'module',
  'import',
  'require',
  'main',
  'bin',
  'entry',
  'entrypoint',
  'loader',
  'plugin',
  'validator',
  'transform',
  'compute',
  'expression',
  'template',
])

/** `onInstall`, `on_answer`, `onChange`: event-handler shaped names. */
const HANDLER_SHAPE = /^on[A-Z_-]/

/** One field that looks executable, with where it was found. */
export interface ExecutableField {
  /** Dotted path from the `strutvane` block, e.g. `installs.postinstall`. */
  readonly path: string
  readonly key: string
}

/**
 * Every field in `value` whose name looks like code to run.
 *
 * @example
 * findExecutableFields({ id: 'x', installs: { postinstall: 'node x.js' } })
 * // [{ path: 'installs.postinstall', key: 'postinstall' }]
 */
export function findExecutableFields(value: unknown, path = '', depth = 0): ExecutableField[] {
  // Depth is bounded separately (rules.ts); stop early rather than recurse into hostile input.
  if (depth > 12 || typeof value !== 'object' || value === null) return []
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findExecutableFields(item, `${path}[${index}]`, depth + 1))
  }
  const found: ExecutableField[] = []
  for (const [key, inner] of Object.entries(value)) {
    const here = path === '' ? key : `${path}.${key}`
    const folded = key.toLowerCase().replace(/[-_]/g, '')
    if (EXECUTABLE_KEYS.has(folded) || HANDLER_SHAPE.test(key)) found.push({ path: here, key })
    else found.push(...findExecutableFields(inner, here, depth + 1))
  }
  return found
}
