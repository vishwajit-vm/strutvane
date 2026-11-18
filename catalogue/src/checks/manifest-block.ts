/**
 * Conformance of one package version's `strutvane` block, as published on npm (or as written in a
 * package's own `package.json`, for package CI via `check-manifest`).
 *
 * Two dialects share the block today, and both are checked:
 * - **runtime keys** the framework's console reads after install (`compat`, `commands`,
 *   `installer`, `templates`, `migrations`, `allowConsole`; framework
 *   `console/project/contributions.ts`);
 * - **the catalogue manifest** (format 1, `manifestVersion: 1`): what the installer shows before
 *   install. Validated with every manifest rule (`manifest/validate.ts`): no question asks for a
 *   secret, text patterns are ReDoS-safe, ranges are valid, no executable fields, size limits.
 *
 * On top of those rules this module adds what only makes sense for a real release:
 * - no unknown keys (a typo or a newer format is caught, not silently ignored);
 * - module and folder paths stay inside the package;
 * - **no secret values** anywhere in the block (tokens, private keys, credentials in URLs);
 * - the framework range is valid and **accepts the current framework line**.
 *
 * @module
 */
import { LIMITS, VERSION, packageOrigin, relativePathProblem } from '../manifest/rules.ts'
import { findSecretWord } from '../manifest/secret-words.ts'
import { validatePackageJson } from '../manifest/validate.ts'
import { MANIFEST_KEYS } from '../manifest/keys.ts'
import type { SourceEntry } from '../source/schema.ts'
import { RUNTIME_KEYS, catalogueKeys, FRAMEWORK_PACKAGE } from '../source/merge.ts'
import type { Finding } from './findings.ts'
import { acceptsFramework, isSupportedLineRange, parseAnyVersion } from './prerelease.ts'

/** What is known about the version being checked. */
export interface BlockContext {
  readonly name: string
  readonly version: string
  readonly peerDependencies?: Readonly<Record<string, string>> | undefined
  /** The source entry for this package, when the hub lists it. */
  readonly entry?: SourceEntry | undefined
  /**
   * The framework version this release must accept (the framework's newest `latest` or `next`
   * version). Omit to skip the compatibility rule (old releases are allowed to be old).
   */
  readonly frameworkVersion?: string | undefined
}

/**
 * Values that are credentials whatever key they sit under. Each pattern is anchored on a fixed
 * prefix and has bounded repetition, so it runs in linear time on hostile input.
 */
const SECRET_VALUES: readonly (readonly [string, RegExp])[] = [
  ['an npm token', /\bnpm_[A-Za-z0-9]{36}\b/],
  ['a GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,255}|github_pat_[A-Za-z0-9_]{22,255})\b/],
  ['an AWS access key id', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['a Stripe secret key', /\b(?:sk|rk)_live_[0-9A-Za-z]{10,255}\b/],
  ['a Slack token', /\bxox[abposr]-[0-9A-Za-z-]{10,255}/],
  ['a private key', /-----BEGIN [A-Z ]{0,40}PRIVATE KEY-----/],
  ['a JSON Web Token', /\beyJ[A-Za-z0-9_-]{8,4096}\.eyJ[A-Za-z0-9_-]{8,4096}\.[A-Za-z0-9_-]{8,4096}/],
  ['a URL with a password', /\b[a-z][a-z0-9+.-]{1,20}:\/\/[^/\s:@]{1,200}:[^/\s@]{1,200}@/i],
]

/** Every string value in the block with its path, up to the block's depth limit. */
function strings(value: unknown, path: string, depth = 0): { readonly path: string; readonly key: string; readonly value: string }[] {
  if (depth > LIMITS.depth + 1) return []
  if (typeof value === 'string') return [{ path, key: path.split('.').at(-1) ?? '', value }]
  if (Array.isArray(value)) return value.flatMap((item, index) => strings(item, `${path}[${index}]`, depth + 1))
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, item]) => strings(item, `${path}.${key}`, depth + 1))
  }
  return []
}

/** Secret-looking values in a block (exported for tests and for whole-package.json scans). */
export function findSecretValues(block: unknown, root = 'strutvane'): { readonly path: string; readonly what: string }[] {
  const found: { path: string; what: string }[] = []
  for (const { path, key, value } of strings(block, root)) {
    const match = SECRET_VALUES.find(([, pattern]) => pattern.test(value))
    if (match !== undefined) {
      found.push({ path, what: match[0] })
      continue
    }
    // A key that names a credential ("token", "apiKey", "password") holding a non-empty string.
    // `installs.env[].key` is the exception: it holds an env variable NAME ("STRIPE_SECRET").
    const bare = key.replace(/\[\d+\]$/, '')
    if (bare === 'key' && /\.env\[\d+\]\.key$/.test(path)) continue
    const word = findSecretWord(bare)
    if (word !== undefined && value.trim() !== '') found.push({ path, what: `a value under a credential name ("${word}")` })
  }
  return found
}

/** A module (`./dist/commands.mjs`) or folder (`./migrations`) inside the package. */
function packagePathProblem(value: unknown): string | undefined {
  if (typeof value !== 'string') return 'must be a path string'
  const path = value.startsWith('./') ? value.slice(2) : value
  return relativePathProblem(path)
}

const MODULE_KEYS = ['commands', 'installer', 'templates'] as const

/**
 * Check one `strutvane` block. Returns findings for the `manifest` check, subject
 * `<name>@<version>`.
 *
 * @example
 * checkBlock({ compat: '^0.2.0-next.0', commands: './dist/commands.mjs' },
 *   { name: '@strutvane/auth', version: '0.2.0-next.0', frameworkVersion: '0.2.0-next.1' }) // []
 */
