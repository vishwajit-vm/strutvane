/**
 * The last screen: "Ready" with the URL, the first admin and the three commands, or "Setup is not
 * finished" with exactly what is left and the one command that finishes it.
 *
 * @module
 */
import { join } from 'node:path'
import { answersOf, DATABASE_LABELS, designInfo, type Design, otherDesign, type ProjectOptions } from './options.ts'
import { parseEnv } from './env-file.ts'
import { QUESTIONS } from './question-registry.ts'
import type { StepId } from './setup-state.ts'
import { readEnvFile } from './steps/env-io.ts'
import type { ShowOnce } from './steps/types.ts'

/**
 * The same project as one non-interactive command, so it can be repeated (or pasted into CI).
 * Built from the registry: every question that applies writes its own flag, so a new question is
 * never missing here. The opener (Recommended/Custom) is left out: with `--yes` it changes nothing.
 *
 * @example
 * equivalentCommand(options)
 * // 'npm create strutvane@latest my-app -- --stack full --design crisp --ui admin --auth email ... --yes'
 */
export function equivalentCommand(options: ProjectOptions): string {
  const answers = answersOf(options)
  const words = QUESTIONS.filter((q) => q.id !== 'mode' && q.when(answers)).flatMap((q) => q.flagWords(answers))
  return `npm create strutvane@latest ${options.name} -- ${[...words, '--yes'].join(' ')}`
}

/**
 * The "Restyle" next step: where your own colours go, and how to switch to another design.
 * Why in the summary: the design was picked in a few seconds, so say right away it is not final.
 */
function restyleLine(design: Design): string {
  const other = otherDesign(design)
  const switchHint = other === undefined ? '' : `, or switch: node strut design:use ${other}`
  return `${'Restyle:'.padEnd(13)}resources/ui/theme.css${switchHint}`
}

/** How the database reads in the summary. */
function databaseLine(options: ProjectOptions, env: Map<string, string>): string {
  if (options.database === 'sqlite') return `SQLite (${env.get('DB_DATABASE') ?? 'database/database.sqlite'})`
  if (options.docker) {
    // What the host sees (for a GUI client); the app itself uses the "db" service name.
    return `${DATABASE_LABELS[options.database]} in Docker, 127.0.0.1:${env.get('FORWARD_DB_PORT') ?? '?'}/${env.get('DB_DATABASE') ?? ''}`
  }
  return `${DATABASE_LABELS[options.database]}, ${env.get('DB_HOST') ?? '?'}:${env.get('DB_PORT') ?? '?'}/${env.get('DB_DATABASE') ?? ''}`
}

/**
 * The lines of the "Ready" box.
 *
 * @param showOnce - values to show exactly once (the new admin's one-time password). Only passed
 *   in an interactive terminal: CI logs are kept and shared, so a password must never land there.
 *
 * @example
 * readyLines(options, [{ label: 'Password', value: 'q7Vd-3kPz-Xm2c-8RtL' }])
 */
export function readyLines(options: ProjectOptions, showOnce: readonly ShowOnce[], typedUsed = true): string[] {
  const env = parseEnv(readEnvFile(options.directory))
  const lines = [`${'App'.padEnd(13)}${env.get('APP_URL') ?? ''}`, `${'Database'.padEnd(13)}${databaseLine(options, env)}`]
  if (options.design !== undefined) lines.push(`${'Design'.padEnd(13)}${options.design} (${designInfo(options.design).packageName})`)
  if (options.docker) lines.push(`${'Mail inbox'.padEnd(13)}http://localhost:${env.get('FORWARD_MAILPIT_PORT') ?? '8025'}`)
  const email = env.get('SEED_ADMIN_EMAIL') ?? ''
  if (options.auth === 'email') {
    lines.push(`${'Admin'.padEnd(13)}${email}`)
    for (const value of showOnce) {
      lines.push(`${value.label.padEnd(13)}${value.value}   (shown once; change it at first sign-in)`)
    }
    if (showOnce.length === 0) {
      lines.push(
        options.adminPasswordMode === 'type' && typedUsed
          ? `${'Password'.padEnd(13)}the one you typed (never saved in a file)`
          : `${'Password'.padEnd(13)}not shown here. Set one with: node strut user:password ${email}`,
      )
    }
  }
  if (options.auth === 'magic-link') lines.push(`${'Admin'.padEnd(13)}${email} (signs in with an emailed link; no password)`)
  if (options.auth === 'none') {
    // No sign-in is still deny by default: say how to get the token the API now requires.
    lines.push(`${'API'.padEnd(13)}every request needs an API token. Create one: node strut token:create`)
  }
  lines.push(
    '',
    `${'Every day:'.padEnd(13)}cd ${options.name}; npm run dev`,
    `${'Commands:'.padEnd(13)}node strut help`,
    ...(options.design === undefined ? [] : [restyleLine(options.design)]),
    `${'Teammates:'.padEnd(13)}npm run setup   (after git clone)`,
    '',
    'The same project without questions:',
    equivalentCommand(options),
  )
  return lines
}

/**
 * The lines of the "Setup is not finished" box.
 *
 * @example
 * unfinishedLines(options, ['database', 'migrate'])
 */
export function unfinishedLines(options: ProjectOptions, unfinished: readonly StepId[]): string[] {
  return [
    `The project is in ${options.directory}, but these steps are not done: ${unfinished.join(', ')}.`,
    `Progress is saved in ${join('.strutvane', 'setup.json')}. Fix the cause shown above, then run:`,
    '',
    `  cd ${options.name}; npm run setup`,
    '',
    'Setup continues from the first unfinished step.',
  ]
}
