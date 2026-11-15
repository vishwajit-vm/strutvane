/**
 * Question 22 ("extra features"): the catalogue index (untrusted input), compatibility filtering,
 * the grouped popular list, type-to-search, and declarative follow-up questions.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseCommandLine } from '../src/args.ts'
import {
  type Catalogue,
  CatalogueError,
  installerCatalogue,
  offeredEntries,
  parseCatalogue,
  popularGroups,
} from '../src/catalogue.ts'
import { OptionsError, resolveOptions } from '../src/options.ts'
import { askMissing } from '../src/questions.ts'
import { parseVersion, satisfiesRange } from '../src/semver-range.ts'
import { scriptedPrompter } from './helpers/fakes.ts'

const fixture: unknown = JSON.parse(readFileSync(new URL('../src/data/catalogue.json', import.meta.url), 'utf8'))

/** A valid entry to vary in tests. */
const entry = (overrides: Record<string, unknown> = {}) => ({
  id: 'tags', name: 'Tags', description: 'Tag any record', category: 'content', popular: false, published: true,
  frameworkRange: '^0.1', package: '@strutvane/tags', ...overrides,
})
const catalogueOf = (entries: unknown[]): Catalogue =>
  parseCatalogue({ version: 1, categories: [{ id: 'content', name: 'Content' }, { id: 'money', name: 'Money' }], entries }).catalogue

describe('semver ranges (fail closed)', () => {
  it.each([
    ['0.1.0', '^0.1', true], ['0.1.9', '^0.1', true], ['0.2.0', '^0.1', false], ['0.0.9', '^0.0.9', true], ['0.0.10', '^0.0.9', false],
    ['1.4.0', '^1.2', true], ['2.0.0', '^1.2', false], ['1.2.9', '~1.2', true], ['1.3.0', '~1.2', false], ['0.1.0', '>=0.2.0', false],
    ['0.2.5', '>=0.2.0 <0.3.0', true], ['0.3.0', '>=0.2.0 <0.3.0', false], ['1.0.0', '^0.1 || ^1.0', true], ['0.1.0', '*', true],
    ['0.1.0', '0.1.0', true], ['0.1.0', '0.1', false], ['0.1.0', 'banana', false], ['0.1.0', '', false], ['0.1.0-rc.1', '^0.1', false],
  ] as const)('%s in %s → %s', (version, range, expected) => {
    expect(satisfiesRange(version, range)).toBe(expected)
  })

  it('never throws on random input (fuzz, 2000 cases)', () => {
    let seed = 42
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return seed / 2147483648
    }
    const alphabet = '0123456789.^~<>=|* -xabc'
    for (let i = 0; i < 2000; i++) {
      const range = Array.from({ length: Math.floor(random() * 20) }, () => alphabet[Math.floor(random() * alphabet.length)]).join('')
      expect(typeof satisfiesRange('0.1.0', range)).toBe('boolean')
    }
    expect(parseVersion('01.2.3')).toBeUndefined()
  })
})

