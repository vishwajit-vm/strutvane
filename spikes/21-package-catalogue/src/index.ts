/**
 * Spike 21: the package catalogue. Public API, shared by hub CI (builder), the installer,
 * `node strut add` and the docs site (resolver).
 *
 * @module
 */
// Manifest: the `strutvane` block in each package.json.
export { manifestSchema, questionSchema, installsSchema, DESIGN_CATEGORY } from './manifest/schema.ts'
export type { Manifest, ManifestInput, Question, QuestionType, Choice, Installs, EnvKey, PackageKind } from './manifest/schema.ts'
export { validatePackageJson } from './manifest/validate.ts'
export type { PackageValidation, ValidPackage, InvalidPackage, ManifestProblem } from './manifest/validate.ts'
export { selectQuestion, multiselectQuestion, confirmQuestion, textQuestion, defineManifest } from './manifest/define.ts'
export type { AnswerOf, AnswerValue } from './manifest/define.ts'
export { parsePattern, matchesPattern, PATTERN_LIMITS } from './manifest/safe-pattern.ts'
export type { SafePattern, PatternResult } from './manifest/safe-pattern.ts'
export { findSecretWord } from './manifest/secret-words.ts'
export { MANIFEST_VERSION, LIMITS, packageOrigin } from './manifest/rules.ts'
export type { Origin } from './manifest/rules.ts'
// Catalogue index and builder.
export { parseCatalogueIndex, catalogueIndexSchema, CatalogueIndexError, CATALOGUE_VERSION } from './catalogue/index-schema.ts'
export type { CatalogueIndex, CatalogueEntry, CatalogueCategory, ParsedIndex } from './catalogue/index-schema.ts'
export { buildCatalogue, serializeCatalogue, formatBuildProblems, CatalogueBuildError } from './catalogue/build.ts'
export type { BuildProblem, BuildResult } from './catalogue/build.ts'
export { readLocalPackages, readNpmPackages, hubConfigSchema } from './catalogue/sources.ts'
export type { VersionSnapshot, HubConfig, FetchJson } from './catalogue/sources.ts'
export { conformanceVerdict, REQUIRED_KITS } from './catalogue/conformance.ts'
// Resolver.
export { offered, compatibleVersion, unavailableReason, groupByCategory, compareForDisplay } from './resolver/offer.ts'
export type { OfferOptions, CategoryGroup } from './resolver/offer.ts'
export { search } from './resolver/search.ts'
export { planInstall, ResolveError, closestId } from './resolver/plan.ts'
export type { InstallPlan, PlanStep, PlannedQuestion, PlannedEnv, ResolveProblem, ResolveProblemCode, PlanOptions } from './resolver/plan.ts'
export { resolveAnswers, checkAnswer } from './resolver/answers.ts'
export type { ResolvedAnswers } from './resolver/answers.ts'
// Lifecycle, format 1 bridge, JSON Schema.
export { STATUSES, statusProblem } from './catalogue/index-schema.ts'
export type { PackageStatus, HistoryItem } from './catalogue/index-schema.ts'
export { toV1, compareWithV1 } from './catalogue/v1-compat.ts'
export type { V1Catalogue, V1Entry } from './catalogue/v1-compat.ts'
export { generateSchemas } from './json-schema.ts'
