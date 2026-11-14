/**
 * The "choose a design" question (project lead decision, 2026-11-15): the React UI's look ships as
 * separate design packages on top of @strutvane/ui. Crisp is the default, Vivid the alternative.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ArgsError, helpText, parseCommandLine } from '../src/args.ts'
import { main } from '../src/main.ts'
import { DESIGNS, DESIGN_NAMES, type Design, OptionsError, type ProjectOptions, resolveOptions } from '../src/options.ts'
import { askMissing, pruneAnswers, review, reviewLines } from '../src/questions.ts'
import { loadState } from '../src/setup-state.ts'
import { findSwallowedFlags } from '../src/swallowed-flags.ts'
import { renderProject } from '../src/templates/project.ts'
import { fakeEnvironment, scriptedPrompter, tempFolder } from './helpers/fakes.ts'
import { fakePrograms } from './helpers/programs.ts'

const context = { cwd: '/code', targetProblem: () => undefined }

const options = (extra: Parameters<typeof resolveOptions>[0] = {}): ProjectOptions =>
  resolveOptions({ name: 'acme-portal', ...extra }, '/code')

const file = (project: ReturnType<typeof renderProject>, path: string): string => {
  const found = project.find((f) => f.path === path)
  if (found === undefined) throw new Error(`${path} was not generated`)
  return found.content
}

/** Answers for every question except the one under test, so the scripted prompter never stalls. */
const REST = {
  name: 'my-app',
  mode: 'recommended',
  stack: 'full',
  auth: 'none',
  database: 'sqlite',
  docker: 'host',
  agents: false,
}

describe('the design list', () => {
  it('has Crisp first (the default) and Vivid, each with its own package and a short label', () => {
    expect(DESIGN_NAMES).toEqual(['crisp', 'vivid'])
    expect(DESIGNS.map((d) => d.packageName)).toEqual(['@strutvane/design-crisp', '@strutvane/design-vivid'])
    expect(DESIGNS[0].label).toMatch(/^Crisp\s+Clean, minimal and business-first \(recommended\)$/)
    // Labels fit an 80-column terminal (the Laravel Prompts rule used by every question).
    for (const design of DESIGNS) expect(design.label.length, design.value).toBeLessThanOrEqual(74)
  })

  it('defaults to crisp for a full-stack project and has no design for an API-only one', () => {
    expect(options().design).toBe('crisp')
    expect(options({ ui: 'blank' }).design).toBe('crisp')
    expect(options({ design: 'vivid' }).design).toBe('vivid')
    expect(options({ stack: 'api' }).design).toBeUndefined()
  })
})

describe('--design flag', () => {
  it('parses crisp and vivid, and leaves the answer out when not given', () => {
    expect(parseCommandLine(['a', '--design', 'vivid']).answers).toEqual({ name: 'a', design: 'vivid' })
    expect(parseCommandLine(['a', '--design', 'crisp']).answers.design).toBe('crisp')
    expect(parseCommandLine(['a']).answers.design).toBeUndefined()
  })

  it('refuses an unknown design and lists the valid ones', () => {
    expect(() => parseCommandLine(['a', '--design', 'glass'])).toThrow(ArgsError)
    expect(() => parseCommandLine(['a', '--design', 'glass'])).toThrow('--design "glass" is not a choice. Use one of: crisp, vivid')
  })

  it('refuses --design with --stack api, like --ui (an API has no UI to style)', async () => {
    expect(() => options({ stack: 'api', design: 'vivid' })).toThrow(OptionsError)
    expect(() => options({ stack: 'api', design: 'vivid' })).toThrow(/no UI to style: drop --design, or use --stack full/)
    const { environment, output } = fakeEnvironment({ cwd: tempFolder(), argv: ['acme', '--stack', 'api', '--design', 'vivid', '--yes'] })
    expect(await main(environment)).toBe(1)
    expect(output()).toMatch(/drop --design, or use --stack full/)
  })

  it('is in the help text with its default', () => {
    expect(helpText('x')).toMatch(/--design crisp\|vivid\s+Look of the React UI \(a design package\)\s+\[crisp\]/)
  })

  it('is recognised when npm swallowed it (no -- before the flags)', () => {
    const env = { npm_config_user_agent: 'npm/11.19.0 node/v24.21.0 win32 x64', npm_config_design: 'vivid' }
    expect(findSwallowedFlags(env)).toEqual([{ flag: 'design', value: 'vivid' }])
  })
})

