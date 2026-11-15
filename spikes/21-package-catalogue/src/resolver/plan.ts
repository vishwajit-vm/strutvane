/**
 * The install plan: from "the packages I picked" to "exactly what will be installed, in which
 * order, and which questions will be asked".
 *
 * **Order independence** (ECOSYSTEM rule 3: install order never changes the result): the plan is a
 * function of the *set* of picks. Picks are de-duplicated and sorted before anything else, the
 * required packages are added by a sorted walk, and the steps are a topological order with ties
 * broken by id. Picking `[billing, settings]` or `[settings, billing, billing]` gives the same plan,
 * byte for byte (property-tested).
 *
 * Every refusal is a {@link ResolveError} listing *all* problems in plain words, so the
 * installer can show them at once instead of one per attempt.
 *
 * @module
 */
import type { EnvKey, PackageKind, Question } from '../manifest/schema.ts'
import { byCodeUnit, findCycle, topologicalOrder } from '../graph.ts'
import type { CatalogueEntry, CatalogueIndex } from '../catalogue/index-schema.ts'
import { compatibleVersion, type OfferOptions, unavailableReason } from './offer.ts'

/** Machine-readable reason codes, stable for tests and for `--json` output. */
export type ResolveProblemCode =
  | 'unknown-package'
  | 'not-available'
  | 'not-installable'
  | 'conflict'
  | 'requires-cycle'
  | 'two-designs'

/** One reason the plan cannot be made. */
export interface ResolveProblem {
  readonly code: ResolveProblemCode
  /** Plain words, ready to show. */
  readonly message: string
  /** The catalogue ids involved, sorted. */
  readonly ids: readonly string[]
}

/** The picks cannot be installed; `problems` says why, every one of them. */
export class ResolveError extends Error {
  readonly problems: readonly ResolveProblem[]
  constructor(problems: readonly ResolveProblem[]) {
    super(problems.map((problem) => problem.message).join('\n'))
    this.name = 'ResolveError'
    this.problems = problems
  }
}

/** A follow-up question in the plan, keyed `<package id>.<question id>` (the `--feature-option` key). */
export interface PlannedQuestion {
  readonly key: `${string}.${string}`
  readonly packageId: string
  readonly question: Question
}

/** One package to install. */
export interface PlanStep {
  readonly id: string
  readonly package: string
  /** The newest version compatible with the framework. */
  readonly version: string
  readonly kind: PackageKind
  /** `picked` by the developer, or added because another package `required` it. */
  readonly reason: 'picked' | 'required'
  /** The planned packages that require this one, sorted. */
  readonly requiredBy: readonly string[]
}

/** One `.env` key the plan adds, merged across packages. */
export interface PlannedEnv {
  readonly key: string
  readonly description: string
  /** Secret if any package says so: written empty to `.env`, never given an example value. */
  readonly secret: boolean
  readonly packages: readonly string[]
}

/** Everything the installer needs to show the review screen and run the steps. */
export interface InstallPlan {
  readonly frameworkVersion: string
  /** Requirements before the packages that need them; otherwise by id. */
  readonly steps: readonly PlanStep[]
  /** Every follow-up question, in step order, then the package's own order. */
  readonly questions: readonly PlannedQuestion[]
  /** `.env` keys, sorted. Secret ones are for the developer to fill in later. */
  readonly env: readonly PlannedEnv[]
  /** Not errors, but worth showing (e.g. "settings is deprecated"). */
  readonly warnings: readonly string[]
}

/** Options for {@link planInstall}: the same as for offering. */
export type PlanOptions = Pick<OfferOptions, 'frameworkVersion' | 'includeUnpublished' | 'includePreview'>