describe('the catalogue index', () => {
  it('the fixture has about 30 valid entries and nothing is skipped', () => {
    const { catalogue, skipped } = parseCatalogue(fixture)
    expect(skipped).toEqual([])
    expect(catalogue.entries.length).toBeGreaterThanOrEqual(30)
  })

  it('offers only published entries compatible with the framework being installed', () => {
    const offered = offeredEntries(installerCatalogue()).map((e) => e.id)
    expect(offered).not.toContain('workflows') // unpublished
    expect(offered).not.toContain('legacy-exports') // ^0.0.9
    expect(offered).not.toContain('spreadsheets') // >=0.2.0
    expect(offered).toContain('billing')
    expect(offeredEntries(installerCatalogue(), '0.2.0').map((e) => e.id)).toContain('spreadsheets')
  })

  it('groups the popular list by category, in the blueprint order', () => {
    const groups = popularGroups(installerCatalogue()).map((g) => [g.category.name, g.entries.map((e) => e.id)])
    expect(groups).toEqual([
      ['Operations', ['log-viewer', 'queue-dashboard', 'inspector', 'health']],
      ['Data', ['charts', 'search', 'import-export', 'api-explorer']],
      ['Back office', ['activity-log', 'settings', 'media-library', 'pdf', 'privacy', 'backups']],
      ['Integrations', ['feature-flags', 'webhooks', 'graphql', 'realtime', 'notification-channels']],
      ['Money', ['billing', 'invoicing']],
      ['AI', ['ai-sdk', 'mcp-server']],
    ])
  })

  it('skips bad entries instead of trusting them (path tricks, foreign scopes, secrets, duplicates)', () => {
    const { catalogue, skipped } = parseCatalogue({
      version: 1,
      categories: [{ id: 'content', name: 'Content' }],
      entries: [
        entry(),
        entry({ id: 'evil', package: '@strutvane/../../etc' }),
        entry({ id: 'foreign', package: '@someone/tags' }),
        entry({ id: 'unknown-cat', category: 'nope' }),
        entry({ id: 'tags' }),
        entry({ id: 'stripe-keys', followUps: [{ id: 'key', label: 'Your Stripe API key?', default: 'a', choices: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] }] }),
        entry({ id: 'bad-default', followUps: [{ id: 'mode', label: 'Mode?', default: 'zzz', choices: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] }] }),
        entry({ id: 'newline', name: 'Line\nbreak' }),
        'not an object',
      ],
    })
    expect(catalogue.entries.map((e) => e.id)).toEqual(['tags'])
    expect(skipped.join('\n')).toMatch(/bad package name[\s\S]*bad package name[\s\S]*unknown category[\s\S]*duplicate id[\s\S]*asks for a secret[\s\S]*default is not a choice[\s\S]*bad name[\s\S]*not an object/)
  })

  it('refuses an index with an unknown version or shape', () => {
    expect(() => parseCatalogue({ version: 2, categories: [], entries: [] })).toThrow(CatalogueError)
    expect(() => parseCatalogue({ version: 1 })).toThrow(/no categories or entries/)
    expect(() => parseCatalogue(null)).toThrow(CatalogueError)
  })
})

describe('question 22: picking features', () => {
  const custom = { name: 'my-app', mode: 'custom' } as const

  it('shows only the popular, offered entries in groups; searching offers the rest; follow-ups come after', async () => {
    const { prompter, asked } = scriptedPrompter({ features: ['billing', 'log-viewer'], featuresSearch: true, featuresMore: ['tags'], 'billing.provider': 'paddle' })
    // Only question 22 is asked: everything else is answered already.
    const context = { cwd: '/code', targetProblem: () => undefined }
    const answers = await askMissing({ ...custom, ...everythingElse }, prompter, context)
    expect(asked).toEqual(['features', 'featuresSearch', 'featuresMore', 'billing.provider'])
    expect(answers.features).toEqual(['log-viewer', 'billing', 'tags'])
    expect(answers.featureOptions).toEqual({ 'billing.provider': 'paddle' })
    const options = resolveOptions(answers, '/code')
    expect(options.features).toEqual(['log-viewer', 'billing', 'tags']) // catalogue order
  })

  it('cannot pick an unpublished or incompatible package, not even by flag', () => {
    expect(() => resolveOptions({ name: 'a', features: ['workflows'] }, '/c')).toThrow(OptionsError)
    expect(() => resolveOptions({ name: 'a', features: ['spreadsheets'] }, '/c')).toThrow(/not an available package/)
    expect(() => resolveOptions({ name: 'a', features: ['nope'] }, '/c')).toThrow(/not an available package/)
  })

  it('the picker never lists hidden packages', async () => {
    const offeredIds: string[] = []
    const { prompter } = scriptedPrompter({ features: [], featuresSearch: true, featuresMore: [] })
    const spy = {
      ...prompter,
      groupMultiselect: async <T extends string>(q: { id: string; message: string; groups: ReadonlyMap<string, readonly { value: T; label: string }[]>; initialValues: readonly T[] }) => {
        for (const choices of q.groups.values()) offeredIds.push(...choices.map((c) => c.value))
        return prompter.groupMultiselect(q)
      },
      search: async <T extends string>(q: { id: string; message: string; placeholder: string; options: readonly { value: T; label: string }[]; initialValues: readonly T[] }) => {
        offeredIds.push(...q.options.map((c) => c.value))
        return prompter.search(q)
      },
    }
    await askMissing({ ...custom, ...everythingElse }, spy, { cwd: '/code', targetProblem: () => undefined })
    expect(offeredIds).not.toContain('workflows')
    expect(offeredIds).not.toContain('legacy-exports')
    expect(offeredIds).not.toContain('spreadsheets')
    expect(new Set(offeredIds).size).toBe(offeredEntries(installerCatalogue()).length)
  })

  it('follow-ups by flag; their defaults apply when not given; wrong values are refused', () => {
    const answers = parseCommandLine(['a', '--features', 'billing,search', '--feature-option', 'billing.provider=paddle']).answers
    expect(resolveOptions(answers, '/c').featureOptions).toEqual({ 'billing.provider': 'paddle', 'search.engine': 'database' })
    expect(() => resolveOptions({ name: 'a', features: ['billing'], featureOptions: { 'billing.provider': 'bitcoin' } }, '/c')).toThrow(/is not a choice. Use one of: stripe, paddle/)
    expect(() => resolveOptions({ name: 'a', features: ['tags'], featureOptions: { 'billing.provider': 'stripe' } }, '/c')).toThrow(/belongs to no picked feature/)
  })

  it('a catalogue passed in the context is the one used (a new package appears without code changes)', async () => {
    const catalogue = catalogueOf([entry({ id: 'kanban', name: 'Kanban', category: 'money', popular: true, package: '@strutvane/kanban' })])
    const { prompter } = scriptedPrompter({ features: ['kanban'], featuresSearch: false })
    const answers = await askMissing({ ...custom, ...everythingElse }, prompter, { cwd: '/code', targetProblem: () => undefined, catalogue })
    expect(answers.features).toEqual(['kanban'])
    expect(resolveOptions(answers, '/code', catalogue).features).toEqual(['kanban'])
  })
})

