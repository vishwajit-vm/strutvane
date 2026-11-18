/**
 * The hub's catalogue tool. Public API for hub CI and for anything that wants to reuse the rules
 * (package CI can call `checkBlock` or `validatePackageJson`).
 *
 * The reader side (the resolver used by the installer, `node strut add` and the docs site) stays
 * in spike 21 until it moves into `@strutvane/framework` (see NEXT.md).
 *
 * @module
 */
// Manifest: the `strutvane` block in each package.json (format 1).
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
// The index (catalogue.json, format 2) and the pure builder.
export { parseCatalogueIndex, catalogueIndexSchema, CatalogueIndexError, CATALOGUE_VERSION, STATUSES } from './catalogue/index-schema.ts'
export type { CatalogueIndex, CatalogueEntry, CatalogueCategory, ParsedIndex, PackageStatus, HistoryItem } from './catalogue/index-schema.ts'
export { buildCatalogue, serializeCatalogue, formatBuildProblems, CatalogueBuildError } from './catalogue/build.ts'
export type { BuildProblem, BuildResult } from './catalogue/build.ts'
export { conformanceVerdict, REQUIRED_KITS } from './catalogue/conformance.ts'
// The hub source and how it merges with npm.
export { parseSource, sourceSchema, SOURCE_STATUSES, SOURCE_KINDS, LISTED_STATUSES } from './source/schema.ts'
export type { Source, SourceEntry, SourceStatus, SourceKind, SourceProblem } from './source/schema.ts'
export { buildFromSource, mergeSource, RUNTIME_KEYS } from './source/merge.ts'
// Live data and its recorded snapshots.
export { readNpm, reducePackument, fetchPackumentOverHttp } from './live/npm.ts'
export type { NpmSnapshot, NpmPackage, NpmVersion, FetchPackument } from './live/npm.ts'
export { readRepos, listReposWithGh } from './live/repos.ts'
export type { RepoSnapshot, Repo, ListRepos } from './live/repos.ts'
// Checks.
export { checkBlock, findSecretValues } from './checks/manifest-block.ts'
export type { BlockContext } from './checks/manifest-block.ts'
export { checkNpm, currentFramework } from './checks/npm-state.ts'
export { checkRepos, isTrackedRepo } from './checks/repos.ts'
export { checkDocs, readDocsPackages, matchDocsEntry } from './checks/docs.ts'
export type { DocsPackages, DocsEntry } from './checks/docs.ts'
export { formatFindings, sortFindings } from './checks/findings.ts'
export type { Finding, Severity, CheckName } from './checks/findings.ts'
