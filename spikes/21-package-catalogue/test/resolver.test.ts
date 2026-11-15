import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import type { CatalogueIndex } from '../src/catalogue/index-schema.ts'
import { resolveAnswers } from '../src/resolver/answers.ts'
import { groupByCategory, offered } from '../src/resolver/offer.ts'
import { planInstall, ResolveError, type ResolveProblem } from '../src/resolver/plan.ts'
import { search } from '../src/resolver/search.ts'
import { buildCatalogue } from '../src/catalogue/build.ts'
import { indexOf, pkg, seedIndex, shuffled, snap, testHub } from './helpers.ts'

const design = (id: string) => ({ ...pkg(id, { kind: 'design', category: 'design', installs: { config: ['resources/ui/theme.css'] } }), name: `@strutvane/design-${id}` })

/** A small published catalogue with requirements, a conflict, designs and a core package. */
const index = indexOf([
  pkg('settings', { category: 'operations', popular: true, installs: { env: [{ key: 'SETTINGS_CACHE', description: 'Cache store for settings', secret: false, example: 'database' }] } }),
  pkg('billing', {
    category: 'money',
    popular: true,
    requires: ['settings'],
    conflicts: ['payments'],
    installs: { env: [{ key: 'STRIPE_SECRET', description: 'Stripe secret key', secret: true }] },
    questions: [
      { id: 'provider', type: 'select', label: 'Billing: which provider?', choices: [{ value: 'stripe', label: 'Stripe' }, { value: 'paddle', label: 'Paddle' }], default: 'stripe' },
      { id: 'tax', type: 'confirm', label: 'Billing: calculate tax?', default: false, when: { question: 'provider', equals: 'stripe' } },
    ],
  }),
  pkg('payments', { category: 'money', installs: { env: [{ key: 'STRIPE_SECRET', description: 'Stripe secret key', secret: true }] } }),
  pkg('invoicing', {
    category: 'money',
    requires: ['settings', 'pdf'],
    questions: [{ id: 'prefix', type: 'text', label: 'Invoicing: number prefix', default: 'INV-', maxLength: 12, pattern: { regex: '^[A-Z][A-Z0-9-]{0,11}$', message: 'Use capital letters, like INV-' } }],
  }),
  pkg('pdf', { category: 'data', tags: ['documents'] }),
  pkg('media-library', { category: 'data', displayName: 'Média library', description: 'Images and files attached to records', tags: ['images'] }),
  pkg('channels', {
    category: 'operations',
    questions: [
      { id: 'list', type: 'multiselect', label: 'Channels: which ones?', choices: [{ value: 'sms', label: 'SMS' }, { value: 'slack', label: 'Slack' }, { value: 'push', label: 'Push' }], default: ['slack'], min: 1, max: 2 },
      { id: 'sms-sender', type: 'text', label: 'Channels: SMS sender name', maxLength: 11, pattern: { regex: '^[A-Za-z0-9]{3,11}$', message: 'Use 3 to 11 letters or digits' }, when: { question: 'list', includes: 'sms' } },
    ],
  }),
  pkg('old-exports', { category: 'data', deprecated: { message: 'Superseded.', replacedBy: 'pdf' } }),
  pkg('future', { category: 'data', framework: '^0.3' }),
  { ...pkg('framework', { category: 'core' }), name: '@strutvane/framework' },
  design('crisp'),
  design('vivid'),
])

const problemsOf = (fn: () => unknown): readonly ResolveProblem[] => {
  try {
    fn()
  } catch (error) {
    if (error instanceof ResolveError) return error.problems
    throw error
  }
  return []
}

const fw = { frameworkVersion: '0.2.4' }

