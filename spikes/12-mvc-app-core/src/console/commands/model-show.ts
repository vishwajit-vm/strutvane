import { isInternalResource, MetadataToken } from '../../database/metadata.ts'
import { StrutvaneError } from '../../support/errors.ts'
import { closestMatch } from '../../support/str.ts'
import { defineCommand } from '../command.ts'
import { renderTable } from '../table.ts'

/**
 * `node strut model:show Post`: a model's columns and what the API does with each, read from
 * `.strutvane/resources.json`. Laravel's `php artisan model:show`, without a database round trip.
 *
 * @example
 * node strut model:show Post
 * node strut model:show posts --json
 */
export const modelShowCommand = defineCommand({
  name: 'model:show',
  description: 'Show a model\'s columns, casts and API behaviour',
  arguments: [{ name: 'model', description: 'The model class (Post) or table (posts)', required: true }],
  options: { json: { type: 'boolean', description: 'Print JSON for scripts and agents' } },
  run({ app, args, options, output }) {
    const wanted = args[0] ?? ''
    const metadata = app.make(MetadataToken)
    const resource = metadata.resources.find((entry) => entry.model === wanted || entry.table === wanted)
    if (resource === undefined) {
      const suggestion = closestMatch(wanted, metadata.resources.flatMap((entry) => [entry.model, entry.table]))
      throw new StrutvaneError('UNKNOWN_MODEL', `There is no "${wanted}" model.`, suggestion === undefined ? `Models: ${metadata.resources.map((entry) => entry.model).join(', ')}.` : `Did you mean "${suggestion}"?`)
    }
    if (options.json) {
      output.line(JSON.stringify(resource, null, 2))
      return
    }
    output.line(`\n  ${resource.model}  (table ${resource.table}${isInternalResource(resource) ? ', internal: never served by the auto API' : ''})`)
    output.line(`  Route key: ${resource.slug?.field ?? resource.primaryKey} · Soft deletes: ${resource.softDeletes ? 'yes' : 'no'} · Default sort: ${resource.defaultSort}\n`)
    const rows = resource.fields.map((field) => [field.name, field.cast + (field.nullable ? '?' : ''), flag(field.fillable && !field.hidden), flag(field.hidden), field.searchable === false ? '' : field.searchable, flag(field.sortable), field.filterOperators.join(',')])
    output.line(renderTable(['Column', 'Cast', 'Fillable', 'Hidden', 'Search', 'Sort', 'Filters'], rows))
  },
})

function flag(value: boolean): string {
  return value ? 'yes' : ''
}
