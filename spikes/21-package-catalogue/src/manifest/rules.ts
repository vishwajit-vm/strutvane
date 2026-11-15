/**
 * The small, named rules a manifest is checked against: names, ids, URLs, paths and sizes.
 *
 * Each rule lives here once, with the reason it exists, and is used by both the Zod schema
 * (`schema.ts`) and the catalogue index parser, so a manifest and the index built from it can
 * never disagree about what is valid.
 *
 * @module
 */

/** The manifest format this code reads and writes. Bumped only with a migration note in the README. */
export const MANIFEST_VERSION = 1

/**
 * Size limits. Why: the catalogue is downloaded by every `npm create strutvane` run and shown in
 * an 80-column terminal; one huge or chatty manifest must not slow every install or break the
 * layout. The numbers keep every picker line within 74 characters (spike 13's limits).
 */
export const LIMITS = {
  /** Largest `package.json` the builder will read, in bytes. */
  packageJsonBytes: 512 * 1024,
  /** Largest `strutvane` block, as JSON, in bytes. */
  manifestBytes: 16 * 1024,
  /** Deepest nesting inside the `strutvane` block. */
  depth: 6,
  displayName: 30,
  description: 60,
  label: 74,
  help: 160,
  envDescription: 120,
  deprecationMessage: 200,
  url: 300,
  tags: 8,
  tag: 24,
  questions: 6,
  choices: 12,
  relations: 20,
  installsPerKind: 40,
  sidebar: 10,
  textAnswer: 200,
} as const

/**
 * A catalogue id: what people type in `node strut install:<id>` and `--features <id>`. Lower case
 * words joined by single dashes, so it is safe as a file name, a CLI argument and a JSON key.
 */
export const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/
export const ID_MAX = 40

/**
 * Package names that may be listed. First-party packages live under `@strutvane/`, community
 * packages are named `strutvane-<name>` (blueprint §3.3 item 7). Anything else, including other
 * scopes and look-alikes such as `@strutvane-x/y`, is refused: the name becomes an
 * `npm install` argument, a folder and a `package.json` key.
 */
export const FIRST_PARTY_NAME = /^@strutvane\/[a-z0-9]+(?:-[a-z0-9]+)*$/
export const COMMUNITY_NAME = /^strutvane-[a-z0-9]+(?:-[a-z0-9]+)*$/
/** The two unscoped first-party names (the installer and the `npx` guard). Nothing else unscoped. */
export const RESERVED_FIRST_PARTY = new Set(['create-strutvane', 'strutvane'])
export const PACKAGE_NAME_MAX = 60

/** Where a package name puts it. */
export type Origin = 'first-party' | 'community'

/**
 * Is this an allowed package name, and whose is it?
 *
 * @example
 * packageOrigin('@strutvane/billing') // 'first-party'
 * packageOrigin('strutvane-kanban')   // 'community'
 * packageOrigin('@evil/strutvane')    // undefined
 */
export function packageOrigin(name: string): Origin | undefined {
  if (name.length > PACKAGE_NAME_MAX) return undefined
  if (FIRST_PARTY_NAME.test(name) || RESERVED_FIRST_PARTY.has(name)) return 'first-party'
  if (COMMUNITY_NAME.test(name)) return 'community'
  return undefined
}

/**
 * The design name inside a design package's npm name (`@strutvane/design-crisp` → `crisp`), or
 * `undefined` when the name is not a design package name (blueprint §5.1).
 */
