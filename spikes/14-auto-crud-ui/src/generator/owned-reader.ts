/**
 * Read a developer-owned `resources/ui/<resource>.ui.ts` file *statically* (oxc parser, never
 * executed) to learn which lists are `auto()` and which are explicit.
 *
 * Why static: `ui:sync` runs on every migrate, in CI and in watch mode. Running app code there
 * would break ADR-0010 ("parse, never execute"). The generator only needs to know the *shape* of
 * three properties, which a parser sees reliably as long as the file uses literals, which the
 * scaffold does. Anything cleverer is reported as "could not read", never guessed.
 *
 * @module
 */
import { parseSync } from 'oxc-parser'

/**
 * What one list property (`columns`, `form` or `filters`) looks like in the owned file.
 *
 * - `default`: the property is absent, which behaves exactly like `auto()`.
 * - `auto`: `auto()` or `auto({ except: [...], order: [...] })`.
 * - `explicit`: an array of field names. `ui:sync` never rewrites these.
 * - `unreadable`: something the static reader cannot interpret (a variable, a spread, a function).
 *
 * @example
 * const shape: SelectionShape = { kind: 'explicit', fields: ['title', 'status'] }
 */
export type SelectionShape =
  | { readonly kind: 'default' }
  | { readonly kind: 'auto'; readonly except: readonly string[]; readonly order: readonly string[] }
  | { readonly kind: 'explicit'; readonly fields: readonly string[] }
  | { readonly kind: 'unreadable'; readonly line: number }

/** The three list properties an owned file can set. */
export const SELECTION_KEYS = ['columns', 'form', 'filters'] as const

/**
 * Which list property: `columns`, `form` or `filters`.
 *
 * @example
 * const key: SelectionKey = 'columns'
 */
export type SelectionKey = (typeof SELECTION_KEYS)[number]

/**
 * The statically read shape of one owned file.
 *
 * @example
 * const shape = readOwnedFile('posts.ui.ts', source)
 * shape.selections.columns.kind // 'auto'
 */
export interface OwnedFileShape {
  /** The resource named in `defineResourceUi('posts', ...)`, if it could be read. */
  readonly resource: string | undefined
  readonly selections: Readonly<Record<SelectionKey, SelectionShape>>
  /** Friendly sentences about anything the reader could not interpret. */
  readonly problems: readonly string[]
}

/** A loosely typed ESTree node: oxc's own types are large, and the reader needs only a few shapes. */
type AstNode = { readonly type: string } & Readonly<Record<string, unknown>>

/**
 * Read an owned file's shape without running it.
 *
 * @example
 * readOwnedFile('posts.ui.ts', "export default defineResourceUi('posts', { columns: ['title'] })")
 * // { resource: 'posts', selections: { columns: { kind: 'explicit', fields: ['title'] }, form: { kind: 'default' }, ... } }
 */
export function readOwnedFile(fileName: string, source: string): OwnedFileShape {
  const lineOf = (offset: unknown): number => (typeof offset === 'number' ? source.slice(0, offset).split('\n').length : 1)
  const parsed = parseSync(fileName, source, { sourceType: 'module', lang: 'ts' })
  const syntaxError = parsed.errors.find((error) => error.severity === 'Error')
  if (syntaxError !== undefined) {
    return unreadableFile(`${fileName} has a syntax error (${syntaxError.message}); fix it and run ui:sync again.`)
  }
  const call = findDefaultDefineCall(asNode(parsed.program))
  if (call === undefined) {
    return unreadableFile(`${fileName} has no \`export default defineResourceUi(...)\`, so ui:sync cannot tell which columns it shows.`)
  }
  const [nameArgument, configArgument] = arrayOf(call['arguments'])
  const resource = stringLiteral(nameArgument)
  const config = unwrapTypeAssertions(configArgument)
  const problems: string[] = []
  const selections = {} as Record<SelectionKey, SelectionShape>
  for (const key of SELECTION_KEYS) {
    const value = config?.type === 'ObjectExpression' ? propertyValue(config, key) : undefined
    const shape = value === undefined ? ({ kind: 'default' } as const) : readSelection(value, lineOf)
    if (shape.kind === 'unreadable') problems.push(`${fileName}:${shape.line}: \`${key}\` is not auto(...) or a list of field names, so ui:sync skipped its checks.`)
    selections[key] = shape
  }
  if (config?.type !== 'ObjectExpression') problems.push(`${fileName}: the settings are not an object literal, so ui:sync skipped its checks.`)
  return { resource, selections, problems }
}

