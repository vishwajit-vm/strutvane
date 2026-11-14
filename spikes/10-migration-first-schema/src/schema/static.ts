/**
 * Approach (b): derive the schema by *reading* migration files with oxc-parser, never running them.
 *
 * Built "only enough to compare" with approach (a). It reads the narrow, literal shape that `make:migration`
 * stubs produce:
 *
 *   export default migration({ up(schema) { schema.create('posts', (t) => { t.string('title', 200).nullable() }) }, … })
 *
 * The extracted calls become a small "call script" that is replayed on the *same* Blueprint and
 * recorder as approach (a). So the two approaches can only disagree on what they *extract*, never
 * on what a call *means*.
 *
 * Anything it can't read without running code (a loop, an `if`, a variable, a helper function,
 * `schema.hasColumn`) is reported as a diagnostic with a line and column, never guessed.
 */
import { readFileSync } from 'node:fs'
import { parseSync } from 'oxc-parser'
import type { Blueprint } from './blueprint.ts'
import type { Migration, SchemaBuilder } from './migration.ts'
import type { LoadedMigration, MigrationFile } from './replay.ts'

/** A value the analyser can read without running code. */
type Literal = string | number | boolean | null | readonly Literal[]

/** One call such as `.nullable()` or `t.string('title', 200)`. */
interface StaticCall {
  readonly method: string
  readonly args: readonly Literal[]
}

/** One `schema.*` call, plus the blueprint chains of its callback, if it has one. */
interface SchemaCall extends StaticCall {
  readonly chains: readonly (readonly StaticCall[])[]
}

/**
 * Something the analyser could not read, and where.
 *
 * @example
 * const d: StaticDiagnostic = { file: 'x.ts', line: 5, column: 7, message: 'A loop can\'t be read without running it.' }
 */
export interface StaticDiagnostic {
  readonly file: string
  readonly line: number
  readonly column: number
  readonly message: string
}

/**
 * The result of reading migration files statically: migrations that can be replayed exactly like
 * imported ones, plus diagnostics for anything that could not be read.
 *
 * @example
 * const { migrations, diagnostics } = analyzeMigrationFiles(files)
 */
export interface StaticAnalysis {
  readonly migrations: LoadedMigration[]
  readonly diagnostics: StaticDiagnostic[]
}

// Only these methods may appear in a script. Anything else (including Blueprint internals such as
// `toActions`) is a diagnostic, so a crafted file can't make the replay call arbitrary methods.
const SCHEMA_METHODS: ReadonlySet<string> = new Set(['create', 'table', 'drop', 'dropIfExists', 'rename'])
const BLUEPRINT_METHODS: ReadonlySet<string> = new Set([
  'id', 'integer', 'bigInteger', 'string', 'text', 'slug', 'uuid', 'decimal', 'double', 'boolean', 'enum', 'date',
  'timestamp', 'json', 'foreignId', 'timestamps', 'softDeletes', 'renameColumn', 'dropColumn', 'dropConstrainedForeignId',
  'dropTimestamps', 'dropSoftDeletes', 'unique', 'index', 'dropIndex', 'dropUnique',
])
const MODIFIER_METHODS: ReadonlySet<string> = new Set([
  'nullable', 'default', 'unique', 'index', 'comment', 'from', 'constrained', 'cascadeOnDelete', 'nullOnDelete', 'restrictOnDelete',
])

/**
 * Read every file and turn it into a replayable migration, collecting diagnostics on the way.
 * A file with any diagnostic is left out of `migrations`, because a partially read migration would
 * produce wrong types silently.
 *
 * @example
 * const analysis = analyzeMigrationFiles(discoverMigrations(dir))
 * if (analysis.diagnostics.length === 0) replayMigrations(analysis.migrations)
 */
export function analyzeMigrationFiles(files: readonly MigrationFile[]): StaticAnalysis {
  const migrations: LoadedMigration[] = []
  const diagnostics: StaticDiagnostic[] = []
  for (const file of files) {
    const result = analyzeMigrationSource(`${file.name}.ts`, readFileSync(file.path, 'utf8'))
    if (result.diagnostics.length > 0) diagnostics.push(...result.diagnostics)
    else if (result.migration !== undefined) migrations.push({ name: file.name, migration: result.migration })
  }
  return { migrations, diagnostics }
}