// Regression (class: terminal escape injection from untrusted catalogue text). Names,
// descriptions and labels are printed in the question-22 picker; the index comes from the network,
// and only CR/LF/TAB/NUL were refused, so an entry could clear the screen, fake a prompt, set the
// window title, write the clipboard (OSC 52) or reverse text with bidi overrides.
describe('catalogue text that would control the terminal', () => {
  const entry = (patch: Record<string, unknown>) => ({
    id: 'evil', name: 'Evil', description: 'Looks harmless', category: 'operations', popular: true, published: true,
    frameworkRange: '^0.1', package: '@strutvane/evil', ...patch,
  })
  const parse = (patch: Record<string, unknown>) =>
    parseCatalogue({ version: 1, categories: [{ id: 'operations', name: 'Operations' }], entries: [entry(patch)] })

  for (const [label, text] of [
    ['ESC (clear screen)', 'Evil\u001b[2J'],
    ['OSC 52 clipboard write', 'Evil\u001b]52;c;cm0gLXJmIH4=\u0007'],
    ['BEL', 'Evil\u0007'],
    ['C1 CSI', 'Evil\u009b2J'],
    ['right-to-left override', 'Evil\u202egnp.exe'],
    ['zero-width space', 'Ev\u200bil'],
  ] as const) {
    it(`skips an entry whose name contains ${label}`, () => {
      const { catalogue, skipped } = parse({ name: text })
      expect(catalogue.entries).toEqual([])
      expect(skipped.join(' ')).toMatch(/bad name/)
    })
  }

  it('checks descriptions, category names and follow-up labels the same way', () => {
    expect(parse({ description: 'fine\u001b[31mred' }).catalogue.entries).toEqual([])
    expect(parse({ followUps: [{ id: 'mode', label: 'Pick\u001b[1A', default: 'a', choices: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] }] }).catalogue.entries).toEqual([])
    expect(parse({ followUps: [{ id: 'mode', label: 'Pick', default: 'a', choices: [{ value: 'a', label: 'A\u202e' }, { value: 'b', label: 'B' }] }] }).catalogue.entries).toEqual([])
    expect(() => parseCatalogue({ version: 1, categories: [{ id: 'ops', name: 'Ops\u001b[2J' }], entries: [] })).toThrow(/malformed category/)
    // Ordinary non-ASCII text stays allowed.
    expect(parse({ name: 'Rechnungen für Kunden', description: 'Factures et reçus, 請求書' }).catalogue.entries).toHaveLength(1)
  })
})

/** Every Custom question except 22, answered, so only the features flow is asked. */
const everythingElse = {
  stack: 'full', design: 'crisp', ui: 'admin', auth: 'email', security: [], social: [], apiAccess: 'tokens', roles: 'basic', teams: false,
  database: 'sqlite', docker: false, adminEmail: 'admin@my-app.test', adminPasswordMode: 'generate', sampleData: false, cache: 'database',
  storage: 'local', mailer: 'later', locale: 'en', timezone: 'UTC', currency: 'USD', testing: 'none', agents: false, git: false,
  securityProfile: 'standard', activityLog: false, ai: false, mcpServer: false, uiLanguages: ['en'], appearance: 'system', pwa: false,
  liveUpdates: false, monitoring: 'none', deploy: 'later', editor: false, devContainer: false,
} as const