export function checkBlock(block: unknown, context: BlockContext): Finding[] {
  const findings: Finding[] = []
  const subject = `${context.name}@${context.version}`
  const error = (message: string): void => {
    findings.push({ check: 'manifest', severity: 'error', subject, message })
  }
  const warning = (message: string): void => {
    findings.push({ check: 'manifest', severity: 'warning', subject, message })
  }
  if (typeof block !== 'object' || block === null || Array.isArray(block)) {
    error('strutvane must be an object')
    return findings
  }
  const record = block as Record<string, unknown>
  let size = 0
  try {
    size = Buffer.byteLength(JSON.stringify(record), 'utf8')
  } catch {
    error('strutvane is not plain JSON data')
    return findings
  }
  if (size > LIMITS.manifestBytes) {
    error(`strutvane is too large (${size} bytes; at most ${LIMITS.manifestBytes})`)
    return findings
  }

  // 1. Every key is known.
  for (const key of Object.keys(record).sort()) {
    if (!RUNTIME_KEYS.has(key) && !MANIFEST_KEYS.has(key)) {
      error(`strutvane.${key} is not a known field (runtime: ${[...RUNTIME_KEYS].join(', ')}; catalogue: manifestVersion, id, displayName, …)`)
    }
  }

  // 2. No secret values, anywhere.
  for (const secret of findSecretValues(record)) {
    error(`${secret.path} holds ${secret.what}. Never publish credentials; rotate it now, then remove it and declare the key under installs.env with "secret": true`)
  }

  // 3. Runtime keys: paths stay inside the package; compat is a range we understand.
  for (const key of MODULE_KEYS) {
    if (record[key] === undefined) continue
    const problem = packagePathProblem(record[key])
    if (problem !== undefined) error(`strutvane.${key} ${problem} (a module inside the package, like "./dist/${key}.mjs")`)
  }
  if (record['migrations'] !== undefined) {
    const problem = packagePathProblem(record['migrations'])
    if (problem !== undefined) error(`strutvane.migrations ${problem} (a folder inside the package, like "./migrations")`)
  }
  if (record['allowConsole'] !== undefined) {
    const list = record['allowConsole']
    if (!Array.isArray(list) || list.length > 50) error('strutvane.allowConsole must be a list of at most 50 file paths')
    else list.forEach((item, index) => {
      const problem = packagePathProblem(item)
      if (problem !== undefined) error(`strutvane.allowConsole[${index}] ${problem}`)
    })
  }
  const compat = record['compat']
  if (compat !== undefined && (typeof compat !== 'string' || compat.length > 100 || !isSupportedLineRange(compat))) {
    error(`strutvane.compat ${JSON.stringify(compat)} is not a semver range the catalogue understands (use "^0.2" or "^0.2.0-next.0")`)
  }

  // 4. The catalogue manifest, when present, passes every manifest rule.
  const catalogue = catalogueKeys(record)
  const declaresCatalogue = Object.keys(catalogue).some((key) => MANIFEST_KEYS.has(key))
  if (declaresCatalogue && record['manifestVersion'] === undefined) {
    error(`declares catalogue fields (${Object.keys(catalogue).filter((key) => MANIFEST_KEYS.has(key)).sort().join(', ')}) without "manifestVersion": 1; the catalogue ignores them until it is added`)
  }
  let manifestRange: string | undefined
  if (record['manifestVersion'] !== undefined) {
    // Pre-releases are validated as their release line: the version rule is about listing, which
    // the builder enforces separately.
    const parsedVersion = parseAnyVersion(context.version)
    const version = VERSION.test(context.version) ? context.version : (parsedVersion?.base ?? context.version)
    const result = validatePackageJson({
      name: context.name,
      version,
      ...(context.peerDependencies === undefined ? {} : { peerDependencies: context.peerDependencies }),
      strutvane: catalogue,
    })
    if (!result.ok) {
      for (const problem of result.problems) error(`${problem.path === '' ? '' : `${problem.path} `}${problem.message}`)
    } else {
      manifestRange = result.manifest.framework
      const entry = context.entry
      if (entry !== undefined) {
        if (result.manifest.id !== entry.id) error(`strutvane.id is "${result.manifest.id}" but the hub lists this package as "${entry.id}"; ids are permanent, so fix the manifest`)
        if (result.manifest.kind !== entry.kind) error(`strutvane.kind is "${result.manifest.kind}" but the hub lists a ${entry.kind}`)
        if (entry.category !== undefined && result.manifest.category !== entry.category) {
          error(`strutvane.category is "${result.manifest.category}" but the hub files it under "${entry.category}"; change one of them`)
        }
      }
    }
  }

  // 5. Framework compatibility: the release accepts the framework line being shipped.
  if (context.name !== FRAMEWORK_PACKAGE && context.frameworkVersion !== undefined) {
    const range =
      (typeof compat === 'string' ? compat : undefined) ?? context.peerDependencies?.[FRAMEWORK_PACKAGE] ?? manifestRange
    if (range === undefined) {
      if (packageOrigin(context.name) === 'community') error('declares no framework range (strutvane.compat or a peer on @strutvane/framework); community packages must')
      else warning('declares no framework range; first-party packages may omit it, but then nothing proves it works with the current framework')
    } else if (!acceptsFramework(range, context.frameworkVersion)) {
      error(`framework range "${range}" does not accept the current framework ${context.frameworkVersion}; release a version whose strutvane.compat includes it`)
    }
  }
  if (context.name === FRAMEWORK_PACKAGE && typeof compat === 'string' && !acceptsFramework(compat, context.version)) {
    error(`strutvane.compat "${compat}" does not include the framework's own version ${context.version}; plugins checked against it would be refused`)
  }
  return findings
}