export function designNameOf(packageName: string): string | undefined {
  return /^(?:@strutvane\/|strutvane-)design-([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(packageName)?.[1]
}

/**
 * Why a URL is unsafe to show as a docs link, or `undefined` when it is fine.
 *
 * - **https only:** `http:` can be rewritten on the way; `javascript:`, `data:` and `file:` run
 *   or read things when clicked in the docs site or a terminal that links URLs;
 * - **no user name or password** in the URL (`https://user:pass@host`): a credential leak, and a
 *   classic way to disguise the real host;
 * - **no IP addresses or localhost:** a docs link that points into the reader's own network is
 *   either broken or an attack;
 * - **canonical form:** the URL must be written exactly as the WHATWG parser prints it, so what
 *   reviewers read is what browsers open (no `HTTPS://Example.com/./a/../b` tricks).
 *
 * @example
 * urlProblem('https://github.com/vishwajit-vm/strutvane-billing#readme') // undefined
 * urlProblem('http://example.com')                                       // 'must use https'
 */
export function urlProblem(text: string): string | undefined {
  if (text.length > LIMITS.url) return `is too long (at most ${LIMITS.url} characters)`
  let url: URL
  try {
    url = new URL(text)
  } catch {
    return 'is not a valid URL'
  }
  if (url.protocol !== 'https:') return 'must use https'
  if (url.username !== '' || url.password !== '') return 'must not contain a user name or password'
  const host = url.hostname
  if (host === 'localhost' || host.endsWith('.localhost') || /^[\d.]+$/.test(host) || host.startsWith('[')) {
    return 'must point to a public host name, not an IP address or localhost'
  }
  if (!host.includes('.')) return 'must point to a public host name'
  if (url.href !== text) return `must be written in canonical form: ${url.href}`
  return undefined
}

/**
 * A relative project path such as `config/billing.ts`. Why so strict: the installer writes these
 * files, so `..`, absolute paths, backslashes and drive letters would let a manifest aim outside
 * the project. Dot-files and dot-folders (`.ai/rules/x.md`) are allowed.
 */
export const RELATIVE_PATH = /^(?:\.?[a-z0-9_][a-z0-9_.-]*\/)*\.?[a-z0-9_][a-z0-9_.-]*$/i
/** No path segment may be `.` or `..` (the regex alone lets `a/../b` through as `..` is `[.-]+`). */
export function relativePathProblem(path: string): string | undefined {
  if (path.length > 120) return 'is too long (at most 120 characters)'
  if (!RELATIVE_PATH.test(path)) return 'must be a relative path with forward slashes (letters, digits, "_", "-", ".")'
  if (path.split('/').some((segment) => segment === '.' || segment === '..' || segment.startsWith('..'))) {
    return 'must not contain "." or ".." segments'
  }
  return undefined
}

/** A route path the package registers: `/billing`, `/api/_charts/metrics/:name`, `/{slug*}`. */
export const ROUTE_PATH = /^\/(?:[a-z0-9_.:{}*-]+(?:\/[a-z0-9_.:{}*-]+)*)?$/i
/** An app screen path in the UI. */
export const SCREEN_PATH = /^\/(?:[a-z0-9_:-]+(?:\/[a-z0-9_:-]+)*)?$/i
/** A `node strut` command name: `billing:sync`, `make:metric`, `charts:cache:clear`. */
export const COMMAND_NAME = /^[a-z][a-z0-9-]*(?::[a-z][a-z0-9-]*)*$/
/** An `.env` key. Upper snake case, so it works in every shell and in Docker. */
export const ENV_KEY = /^[A-Z][A-Z0-9_]{1,63}$/
/** A migration (table-creating) name: `create_subscriptions_table`. */
export const MIGRATION_NAME = /^[a-z][a-z0-9_]{2,79}$/
/** A sidebar icon name from the design's icon set (Lucide names). */
export const ICON_NAME = /^[a-z][a-z0-9-]{1,40}$/
/** A tag: lower-case words with dashes. */
export const TAG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
/** A full release version. Pre-releases are not listed (`semver-range.ts` cannot compare them). */
export const VERSION = /^(?:0|[1-9]\d{0,8})\.(?:0|[1-9]\d{0,8})\.(?:0|[1-9]\d{0,8})$/

/**
 * Env keys whose names say "credential". They must be declared `secret: true`, so the installer
 * writes them empty to `.env` and never puts a value in `.env.example`.
 */
export const SECRET_ENV_KEY = /(?:^|_)(?:KEY|SECRET|TOKEN|PASSWORD|PASS|PWD|PRIVATE|CREDENTIALS?|DSN)(?:_|$)/