describe('the design question', () => {
  it('is asked right after "What are you building?" (blueprint row 3, before the UI starter), in both modes', async () => {
    const recommended = scriptedPrompter({ ...REST, design: 'vivid' })
    const answers = await askMissing({}, recommended.prompter, context)
    expect(recommended.asked.slice(0, 4)).toEqual(['name', 'mode', 'stack', 'design'])
    expect(answers.design).toBe('vivid')
    const custom = scriptedPrompter({ ...REST, mode: 'custom', design: 'crisp', ui: 'admin' })
    await askMissing({}, custom.prompter, context).catch(() => undefined) // later custom questions are not scripted
    expect(custom.asked.slice(2, 5)).toEqual(['stack', 'design', 'ui'])
  })

  it('is never asked for an API-only project', async () => {
    const { prompter, asked } = scriptedPrompter({ ...REST, stack: 'api' })
    const answers = await askMissing({}, prompter, context)
    expect(asked).not.toContain('design')
    expect(answers.design).toBeUndefined()
  })

  it('is not asked when --design was given', async () => {
    const { prompter, asked } = scriptedPrompter(REST)
    await askMissing({ design: 'vivid' }, prompter, context)
    expect(asked).not.toContain('design')
  })
})

describe('review screen', () => {
  it('shows the design and its package, including the default', () => {
    expect(reviewLines({ name: 'my-app' }, '/code').join('\n')).toMatch(/^Design\s+crisp \(@strutvane\/design-crisp\)$/m)
    expect(reviewLines({ name: 'my-app', design: 'vivid' }, '/code').join('\n')).toMatch(/^Design\s+vivid \(@strutvane\/design-vivid\)$/m)
    expect(reviewLines({ name: 'my-app', stack: 'api' }, '/code').join('\n')).not.toMatch(/^Design/m)
  })

  it('"Change an answer" can revisit the design', async () => {
    const { prompter, asked, notes } = scriptedPrompter({ review: ['change', 'create'], change: 'design', design: 'vivid' })
    const given = { name: 'my-app', mode: 'recommended', stack: 'full', auth: 'none', database: 'sqlite', docker: false, agents: false } as const
    const answers = await review({ ...given, design: 'crisp' }, prompter, context)
    expect(answers.design).toBe('vivid')
    expect(asked).toEqual(['review', 'change', 'design', 'review'])
    expect(notes[1]?.lines.join('\n')).toMatch(/Design\s+vivid/)
  })

  it('drops the design when the stack changes to API only', () => {
    expect(pruneAnswers({ stack: 'api', design: 'vivid' })).toEqual({ stack: 'api' })
  })
})

