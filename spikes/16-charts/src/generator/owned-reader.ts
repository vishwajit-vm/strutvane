/**
 * Read a developer-owned `resources/charts/<resource>.charts.ts` *statically* (oxc, never
 * executed) to learn whether its widget list follows the suggestions (`auto()`) or is explicit,
 * and which suggestion ids it names.
 *
 * Why static: `charts:sync` runs on every migrate, in CI and in watch mode; running app code there
 * would break ADR-0010 ("parse, never execute"), exactly as spike 14's `ui:sync` avoids it. Anything
 * non-literal is reported as "could not read", never guessed.
 *
 * @module
 */
import { parseSync } from 'oxc-parser'

/**
 * The shape of the `widgets` property.
 *
 * - `default`: absent, which behaves like `auto()`;
 * - `auto`: `auto()` / `auto({ except, order })`; `named` = ids in except/order;
 * - `explicit`: an array; `named` = its string entries (hand-made object entries are skipped);
 * - `unreadable`: a variable, a spread, a function call other than `auto`.
 *
 * @example
 * const shape: WidgetsShape = { kind: 'explicit', named: ['invoices.new'] }
 */
export type WidgetsShape =
  | { readonly kind: 'default' }
  | { readonly kind: 'auto'; readonly named: readonly string[] }
  | { readonly kind: 'explicit'; readonly named: readonly string[] }
  | { readonly kind: 'unreadable'; readonly line: number }

/**
 * What `charts:sync` learns from one owned file.
 *
 * @example
 * readOwnedCharts('invoices.charts.ts', source).widgets.kind // 'auto'
 */
export interface OwnedChartsShape {
  /** The resource named in `defineResourceCharts('invoices', …)`, if readable. */
  readonly resource: string | undefined
  readonly widgets: WidgetsShape
  /** Ids named in `dashboard: [...]` (empty for auto/false/absent). */
  readonly dashboardIds: readonly string[]
  readonly problems: readonly string[]
}

/** A loosely typed ESTree node; the reader needs only a few shapes of oxc's large AST types. */
type AstNode = { readonly type: string } & Readonly<Record<string, unknown>>

/**
 * Read an owned chart file without running it.
 *
 * @example
 * readOwnedCharts('tags.charts.ts', "export default defineResourceCharts('tags', { widgets: ['tags.new'] })")
 * // { resource: 'tags', widgets: { kind: 'explicit', named: ['tags.new'] }, dashboardIds: [], problems: [] }
 */
export function readOwnedCharts(fileName: string, source: string): OwnedChartsShape {
  const lineOf = (offset: unknown): number => (typeof offset === 'number' ? source.slice(0, offset).split('\n').length : 1)
  const parsed = parseSync(fileName, source, { sourceType: 'module', lang: 'ts' })
  const syntaxError = parsed.errors.find((error) => error.severity === 'Error')
  if (syntaxError !== undefined) return unreadable(`${fileName} has a syntax error (${syntaxError.message}); fix it and run charts:sync again.`)
  const call = findDefineCall(asNode(parsed.program))
  if (call === undefined) return unreadable(`${fileName} has no \`export default defineResourceCharts(...)\`, so charts:sync can't check it.`)
  const [nameArgument, configArgument] = arrayOf(call['arguments'])
  const config = unwrap(configArgument)
  if (config?.type !== 'ObjectExpression') return { ...unreadable(`${fileName}: the settings are not an object literal, so charts:sync skipped its checks.`), resource: stringLiteral(nameArgument) }
  const widgetsNode = propertyValue(config, 'widgets')
  const widgets = widgetsNode === undefined ? ({ kind: 'default' } as const) : readWidgets(widgetsNode, lineOf)
  const dashboardNode = unwrap(propertyValue(config, 'dashboard'))
  const problems = widgets.kind === 'unreadable' ? [`${fileName}:${widgets.line}: \`widgets\` is not auto(...) or a list, so charts:sync skipped its checks.`] : []
  return { resource: stringLiteral(nameArgument), widgets, dashboardIds: dashboardNode?.type === 'ArrayExpression' ? strings(dashboardNode) : [], problems }
}

function unreadable(problem: string): OwnedChartsShape {
  return { resource: undefined, widgets: { kind: 'unreadable', line: 1 }, dashboardIds: [], problems: [problem] }
}

/** `export default defineResourceCharts(...)`, looking through `as`/`satisfies`. */
function findDefineCall(program: AstNode | undefined): AstNode | undefined {
  for (const statement of arrayOf(program?.['body'])) {
    if (statement?.type !== 'ExportDefaultDeclaration') continue
    const declaration = unwrap(asNode(statement['declaration']))
    const callee = asNode(declaration?.['callee'])
    if (declaration?.type === 'CallExpression' && callee?.type === 'Identifier' && callee['name'] === 'defineResourceCharts') return declaration
  }
  return undefined
}

function readWidgets(node: AstNode, lineOf: (offset: unknown) => number): WidgetsShape {
  const value = unwrap(node)
  if (value?.type === 'ArrayExpression') {
    const elements = arrayOf(value['elements'])
    // Hand-made charts are object literals; anything else (spread, variable) can't be checked.
    if (elements.some((element) => element?.type !== 'ObjectExpression' && stringLiteral(element) === undefined)) return { kind: 'unreadable', line: lineOf(node['start']) }
    return { kind: 'explicit', named: strings(value) }
  }
  const callee = asNode(value?.['callee'])
  if (value?.type === 'CallExpression' && callee?.type === 'Identifier' && callee['name'] === 'auto') {
    const [options] = arrayOf(value['arguments'])
    if (options === undefined) return { kind: 'auto', named: [] }
    if (options.type === 'ObjectExpression') {
      const named = ['except', 'order'].flatMap((key) => {
        const list = unwrap(propertyValue(options, key))
        return list?.type === 'ArrayExpression' ? strings(list) : []
      })
      return { kind: 'auto', named }
    }
  }
  return { kind: 'unreadable', line: lineOf(node['start']) }
}

/** The value of a plain property `key` of an object literal. */
function propertyValue(object: AstNode, key: string): AstNode | undefined {
  for (const property of arrayOf(object['properties'])) {
    if (property?.type !== 'Property' || property['computed'] === true) continue
    const name = asNode(property['key'])
    if ((name?.type === 'Identifier' && name['name'] === key) || stringLiteral(name) === key) return asNode(property['value'])
  }
  return undefined
}

/** The string-literal elements of an array literal. */
function strings(array: AstNode): string[] {
  return arrayOf(array['elements']).flatMap((element) => {
    const text = stringLiteral(element)
    return text === undefined ? [] : [text]
  })
}

function stringLiteral(node: AstNode | undefined): string | undefined {
  return node?.type === 'Literal' && typeof node['value'] === 'string' ? node['value'] : undefined
}

/** Look through `x as const`, `x satisfies T` and parentheses, which change types, not values. */
function unwrap(node: AstNode | undefined): AstNode | undefined {
  let current = node
  while (current?.type === 'TSAsExpression' || current?.type === 'TSSatisfiesExpression' || current?.type === 'ParenthesizedExpression') current = asNode(current['expression'])
  return current
}

function arrayOf(value: unknown): (AstNode | undefined)[] {
  return Array.isArray(value) ? value.map((item: unknown) => asNode(item)) : []
}

function asNode(value: unknown): AstNode | undefined {
  if (typeof value !== 'object' || value === null || !('type' in value)) return undefined
  return typeof value.type === 'string' ? (value as AstNode) : undefined
}
