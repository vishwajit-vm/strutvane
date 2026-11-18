/**
 * Type-level tests: they run under `tsc --noEmit` (part of `npm test`). Each `@ts-expect-error`
 * proves a misuse does not compile; if the misuse ever compiled, tsc would fail on the unused
 * directive.
 */
import { describe, expectTypeOf, it } from 'vitest'
import {
  type AnswerOf,
  type CatalogueEntry,
  type Manifest,
  type PackageKind,
  type PackageStatus,
  type Question,
  type QuestionType,
  type SourceKind,
  type SourceStatus,
  type Finding,
  confirmQuestion,
  defineManifest,
  multiselectQuestion,
  selectQuestion,
  textQuestion,
} from '../src/index.ts'

const two = [
  { value: 'stripe', label: 'Stripe' },
  { value: 'paddle', label: 'Paddle' },
] as const

describe('public types', () => {
  it('question types are exactly four, with no password type', () => {
    expectTypeOf<QuestionType>().toEqualTypeOf<'select' | 'multiselect' | 'confirm' | 'text'>()
    // @ts-expect-error there is no secret prompt
    const password: QuestionType = 'password'
    void password
  })

  it('select defaults must be one of the choices', () => {
    selectQuestion({ id: 'provider', label: 'Provider?', choices: two, default: 'stripe' })
    // @ts-expect-error "mollie" is not a choice
    selectQuestion({ id: 'provider', label: 'Provider?', choices: two, default: 'mollie' })
    // @ts-expect-error a choice between fewer than two options is not a question
    selectQuestion({ id: 'provider', label: 'Provider?', choices: [{ value: 'stripe', label: 'Stripe' }], default: 'stripe' })
  })

  it('multiselect defaults must be choices; confirm defaults are booleans', () => {
    multiselectQuestion({ id: 'm', label: 'Pick', choices: two, default: ['stripe'] })
    // @ts-expect-error "mollie" is not a choice
    multiselectQuestion({ id: 'm', label: 'Pick', choices: two, default: ['mollie'] })
    confirmQuestion({ id: 'c', label: 'Sure?', default: true })
    // @ts-expect-error confirm answers are booleans
    confirmQuestion({ id: 'c', label: 'Sure?', default: 'yes' })
  })

  it('text questions need a pattern and a length limit', () => {
    textQuestion({ id: 't', label: 'Prefix', maxLength: 10, pattern: { regex: '^[A-Z]+$', message: 'Capitals' } })
    // @ts-expect-error no pattern: free text is never accepted unchecked
    textQuestion({ id: 't', label: 'Prefix', maxLength: 10 })
    // @ts-expect-error no masked/secret option exists
    textQuestion({ id: 't', label: 'Prefix', maxLength: 10, pattern: { regex: '^a$', message: 'a' }, mask: true })
  })

  it('answer types follow the question type', () => {
    expectTypeOf<AnswerOf<Extract<Question, { type: 'select' }>>>().toEqualTypeOf<string>()
    expectTypeOf<AnswerOf<Extract<Question, { type: 'multiselect' }>>>().toEqualTypeOf<readonly string[]>()
    expectTypeOf<AnswerOf<Extract<Question, { type: 'confirm' }>>>().toEqualTypeOf<boolean>()
    expectTypeOf<AnswerOf<Extract<Question, { type: 'text' }>>>().toEqualTypeOf<string>()
  })

  it('manifests: defaults filled in the output type; kind and fields are closed', () => {
    expectTypeOf<Manifest['questions']>().toEqualTypeOf<Question[]>()
    expectTypeOf<Manifest['popular']>().toEqualTypeOf<boolean>()
    expectTypeOf<PackageKind>().toEqualTypeOf<'package' | 'design'>()
    const base = { id: 'tags', displayName: 'Tags', description: 'Tags', category: 'content', docs: 'https://x.dev/', framework: '^0.2' } as const
    defineManifest({ ...base, manifestVersion: 1, kind: 'package' })
    // @ts-expect-error manifestVersion is the literal 1
    defineManifest({ ...base, manifestVersion: 2, kind: 'package' })
    // @ts-expect-error unknown kind
    defineManifest({ ...base, manifestVersion: 1, kind: 'plugin' })
    // @ts-expect-error unknown field: code-like fields cannot be typed in
    defineManifest({ manifestVersion: 1, kind: 'package', id: 'tags', displayName: 'Tags', description: 'Tags', category: 'content', docs: 'https://x.dev/', framework: '^0.2', postinstall: 'x' })
  })

  it('catalogue entries and source statuses are closed unions', () => {
    expectTypeOf<PackageStatus>().toEqualTypeOf<'available' | 'preview' | 'in-development' | 'planned' | 'shelved'>()
    expectTypeOf<CatalogueEntry['origin']>().toEqualTypeOf<'first-party' | 'community'>()
    expectTypeOf<SourceStatus>().toEqualTypeOf<'planned' | 'in-development' | 'released' | 'shelved' | 'retired'>()
    expectTypeOf<SourceKind>().toEqualTypeOf<'package' | 'design' | 'feature' | 'repo'>()
    expectTypeOf<Finding['severity']>().toEqualTypeOf<'error' | 'warning'>()
    const mutate = (finding: Finding): void => {
      // @ts-expect-error findings are read-only data
      finding.message = ''
    }
    void mutate
  })
})