/**
 * Read one migration's source text.
 *
 * @example
 * analyzeMigrationSource('x.ts', "export default migration({ up(schema) { schema.drop('a') }, down(schema) {} })")
 */
export function analyzeMigrationSource(file: string, source: string): { migration?: Migration; diagnostics: StaticDiagnostic[] } {
  const reader = new SourceReader(file, source)
  const parsed = parseSync(file, source, { sourceType: 'module' })
  const syntaxError = parsed.errors.find((error) => error.severity === 'Error')
  if (syntaxError !== undefined) return { diagnostics: [reader.at(0, `The file has a syntax error: ${syntaxError.message}`)] }

  const definition = reader.findMigrationObject(asNode(parsed.program))
  if (definition === undefined) return { diagnostics: reader.diagnostics }
  const up = reader.readHook(definition, 'up')
  const down = reader.readHook(definition, 'down')
  if (reader.diagnostics.length > 0 || up === undefined || down === undefined) return { diagnostics: reader.diagnostics }
  return { migration: { up: (schema) => runScript(schema, up), down: (schema) => runScript(schema, down) }, diagnostics: [] }
}

/** Replay a call script on a real recorder, so meaning is shared with approach (a). */
function runScript(schema: SchemaBuilder, script: readonly SchemaCall[]): void {
  for (const call of script) {
    if (call.method === 'create' || call.method === 'table') {
      schema[call.method](String(call.args[0]), (t) => {
        for (const chain of call.chains) runChain(t, chain)
      })
    } else {
      callMethod(schema, call)
    }
  }
}

function runChain(blueprint: Blueprint, chain: readonly StaticCall[]): void {
  let target: unknown = blueprint
  for (const link of chain) target = callMethod(target, link)
}

/** Call a whitelisted method by name. The whitelist was checked while reading the source. */
function callMethod(target: unknown, call: StaticCall): unknown {
  const method: unknown = typeof target === 'object' && target !== null ? Reflect.get(target, call.method) : undefined
  if (typeof method !== 'function') throw new Error(`Internal: "${call.method}" is not callable on the replay target.`)
  return Reflect.apply(method, target, call.args) as unknown
}

// ─── Reading the AST ──────────────────────────────────────────────────────────────────────────

type Node = { readonly type: string; readonly start: number } & Record<string, unknown>

function asNode(value: unknown): Node | undefined {
  if (typeof value !== 'object' || value === null) return undefined
  const record = value as Record<string, unknown>
  return typeof record['type'] === 'string' && typeof record['start'] === 'number' ? (value as Node) : undefined
}

function childNode(node: Node, key: string): Node | undefined {
  return asNode(node[key])
}

function childNodes(node: Node, key: string): Node[] {
  const value = node[key]
  return Array.isArray(value) ? value.flatMap((item) => asNode(item) ?? []) : []
}

/** Unwrap `(x)`, `x as T`, `x satisfies T`: they don't change the value. */
function unwrap(node: Node): Node {
  if (node.type === 'ParenthesizedExpression' || node.type === 'TSAsExpression' || node.type === 'TSSatisfiesExpression') {
    const inner = childNode(node, 'expression')
    return inner === undefined ? node : unwrap(inner)
  }
  return node
}

function identifierName(node: Node | undefined): string | undefined {
  return node?.type === 'Identifier' && typeof node['name'] === 'string' ? node['name'] : undefined
}

/**
 * Walks one file's AST and collects diagnostics. A class so the file name, the source (for line
 * numbers) and the diagnostics list travel together instead of through every function signature.
 */
class SourceReader {
  readonly diagnostics: StaticDiagnostic[] = []
  readonly #file: string
  readonly #lineStarts: number[]

  constructor(file: string, source: string) {
    this.#file = file
    this.#lineStarts = [0]
    for (let index = 0; index < source.length; index++) if (source[index] === '\n') this.#lineStarts.push(index + 1)
  }