/**
 * Turn picked ids into an install plan, or throw {@link ResolveError}.
 *
 * Rules:
 * - every picked id must exist, be released (unless `includeUnpublished`) and fit the framework;
 * - packages in non-pickable categories (the framework, the installer, the `npx` guard) are
 *   never installed this way;
 * - everything a package `requires` is added (and must be available too);
 * - no two planned packages may conflict (a conflict declared by either side counts);
 * - at most one design;
 * - requirements must not form a cycle.
 *
 * @example
 * const plan = planInstall(index, ['billing'], { frameworkVersion: '0.2.0' })
 * plan.steps.map((s) => s.id) // ['settings', 'billing'] when billing requires settings
 */
export function planInstall(index: CatalogueIndex, picks: readonly string[], options: PlanOptions): InstallPlan {
  const byId = new Map(index.entries.map((entry) => [entry.id, entry] as const))
  const installable = new Set(index.categories.filter((category) => category.pickable).map((category) => category.id))
  const problems: ResolveProblem[] = []
  const warnings: string[] = []
  const picked = [...new Set(picks)].sort(byCodeUnit)

  // 1. Picked ids exist and can be installed.
  for (const id of picked) {
    const entry = byId.get(id)
    if (entry === undefined) {
      const suggestion = closestId(id, [...byId.keys()])
      problems.push({ code: 'unknown-package', ids: [id], message: `There is no package "${id}" in the catalogue.${suggestion === undefined ? '' : ` Did you mean "${suggestion}"?`}` })
    } else if (entry.kind === 'package' && !installable.has(entry.category)) {
      problems.push({ code: 'not-installable', ids: [id], message: `${entry.name} (${id}) is not added with install:<name>; it is part of every app or a standalone tool.` })
    }
  }

  // 2. Add requirements (sorted breadth-first walk, so discovery order never depends on picks).
  const requiredBy = new Map<string, Set<string>>()
  const planned = new Set(picked.filter((id) => byId.has(id)))
  const queue = [...planned]
  while (queue.length > 0) {
    const id = queue.shift() ?? ''
    for (const need of [...(byId.get(id)?.requires ?? [])].sort(byCodeUnit)) {
      requiredBy.set(need, (requiredBy.get(need) ?? new Set()).add(id))
      if (!byId.has(need)) {
        problems.push({ code: 'unknown-package', ids: [id, need].sort(byCodeUnit), message: `${byId.get(id)?.name ?? id} needs "${need}", which is not in the catalogue.` })
      } else if (!planned.has(need)) {
        planned.add(need)
        queue.push(need)
      }
    }
  }

  // 3. Every planned package is available for this framework.
  for (const id of [...planned].sort(byCodeUnit)) {
    const entry = byId.get(id)
    if (entry === undefined) continue
    const reason = unavailableReason(entry, options)
    if (reason !== undefined) {
      const needers = [...(requiredBy.get(id) ?? [])].sort(byCodeUnit)
      const why = picked.includes(id) || needers.length === 0 ? '' : ` It is needed by ${needers.join(', ')}.`
      problems.push({ code: 'not-available', ids: [id, ...needers].sort(byCodeUnit), message: `${reason}.${why}` })
    }
    if (entry.deprecated !== undefined) {
      warnings.push(`${entry.name} (${id}) is deprecated: ${entry.deprecated.message}${entry.deprecated.replacedBy === undefined ? '' : ` Use "${entry.deprecated.replacedBy}" instead.`}`)
    }
  }

  // 4. Conflicts (either side declaring it is enough) and the one-design rule.
  const ids = [...planned].sort(byCodeUnit)
  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const a = byId.get(ids[i] ?? '')
      const b = byId.get(ids[j] ?? '')
      if (a === undefined || b === undefined) continue
      if (a.conflicts.includes(b.id) || b.conflicts.includes(a.id)) {
        problems.push({ code: 'conflict', ids: [a.id, b.id], message: `${describe(a, picked, requiredBy)} and ${describe(b, picked, requiredBy)} cannot be installed together. Pick one.` })
      }
    }
  }
  const designs = ids.filter((id) => byId.get(id)?.kind === 'design')
  if (designs.length > 1) {
    problems.push({ code: 'two-designs', ids: designs, message: `An app uses one design at a time, but the plan has ${designs.join(' and ')}. Pick one (switch later with node strut design:use <name>).` })
  }

  // 5. Order: requirements first. A cycle cannot be ordered, so it is an error, named in full.
  const requiresOf = (id: string): readonly string[] => byId.get(id)?.requires ?? []
  const order = topologicalOrder(ids, requiresOf)
  if (order === undefined) {
    const cycle = findCycle(ids, requiresOf) ?? ids
    problems.push({ code: 'requires-cycle', ids: [...new Set(cycle)].sort(byCodeUnit), message: `These packages require each other in a circle, so none can be installed first: ${cycle.join(' → ')}.` })
  }

  if (problems.length > 0) throw new ResolveError(problems)

  const steps: PlanStep[] = (order ?? []).flatMap((id) => {
    const entry = byId.get(id)
    const version = entry === undefined ? undefined : compatibleVersion(entry, options.frameworkVersion)
    if (entry === undefined || version === undefined) return []
    return [{
      id,
      package: entry.package,
      version,
      kind: entry.kind,
      reason: picked.includes(id) ? 'picked' : 'required',
      requiredBy: [...(requiredBy.get(id) ?? [])].filter((other) => planned.has(other)).sort(byCodeUnit),
    } satisfies PlanStep]
  })
  const questions = steps.flatMap((step) =>
    (byId.get(step.id)?.followUps ?? []).map((question): PlannedQuestion => ({ key: `${step.id}.${question.id}`, packageId: step.id, question })),
  )
  return { frameworkVersion: options.frameworkVersion, steps, questions, env: mergeEnv(steps, byId), warnings: warnings.sort(byCodeUnit) }
}