describe('offered: filter by framework and published status', () => {
  it('hides incompatible, deprecated, core and design entries by default', () => {
    expect(offered(index, fw).map((e) => e.id)).toEqual(['billing', 'channels', 'invoicing', 'media-library', 'payments', 'pdf', 'settings'])
  })

  it('offers a package only for framework versions its range accepts', () => {
    expect(offered(index, { frameworkVersion: '0.1.3' })).toEqual([])
    expect(offered(index, { frameworkVersion: '0.3.0' }).map((e) => e.id)).toEqual(['future'])
  })

  it('can include deprecated packages and designs on request', () => {
    expect(offered(index, { ...fw, includeDeprecated: true }).map((e) => e.id)).toContain('old-exports')
    expect(offered(index, { ...fw, kinds: ['design'] }).map((e) => e.id)).toEqual([])
    expect(offered(index, { ...fw, kinds: ['design'], pickableOnly: false }).map((e) => e.id)).toEqual(['crisp', 'vivid'])
  })

  it('never offers unpublished packages unless asked (both states)', async () => {
    const unpublished = indexOf([pkg('tags')], false)
    expect(offered(unpublished, fw)).toEqual([])
    expect(offered(unpublished, { ...fw, includeUnpublished: true }).map((e) => e.id)).toEqual(['tags'])
    const seed = await seedIndex()
    expect(offered(seed, { frameworkVersion: '0.2.0' })).toEqual([])
    expect(offered(seed, { frameworkVersion: '0.2.0', includeUnpublished: true }).map((e) => e.id)).toEqual(['auth', 'log-viewer', 'ui'])
  })

  it('picks the newest version that fits, not just the latest release', () => {
    const multi = buildCatalogue(
      [snap({ ...pkg('charts', { framework: '^0.1' }), version: '0.1.0' }, { published: true }), snap({ ...pkg('charts'), version: '0.2.0' }, { published: true })],
      testHub,
    ).index
    expect(planInstall(multi, ['charts'], { frameworkVersion: '0.1.3' }).steps[0]?.version).toBe('0.1.0')
    expect(planInstall(multi, ['charts'], { frameworkVersion: '0.2.0' }).steps[0]?.version).toBe('0.2.0')
  })
})

describe('groupByCategory', () => {
  it('follows the hub category order, popular first, then by name', () => {
    const groups = groupByCategory(index, offered(index, fw))
    expect(groups.map((g) => [g.category.id, g.entries.map((e) => e.id)])).toEqual([
      ['operations', ['settings', 'channels']],
      ['data', ['media-library', 'pdf']],
      ['money', ['billing', 'invoicing', 'payments']],
    ])
  })

  it('shows only popular entries for the short list, and drops empty groups', () => {
    expect(groupByCategory(index, offered(index, fw), { popularOnly: true }).map((g) => [g.category.id, g.entries.map((e) => e.id)])).toEqual([
      ['operations', ['settings']],
      ['money', ['billing']],
    ])
  })

  it('groups the 24 popular seed packages the way question 22 describes', async () => {
    const seed = await seedIndex()
    const groups = groupByCategory(seed, offered(seed, { frameworkVersion: '1.0.0', includeUnpublished: true }), { popularOnly: true })
    expect(groups.map((g) => g.category.name)).toEqual(['Operations', 'Data', 'Back office', 'Integrations', 'Money', 'AI'])
    expect(groups.flatMap((g) => g.entries).length).toBe(22)
  })
})

describe('search', () => {
  const all = offered(index, fw)

  it.each([
    ['MEDIA', ['media-library']],
    ['média', ['media-library']],
    ['MÉDIA LIBRARY', ['media-library']],
    ['documents', ['pdf']],
    ['images records', ['media-library']],
    ['bill', ['billing']],
    ['nothing-like-this', []],
    ['   ', []],
  ])('finds %s', (query, ids) => {
    expect(search(all, query).map((e) => e.id)).toEqual(ids)
  })

  it('ranks an exact id above a description match', () => {
    expect(search(all, 'pdf')[0]?.id).toBe('pdf')
  })

  it('is case- and diacritic-insensitive for any query (property)', () => {
    fc.assert(
      fc.property(fc.constantFrom('media', 'billing', 'settings', 'pdf', 'images'), (word) => {
        const accented = word.replace('e', 'é').replace('i', 'Ï')
        expect(search(all, accented.toUpperCase()).map((e) => e.id)).toEqual(search(all, word).map((e) => e.id))
      }),
    )
  })
})

