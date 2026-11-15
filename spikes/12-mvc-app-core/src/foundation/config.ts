/**
 * Typed config files (`config/app.ts`, `config/database.ts`, …) and the repository that serves
 * them through `config('app.name')`.
 *
 * Laravel's config files are plain arrays read with string keys. Here each file is a function of
 * a typed {@link Env}, so the value types flow all the way to `config('app.debug')`: boolean.
 */
import { StrutvaneError } from '../support/errors.ts'
import { Env, type EnvIssue, type EnvSource } from './env.ts'

/**
 * One config file's default export.
 *
 * @example
 * const app: ConfigDefinition<{ name: string }> = defineConfig((env) => ({ name: env.string('APP_NAME', 'Blog') }))
 */
export interface ConfigDefinition<TValue> {
  /** Build the values from the environment. Runs once, at boot. */
  readonly build: (env: Env) => TValue
}

/**
 * Declare a config file. The return type of `build` *is* the config's type.
 *
 * @example
 * export default defineConfig((env) => ({
 *   name: env.string('APP_NAME', 'Strutvane'),
 *   debug: env.boolean('APP_DEBUG', false),
 * }))
 */
export function defineConfig<TValue>(build: (env: Env) => TValue): ConfigDefinition<TValue> {
  return { build }
}

/**
 * Turn `{ app: ConfigDefinition<A>, database: ConfigDefinition<D> }` into `{ app: A, database: D }`.
 * Used in the app's `ConfigRegistry` augmentation.
 *
 * @example
 * interface ConfigRegistry extends ConfigOf<typeof config> {}
 */
export type ConfigOf<TFiles> = { readonly [File in keyof TFiles]: TFiles[File] extends ConfigDefinition<infer TValue> ? TValue : never }

/** Depth guard for {@link ConfigPath}: config trees deeper than four levels are not worth typing. */
type Depth = [never, 0, 1, 2, 3]

/**
 * Every dot path into a config tree, for example `'app' | 'app.name' | 'database.connections.mysql.host'`.
 *
 * @example
 * const key: ConfigPath<{ app: { name: string } }> = 'app.name'
 */
export type ConfigPath<TTree, TLevel extends number = 4> = [TLevel] extends [never]
  ? never
  : TTree extends object
    ? TTree extends readonly unknown[]
      ? never
      : { [Key in keyof TTree & string]: Key | `${Key}.${ConfigPath<TTree[Key], Depth[TLevel]>}` }[keyof TTree & string]
    : never

/**
 * The type at a dot path.
 *
 * @example
 * type Debug = ConfigValue<{ app: { debug: boolean } }, 'app.debug'> // boolean
 */
export type ConfigValue<TTree, TPath extends string> = TPath extends `${infer Head}.${infer Rest}`
  ? Head extends keyof TTree
    ? ConfigValue<TTree[Head], Rest>
    : never
  : TPath extends keyof TTree
    ? TTree[TPath]
    : never

/**
 * Thrown at boot when environment variables are missing or wrong. Lists every problem, grouped
 * by config file.
 *
 * @example
 * try { loadConfig(files, env) } catch (error) { if (error instanceof ConfigError) console.error(error.describe()) }
 */
export class ConfigError extends StrutvaneError {
  /** Every problem, with the config file it came from. */
  readonly problems: readonly (EnvIssue & { readonly file: string })[]

  constructor(problems: readonly (EnvIssue & { readonly file: string })[]) {
    const lines = problems.map((problem) => `  - ${problem.key} ${problem.message} (read in config/${problem.file}.ts)`)
    super('INVALID_ENVIRONMENT', `The app can't start: ${problems.length} environment ${problems.length === 1 ? 'variable needs' : 'variables need'} attention.\n${lines.join('\n')}`, 'Fix the values in .env (see .env.example for every key) and start again.')
    this.name = 'ConfigError'
    this.problems = problems
  }
}

/**
 * The loaded, frozen config tree with dot-path lookups.
 *
 * @example
 * const repository = loadConfig({ app }, { APP_NAME: 'Blog' })
 * repository.get('app.name') // 'Blog'
 */
export class ConfigRepository {
  readonly #tree: Readonly<Record<string, unknown>>

  constructor(tree: Readonly<Record<string, unknown>>) {
    this.#tree = tree
  }

  /** The whole tree, for `about` and debugging. */
  get all(): Readonly<Record<string, unknown>> {
    return this.#tree
  }

  /**
   * `true` when a value exists at the dot path. For optional settings a framework feature reads
   * only if the app defines them (`app.previous_keys`).
   *
   * @example
   * repository.has('app.previous_keys') // false for apps that don't rotate keys yet
   */
  has(path: string): boolean {
    let current: unknown = this.#tree
    for (const segment of path.split('.')) {
      if (typeof current !== 'object' || current === null || !Object.hasOwn(current, segment)) return false
      current = (current as Record<string, unknown>)[segment]
    }
    return true
  }

  /**
   * Read a value by dot path. Unknown paths are an error (not `undefined`), because a typo in a
   * config key should never silently turn a feature off.
   *
   * @example
   * repository.get('database.default') // 'mysql'
   */
  get(path: string): unknown {
    let current: unknown = this.#tree
    for (const segment of path.split('.')) {
      if (typeof current !== 'object' || current === null || !Object.hasOwn(current, segment)) {
        throw new StrutvaneError('UNKNOWN_CONFIG_KEY', `There is no config value at "${path}".`, `Check the key against the files in config/; the first segment is the file name (for example "app.name" reads config/app.ts).`)
      }
      current = (current as Record<string, unknown>)[segment]
    }
    return current
  }
}

/**
 * Build every config file from the environment, then fail once with *all* problems if any.
 *
 * @example
 * const config = loadConfig({ app: appConfig, database: databaseConfig }, process.env)
 */
export function loadConfig(files: Readonly<Record<string, ConfigDefinition<unknown>>>, source: EnvSource): ConfigRepository {
  const tree: Record<string, unknown> = {}
  const problems: (EnvIssue & { file: string })[] = []
  for (const [file, definition] of Object.entries(files)) {
    // A fresh reader per file, so each problem can name the file that read the variable.
    const env = new Env(source)
    tree[file] = deepFreeze(definition.build(env))
    problems.push(...env.issues.map((issue) => ({ ...issue, file })))
  }
  if (problems.length > 0) throw new ConfigError(problems)
  return new ConfigRepository(Object.freeze(tree))
}

/**
 * Freeze a config tree recursively. Config is read-only after boot: a mutation would be invisible
 * to code that already read it.
 *
 * @example
 * const tree = deepFreeze({ app: { name: 'Blog' } })
 */
export function deepFreeze<TValue>(value: TValue): TValue {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const child of Object.values(value)) deepFreeze(child)
  }
  return value
}
