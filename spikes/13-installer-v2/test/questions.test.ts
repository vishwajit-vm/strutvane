/**
 * Interactive question flows, driven by a scripted prompter.
 */
import { describe, expect, it } from 'vitest'
import { CANCEL, CancelledError } from '../src/prompter.ts'
import { askMissing, pruneAnswers, review, reviewLines } from '../src/questions.ts'
import { scriptedPrompter } from './helpers/fakes.ts'

const context = { cwd: '/code', targetProblem: () => undefined }

/** The script: what the prompter answers (the Docker question is a select: 'docker' | 'host'). */
const EVERY_ANSWER = {
  name: 'my-app',
  stack: 'full',
  ui: 'admin',
  design: 'crisp',
  auth: 'email',
  features: ['registration', '2fa'],
  teams: false,
  database: 'mysql',
  docker: 'docker',
  testing: 'vitest',
  git: true,
}

describe('questions', () => {
  it('asks everything in Laravel order when no flags are given', async () => {
    const { prompter, asked } = scriptedPrompter(EVERY_ANSWER)
    const answers = await askMissing({}, prompter, context)
    expect(asked).toEqual(['name', 'stack', 'ui', 'design', 'auth', 'features', 'teams', 'database', 'docker', 'testing', 'git'])
    expect(answers).toEqual({ ...EVERY_ANSWER, docker: true })
  })

  it('skips the UI question for an API-only project', async () => {
    const { prompter, asked } = scriptedPrompter({ ...EVERY_ANSWER, stack: 'api' })
    await askMissing({}, prompter, context)
    expect(asked).not.toContain('ui')
  })

  it('skips sign-in features and teams without sign-in', async () => {
    const { prompter, asked } = scriptedPrompter({ ...EVERY_ANSWER, auth: 'none' })
    const answers = await askMissing({}, prompter, context)
    expect(asked).not.toContain('features')
    expect(asked).not.toContain('teams')
    expect(answers.teams).toBeUndefined()
  })

  it('asks "with Docker or without?" for every database, and connection details only without Docker', async () => {
    const sqlite = scriptedPrompter({ ...EVERY_ANSWER, database: 'sqlite', docker: 'host' })
    expect((await askMissing({}, sqlite.prompter, context)).docker).toBe(false)
    expect(sqlite.asked).toContain('docker')
    expect(sqlite.asked).not.toContain('dbHost')

    const own = scriptedPrompter({ ...EVERY_ANSWER, docker: 'host', dbHost: '', dbPort: '3307', dbName: 'shop', dbUser: '', dbPassword: "pa ss'#word" })
    const answers = await askMissing({}, own.prompter, context)
    expect(own.asked).toEqual(['name', 'stack', 'ui', 'design', 'auth', 'features', 'teams', 'database', 'docker', 'dbHost', 'dbPort', 'dbName', 'dbUser', 'dbPassword', 'testing', 'git'])
    // Enter accepts the suggestion; the password is kept for .env only.
    expect(answers).toMatchObject({ docker: false, dbHost: '127.0.0.1', dbPort: 3307, dbName: 'shop', dbUser: 'my_app', dbPassword: "pa ss'#word" })
  })

  it('explains what teams mean on MySQL right after the database answer', async () => {
    const { prompter, infos } = scriptedPrompter({ ...EVERY_ANSWER, teams: true, database: 'mysql' })
    await askMissing({}, prompter, context)
    expect(infos.join('\n')).toMatch(/Teams on MySQL: .*ORM tenant scope/)
  })

  it('never asks what was given as a flag', async () => {
    const { prompter, asked } = scriptedPrompter(EVERY_ANSWER)
    await askMissing({ name: 'given', database: 'sqlite', docker: false, git: false }, prompter, context)
    expect(asked).toEqual(['stack', 'ui', 'design', 'auth', 'features', 'teams', 'testing'])
  })

  it('rejects a folder that already has files, at the name question', async () => {
    const { prompter } = scriptedPrompter(EVERY_ANSWER)
    const busy = { cwd: '/code', targetProblem: () => '/code/my-app already exists and is not empty.' }
    await expect(askMissing({}, prompter, busy)).rejects.toThrow(/already exists and is not empty/)
  })

  it('turns Ctrl+C into CancelledError', async () => {
    const { prompter } = scriptedPrompter({ name: 'x', stack: CANCEL })
    await expect(askMissing({}, prompter, context)).rejects.toBeInstanceOf(CancelledError)
  })
})

describe('review screen', () => {
  it('shows every answer and creates on "Create it"', async () => {
    const { prompter, notes } = scriptedPrompter({ review: 'create' })
    const answers = await review({ name: 'my-app', teams: true, database: 'mysql' }, prompter, context)
    expect(answers.name).toBe('my-app')
    const lines = notes[0]?.lines.join('\n') ?? ''
    expect(lines).toMatch(/Database\s+MySQL/)
    expect(lines).toMatch(/Docker\s+yes/)
    expect(lines).toMatch(/Teams on MySQL/)
  })

  it('"Change an answer" re-asks one question and settles what it affects', async () => {
    // Without Docker, switch MySQL → SQLite: the connection answers no longer apply and are dropped.
    const { prompter, asked } = scriptedPrompter({ review: ['change', 'create'], change: 'database', database: 'sqlite' })
    const full = { name: 'my-app', stack: 'api', auth: 'none', testing: 'none', git: false } as const
    const answers = await review({ ...full, database: 'mysql', docker: false, dbHost: 'db.local', dbPort: 3306, dbName: 'x', dbUser: 'x', dbPassword: 'x' }, prompter, context)
    expect(answers.database).toBe('sqlite')
    expect(answers.dbHost).toBeUndefined()
    expect(answers.dbPassword).toBeUndefined()
    expect(asked).toEqual(['review', 'change', 'database', 'review'])
  })

  it('asks questions that newly apply after a change (Docker → without Docker asks the connection)', async () => {
    const { prompter, asked } = scriptedPrompter({
      review: ['change', 'create'],
      change: 'docker',
      docker: 'host',
      dbHost: 'db.local',
      dbPort: '',
      dbName: '',
      dbUser: '',
      dbPassword: 'secret',
    })
    const full = { name: 'my-app', stack: 'api', auth: 'none', testing: 'none', git: false } as const
    const answers = await review({ ...full, database: 'postgres', docker: true }, prompter, context)
    expect(answers).toMatchObject({ database: 'postgres', docker: false, dbHost: 'db.local', dbPort: 5432 })
    expect(asked).toEqual(['review', 'change', 'docker', 'dbHost', 'dbPort', 'dbName', 'dbUser', 'dbPassword', 'review'])
  })

  it('"Cancel" throws CancelledError (nothing is written)', async () => {
    const { prompter } = scriptedPrompter({ review: 'cancel' })
    await expect(review({ name: 'x' }, prompter, context)).rejects.toBeInstanceOf(CancelledError)
  })

  it('prunes stale answers and formats review lines', () => {
    expect(pruneAnswers({ stack: 'api', ui: 'admin', auth: 'none', teams: true })).toEqual({ stack: 'api', auth: 'none' })
    expect(reviewLines({ name: 'my-app', stack: 'api' }, '/code').join('\n')).not.toMatch(/^UI/m)
  })
})
