/**
 * The whole installer in-process: flags/CI mode, interactive mode, cancel, preflight errors and
 * the all-or-nothing file write. External programs are faked; files are real (temp folders).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkNodeVersion, main } from '../src/main.ts'
import { CANCEL } from '../src/prompter.ts'
import { FAKE_NODE, FAKE_NPM_CLI, describeCall, fakeEnvironment, scriptedPrompter, tempFolder } from './helpers/fakes.ts'
import { fakePrograms } from './helpers/programs.ts'

const NPM_AGENT = 'npm/11.19.0 node/v24.21.0 win32 x64 workspaces/false'

describe('CI mode (--yes and flags)', () => {
  it('Docker mode (the default): starts the containers, then installs, migrates and seeds INSIDE the app container', async () => {
    const cwd = tempFolder()
    const world = fakePrograms()
    const { environment, output } = fakeEnvironment({ cwd, argv: ['acme', '--yes'], spawn: world.spawn })
    expect(await main(environment)).toBe(0)
    expect(world.calls.map(describeCall)).toEqual([
      'docker --version',
      'docker info',
      'docker compose version',
      'docker compose up',
      'app: chown 1000:1000',
      'app: npm ci',
      'app: strut migrate',
      'git --version',
      'git rev-parse',
      'git init',
      'git check-ignore',
      'git add',
      'git diff',
      'git commit',
    ])
    for (const call of world.calls) expect(call.command).not.toMatch(/\.(cmd|bat|ps1)$/i)
    // Compose is always scoped to this project; npm runs in the container, as the app user.
    const up = world.calls.find((call) => call.args.includes('up'))
    expect(up?.args).toEqual(['compose', '-p', 'acme', '--env-file', '.env', '-f', 'docker/compose.yaml', 'up', '-d', '--wait', '--wait-timeout', '180'])
    const chown = world.calls.find((call) => call.args.includes('chown'))
    expect(chown?.args.slice(7)).toEqual(['exec', '-T', '-u', 'root', 'app', 'chown', '1000:1000', '/app/node_modules'])
    const npm = world.calls.find((call) => describeCall(call) === 'app: npm ci')
    expect(npm?.args.slice(7)).toEqual(['exec', '-T', 'app', 'npm', 'ci', '--ignore-scripts', '--no-audit', '--no-fund'])
    // The admin password reaches the seeder through the environment (-e NAME), never argv or CI output.
    const migrate = world.calls.find((call) => describeCall(call) === 'app: strut migrate')
    expect(migrate?.args.slice(7)).toEqual(['exec', '-T', '-e', 'STRUT_SEED_ADMIN_PASSWORD', 'app', 'node', 'strut', 'migrate', '--seed'])
    expect(migrate?.args.join(' ')).not.toContain('Abcd-Efgh-Jkmn-Pqrs')
    expect(migrate?.env).toEqual({ STRUT_SEED_ADMIN_PASSWORD: 'Abcd-Efgh-Jkmn-Pqrs' })
    expect(migrate?.redact).toEqual(['Abcd-Efgh-Jkmn-Pqrs'])
    expect(output()).not.toContain('Abcd-Efgh-Jkmn-Pqrs')
    expect(output()).toContain('not shown here. Set one with: node strut user:password admin@acme.test')
    expect(output()).toContain('npm create strutvane@latest acme -- --stack full --ui admin --auth email --features none --no-teams --db mysql --docker --testing vitest --git --yes')
    expect(output()).toMatch(/Mail inbox\s+http:\/\/localhost:8025/)
    const state: unknown = JSON.parse(readFileSync(join(cwd, 'acme', '.strutvane', 'setup.json'), 'utf8'))
    expect(JSON.stringify(state)).not.toMatch(/secret-0|Abcd-Efgh/) // no secret ever in setup.json
  })

  it('without Docker: runs npm on this computer as node + npm-cli.js (never npm.cmd), and strut.js with node', async () => {
    const world = fakePrograms()
    const { environment } = fakeEnvironment({ cwd: tempFolder(), argv: ['acme', '--yes', '--db', 'sqlite'], spawn: world.spawn })
    expect(await main(environment)).toBe(0)
    expect(world.calls.map(describeCall).slice(0, 2)).toEqual(['npm ci', 'strut migrate'])
    const [npm, migrate] = world.calls
    expect(npm?.command).toBe(FAKE_NODE)
    expect(npm?.args).toEqual([FAKE_NPM_CLI, 'ci', '--ignore-scripts', '--no-audit', '--no-fund'])
    expect(migrate?.command).toBe(FAKE_NODE)
    expect(migrate?.args).toEqual(['strut.js', 'migrate', '--seed'])
    expect(migrate?.redact).toEqual(['Abcd-Efgh-Jkmn-Pqrs'])
    expect(world.calls.some((call) => call.command === 'docker')).toBe(false)
  })

  it('on Linux, runs the app container as the host user', async () => {
    const cwd = tempFolder()
    const world = fakePrograms()
    const { environment } = fakeEnvironment({ cwd, argv: ['acme', '--yes'], spawn: world.spawn, hostUser: { uid: 1001, gid: 1002 } })
    expect(await main(environment)).toBe(0)
    expect(readFileSync(join(cwd, 'acme', '.env'), 'utf8')).toMatch(/^STRUT_UID=1001$/m)
    expect(world.calls.map(describeCall)).toContain('app: chown 1001:1002')
  })

  it('treats CI=true as non-interactive even in a terminal', async () => {
    const cwd = tempFolder()
    const { environment } = fakeEnvironment({
      cwd,
      argv: ['acme', '--db', 'sqlite'],
      env: { CI: 'true' },
      interactiveTerminal: true,
      spawn: fakePrograms().spawn,
    })
    expect(await main(environment)).toBe(0) // the empty prompter script would throw if asked
  })

  it('needs a name when there are no questions', async () => {
    const { environment, output } = fakeEnvironment({ cwd: tempFolder(), argv: ['--yes'] })
    expect(await main(environment)).toBe(1)
    expect(output()).toContain('npm create strutvane@latest my-app -- --yes')
  })

  it('stops on flags npm swallowed, with the corrected command, before writing anything', async () => {
    const cwd = tempFolder()
    const { environment, output } = fakeEnvironment({
      cwd,
      argv: ['acme', 'sqlite'],
      env: { npm_config_user_agent: NPM_AGENT, npm_config_db: 'sqlite' },
    })
    expect(await main(environment)).toBe(1)
    expect(output()).toContain('npm create strutvane@latest acme -- --db sqlite')
    expect(existsSync(join(cwd, 'acme'))).toBe(false)
  })

  it('refuses a non-empty folder before any question', async () => {
    const cwd = tempFolder()
    mkdirSync(join(cwd, 'acme'))
    writeFileSync(join(cwd, 'acme', 'keep.txt'), 'mine')
    const { environment, output } = fakeEnvironment({ cwd, argv: ['acme'], interactiveTerminal: true })
    expect(await main(environment)).toBe(1)
    expect(output()).toMatch(/already exists and is not empty/)
    expect(readFileSync(join(cwd, 'acme', 'keep.txt'), 'utf8')).toBe('mine')
  })

  it('refuses conflicting flags before any question', async () => {
    const { environment, output } = fakeEnvironment({ cwd: tempFolder(), argv: ['acme', '--db', 'sqlite', '--db-host', 'x'], interactiveTerminal: true })
    expect(await main(environment)).toBe(1)
    expect(output()).toMatch(/connection details .* only for MySQL\/PostgreSQL without Docker/)
  })

  it('rolls back completely when writing fails halfway', async () => {
    const cwd = tempFolder()
    let written = 0
    const { environment, output } = fakeEnvironment({
      cwd,
      argv: ['acme', '--yes'],
      writeFile: async (path, content) => {
        written += 1
        if (written === 5) throw new Error('ENOSPC: no space left on device')
        mkdirSync(join(path, '..'), { recursive: true })
        writeFileSync(path, content)
      },
    })
    expect(await main(environment)).toBe(1)
    expect(output()).toMatch(/nothing was created: ENOSPC/)
    expect(existsSync(join(cwd, 'acme'))).toBe(false)
  })

  it('checks the Node version first', () => {
    expect(checkNodeVersion('24.21.0')).toBeUndefined()
    expect(checkNodeVersion('26.0.0')).toBeUndefined()
    expect(checkNodeVersion('24.2.0')).toMatch(/needs Node.js 24.3 or newer/)
    expect(checkNodeVersion('v22.11.0')).toMatch(/you have v22.11.0/)
  })

  it('starts npm run dev at the end with --dev, without a shell', async () => {
    const world = fakePrograms()
    const { environment } = fakeEnvironment({ cwd: tempFolder(), argv: ['acme', '--yes', '--db', 'sqlite', '--dev'], spawn: world.spawn })
    expect(await main(environment)).toBe(0)
    const dev = world.calls.at(-1)
    expect(dev?.args).toEqual([FAKE_NPM_CLI, 'run', 'dev'])
    expect(dev?.inherit).toBe(true)
  })
})

describe('interactive mode', () => {
  it('asks, reviews, creates, shows the one-time password once, and offers npm run dev', async () => {
    const cwd = tempFolder()
    const { prompter, asked, notes } = scriptedPrompter({
      name: 'acme',
      stack: 'full',
      ui: 'admin',
      auth: 'email',
      features: ['2fa'],
      teams: false,
      database: 'sqlite',
      docker: 'host',
      testing: 'vitest',
      git: true,
      review: 'create',
      dev: false,
    })
    const world = fakePrograms()
    const { environment, output } = fakeEnvironment({ cwd, argv: [], interactiveTerminal: true, prompter, spawn: world.spawn })
    expect(await main(environment)).toBe(0)
    expect(asked.at(-1)).toBe('dev')
    expect(notes[0]?.title).toBe('Review')
    expect(output()).toContain('Abcd-Efgh-Jkmn-Pqrs   (shown once; change it at first sign-in)')
    expect(world.calls.some((call) => call.args.includes('run'))).toBe(false)
  })

  it('exits 130 and writes nothing when cancelled', async () => {
    const cwd = tempFolder()
    const { prompter } = scriptedPrompter({ name: 'acme', stack: CANCEL })
    const { environment } = fakeEnvironment({ cwd, argv: [], interactiveTerminal: true, prompter })
    expect(await main(environment)).toBe(130)
    expect(existsSync(join(cwd, 'acme'))).toBe(false)
  })
})
