/**
 * Conformance results: the file that earns a package its "verified" badge (blueprint §3.3 items
 * 4 and 7).
 *
 * Who writes it: the hub's nightly job installs every package against the framework and runs the
 * conformance kits, then writes one results file per package version. Because the hub produces
 * the file, a package cannot simply claim "passed" in its own tarball. (Signing results with npm
 * provenance / GitHub OIDC attestations, so package CI could produce them too, is future work.)
 *
 * The badge fails closed: a missing, malformed, mismatched or partial results file means "not
 * verified", never an error that stops the build.
 *
 * @module
 */
import { z } from 'zod'
import { VERSION } from '../manifest/rules.ts'
import { satisfiesRange } from '../manifest/semver-range.ts'
import type { PackageKind } from '../manifest/schema.ts'

/** The kits a package must pass, by kind. Designs also pass `designConformance()` (blueprint §5.1). */
export const REQUIRED_KITS: Readonly<Record<PackageKind, readonly string[]>> = {
  package: ['installer-protocol', 'security', 'typecheck'],
  design: ['installer-protocol', 'security', 'typecheck', 'design'],
}

/** One results file. */
export const conformanceSchema = z.strictObject({
  conformanceVersion: z.literal(1),
  package: z.string().max(60),
  version: z.string().regex(VERSION),
  /** The exact framework version the kits ran against. */
  framework: z.string().regex(VERSION),
  // Partial: a package (not a design) has no "design" kit result.
  kits: z.partialRecord(z.enum(['installer-protocol', 'security', 'typecheck', 'design']), z.enum(['passed', 'failed', 'skipped'])),
})

export type ConformanceResults = z.output<typeof conformanceSchema>

/** The verdict for one package version. */
export interface ConformanceVerdict {
  readonly verified: boolean
  /** Why not, in plain words (empty when verified). */
  readonly reason: string
}

/**
 * Is this package version verified?
 *
 * @example
 * conformanceVerdict(results, { name: '@strutvane/charts', version: '0.2.0', kind: 'package', framework: '^0.2' })
 * // { verified: true, reason: '' }
 */
export function conformanceVerdict(
  raw: unknown,
  expected: { readonly name: string; readonly version: string; readonly kind: PackageKind; readonly framework: string },
): ConformanceVerdict {
  if (raw === undefined) return { verified: false, reason: 'no conformance results yet' }
  const parsed = conformanceSchema.safeParse(raw)
  if (!parsed.success) return { verified: false, reason: 'the conformance results file is malformed' }
  const results = parsed.data
  if (results.package !== expected.name || results.version !== expected.version) {
    return { verified: false, reason: `the conformance results are for ${results.package}@${results.version}, not ${expected.name}@${expected.version}` }
  }
  if (!satisfiesRange(results.framework, expected.framework)) {
    return { verified: false, reason: `the kits ran against framework ${results.framework}, outside the package's range ${expected.framework}` }
  }
  const missing = REQUIRED_KITS[expected.kind].filter((kit) => results.kits[kit as keyof typeof results.kits] !== 'passed')
  if (missing.length > 0) return { verified: false, reason: `not passed: ${missing.join(', ')}` }
  return { verified: true, reason: '' }
}
