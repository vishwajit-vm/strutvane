/**
 * The question engine with a scripted prompter: Recommended vs Custom, the order, `when` rules,
 * the review screen and "Change an answer".
 */
import { describe, expect, it } from 'vitest'
import { CANCEL, CancelledError } from '../src/prompter.ts'
import { QUESTIONS } from '../src/question-registry.ts'
import { askMissing, pruneAnswers, review, reviewLines } from '../src/questions.ts'
import { CUSTOM_ANSWERS, RECOMMENDED_ANSWERS, scriptedPrompter } from './helpers/fakes.ts'

const context = { cwd: '/code', targetProblem: () => undefined }


describe('Recommended mode (the default)', () => {
  it('asks only the 7 starred questions after the name and the opener', async () => {
    const { prompter, asked } = scriptedPrompter({ ...RECOMMENDED_ANSWERS, name: 'my-app' })
    const answers = await askMissing({}, prompter, context)
    expect(asked).toEqual(['name', 'mode', 'stack', 'design', 'auth', 'teams', 'database', 'docker', 'agents'])
    expect(answers).toEqual({ ...RECOMMENDED_ANSWERS, name: 'my-app', docker: true })
  })

  it('the opener counts the questions from the registry', async () => {
    const { prompter, messages } = scriptedPrompter({ ...RECOMMENDED_ANSWERS, name: 'acme' })
    await askMissing({}, prompter, context)
    expect(messages[1]).toBe('How do you want to set up acme?')
    const select = QUESTIONS.find((q) => q.id === 'mode')
    expect(select?.flag?.usage).toBe('--mode recommended|custom')
  })

  it('still asks what an earlier answer made necessary: your own server and its password', async () => {
    const { prompter, asked } = scriptedPrompter({ ...RECOMMENDED_ANSWERS, name: 'my-app', docker: 'host', dbHost: '', dbPort: '3307', dbName: 'shop', dbUser: '', dbPassword: "pa ss'#word" })
    const answers = await askMissing({}, prompter, context)
    expect(asked).toEqual(['name', 'mode', 'stack', 'design', 'auth', 'teams', 'database', 'docker', 'dbHost', 'dbPort', 'dbName', 'dbUser', 'dbPassword', 'agents'])
    expect(answers).toMatchObject({ docker: false, dbHost: '127.0.0.1', dbPort: 3307, dbName: 'shop', dbUser: 'root', dbPassword: "pa ss'#word" })
  })

  it('skips design for an API-only project and teams without sign-in', async () => {
    const { prompter, asked } = scriptedPrompter({ ...RECOMMENDED_ANSWERS, name: 'my-app', stack: 'api', auth: 'none' })
    await askMissing({}, prompter, context)
    expect(asked).toEqual(['name', 'mode', 'stack', 'auth', 'database', 'docker', 'agents'])
  })

  it('never asks what was given as a flag', async () => {
    const { prompter, asked } = scriptedPrompter(RECOMMENDED_ANSWERS)
    await askMissing({ name: 'given', mode: 'recommended', database: 'sqlite', docker: false, agents: false }, prompter, context)
    expect(asked).toEqual(['stack', 'design', 'auth', 'teams'])
  })

  it('explains what teams mean on MySQL right after the database answer', async () => {
    const { prompter, infos } = scriptedPrompter({ ...RECOMMENDED_ANSWERS, name: 'x', teams: true, database: 'mysql' })
    await askMissing({}, prompter, context)
    expect(infos.join('\n')).toMatch(/Teams on MySQL: .*ORM tenant scope/)
  })
})

describe('Custom mode', () => {
  it('asks every question in blueprint order, with group headers', async () => {
    const { prompter, asked, infos } = scriptedPrompter(CUSTOM_ANSWERS)
    await askMissing({}, prompter, context)
    expect(asked).toEqual([
      'name', 'mode', 'stack', 'design', 'ui', 'auth', 'security', 'social', 'apiAccess', 'roles', 'teams', 'database', 'docker',
      'adminEmail', 'adminPasswordMode', 'sampleData', 'cache', 'storage', 'mailer', 'locale', 'timezone', 'currency',
      'features', 'featuresSearch', 'testing', 'agents', 'git', 'ci', 'securityProfile', 'activityLog', 'ai', 'mcpServer',
      'uiLanguages', 'appearance', 'pwa', 'liveUpdates', 'monitoring', 'deploy', 'editor', 'devContainer',
    ])
    expect(infos).toContain('── Sign-in ──')
    expect(infos).toContain('── Ops ──')
  })

  it('asks a question that a later answer switched on (teams → SSO and team resolver)', async () => {
    const { prompter, asked } = scriptedPrompter({ ...CUSTOM_ANSWERS, teams: true, database: 'postgres' })
    const answers = await askMissing({}, prompter, context)
    expect(asked.indexOf('sso')).toBeGreaterThan(asked.indexOf('teams'))
    expect(asked).toContain('tenantResolver')
    expect(answers).toMatchObject({ teams: true, sso: false, tenantResolver: 'switcher' })
  })

  it('asks for the AI provider only after "yes" to AI features, and never for a key', async () => {
    const { prompter, asked, prompts } = scriptedPrompter({ ...CUSTOM_ANSWERS, ai: true, aiProvider: 'openai' })
    const answers = await askMissing({}, prompter, context)
    expect(asked.indexOf('aiProvider')).toBe(asked.indexOf('ai') + 1)
    expect(answers.aiProvider).toBe('openai')
    // Free text is where a key could be typed: no free-text question mentions one.
    const typed = prompts.filter((p) => p.kind !== 'choice')
    expect(typed.length).toBeGreaterThan(0)
    for (const prompt of typed) expect(prompt.message).not.toMatch(/api[\s_-]?key|secret|token|credential/i)
  })

  it('asks a typed admin password only for "type it", masked, at least 12 characters', async () => {
    const { prompter, asked, infos } = scriptedPrompter({ ...CUSTOM_ANSWERS, adminPasswordMode: 'type', adminPassword: ['short', 'a-long-enough-secret'] })
    const answers = await askMissing({}, prompter, context)
    expect(asked.filter((id) => id === 'adminPassword')).toHaveLength(2)
    expect(infos).toContain('Please use at least 12 characters.')
    expect(answers.adminPassword).toBe('a-long-enough-secret')
  })

  it('email link sign-in has an admin email but no admin password question', async () => {
    const { prompter, asked } = scriptedPrompter({ ...CUSTOM_ANSWERS, auth: 'magic-link' })
    await askMissing({}, prompter, context)
    expect(asked).toContain('adminEmail')
    expect(asked).not.toContain('adminPasswordMode')
  })

  it('turns Ctrl+C into CancelledError', async () => {
    const { prompter } = scriptedPrompter({ name: 'x', mode: CANCEL })
    await expect(askMissing({}, prompter, context)).rejects.toBeInstanceOf(CancelledError)
  })

  it('rejects a folder that already has files, at the name question', async () => {
    const { prompter } = scriptedPrompter(CUSTOM_ANSWERS)
    const busy = { cwd: '/code', targetProblem: () => '/code/my-app already exists and is not empty.' }
    await expect(askMissing({}, prompter, busy)).rejects.toThrow(/already exists and is not empty/)
  })
})