/** "Billing (billing)" or "Settings (settings, needed by billing)". */
function describe(entry: CatalogueEntry, picked: readonly string[], requiredBy: ReadonlyMap<string, ReadonlySet<string>>): string {
  const needers = [...(requiredBy.get(entry.id) ?? [])].sort(byCodeUnit)
  return picked.includes(entry.id) || needers.length === 0 ? `${entry.name} (${entry.id})` : `${entry.name} (${entry.id}, needed by ${needers.join(', ')})`
}

/** `.env` keys across the plan; a key shared by two packages is listed once. */
function mergeEnv(steps: readonly PlanStep[], byId: ReadonlyMap<string, CatalogueEntry>): PlannedEnv[] {
  const merged = new Map<string, { description: string; secret: boolean; packages: string[] }>()
  for (const step of steps) {
    for (const env of byId.get(step.id)?.installs.env ?? ([] as EnvKey[])) {
      const current = merged.get(env.key)
      if (current === undefined) merged.set(env.key, { description: env.description, secret: env.secret, packages: [step.id] })
      else {
        current.secret ||= env.secret
        current.packages.push(step.id)
      }
    }
  }
  return [...merged]
    .sort(([a], [b]) => byCodeUnit(a, b))
    .map(([key, value]) => ({ key, description: value.description, secret: value.secret, packages: value.packages.sort(byCodeUnit) }))
}

/** The id within edit distance 2 of `typed`, if exactly one is closest ("did you mean"). */
export function closestId(typed: string, ids: readonly string[]): string | undefined {
  if (typed.length > 40) return undefined
  let best: string | undefined
  let bestDistance = 3
  for (const id of [...ids].sort(byCodeUnit)) {
    const distance = editDistance(typed, id, bestDistance)
    if (distance < bestDistance) {
      best = id
      bestDistance = distance
    }
  }
  return best
}

/** Levenshtein distance, giving up (returning `limit`) once it cannot beat `limit`. */
function editDistance(a: string, b: string, limit: number): number {
  if (Math.abs(a.length - b.length) >= limit) return limit
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i]
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1))
    }
    if (Math.min(...current) >= limit) return limit
    previous = current
  }
  return previous[b.length] ?? limit
}
