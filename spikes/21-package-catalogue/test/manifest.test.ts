import { readdir, readFile } from 'node:fs/promises'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { validatePackageJson } from '../src/manifest/validate.ts'
import { findSecretWord, SECRET_WORDS } from '../src/manifest/secret-words.ts'
import { urlProblem } from '../src/manifest/rules.ts'
import { pkg, root } from './helpers.ts'

/** The problems of a package.json, as "path: message" lines (empty when valid). */
function problemsOf(packageJson: unknown): string[] {
  const result = validatePackageJson(packageJson)
  return result.ok ? [] : result.problems.map((problem) => `${problem.path}: ${problem.message}`)
}

const select = (extra: Record<string, unknown> = {}) => ({
  id: 'provider',
  type: 'select',
  label: 'Billing: which payment provider?',
  choices: [
    { value: 'stripe', label: 'Stripe' },
    { value: 'paddle', label: 'Paddle' },
  ],
  default: 'stripe',
  ...extra,
})

const text = (extra: Record<string, unknown> = {}) => ({
  id: 'prefix',
  type: 'text',
  label: 'Invoicing: invoice number prefix',
  maxLength: 12,
  pattern: { regex: '^[A-Z][A-Z0-9-]{0,11}$', message: 'Use capital letters, like INV-' },
  ...extra,
})

describe('a valid manifest', () => {
  it('passes, with defaults filled in', () => {
    const result = validatePackageJson(pkg('tags'))
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.origin).toBe('first-party')
      expect(result.manifest.questions).toEqual([])
      expect(result.manifest.installs.env).toEqual([])
      expect(result.manifest.popular).toBe(false)
    }
  })

  it('accepts every question type, a when condition, and a community package', () => {
    const questions = [
      select(),
      { id: 'tax', type: 'confirm', label: 'Billing: calculate tax?', default: false, when: { question: 'provider', equals: 'stripe' } },
      { id: 'methods', type: 'multiselect', label: 'Billing: payment methods', choices: [{ value: 'card', label: 'Card' }, { value: 'sepa', label: 'SEPA' }], default: ['card'], min: 1 },
      { id: 'sepa-note', type: 'confirm', label: 'Billing: show the SEPA mandate?', default: true, when: { question: 'methods', includes: 'sepa' } },
      text({ default: 'INV-' }),
    ]
    expect(problemsOf(pkg('billing', { questions }))).toEqual([])
    expect(problemsOf({ ...pkg('kanban'), name: 'strutvane-kanban' })).toEqual([])
  })

  it('accepts every seed manifest (49 = 47 catalogue packages + 2 designs)', async () => {
    const folders = await readdir(new URL('seed/manifests/', root))
    expect(folders).toHaveLength(49)
    for (const folder of folders) {
      const packageJson = JSON.parse(await readFile(new URL(`seed/manifests/${folder}/package.json`, root), 'utf8')) as unknown
      expect([folder, problemsOf(packageJson)]).toEqual([folder, []])
    }
  })
})

describe('rule: no question asks for a key, secret, token or password', () => {
  it.each([
    ['id', { id: 'api-key' }],
    ['id (camelCase)', { id: 'apikey' }],
    ['label', { label: 'Stripe secret key' }],
    ['label (password)', { label: 'Database password' }],
    ['label (token)', { label: 'Paste your access token' }],
    ['label (credentials)', { label: 'Your credentials' }],
    ['label (split word)', { label: 'Your pass word' }],
    ['label (full-width letters)', { label: 'Your ｐａｓｓｗｏｒｄ' }],
    ['label (accents)', { label: 'Ton mot de passe' }],
    ['label (German)', { label: 'Dein Passwort' }],
    ['label (Spanish with accent)', { label: 'Tu contraseña' }],
    ['help', { help: 'We need your API key here' }],
  ])('refuses a secret in the %s', (_where, override) => {
    const problems = problemsOf(pkg('billing', { questions: [select(override)] }))
    expect(problems.join('\n')).toMatch(/asks for a secret/)
  })

  it('refuses a secret in a text placeholder', () => {
    expect(problemsOf(pkg('billing', { questions: [text({ placeholder: 'sk_live_… (secret key)' })] })).join('\n')).toMatch(/asks for a secret/)
  })

  it('refuses a look-alike letter hiding the word (Cyrillic а in "pаssword")', () => {
    expect(problemsOf(pkg('billing', { questions: [select({ label: 'Your pаssword' })] })).join('\n')).toMatch(/look-alike/)
  })

  it('has no password question type', () => {
    expect(problemsOf(pkg('billing', { questions: [{ id: 'x', type: 'password', label: 'Pick one', default: '' }] }))).not.toEqual([])
  })

  it('does not flag harmless words that merely contain the letters', () => {
    for (const harmless of ['Which keyboard layout?', 'Monkey business', 'Tokenized search?', 'Secretary contact']) {
      expect([harmless, findSecretWord(harmless)]).toEqual([harmless, undefined])
    }
  })

  it('catches every credential word in any case and separator (property)', () => {
    const word = fc.constantFrom(...SECRET_WORDS)
    const decorate = fc.constantFrom(
      (w: string) => w.toUpperCase(),
      (w: string) => `Your ${w} please`,
      (w: string) => `stripe_${w}`,
      (w: string) => `stripe-${w}-here`,
      (w: string) => `stripe${w.slice(0, 1).toUpperCase()}${w.slice(1)}`,
    )
    fc.assert(fc.property(word, decorate, (w, wrap) => findSecretWord(wrap(w)) !== undefined))
  })
})