  /** Build a diagnostic at a source offset, with a 1-based line and column. */
  at(offset: number, message: string): StaticDiagnostic {
    let line = 0
    while (line + 1 < this.#lineStarts.length && (this.#lineStarts[line + 1] ?? Infinity) <= offset) line++
    return { file: this.#file, line: line + 1, column: offset - (this.#lineStarts[line] ?? 0) + 1, message }
  }

  #report(node: Node, message: string): undefined {
    this.diagnostics.push(this.at(node.start, message))
    return undefined
  }

  /** Find `export default migration({ … })` and return the object literal. */
  findMigrationObject(program: Node | undefined): Node | undefined {
    const exported = program === undefined ? undefined : childNodes(program, 'body').find((statement) => statement.type === 'ExportDefaultDeclaration')
    const call = exported === undefined ? undefined : childNode(exported, 'declaration')
    const unwrapped = call === undefined ? undefined : unwrap(call)
    if (unwrapped?.type !== 'CallExpression' || identifierName(childNode(unwrapped, 'callee')) !== 'migration') {
      this.diagnostics.push(this.at(exported?.start ?? 0, 'Expected `export default migration({ up(schema) { … }, down(schema) { … } })`.'))
      return undefined
    }
    const argument = childNodes(unwrapped, 'arguments')[0]
    const object = argument === undefined ? undefined : unwrap(argument)
    if (object?.type !== 'ObjectExpression') return this.#report(unwrapped, 'migration(…) must be given an object literal.')
    return object
  }

  /** Read `up(schema) { … }` / `down: (schema) => { … }` into a call script. */
  readHook(definition: Node, name: 'up' | 'down'): SchemaCall[] | undefined {
    const property = childNodes(definition, 'properties').find((prop) => identifierName(childNode(prop, 'key')) === name)
    const fn = property === undefined ? undefined : childNode(property, 'value')
    if (fn === undefined || (fn.type !== 'FunctionExpression' && fn.type !== 'ArrowFunctionExpression')) {
      return this.#report(property ?? definition, `\`${name}\` must be written as a method or arrow function.`)
    }
    const schemaName = identifierName(childNodes(fn, 'params')[0])
    const body = childNode(fn, 'body')
    if (body === undefined) return []
    const statements = body.type === 'BlockStatement' ? childNodes(body, 'body') : [body]
    const script: SchemaCall[] = []
    for (const statement of statements) {
      const call = this.#readSchemaStatement(statement, schemaName)
      if (call !== undefined) script.push(call)
    }
    return script
  }

  #readSchemaStatement(statement: Node, schemaName: string | undefined): SchemaCall | undefined {
    const expression = statement.type === 'ExpressionStatement' ? childNode(statement, 'expression') : statement
    const chain = expression === undefined ? undefined : this.#readChain(expression, schemaName, SCHEMA_METHODS, new Set())
    if (chain === undefined) return this.#reportStatement(statement)
    const [call] = chain
    if (call === undefined || chain.length !== 1) return this.#report(statement, 'Only one schema.* call per statement can be read.')
    const callback = call.callback
    if (callback === undefined) return { method: call.method, args: call.args, chains: [] }
    const chains = this.#readBlueprintCallback(callback)
    return chains === undefined ? undefined : { method: call.method, args: call.args, chains }
  }

