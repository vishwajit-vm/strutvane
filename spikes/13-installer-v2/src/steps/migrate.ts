/**
 * Step "migrate": run the app's own `node strut migrate --seed`.
 *
 * Why call the app instead of migrating from the installer: the app's CLI is what developers run
 * every day, so setup exercises the exact same code path (and package migrations the app
 * installed). The contract with `node strut`:
 * - without Docker: spawned as `<node> strut.js migrate --seed`, cwd = the project, no shell;
 * - Docker mode: `docker compose -p <app> ... exec -T -e STRUT_SEED_ADMIN_PASSWORD app node strut
 *   migrate --seed` (inside the app container, where STRUTVANE_IN_CONTAINER=1 stops forwarding);
 * - the first admin's one-time password travels only in STRUT_SEED_ADMIN_PASSWORD (environment);
 *   the seeder prints "Admin created: <email>" when it used it;
 * - exit 0 = migrated and seeded; exit 3 = database unreachable; anything else = failed;
 * - all output goes to the setup log (password redacted); the last lines are shown on failure.
 *
 * @module
 */
import { lastLines } from '../spawn.ts'
import { execInApp } from './compose.ts'
import { failed, type Step } from './types.ts'

/** The exit code `node strut` uses for "cannot reach the database". */
export const EXIT_DATABASE_UNREACHABLE = 3

/** The environment variable that carries the first admin's one-time password to the seeder. */
export const ADMIN_PASSWORD_VARIABLE = 'STRUT_SEED_ADMIN_PASSWORD'

/**
 * The migrate step.
 *
 * @example
 * await migrateStep.run(context) // { status: 'done', message: 'Migrations run (3 new, 3 total); Database seeded (1 record ensured)' }
 */
export const migrateStep: Step = {
  id: 'migrate',
  title: 'Running migrations and seeders (node strut migrate --seed)',
  needs: () => ['install', 'database'],
  applies: () => true,
  run: async (context) => {
    // The first admin's one-time password: made here, handed over in the child's environment only
    // (never argv, never .env), hidden in the log, and shown once at the end (security review F-18).
    const typed = context.typedAdminPassword
    const adminPassword = typed ?? context.generatePassword()
    const env = { [ADMIN_PASSWORD_VARIABLE]: adminPassword }
    // Docker mode: inside the app container (`-e NAME` copies the value from our environment).
    const result = context.options.docker
      ? await execInApp(context, ['node', 'strut', 'migrate', '--seed'], { env, redact: [adminPassword] })
      : await context.spawn({
          command: context.execPath,
          args: ['strut.js', 'migrate', '--seed'],
          cwd: context.directory,
          env,
          logFile: context.logFile,
          redact: [adminPassword],
        })
    if (result.code === 0) {
      const lines = result.output.split(/\r?\n/)
      const summary = lines.filter((line) => /^(Migrations run|Database seeded|Admin )/.test(line)).join('; ')
      const message = summary.length > 0 ? summary : 'Migrations and seeders run'
      // Only a newly created admin gets this password; an existing one keeps theirs.
      const created = lines.some((line) => line.startsWith('Admin created:'))
      // A typed password is already known to its owner, and email-link sign-in has no password
      // to show: in both cases nothing is shown.
      const show = created && typed === undefined && context.options.auth === 'email'
      return show
        ? { status: 'done', message, showOnce: { label: 'Password', value: adminPassword } }
        : { status: 'done', message }
    }
    const details = lastLines(result.output, 8)
    if (result.code === EXIT_DATABASE_UNREACHABLE) {
      return failed(
        'database-unreachable',
        'The database could not be reached, so migrations did not run.',
        'Start the database (Docker: node strut services:up), check DB_* in .env, then choose Retry.',
        details,
      )
    }
    return failed(
      'command-failed',
      `node strut migrate --seed failed (exit code ${result.code}).`,
      `A migration or seeder failed. Fix it, then run: npm run setup  (full log: ${context.logFile})`,
      details,
    )
  },
}