function unreadableFile(problem: string): OwnedFileShape {
  const unreadable: SelectionShape = { kind: 'unreadable', line: 1 }
  return { resource: undefined, selections: { columns: unreadable, form: unreadable, filters: unreadable }, problems: [problem] }
}

/** `export default defineResourceUi(...)`, looking through `as`/`satisfies` wrappers. */
function findDefaultDefineCall(program: AstNode | undefined): AstNode | undefined {
  for (const statement of arrayOf(program?.['body'])) {
    if (statement?.type !== 'ExportDefaultDeclaration') continue
    const declaration = unwrapTypeAssertions(asNode(statement['declaration']))
    const callee = asNode(declaration?.['callee'])
    if (declaration?.type === 'CallExpression' && callee?.type === 'Identifier' && callee['name'] === 'defineResourceUi') return declaration
  }
  return undefined
}

/** Classify one property value. */
function readSelection(node: AstNode, lineOf: (offset: unknown) => number): SelectionShape {
  const value = unwrapTypeAssertions(node)
  if (value?.type === 'ArrayExpression') {
    const fields = stringList(value)
    return fields === undefined ? { kind: 'unreadable', line: lineOf(node['start']) } : { kind: 'explicit', fields }
  }
  const callee = asNode(value?.['callee'])
  if (value?.type === 'CallExpression' && callee?.type === 'Identifier' && callee['name'] === 'auto') {
    const [options] = arrayOf(value['arguments'])
    if (options === undefined) return { kind: 'auto', except: [], order: [] }
    const except = optionalList(options, 'except')
    const order = optionalList(options, 'order')
    if (options.type === 'ObjectExpression' && except !== undefined && order !== undefined) return { kind: 'auto', except, order }
  }
  return { kind: 'unreadable', line: lineOf(node['start']) }
}

/** `except: ['a', 'b']` inside `auto({...})`; an absent key is an empty list, anything else undefined. */
function optionalList(options: AstNode, key: string): string[] | undefined {
  const value = propertyValue(options, key)
  if (value === undefined) return []
  const unwrapped = unwrapTypeAssertions(value)
  return unwrapped?.type === 'ArrayExpression' ? stringList(unwrapped) : undefined
}

/** The value of a plain (non-computed, non-spread) property `key` of an object literal. */
function propertyValue(object: AstNode, key: string): AstNode | undefined {
  for (const property of arrayOf(object['properties'])) {
    if (property?.type !== 'Property' || property['computed'] === true) continue
    const name = asNode(property['key'])
    const matches = (name?.type === 'Identifier' && name['name'] === key) || stringLiteral(name) === key
    if (matches) return asNode(property['value'])
  }
  return undefined
}

/** Every element a string literal, or `undefined` when any is not (a variable, a spread). */
function stringList(array: AstNode): string[] | undefined {
  const values: string[] = []
  for (const element of arrayOf(array['elements'])) {
    const text = stringLiteral(element)
    if (text === undefined) return undefined
    values.push(text)
  }
  return values
}

function stringLiteral(node: AstNode | undefined): string | undefined {
  return node?.type === 'Literal' && typeof node['value'] === 'string' ? node['value'] : undefined
}

/** Look through `x as const` and `x satisfies T`, which change types, not values. */
function unwrapTypeAssertions(node: AstNode | undefined): AstNode | undefined {
  let current = node
  while (current?.type === 'TSAsExpression' || current?.type === 'TSSatisfiesExpression' || current?.type === 'ParenthesizedExpression') {
    current = asNode(current['expression'])
  }
  return current
}

function arrayOf(value: unknown): (AstNode | undefined)[] {
  return Array.isArray(value) ? value.map((item: unknown) => asNode(item)) : []
}

function asNode(value: unknown): AstNode | undefined {
  if (typeof value !== 'object' || value === null || !('type' in value)) return undefined
  return typeof value.type === 'string' ? (value as AstNode) : undefined
}
