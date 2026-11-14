/**
 * The service container: Laravel's `app()->bind()` / `app()->make()`, without reflection.
 *
 * Laravel autowires constructors by reading PHP type hints at runtime. TypeScript erases types,
 * and decorators/`reflect-metadata` are banned by the standards, so a class that needs services
 * says so explicitly in a `static inject` list. The compiler then checks that list against the
 * constructor's parameters (see {@link Injectable}), so the wiring can't drift.
 */
import { StrutvaneError } from '../support/errors.ts'

/**
 * A typed key for something in the container. The type parameter is the type of the value, so
 * `container.make(token)` returns exactly that type.
 *
 * @example
 * export const Clock = token<() => Date>('clock')
 */
export interface Token<TValue> {
  /**
   * Marks the object as a token. Without it, any class (which also has a `name`) would match
   * the token overload of `make()` and skip the `inject` check.
   */
  readonly kind: 'token'
  /** A readable name for error messages and `about`. */
  readonly name: string
  /**
   * Never set at runtime: it only carries `TValue` for the type checker. A getter-shaped type
   * keeps tokens covariant, so a `Token<Logger>` fits wherever "any token" is expected.
   */
  readonly __type?: () => TValue
}

/**
 * Create a token.
 *
 * Why tokens and not strings: a string key (`'db'`) can't tell the compiler what comes back,
 * which is exactly the "facade magic" problem the Laravel study warns about.
 *
 * @example
 * const Mailer = token<{ send(to: string): Promise<void> }>('mailer')
 * app.container.singleton(Mailer, () => new SmtpMailer())
 */
export function token<TValue>(name: string): Token<TValue> {
  return Object.freeze({ kind: 'token', name })
}

/**
 * A class the container can build: no constructor arguments, or a `static inject` list whose
 * resolved types match the constructor's parameters one by one.
 *
 * @example
 * class PostService {
 *   static readonly inject = [DatabaseToken] as const
 *   readonly db: Database
 *   constructor(db: Database) { this.db = db }
 * }
 */
export type Injectable<TInstance> =
  | (new () => TInstance)
  | ({ new (...args: never[]): TInstance; readonly inject: readonly Key<unknown>[] })

/**
 * Anything you can ask the container for: a token or a class.
 *
 * @example
 * const key: Key<PostController> = PostController
 */
export type Key<TValue> = Token<TValue> | Injectable<TValue>

/**
 * The value types of an `inject` list, in order. Used to check a constructor against its list.
 *
 * @example
 * type Deps = ResolvedList<readonly [typeof Database, Token<Logger>]> // [Database, Logger]
 */
export type ResolvedList<TKeys extends readonly unknown[]> = { -readonly [Index in keyof TKeys]: TKeys[Index] extends Key<infer TValue> ? TValue : never }

/**
 * Compile-time check that a class's `inject` list matches its constructor. Use it as
 * `satisfies` target or in a type test; the container calls it implicitly.
 *
 * @example
 * type Ok = CheckInjectable<typeof PostService> // typeof PostService (or `never` if the list is wrong)
 */
export type CheckInjectable<TClass> = TClass extends { readonly inject: infer TList extends readonly unknown[]; new (...args: infer TArgs): unknown }
  ? ResolvedList<TList> extends TArgs
    ? TClass
    : never
  : TClass extends new () => unknown
    ? TClass
    : never

/** How long a binding's value lives. */
type Lifetime = 'transient' | 'singleton'

interface Binding {
  readonly factory: (container: Container) => unknown
  readonly lifetime: Lifetime
}

/**
 * The container itself. One per application; tests create as many apps as they like, because
 * nothing here is global.
 *
 * @example
 * const container = new Container()
 * container.singleton(Clock, () => () => new Date())
 * container.make(Clock)() // a Date
 */
export class Container {
  readonly #bindings = new Map<Key<unknown>, Binding>()
  readonly #instances = new Map<Key<unknown>, unknown>()
  /** Keys being built right now, to turn a dependency cycle into a clear error. */
  readonly #resolving: Key<unknown>[] = []

