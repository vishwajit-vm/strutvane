import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { StrutvaneError } from '../../support/errors.ts'
import { kebabCase, pascalCase, plural, snakeCase } from '../../support/str.ts'
import { defineCommand } from '../command.ts'
import { writeIfMissing, writeNewFile } from '../files.ts'
import { modelControllerStub, plainControllerStub, policyStub, resourceControllerStub, type StubNames } from '../stubs.ts'

const CONTROLLER_NAME = /^[A-Z][A-Za-z0-9]*Controller$/
const MODEL_NAME = /^[A-Z][A-Za-z0-9]*$/

/**
 * `node strut make:controller PostController [--resource|--api|--model=Post]`, Laravel's
 * `make:controller`.
 *
 * - no flag: an empty controller;
 * - `--model=Post`: a `ResourceController` subclass (all five API actions inherited);
 * - `--resource` / `--api`: every action written out (7 or 5), each calling `authorize()` first.
 *
 * Model-bound variants also write the policy if it doesn't exist (denying all but admins).
 *
 * @example
 * node strut make:controller PostController --resource
 */
export const makeControllerCommand = defineCommand({
  name: 'make:controller',
  description: 'Create a new controller class',
  needsBoot: false,
  arguments: [{ name: 'name', description: 'The class name, ending in Controller (PostController)', required: true }],
  options: {
    resource: { type: 'boolean', short: 'r', description: 'Write all 7 resource actions (index, create, store, show, edit, update, destroy)' },
    api: { type: 'boolean', description: 'Write the 5 API actions (no create/edit form pages)' },
    model: { type: 'string', short: 'm', description: 'Inherit the API actions from ResourceController for this model' },
    force: { type: 'boolean', description: 'Overwrite the file if it exists' },
  },
  help: [
    'Examples:',
    '  node strut make:controller ReportController',
    '  node strut make:controller PostController --resource',
    '  node strut make:controller PostController --api',
    '  node strut make:controller PostController --model=Post',
  ],
  run({ app, args, options, output }) {
    const className = checkedControllerName(args[0] ?? '')
    if (options.resource && options.api) throw new StrutvaneError('CONFLICTING_OPTIONS', '--resource and --api can\'t be used together.', 'Use --resource for 7 actions (with form pages) or --api for 5.')
    const file = `app/http/controllers/${kebabCase(className.replace(/Controller$/, ''))}.controller.ts`
    const modelBound = options.resource || options.api || options.model !== undefined
    if (!modelBound) {
      output.line(`  Created ${writeNewFile(app.basePath, file, plainControllerStub(className), options.force)}`)
      return
    }
    const names = namesFor(options.model ?? className.replace(/Controller$/, ''))
    const source = options.model !== undefined && !options.resource && !options.api ? modelControllerStub(className, names) : resourceControllerStub(className, names, options.api)
    output.line(`  Created ${writeNewFile(app.basePath, file, source, options.force)}`)
    const policy = writeIfMissing(app.basePath, `app/policies/${names.singular}.policy.ts`, policyStub(names))
    if (policy !== undefined) output.line(`  Created ${policy} (denies everyone but admins until you edit it)`)
    if (!existsSync(join(app.basePath, 'app', 'models', `${names.singular}.ts`))) {
      output.line(`  Note: app/models/${names.singular}.ts doesn't exist yet. Create it with: node strut make:migration create_${names.table}_table`)
    }
    const method = options.api || options.model !== undefined ? 'apiResource' : 'resource'
    output.line('')
    output.line(`  Next: route it in routes/${method === 'apiResource' ? 'api' : 'web'}.ts:`)
    output.line(`    Route.${method}('${names.table}', ${className})`)
    output.line(`  and bind the model in bootstrap/app.ts: withRouting({ bindings: { ${names.singular}: ${names.model} } })`)
  },
})

function checkedControllerName(name: string): string {
  if (CONTROLLER_NAME.test(name)) return name
  const suggestion = `${pascalCase(snakeCase(name.replace(/controller$/i, '')))}Controller`
  throw new StrutvaneError('INVALID_CONTROLLER_NAME', `"${name}" is not a controller class name.`, `Use PascalCase ending in "Controller", for example: node strut make:controller ${suggestion === 'Controller' ? 'PostController' : suggestion}`)
}

function namesFor(model: string): StubNames {
  if (!MODEL_NAME.test(model)) throw new StrutvaneError('INVALID_MODEL_NAME', `"${model}" is not a model class name.`, 'Use PascalCase, for example --model=Post.')
  const singular = snakeCase(model)
  return { model, singular: kebabCase(model), variable: `${model.charAt(0).toLowerCase()}${model.slice(1)}`, table: plural(singular) }
}