  #readBlueprintCallback(callback: Node): StaticCall[][] | undefined {
    const blueprintName = identifierName(childNodes(callback, 'params')[0])
    const body = childNode(callback, 'body')
    if (body === undefined) return []
    const statements = body.type === 'BlockStatement' ? childNodes(body, 'body') : [body]
    const chains: StaticCall[][] = []
    let readable = true
    // Keep going after a problem, so the developer sees every unreadable line in one run.
    for (const statement of statements) {
      const expression = statement.type === 'ExpressionStatement' ? childNode(statement, 'expression') : undefined
      const chain = expression === undefined ? undefined : this.#readChain(expression, blueprintName, BLUEPRINT_METHODS, MODIFIER_METHODS)
      if (chain === undefined) {
        this.#reportStatement(statement)
        readable = false
      } else {
        chains.push(chain.map(({ method, args }) => ({ method, args })))
      }
    }
    return readable ? chains : undefined
  }

  /**
   * Read `root.first(…).second(…)…` into a list of calls. The first call must be one of
   * `rootMethods`, the rest must be `modifiers`. A trailing arrow-function argument (the
   * `schema.create` callback) is handed back separately.
   */
  #readChain(expression: Node, rootName: string | undefined, rootMethods: ReadonlySet<string>, modifiers: ReadonlySet<string>): (StaticCall & { callback?: Node })[] | undefined {
    const calls: (StaticCall & { callback?: Node })[] = []
    let current: Node | undefined = unwrap(expression)
    while (current?.type === 'CallExpression') {
      const callee = childNode(current, 'callee')
      const method = callee?.type === 'MemberExpression' && callee['computed'] !== true ? identifierName(childNode(callee, 'property')) : undefined
      if (callee === undefined || method === undefined) {
        const helper = identifierName(callee)
        const message = helper === undefined
          ? 'Only plain method calls such as t.string(\'title\') can be read.'
          : `\`${helper}(…)\` is a helper function; the columns it adds can't be seen without running the file.`
        return this.#report(current, message)
      }
      const read = this.#readArguments(childNodes(current, 'arguments'))
      if (read === undefined) return undefined
      calls.unshift({ method, args: read.args, ...(read.callback === undefined ? {} : { callback: read.callback }) })
      current = unwrap(childNode(callee, 'object') ?? callee)
    }
    if (current === undefined || identifierName(current) !== rootName || calls.length === 0) return undefined
    const [first, ...rest] = calls
    if (first === undefined || !rootMethods.has(first.method)) return this.#report(current, `\`${first?.method ?? '?'}\` isn't a method the static reader understands.`)
    const unknown = rest.find((call) => !modifiers.has(call.method))
    if (unknown !== undefined) return this.#report(current, `\`.${unknown.method}()\` isn't a modifier the static reader understands.`)
    return calls
  }

  #readArguments(nodes: readonly Node[]): { args: Literal[]; callback?: Node } | undefined {
    const args: Literal[] = []
    let callback: Node | undefined
    for (const node of nodes) {
      const value = unwrap(node)
      if (value.type === 'ArrowFunctionExpression' || value.type === 'FunctionExpression') {
        callback = value
        continue
      }
      const literal = this.#readLiteral(value)
      if (literal === undefined) return undefined
      args.push(literal.value)
    }
    return callback === undefined ? { args } : { args, callback }
  }

  #readLiteral(node: Node): { value: Literal } | undefined {
    if (node.type === 'Literal') {
      const value = node['value']
      if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return { value }
    }
    if (node.type === 'UnaryExpression' && node['operator'] === '-') {
      const inner = childNode(node, 'argument')
      if (inner?.type === 'Literal' && typeof inner['value'] === 'number') return { value: -inner['value'] }
    }
    if (node.type === 'ArrayExpression') {
      const items: Literal[] = []
      for (const element of childNodes(node, 'elements')) {
        const item = this.#readLiteral(unwrap(element))
        if (item === undefined) return undefined
        items.push(item.value)
      }
      return { value: items }
    }
    if (node.type === 'TemplateLiteral' && childNodes(node, 'expressions').length === 0) {
      const cooked = childNodes(node, 'quasis')[0]?.['value']
      if (typeof cooked === 'object' && cooked !== null && typeof (cooked as Record<string, unknown>)['cooked'] === 'string') {
        return { value: (cooked as Record<string, string>)['cooked'] ?? '' }
      }
    }
    return this.#report(node, 'This value must be written literally (a string, number, boolean, null or array of those) to be read without running the file.')
  }

  #reportStatement(statement: Node): undefined {
    const what: Record<string, string> = {
      ForStatement: 'A loop',
      ForOfStatement: 'A loop',
      ForInStatement: 'A loop',
      WhileStatement: 'A loop',
      IfStatement: 'An `if`',
      VariableDeclaration: 'A variable',
    }
    const kind = what[statement.type]
    // Only report once per statement: a nested reader may already have said something more precise.
    if (this.diagnostics.some((diagnostic) => diagnostic.line === this.at(statement.start, '').line)) return undefined
    return this.#report(statement, `${kind ?? 'This statement'} can't be read without running the file. Only direct schema.* and t.* calls with literal values are understood.`)
  }
}