describe('generated files per design', () => {
  it.each(DESIGN_NAMES)('%s: package.json dependency, lockfile link, stub, config/ui.ts, theme.css and README', (design: Design) => {
    const project = renderProject(options({ design }))
    const other = DESIGN_NAMES.find((name) => name !== design)
    const packageName = `@strutvane/design-${design}`

    // Pinned like @strutvane/framework: a local stub link that the shipped lockfile matches.
    const manifest = JSON.parse(file(project, 'package.json')) as { dependencies: Record<string, string> }
    expect(manifest.dependencies[packageName]).toBe(`file:stubs/strutvane-design-${design}`)
    expect(Object.keys(manifest.dependencies).filter((name) => name.startsWith('@strutvane/design-'))).toEqual([packageName])
    const lock = JSON.parse(file(project, 'package-lock.json')) as { packages: Record<string, Record<string, unknown>> }
    expect(lock.packages['']?.['dependencies']).toEqual(manifest.dependencies)
    expect(lock.packages[`node_modules/${packageName}`]).toEqual({ resolved: `stubs/strutvane-design-${design}`, link: true })
    expect(JSON.parse(file(project, `stubs/strutvane-design-${design}/package.json`))).toMatchObject({ name: packageName })

    const config = file(project, 'config/ui.ts')
    expect(config).toContain(`design: '${design}',`)
    expect(config).toContain(`node strut design:use ${other}`)
    expect(config).toContain('resources/ui/theme.css')
    expect(config).toMatch(/^\/\/ /) // starts with the friendly comment

    const theme = file(project, 'resources/ui/theme.css')
    expect(theme).toContain(packageName)
    // Every override is commented out: a fresh app looks exactly like the chosen design.
    const active = theme.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(active).not.toMatch(/--[a-z-]+\s*:/)
    for (const token of ['--brand-hue', '--font-sans', '--radius']) expect(theme).toContain(token)

    const readme = file(project, 'README.md')
    expect(readme).toContain(`## Design`)
    expect(readme).toContain(`**${design}** design (\`${packageName}\``)
    expect(readme).toContain(`node strut design:use ${other}`)
  })

  it('an API-only project has no design dependency, config/ui.ts or theme.css', () => {
    const project = renderProject(options({ stack: 'api' }))
    const paths = project.map((f) => f.path)
    expect(paths).not.toContain('config/ui.ts')
    expect(paths).not.toContain('resources/ui/theme.css')
    expect(paths.some((p) => p.startsWith('stubs/strutvane-design-'))).toBe(false)
    expect(file(project, 'package.json')).not.toContain('design-')
    expect(file(project, 'README.md')).not.toContain('## Design')
  })
})

describe('--yes path (no questions)', () => {
  it('installs Crisp, writes it to the files and setup.json, and names it in the summary', async () => {
    const cwd = tempFolder()
    const world = fakePrograms()
    const { environment, output } = fakeEnvironment({ cwd, argv: ['acme', '--yes', '--db', 'sqlite'], spawn: world.spawn })
    expect(await main(environment)).toBe(0)
    const directory = join(cwd, 'acme')
    const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as { dependencies: Record<string, string> }
    expect(manifest.dependencies['@strutvane/design-crisp']).toBe('file:stubs/strutvane-design-crisp')
    expect(readFileSync(join(directory, 'config', 'ui.ts'), 'utf8')).toContain("design: 'crisp',")
    expect(existsSync(join(directory, 'resources', 'ui', 'theme.css'))).toBe(true)
    expect(loadState(directory).options.design).toBe('crisp')
    expect(output()).toMatch(/Design\s+crisp \(@strutvane\/design-crisp\)/)
    expect(output()).toMatch(/Restyle:\s+resources\/ui\/theme\.css, or switch: node strut design:use vivid/)
    expect(output()).toContain('--stack full --design crisp --ui admin --auth')
  })

  it('--design vivid --yes installs Vivid instead', async () => {
    const cwd = tempFolder()
    const { environment, output } = fakeEnvironment({ cwd, argv: ['acme', '--yes', '--db', 'sqlite', '--design', 'vivid'], spawn: fakePrograms().spawn })
    expect(await main(environment)).toBe(0)
    expect(readFileSync(join(cwd, 'acme', 'config', 'ui.ts'), 'utf8')).toContain("design: 'vivid',")
    expect(readFileSync(join(cwd, 'acme', 'package.json'), 'utf8')).toContain('@strutvane/design-vivid')
    expect(output()).toMatch(/switch: node strut design:use crisp/)
  })
})