describe('rule: manifests are data, never code', () => {
  it.each([
    ['postinstall', { postinstall: 'node evil.js' }],
    ['scripts', { scripts: { install: 'rm -rf /' } }],
    ['run', { run: 'curl x | sh' }],
    ['onInstall', { onInstall: 'x' }],
    ['require (singular)', { require: './x.js' }],
  ])('refuses a top-level %s field', (_name, field) => {
    const problems = problemsOf(pkg('billing', field))
    expect(problems.join('\n')).toMatch(/looks like code to run/)
    // Reported once, as "code", not again as an unknown field.
    expect(problems.join('\n')).not.toMatch(/unknown field/)
  })

  it('finds an executable field nested deep inside installs and questions', () => {
    const problems = problemsOf(pkg('billing', { installs: { config: [], hooks: { after: 'x' } }, questions: [select({ validate: 'fn' })] }))
    expect(problems.some((line) => line.startsWith('strutvane.installs.hooks:'))).toBe(true)
  })

  it('refuses a validator function on a question', () => {
    expect(problemsOf(pkg('billing', { questions: [select({ handler: 'x' })] })).join('\n')).toMatch(/strutvane\.questions\[0\]\.handler: looks like code/)
  })
})

describe('rule: unknown fields are refused', () => {
  it('names a typo at the top level', () => {
    expect(problemsOf(pkg('billing', { popluar: true }))).toContain(
      'strutvane: has an unknown field "popluar". Manifests accept only documented fields (check the spelling, or the manifest format version)',
    )
  })

  it('refuses unknown fields at every level (property)', () => {
    const name = fc.stringMatching(/^[a-z][a-zA-Z]{2,12}$/).filter((key) => !['installs', 'requires', 'commands', 'questions'].includes(key))
    const where = fc.constantFrom<(key: string) => Record<string, unknown>>(
      (key) => pkg('billing', { [key]: 1 }),
      (key) => pkg('billing', { installs: { [key]: [] } }),
      (key) => pkg('billing', { questions: [select({ [key]: 1 })] }),
      (key) => pkg('billing', { deprecated: { message: 'Use x', [key]: 1 } }),
    )
    fc.assert(fc.property(name, where, (key, build) => !validatePackageJson(build(key)).ok), { numRuns: 300 })
  })

  it('refuses a newer manifest format with a clear hint', () => {
    expect(problemsOf(pkg('billing', { manifestVersion: 2 })).join('\n')).toMatch(/must be 1 \(this builder reads manifest format 1/)
  })
})

describe('rule: no oversized values', () => {
  it.each([
    ['displayName', { displayName: 'x'.repeat(31) }, 'too long'],
    ['description', { description: 'x'.repeat(61) }, 'too long'],
    ['tags', { tags: Array.from({ length: 9 }, (_, i) => `t${i}`) }, 'too many items'],
    ['questions', { questions: Array.from({ length: 7 }, (_, i) => select({ id: `q${i}` })) }, 'too many items'],
    ['choices', { questions: [select({ choices: Array.from({ length: 13 }, (_, i) => ({ value: `c${i}`, label: 'C' })), default: 'c0' })] }, 'too many items'],
    ['env keys', { installs: { env: Array.from({ length: 41 }, (_, i) => ({ key: `K_${i}X`, description: 'x', secret: false })) } }, 'too many items'],
  ])('refuses too large a %s', (_field, override, message) => {
    expect(problemsOf(pkg('billing', override)).join('\n')).toContain(message)
  })

  it('refuses a block over 16 KiB before validating anything else', () => {
    const problems = problemsOf(pkg('billing', { description: 'x'.repeat(20_000) }))
    expect(problems).toEqual([expect.stringMatching(/^strutvane: is too large/)])
  })

  it('refuses deep nesting', () => {
    let deep: unknown = 'x'
    for (let i = 0; i < 10; i += 1) deep = { a: deep }
    expect(problemsOf(pkg('billing', { installs: deep }))).toEqual(['strutvane: nests deeper than 6 levels'])
  })

  it('never throws on arbitrary JSON in the block (fuzz)', () => {
    fc.assert(
      fc.property(fc.jsonValue({ maxDepth: 5 }), (value) => {
        validatePackageJson({ name: '@strutvane/x', version: '0.1.0', strutvane: value })
        validatePackageJson(value)
      }),
      { numRuns: 1_000 },
    )
  })

  it('never throws on random mutations of a valid manifest (fuzz)', () => {
    const fields = ['id', 'displayName', 'description', 'category', 'tags', 'kind', 'popular', 'docs', 'framework', 'installs', 'questions', 'requires', 'conflicts', 'deprecated']
    fc.assert(
      fc.property(fc.constantFrom(...fields), fc.jsonValue({ maxDepth: 3 }), (field, value) => {
        const result = validatePackageJson(pkg('billing', { [field]: value }))
        if (!result.ok) for (const problem of result.problems) expect(problem.message.length).toBeGreaterThan(0)
      }),
      { numRuns: 1_000 },
    )
  })
})

describe('rule: names only under @strutvane/ or strutvane-', () => {
  it.each([
    '@evil/billing',
    '@strutvane-x/billing',
    'billing',
    'strutvane_billing',
    'strutvane-',
    '@strutvane/',
    '@strutvane/Billing',
    '@strutvane/../billing',
    '@strutvane/billing--x',
    'strutvane-billing-',
    `@strutvane/${'a'.repeat(60)}`,
  ])('refuses %s', (name) => {
    expect(problemsOf({ ...pkg('billing'), name }).some((line) => line.startsWith('name:'))).toBe(true)
  })

  it('refuses random non-Strutvane names (property)', () => {
    const name = fc.string({ maxLength: 30 }).filter((value) => !value.startsWith('@strutvane/') && !value.startsWith('strutvane-') && value !== 'strutvane' && value !== 'create-strutvane')
    fc.assert(fc.property(name, (value) => problemsOf({ ...pkg('billing'), name: value }).some((line) => line.startsWith('name:'))), { numRuns: 500 })
  })

  it('keeps community ids honest: the id is the package name, and popular is curated', () => {
    expect(problemsOf({ ...pkg('billing'), name: 'strutvane-kanban' })).toContain('strutvane.id: must be "kanban" for the community package strutvane-kanban')
    expect(problemsOf({ ...pkg('kanban', { popular: true }), name: 'strutvane-kanban' })).toContain(
      'strutvane.popular: can only be set by first-party packages (the hub curates the popular list)',
    )
  })

  it('allows only the two reserved unscoped names', () => {
    expect(problemsOf({ ...pkg('create-strutvane', { category: 'core' }), name: 'create-strutvane' })).toEqual([])
    expect(problemsOf({ ...pkg('x'), name: 'create-strutvane-x' }).some((line) => line.startsWith('name:'))).toBe(true)
  })
})

describe('rule: URLs are https, public and canonical', () => {
  it.each([
    ['http://github.com/x', 'must use https'],
    ['javascript:alert(1)', 'must use https'],
    ['data:text/html,hi', 'must use https'],
    ['file:///etc/passwd', 'must use https'],
    ['ftp://example.com/x', 'must use https'],
    ['https://user:pass@github.com/x', 'user name or password'],
    ['https://127.0.0.1/docs', 'IP address'],
    ['https://[::1]/docs', 'IP address'],
    ['https://localhost/docs', 'localhost'],
    ['https://intranet/docs', 'public host name'],
    ['HTTPS://GitHub.com/x', 'canonical'],
    ['https://github.com/a/../b', 'canonical'],
    ['not a url', 'not a valid URL'],
    [`https://example.com/${'x'.repeat(300)}`, 'too long'],
  ])('refuses %s', (url, message) => {
    expect(urlProblem(url)).toContain(message)
    expect(problemsOf(pkg('billing', { docs: url })).join('\n')).toContain(message)
  })

  it('refuses every non-https scheme (property)', () => {
    const scheme = fc.stringMatching(/^[a-z][a-z0-9+.-]{0,10}$/).filter((value) => value !== 'https')
    fc.assert(fc.property(scheme, (value) => urlProblem(`${value}://example.com/docs`) !== undefined))
  })
})

describe('rule: no ReDoS-prone text patterns', () => {
  it.each(['^(a+)+$', '^(a|a)*$', '^([a-z]+)*@$', '^a{1,1000}$', 'unanchored'])('refuses %s', (regex) => {
    const problems = problemsOf(pkg('invoicing', { questions: [text({ pattern: { regex, message: 'Bad' } })] }))
    expect(problems.some((line) => line.startsWith('strutvane.questions[0] ("prefix").pattern.regex:'))).toBe(true)
  })

  it('requires a pattern on every text question', () => {
    const { pattern: _omit, ...withoutPattern } = text()
    expect(problemsOf(pkg('invoicing', { questions: [withoutPattern] })).join('\n')).toMatch(/pattern: is missing/)
  })
})

describe('cross-field rules', () => {
  it.each([
    ['select default not a choice', { questions: [select({ default: 'mollie' })] }, '"mollie" is not one of the choices (stripe, paddle)'],
    ['duplicate choice values', { questions: [select({ choices: [{ value: 'a', label: 'A' }, { value: 'a', label: 'B' }], default: 'a' })] }, 'two choices with the value "a"'],
    ['duplicate question ids', { questions: [select(), select()] }, 'used by two questions'],
    ['when on a later question', { questions: [select({ when: { question: 'later', equals: 'x' } }), select({ id: 'later' })] }, 'not an earlier question'],
    ['when with an impossible value', { questions: [select(), { id: 'tax', type: 'confirm', label: 'Tax?', default: false, when: { question: 'provider', equals: 'mollie' } }] }, 'not one of that question\'s choices'],
    ['text default not matching', { questions: [text({ default: 'inv' })] }, 'does not match the pattern'],
    ['multiselect default outside min', { questions: [{ id: 'm', type: 'multiselect', label: 'Pick', choices: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }], default: [], min: 1 }] }, 'outside min 1'],
    ['requires itself', { requires: ['billing'] }, 'lists the package itself'],
    ['requires and conflicts the same id', { requires: ['tags'], conflicts: ['tags'] }, 'both required and in conflict'],
    ['secret-looking env key not marked secret', { installs: { env: [{ key: 'STRIPE_SECRET', description: 'Stripe key', secret: false }] } }, 'looks like a credential'],
    ['secret env key with an example value', { installs: { env: [{ key: 'STRIPE_SECRET', description: 'Stripe key', secret: true, example: 'sk_test_123' }] } }, 'must not have an example value'],
    ['config path escaping the project', { installs: { config: ['../../etc/passwd'] } }, 'relative path'],
    ['absolute config path', { installs: { config: ['/etc/passwd'] } }, 'relative path'],
    ['unsupported framework range', { framework: '^0.2.0-rc.1' }, 'not a range the installer understands'],
    ['design category for a package', { category: 'design' }, 'only for designs'],
    ['deprecated replacedBy itself', { deprecated: { message: 'Use something else', replacedBy: 'billing' } }, 'points at the package itself'],
  ])('refuses %s', (_name, override, message) => {
    expect(problemsOf(pkg('billing', override)).join('\n')).toContain(message)
  })

  it('refuses a pre-release version and a framework peer that disagrees with the manifest', () => {
    expect(problemsOf({ ...pkg('billing'), version: '0.2.0-beta.1' })).toContain('version: must be a full release version like 0.2.0 (pre-releases are not listed)')
    expect(problemsOf({ ...pkg('billing'), peerDependencies: { '@strutvane/framework': '^0.3' } })).toContain(
      'strutvane.framework: is "^0.2" but peerDependencies["@strutvane/framework"] is "^0.3"; they must be the same',
    )
  })

  it('checks design rules: name, id, category and what designs may install', () => {
    const design = (name: string, override: Record<string, unknown> = {}) => ({ ...pkg('crisp', { kind: 'design', category: 'design', ...override }), name })
    expect(problemsOf(design('@strutvane/design-crisp'))).toEqual([])
    expect(problemsOf(design('@strutvane/design-vivid'))).toContain('strutvane.id: must be "vivid" for @strutvane/design-vivid (the part after "design-")')
    expect(problemsOf(design('@strutvane/crisp'))).toContain('strutvane.kind: is "design" but designs are named @strutvane/design-<name> or strutvane-design-<name>')
    expect(problemsOf(design('@strutvane/design-crisp', { installs: { migrations: ['create_x_table'] } })).join('\n')).toContain('must be empty for a design')
    expect(problemsOf({ ...pkg('design-crisp'), name: '@strutvane/design-crisp' })).toContain('strutvane.kind: must be "design" for @strutvane/design-crisp')
  })

  it('names the question in the path, so the author can find it', () => {
    expect(problemsOf(pkg('billing', { questions: [select({ label: 'x'.repeat(80) })] }))).toContain(
      'strutvane.questions[0] ("provider").label: is too long (at most 74 characters)',
    )
  })

  it.each([
    ['a line break', 'Billing\nProvider?'],
    ['an escape sequence', 'Billing \u001b[2J provider?'],
    ['a right-to-left override', 'Billing ‮provider'],
    ['a zero-width space', 'Bill​ing'],
    ['leading spaces', '  Billing'],
  ])('refuses display text with %s', (_name, label) => {
    expect(problemsOf(pkg('billing', { questions: [select({ label })] }))).not.toEqual([])
  })
})
