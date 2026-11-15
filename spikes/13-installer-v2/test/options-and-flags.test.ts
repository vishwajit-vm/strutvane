/**
 * Choices, defaults, flag parsing and npm's swallowed flags.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ArgsError, parseCommandLine } from '../src/args.ts'
import { OptionsError, resolveOptions, teamsNote } from '../src/options.ts'
import { findSwallowedFlags, swallowedFlagsMessage } from '../src/swallowed-flags.ts'
import { validateProjectName } from '../src/validate-name.ts'
import { main } from '../src/main.ts'
import { fakeEnvironment, tempFolder } from './helpers/fakes.ts'

const NPM = 'npm/11.19.0 node/v24.21.0 win32 x64 workspaces/false'

describe('defaults (user decisions 2026-11-14 + security review)', () => {
  it('defaults to a full-stack React admin app on MySQL in Docker, sign-in without public registration', () => {
    const options = resolveOptions({ name: 'my-app' }, '/code')
    expect(options).toMatchObject({
      stack: 'full',
      ui: 'admin',
      auth: 'email',
      // 2FA and email verification on; public registration OFF (security review F-02).
      security: ['2fa', 'verification'],
      features: ['log-viewer'],
      teams: false,
      database: 'mysql',
      docker: true,
      testing: 'vitest',
      git: true,
    })
  })

  it('pre-selects PostgreSQL when teams are on, but still allows MySQL with a note', () => {
    expect(resolveOptions({ name: 'a', teams: true }, '/c').database).toBe('postgres')
    const mysql = resolveOptions({ name: 'a', teams: true, database: 'mysql' }, '/c')
    expect(mysql.database).toBe('mysql')
    expect(teamsNote(true, 'mysql')).toMatch(/ORM tenant scope.*PostgreSQL adds row-level security/)
    expect(teamsNote(true, 'postgres')).toBeUndefined()
    expect(teamsNote(false, 'mysql')).toBeUndefined()
  })

  it('defaults Docker off for SQLite (still allowed), and has no UI for an API-only project', () => {
    expect(resolveOptions({ name: 'a', database: 'sqlite' }, '/c').docker).toBe(false)
    expect(resolveOptions({ name: 'a', database: 'sqlite', docker: true }, '/c').docker).toBe(true)
    expect(resolveOptions({ name: 'a', stack: 'api' }, '/c').ui).toBeUndefined()
  })

  it('reports every conflicting choice at once, in plain words', () => {
    try {
      resolveOptions({ name: 'My App', stack: 'api', ui: 'admin', auth: 'none', security: ['2fa'], teams: true, docker: true, dbHost: 'x' }, '/c')
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(OptionsError)
      const problems = (error as OptionsError).problems
      expect(problems).toHaveLength(6) // name: 2, ui, security, teams, docker
      expect(problems.join('\n')).toMatch(/lowercase/)
      expect(problems.join('\n')).toMatch(/drop --ui/)
      expect(problems.join('\n')).toMatch(/teams need sign-in/)
      expect(problems.join('\n')).toMatch(/connection details .* only for MySQL\/PostgreSQL without Docker/)
    }
  })

  it('refuses Windows-reserved and npm-invalid names', () => {
    expect(validateProjectName('con')).toEqual(['"con" is a reserved name on Windows'])
    expect(validateProjectName('.hidden')[0]).toMatch(/cannot start with/)
    expect(validateProjectName('ok-name')).toEqual([])
  })
})

describe('your own database server (no Docker)', () => {
  it('defaults to this computer, the standard port, the usual admin user and a name from the project', () => {
    expect(resolveOptions({ name: 'acme-portal', docker: false }, '/c').connection).toEqual({
      host: '127.0.0.1',
      port: 3306,
      database: 'acme_portal',
      username: 'root',
      sslMode: 'prefer',
    })
    expect(resolveOptions({ name: 'a', database: 'postgres', docker: false }, '/c').connection?.port).toBe(5432)
    expect(resolveOptions({ name: 'a' }, '/c').connection).toBeUndefined() // Docker mode
  })

  it('refuses hosts and names that could break .env or SQL', () => {
    expect(() => resolveOptions({ name: 'a', docker: false, dbHost: 'db host', dbUser: "x'; DROP", dbPort: 70000 }, '/c')).toThrow(
      /not a valid database host[\s\S]*port 70000[\s\S]*not a valid database user/,
    )
  })

  it('parses the connection flags', () => {
    expect(parseCommandLine(['a', '--no-docker', '--db-host', 'db.local', '--db-port', '3307', '--db-name', 'shop', '--db-user', 'shop']).answers).toMatchObject({
      docker: false,
      dbHost: 'db.local',
      dbPort: 3307,
      dbName: 'shop',
      dbUser: 'shop',
    })
    expect(() => parseCommandLine(['a', '--db-port', 'abc'])).toThrow(/is not a port number/)
  })
})

describe('flags: one for every question (CI mode)', () => {
  it('parses every question flag', () => {
    const parsed = parseCommandLine([
      'my-app',
      '--stack', 'full', '--ui', 'blank', '--auth', 'email', '--security', 'registration,2fa',
      '--teams', '--db', 'postgres', '--no-docker', '--testing', 'vitest-playwright', '--no-git', '--yes', '--no-dev',
    ])
    expect(parsed.command).toBe('create')
    expect(parsed.yes).toBe(true)
    expect(parsed.dev).toBe(false)
    expect(parsed.answers).toEqual({
      name: 'my-app',
      stack: 'full',
      ui: 'blank',
      auth: 'email',
      security: ['registration', '2fa'],
      teams: true,
      database: 'postgres',
      docker: false,
      testing: 'vitest-playwright',
      git: false,
    })
  })

  it('keeps "not given" apart from a value, so only missing answers are asked', () => {
    expect(parseCommandLine(['my-app']).answers).toEqual({ name: 'my-app' })
    expect(parseCommandLine(['-y']).yes).toBe(true)
    expect(parseCommandLine(['x', '--security', 'none']).answers.security).toEqual([])
    expect(parseCommandLine(['x', '--features', 'none']).answers.features).toEqual([])
  })

  it('explains unknown flags and bad values, listing the allowed choices', () => {
    expect(() => parseCommandLine(['--databse', 'mysql'])).toThrow(/Unknown option '--databse'.*--help/)
    try {
      parseCommandLine(['x', '--db', 'oracle', '--stack', 'mobile', '--security', 'sso'])
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(ArgsError)
      const problems = (error as ArgsError).problems
      expect(problems).toEqual([
        '--stack "mobile" is not a choice. Use one of: full, api',
        '--security "sso" is not a choice. Use a comma list of: 2fa, verification, passkeys, registration, or none',
        '--db "oracle" is not a choice. Use one of: mysql, postgres, sqlite',
      ])
    }
  })

  it('refuses two different names and extra positionals', () => {
    expect(() => parseCommandLine(['a', '--name', 'b'])).toThrow(/two different names/)
    expect(() => parseCommandLine(['a', 'sqlite'])).toThrow(/unexpected extra argument "sqlite"/)
  })

  it('recognises help, version and the resume command', () => {
    expect(parseCommandLine(['--help']).command).toBe('help')
    expect(parseCommandLine(['-v']).command).toBe('version')
    const resume = parseCommandLine(['--resume', 'C:\\code\\my-app'])
    expect(resume.command).toBe('resume')
    expect(resume.resumeDirectory).toBe('C:\\code\\my-app')
  })
})

describe('flags swallowed by npm (options before "--")', () => {
  it('finds our flags in npm_config_* variables, including npm\'s --auth → auth-type expansion', () => {
    const env = {
      npm_config_user_agent: NPM,
      npm_config_db: 'sqlite',
      npm_config_auth_type: 'none',
      npm_config_git: 'false',
      npm_config_teams: 'true',
      npm_config_install: '', // not ours: ignored
    }
    expect(findSwallowedFlags(env)).toEqual([
      { flag: 'auth', value: 'none' },
      { flag: 'teams', value: 'true' },
      { flag: 'db', value: 'sqlite' },
      { flag: 'git', value: 'false' },
    ])
  })

  it('prints the corrected command with "--" and the npx form', () => {
    const message = swallowedFlagsMessage({ npm_config_user_agent: NPM, npm_config_db: 'sqlite', npm_config_git: 'false' }, ['my-app', 'sqlite'])
    expect(message).toContain('npm create strutvane@latest my-app -- --db sqlite --no-git')
    expect(message).toContain('npx create-strutvane@latest my-app --db sqlite --no-git')
  })

  // Regression (class: npm's real traces, not guessed ones). Recorded with real npm 11.19.0,
  // `npm create` against a local package, no "--" (2026-11-15):
  // - `--db sqlite` (space) leaves npm_config_db=true and "sqlite" as a stray positional; the
  //   old check refused "true" as a value, so no corrected command was printed, and for free-text
  //   flags it printed a WRONG one (`-- --db-host true`);
  // - `--git` / `--editor` (npm's own string settings) leave the variable EMPTY; the old code read
  //   empty as "--no-git", the opposite of what was typed;
  // - `--pwa` is split by npm into -p -w -a (parseable, workspace) and the installer ran inside a
  //   new folder named "--all": the traces are npm_config_parseable=true and "workspaces/true".
  describe('what real npm leaves behind', () => {
    const AGENT = 'npm/11.19.0 node/v24.21.0 win32 x64 workspaces/false'

    it('`--db sqlite`: the value is taken back from the stray positional', () => {
      const message = swallowedFlagsMessage({ npm_config_user_agent: AGENT, npm_config_db: 'true' }, ['my-app', 'sqlite'])
      expect(message).toContain('npm create strutvane@latest my-app -- --db sqlite')
    })

    it('a free-text flag is never rebuilt with the value "true"', () => {
      const message = swallowedFlagsMessage({ npm_config_user_agent: AGENT, npm_config_db_host: 'true' }, ['my-app', 'db.example.com'])
      expect(message).toContain('-- --db-host db.example.com')
      expect(message).not.toContain('--db-host true')
    })

    it('two value flags: the words npm left behind are listed, never guessed into the wrong flag', () => {
      const message = swallowedFlagsMessage({ npm_config_user_agent: AGENT, npm_config_db: 'true', npm_config_design: 'true' }, ['my-app', 'sqlite', 'vivid']) ?? ''
      expect(message).toMatch(/--design <value> --db <value>|--db <value> --design <value>/)
      expect(message).toContain('npm left these words behind: sqlite, vivid')
    })

    it('`--git` and `--editor` leave an empty value: that means yes, not --no-git', () => {
      const message = swallowedFlagsMessage({ npm_config_user_agent: AGENT, npm_config_git: '', npm_config_editor: '' }, ['my-app']) ?? ''
      expect(message).toContain('-- --git --editor')
      expect(message).not.toContain('--no-git')
      expect(swallowedFlagsMessage({ npm_config_user_agent: AGENT, npm_config_git: 'false' }, ['my-app'])).toContain('-- --no-git')
      // A flag npm does not know: --no-teams is stored as an empty value (verified for all 13).
      expect(swallowedFlagsMessage({ npm_config_user_agent: AGENT, npm_config_teams: '', npm_config_pwa: '' }, ['my-app'])).toContain('-- --no-teams --no-pwa')
      expect(swallowedFlagsMessage({ npm_config_user_agent: AGENT, npm_config_teams: 'true' }, ['my-app'])).toContain('-- --teams')
    })

    it('`--pwa` (npm reads -p -w -a): recognised from its traces before anything is written', () => {
      const message = swallowedFlagsMessage({ npm_config_user_agent: 'npm/11.19.0 node/v24.21.0 win32 x64 workspaces/true', npm_config_parseable: 'true' }, ['my-app'])
      expect(message).toContain('-- --pwa')
    })

    it('`--feature-option a=b` leaves its value behind too', () => {
      const message = swallowedFlagsMessage({ npm_config_user_agent: AGENT, npm_config_feature_option: 'true' }, ['my-app', 'billing.provider=paddle'])
      expect(message).toContain('-- --feature-option billing.provider=paddle')
    })

    it('the installer stops with that message (exit 1, nothing created) when it got a stray word', async () => {
      const cwd = tempFolder()
      const { environment, output } = fakeEnvironment({ cwd, argv: ['my-app', 'sqlite'], env: { npm_config_user_agent: AGENT, npm_config_db: 'true' } })
      expect(await main(environment)).toBe(1)
      expect(output()).toContain('-- --db sqlite')
      expect(existsSync(join(cwd, 'my-app'))).toBe(false)
    })
  })

  it('ignores npm\'s own git setting (a path) and anything not started by npm', () => {
    expect(findSwallowedFlags({ npm_config_user_agent: NPM, npm_config_git: 'C:\\Program Files\\Git\\cmd\\git.exe' })).toEqual([])
    expect(findSwallowedFlags({ npm_config_db: 'sqlite' })).toEqual([])
    expect(findSwallowedFlags({ npm_config_user_agent: 'pnpm/10', npm_config_db: 'sqlite' })).toEqual([])
  })
})