describe('review screen', () => {
  it('lists every answer that applies, defaults included, grouped', () => {
    const text = reviewLines({ name: 'my-app', teams: true, database: 'mysql' }, '/code').join('\n')
    expect(text).toMatch(/^Folder\s+/)
    for (const line of [/^Database\s+MySQL$/m, /^Docker\s+yes/m, /^Design\s+crisp \(@strutvane\/design-crisp\)$/m, /^Sign-in security\s+2FA, email verification$/m,
      /^Extra features\s+Log viewer$/m, /^Deploy to\s+decide later$/m, /^Dev container\s+no$/m, /^Activity history\s+yes$/m, /^Sign-in$/m, /^Ops$/m]) {
      expect(text).toMatch(line)
    }
    expect(text).toMatch(/Teams on MySQL/)
  })

  it('shows secrets as "(hidden)", never their value', () => {
    const text = reviewLines({ name: 'my-app', docker: false, dbPassword: 'hunter2-hunter2', adminPasswordMode: 'type', adminPassword: 'correct-horse-battery' }, '/code').join('\n')
    expect(text).not.toContain('hunter2')
    expect(text).not.toContain('correct-horse')
    expect(text).toMatch(/Database password\s+\(hidden\)/)
  })

  it('creates on "Create it", and "Cancel" throws CancelledError', async () => {
    expect((await review({ name: 'my-app' }, scriptedPrompter({ review: 'create' }).prompter, context)).name).toBe('my-app')
    await expect(review({ name: 'x' }, scriptedPrompter({ review: 'cancel' }).prompter, context)).rejects.toBeInstanceOf(CancelledError)
  })

  it('"Change an answer" can change a defaulted (unasked) question too', async () => {
    const { prompter, asked } = scriptedPrompter({ review: ['change', 'create'], change: 'deploy', deploy: 'docker' })
    const given = { name: 'my-app', mode: 'recommended', stack: 'full', design: 'crisp', auth: 'email', teams: false, database: 'sqlite', docker: false, agents: true } as const
    const answers = await review(given, prompter, context)
    expect(answers.deploy).toBe('docker')
    expect(asked).toEqual(['review', 'change', 'deploy', 'review'])
  })

  it('"Change an answer" re-asks one question and settles what it affects', async () => {
    // Without Docker, switch MySQL → SQLite: the connection answers no longer apply and are dropped.
    const { prompter, asked } = scriptedPrompter({ review: ['change', 'create'], change: 'database', database: 'sqlite' })
    const full = { name: 'my-app', mode: 'recommended', stack: 'api', auth: 'none', agents: false } as const
    const answers = await review({ ...full, database: 'mysql', docker: false, dbHost: 'db.local', dbPort: 3306, dbName: 'x', dbUser: 'x', dbPassword: 'x' }, prompter, context)
    expect(answers.database).toBe('sqlite')
    expect(answers.dbHost).toBeUndefined()
    expect(answers.dbPassword).toBeUndefined()
    expect(asked).toEqual(['review', 'change', 'database', 'review'])
  })

  it('asks questions that newly apply after a change (Docker → without Docker asks the connection)', async () => {
    const { prompter, asked } = scriptedPrompter({
      review: ['change', 'create'], change: 'docker', docker: 'host', dbHost: 'db.local', dbPort: '', dbName: '', dbUser: '', dbPassword: 'secret',
    })
    const full = { name: 'my-app', mode: 'recommended', stack: 'api', auth: 'none', agents: false } as const
    const answers = await review({ ...full, database: 'postgres', docker: true }, prompter, context)
    expect(answers).toMatchObject({ database: 'postgres', docker: false, dbHost: 'db.local', dbPort: 5432 })
    expect(asked).toEqual(['review', 'change', 'docker', 'dbHost', 'dbPort', 'dbName', 'dbUser', 'dbPassword', 'review'])
  })

  it('prunes answers that no longer apply', () => {
    expect(pruneAnswers({ stack: 'api', ui: 'admin', design: 'vivid', pwa: true, auth: 'none', teams: true, sso: true })).toEqual({ stack: 'api', auth: 'none' })
    expect(pruneAnswers({ ai: false, aiProvider: 'openai' })).toEqual({ ai: false })
  })
})
