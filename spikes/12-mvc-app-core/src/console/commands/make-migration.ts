import { StrutvaneError } from '../../support/errors.ts'
import { kebabCase, pascalCase, singular } from '../../support/str.ts'
import { defineCommand } from '../command.ts'
import { writeIfMissing, writeNewFile } from '../files.ts'
import { factoryStub, migrationStub, modelStub, seederStub, type StubNames } from '../stubs.ts'

const MIGRATION_NAME = /^[a-z][a-z0-9_]*$/

/**
 * `node strut make:migration create_posts_table [--seeder] [--factory]`.
 *
 * Writes the migration in spike 10's format (create / alter / blank, chosen from the name), and
 * for a `create_*_table` migration **always** writes the model too (Strutvane's flow: one table,
 * one model). `--seeder` and `--factory` add those files. Existing files are never overwritten.
 *
 * @example
 * node strut make:migration create_posts_table --seeder
 */
export const makeMigrationCommand = defineCommand({
  name: 'make:migration',
  description: 'Create a migration (and the model, for create_*_table)',
  needsBoot: false,
  arguments: [{ name: 'name', description: 'snake_case, for example create_posts_table or add_subtitle_to_posts_table', required: true }],
  options: {
    seeder: { type: 'boolean', short: 's', description: 'Also create database/seeders/<model>.seeder.ts' },
    factory: { type: 'boolean', short: 'f', description: 'Also create database/factories/<model>.factory.ts' },
  },
  help: ['Examples:', '  node strut make:migration create_posts_table --seeder', '  node strut make:migration add_subtitle_to_posts_table'],
  run({ app, args, options, output, now }) {
    const name = checkedName(args[0] ?? '')
    const migration = writeNewFile(app.basePath, `database/migrations/${timestamp(now())}_${name}.ts`, migrationStub(name), false)
    output.line(`  Created ${migration}`)
    const table = tableOf(name)
    if (table === undefined) {
      if (options.seeder || options.factory) throw new StrutvaneError('NO_TABLE_IN_NAME', `Can't tell which table "${name}" is about, so no seeder or factory was written.`, 'Name it create_<table>_table or add_<column>_to_<table>_table, or run make:migration again without --seeder/--factory.')
      return
    }
    const names = namesForTable(table)
    if (name.startsWith('create_')) {
      const model = writeIfMissing(app.basePath, `app/models/${names.singular}.ts`, modelStub(names))
      output.line(model === undefined ? `  Kept app/models/${names.singular}.ts (it already exists)` : `  Created ${model}`)
    }
    if (options.seeder) output.line(`  Created ${writeNewFile(app.basePath, `database/seeders/${names.singular}.seeder.ts`, seederStub(names), false)}`)
    if (options.factory) output.line(`  Created ${writeNewFile(app.basePath, `database/factories/${names.singular}.factory.ts`, factoryStub(names), false)}`)
    output.line('')
    output.line('  Next: add your columns to the migration, then run `node strut migrate`.')
    if (options.seeder) output.line(`  Then call ${names.model}Seeder from database/seeders/database.seeder.ts.`)
  },
})

function checkedName(name: string): string {
  if (MIGRATION_NAME.test(name)) return name
  const suggestion = name.trim().replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/[^a-zA-Z0-9]+/g, '_').toLowerCase()
  throw new StrutvaneError('INVALID_MIGRATION_NAME', `"${name}" is not a valid migration name.`, `Use snake_case letters, digits and underscores, for example: node strut make:migration ${suggestion === '' ? 'create_posts_table' : suggestion}`)
}

/** The table a migration name is about, or `undefined` for free-form names. */
function tableOf(name: string): string | undefined {
  return /^create_([a-z0-9_]+?)_table$/.exec(name)?.[1] ?? /_(?:to|from|in|on)_([a-z0-9_]+?)_table$/.exec(name)?.[1]
}

function namesForTable(table: string): StubNames {
  const model = pascalCase(singular(table))
  return { model, singular: kebabCase(model), variable: `${model.charAt(0).toLowerCase()}${model.slice(1)}`, table }
}

/** `2026_11_14_093000`: Laravel's sortable prefix, in UTC so every machine agrees on the order. */
function timestamp(at: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${at.getUTCFullYear()}_${pad(at.getUTCMonth() + 1)}_${pad(at.getUTCDate())}_${pad(at.getUTCHours())}${pad(at.getUTCMinutes())}${pad(at.getUTCSeconds())}`
}