describe('planInstall', () => {
  it('adds requirements and installs them first', () => {
    const plan = planInstall(index, ['invoicing'], fw)
    expect(plan.steps.map((s) => [s.id, s.reason, s.requiredBy])).toEqual([
      ['pdf', 'required', ['invoicing']],
      ['settings', 'required', ['invoicing']],
      ['invoicing', 'picked', []],
    ])
  })

  it('lists questions in step order with --feature-option keys, and merges .env keys', () => {
    const plan = planInstall(index, ['billing', 'invoicing'], fw)
    expect(plan.questions.map((q) => q.key)).toEqual(['billing.provider', 'billing.tax', 'invoicing.prefix'])
    expect(plan.env).toEqual([
      { key: 'SETTINGS_CACHE', description: 'Cache store for settings', secret: false, packages: ['settings'] },
      { key: 'STRIPE_SECRET', description: 'Stripe secret key', secret: true, packages: ['billing'] },
    ])
  })

  it('is independent of the order and repetition of picks (property)', () => {
    const pickable = ['billing', 'invoicing', 'pdf', 'settings', 'media-library', 'channels', 'crisp']
    fc.assert(
      fc.property(fc.subarray(pickable, { minLength: 1 }), fc.integer(), fc.boolean(), (picks, seed, repeat) => {
        let state = seed
        const random = () => ((state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x80000000)
        const reordered = shuffled(repeat ? [...picks, ...picks] : picks, random)
        expect(planInstall(index, reordered, fw)).toEqual(planInstall(index, [...picks].sort(), fw))
      }),
      { numRuns: 300 },
    )
  })

  it('plans any subset of the seed catalogue the same way in any order (property)', async () => {
    const seed = await seedIndex()
    const options = { frameworkVersion: '1.0.0', includeUnpublished: true }
    // Only packages that can be planned on their own on line 1.0: in the seed, planned add-ons
    // target 1.0 while the core train (ui, auth) only has a 0.2 version yet (a builder warning).
    const ids = offered(seed, options)
      .map((e) => e.id)
      .filter((id) => {
        try {
          planInstall(seed, [id], options)
          return true
        } catch {
          return false
        }
      })
    expect(ids.length).toBeGreaterThan(25)
    fc.assert(
      fc.property(fc.subarray(ids, { minLength: 1, maxLength: 12 }), fc.integer(), (picks, seed2) => {
        let state = seed2
        const random = () => ((state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x80000000)
        expect(JSON.stringify(planInstall(seed, shuffled(picks, random), options))).toBe(JSON.stringify(planInstall(seed, picks, options)))
      }),
      { numRuns: 200 },
    )
  })

  it('refuses a conflict in friendly words, also when the conflict comes from a requirement', () => {
    expect(problemsOf(() => planInstall(index, ['payments', 'billing'], fw))).toEqual([
      { code: 'conflict', ids: ['billing', 'payments'], message: 'Billing (billing) and Payments (payments) cannot be installed together. Pick one.' },
    ])
    const viaRequirement = indexOf([pkg('a', { requires: ['b'] }), pkg('b'), pkg('c', { conflicts: ['b'] })])
    expect(problemsOf(() => planInstall(viaRequirement, ['a', 'c'], fw)).map((p) => p.message)).toEqual([
      'B (b, needed by a) and C (c) cannot be installed together. Pick one.',
    ])
  })

  it('refuses a requires cycle in an index that did not come from the builder', () => {
    // The builder refuses cycles; a hand-edited or stale downloaded index might still have one.
    const cyclic: CatalogueIndex = {
      ...index,
      entries: index.entries.map((e) => (e.id === 'settings' ? { ...e, requires: ['billing'] } : e)),
    }
    expect(problemsOf(() => planInstall(cyclic, ['billing'], fw))).toEqual([
      {
        code: 'requires-cycle',
        ids: ['billing', 'settings'],
        message: 'These packages require each other in a circle, so none can be installed first: billing → settings → billing.',
      },
    ])
    // Order of picks does not change the message.
    expect(problemsOf(() => planInstall(cyclic, ['settings', 'billing'], fw))[0]?.message).toContain('billing → settings → billing')
  })

  it('suggests the closest id for a typo', () => {
    expect(problemsOf(() => planInstall(index, ['biling'], fw))).toEqual([
      { code: 'unknown-package', ids: ['biling'], message: 'There is no package "biling" in the catalogue. Did you mean "billing"?' },
    ])
  })

  it('explains unavailable packages, and who needed them', () => {
    const unpublished = indexOf([pkg('a', { requires: ['b'] }), pkg('b')], false)
    expect(problemsOf(() => planInstall(unpublished, ['a'], fw)).map((p) => p.message)).toEqual([
      'A (a) is not released yet.',
      'B (b) is not released yet. It is needed by a.',
    ])
    expect(planInstall(unpublished, ['a'], { ...fw, includeUnpublished: true }).steps.map((s) => s.id)).toEqual(['b', 'a'])
    expect(problemsOf(() => planInstall(index, ['future'], fw))[0]?.message).toBe('Future (future) does not support framework 0.2.4 yet.')
  })

  it('refuses core packages and two designs, and warns about deprecated ones', () => {
    expect(problemsOf(() => planInstall(index, ['framework'], fw))[0]?.code).toBe('not-installable')
    expect(problemsOf(() => planInstall(index, ['crisp', 'vivid'], fw))[0]).toMatchObject({ code: 'two-designs', ids: ['crisp', 'vivid'] })
    expect(planInstall(index, ['crisp'], fw).steps[0]).toMatchObject({ id: 'crisp', kind: 'design', package: '@strutvane/design-crisp' })
    expect(planInstall(index, ['old-exports'], fw).warnings).toEqual(['Old exports (old-exports) is deprecated: Superseded. Use "pdf" instead.'])
  })

  it('reports every problem at once', () => {
    expect(problemsOf(() => planInstall(index, ['ghost', 'framework', 'billing', 'payments'], fw)).map((p) => p.code)).toEqual([
      'not-installable',
      'unknown-package',
      'conflict',
    ])
  })
})

describe('resolveAnswers', () => {
  const plan = planInstall(index, ['billing', 'channels', 'invoicing'], fw)

  it('fills defaults and skips questions whose condition is not met', () => {
    expect(resolveAnswers(plan)).toEqual({
      answers: { 'billing.provider': 'stripe', 'billing.tax': false, 'channels.list': ['slack'], 'invoicing.prefix': 'INV-' },
      skipped: ['channels.sms-sender'],
      problems: [],
    })
    // Questions follow the plan's step order (channels has no requirements, so it comes first).
    expect(resolveAnswers(plan, { 'billing.provider': 'paddle' }).skipped).toEqual(['channels.sms-sender', 'billing.tax'])
  })

  it('accepts command-line strings, and stores multiselect answers in choice order', () => {
    const result = resolveAnswers(plan, { 'billing.tax': 'yes', 'channels.list': 'slack,sms', 'channels.sms-sender': 'Acme' })
    expect(result.problems).toEqual([])
    expect(result.answers['channels.list']).toEqual(['sms', 'slack'])
    expect(result.answers['billing.tax']).toBe(true)
  })

  it('explains every wrong answer', () => {
    expect(
      resolveAnswers(plan, {
        'billing.provider': 'mollie',
        'channels.list': 'sms,slack,push',
        'invoicing.prefix': 'inv;rm',
        'billing.secret': 'x',
      }).problems,
    ).toEqual([
      'billing.secret is not a question of the packages being installed',
      'channels.list: pick between 1 and 2 choices',
      'billing.provider: must be one of: stripe, paddle',
      'invoicing.prefix: Use capital letters, like INV-',
    ])
    expect(resolveAnswers(plan, { 'channels.list': 'sms' }).problems).toEqual(['channels.sms-sender: needs an answer'])
  })

  it('checks text answers in linear time, whatever is typed (fuzz)', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 300 }), (typed) => {
        const result = resolveAnswers(plan, { 'invoicing.prefix': typed })
        const ok = /^[A-Z][A-Z0-9-]{0,11}$/u.test(typed)
        expect(result.problems.length === 0).toBe(ok)
      }),
      { numRuns: 1_000 },
    )
  })
})

describe('lifecycle in the resolver', () => {
  it('never offers a shelved package, and offers a preview only on request', () => {
    const base = indexOf([pkg('tags'), pkg('glass')])
    const lifecycle: CatalogueIndex = {
      ...base,
      entries: base.entries.map((e) => ({ ...e, status: e.id === 'glass' ? ('shelved' as const) : ('preview' as const) })),
    }
    expect(offered(lifecycle, fw)).toEqual([])
    expect(offered(lifecycle, { ...fw, includePreview: true }).map((e) => e.id)).toEqual(['tags'])
    expect(problemsOf(() => planInstall(lifecycle, ['glass'], { ...fw, includePreview: true }))[0]?.message).toBe('Glass (glass) is shelved.')
    expect(problemsOf(() => planInstall(lifecycle, ['tags'], fw))[0]?.message).toBe('Tags (tags) is only a preview so far (install it with --preview).')
  })
})