  /**
   * Register a factory that runs on every `make()`. Laravel's `bind`.
   *
   * @example
   * container.bind(RequestId, () => crypto.randomUUID())
   */
  bind<TValue>(key: Key<TValue>, factory: (container: Container) => TValue): void {
    this.#instances.delete(key)
    this.#bindings.set(key, { factory, lifetime: 'transient' })
  }

  /**
   * Register a factory that runs once; later `make()` calls get the same value. Laravel's `singleton`.
   *
   * @example
   * container.singleton(Database, () => openDatabase(':memory:'))
   */
  singleton<TValue>(key: Key<TValue>, factory: (container: Container) => TValue): void {
    this.#instances.delete(key)
    this.#bindings.set(key, { factory, lifetime: 'singleton' })
  }

  /**
   * Register a ready-made value. Laravel's `instance`.
   *
   * @example
   * container.instance(Config, loadedConfig)
   */
  instance<TValue>(key: Key<TValue>, value: TValue): void {
    this.#bindings.set(key, { factory: () => value, lifetime: 'singleton' })
    this.#instances.set(key, value)
  }

  /**
   * `true` if `key` is bound (classes count as bound only when registered explicitly).
   *
   * @example
   * if (container.has(FeatureFlags)) { … }
   */
  has(key: Key<unknown>): boolean {
    return this.#bindings.has(key)
  }

  /**
   * Resolve a value. Unbound classes are built automatically (from `static inject`), like
   * Laravel's zero-config resolution of concrete classes. Unbound tokens are an error that names
   * the token and says where to bind it.
   *
   * @example
   * const controller = container.make(PostController)
   */
  make<TValue>(key: Token<TValue>): TValue
  make<TClass extends Injectable<unknown>>(key: TClass & CheckInjectable<TClass>): InstanceType<TClass>
  make(key: Key<unknown>): unknown {
    return this.#resolveKey(key)
  }

  /**
   * `make` without the compile-time `inject` check, for framework code holding a class whose
   * type was already checked where it was registered (routes, middleware aliases).
   *
   * @example
   * const controller = container.build(route.action.controller)
   */
  build(key: Key<unknown>): unknown {
    return this.#resolveKey(key)
  }

  #build(key: Key<unknown>): unknown {
    const binding = this.#bindings.get(key)
    if (binding !== undefined) {
      const value = binding.factory(this)
      if (binding.lifetime === 'singleton') this.#instances.set(key, value)
      return value
    }
    if (typeof key === 'function') return this.#construct(key)
    throw new StrutvaneError(
      'UNBOUND_TOKEN',
      `Nothing is bound to "${key.name}" in the container.`,
      `Bind it in a service provider's register() method, for example: app.container.singleton(${key.name}Token, () => …).`,
    )
  }

  #construct(target: Injectable<unknown>): unknown {
    const keys: readonly Key<unknown>[] = 'inject' in target ? target.inject : []
    const args = keys.map((dependency) => this.#resolveKey(dependency))
    // The public `make` overload already checked, at compile time, that `inject` matches the
    // constructor's parameters, so spreading the resolved list is safe.
    const Constructor = target as unknown as new (...values: unknown[]) => unknown
    return new Constructor(...args)
  }

  /** `make` for an untyped key, used while walking an `inject` list. */
  #resolveKey(key: Key<unknown>): unknown {
    if (this.#instances.has(key)) return this.#instances.get(key)
    if (this.#resolving.includes(key)) throw this.#cycleError(key)
    this.#resolving.push(key)
    try {
      return this.#build(key)
    } finally {
      this.#resolving.pop()
    }
  }

  #cycleError(key: Key<unknown>): StrutvaneError {
    const chain = [...this.#resolving, key].map((entry) => entry.name).join(' → ')
    return new StrutvaneError('DEPENDENCY_CYCLE', `These services depend on each other in a loop: ${chain}.`, 'Break the loop by injecting a factory (() => service) instead of the service itself.')
  }
}
