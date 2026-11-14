/**
 * The file templates `make:*` writes, Laravel's stubs. Each takes names that were already
 * validated as identifiers, so nothing user-typed can break out of the generated code.
 *
 * Security rules baked in (security review F-02, F-10, F-11):
 * - generated policies deny everything except admins until the developer edits them;
 * - owned resource controllers call `authorize()` in every action;
 * - generated models list no writable columns (`fillable = []`) until the developer adds them.
 */

/** Names derived from one model, for the templates. */
export interface StubNames {
  /** `Post` */
  readonly model: string
  /** `post`, `blog-post` (file names and labels) */
  readonly singular: string
  /** `post`, `blogPost` (variable names) */
  readonly variable: string
  /** `posts` */
  readonly table: string
}

/**
 * A migration in spike 10's format, chosen from the name (create / alter / blank).
 *
 * @example
 * migrationStub('create_posts_table') // "…schema.create('posts', (t) => { t.id() … })"
 */
export function migrationStub(name: string): string {
  const header = "import { migration } from '#strutvane/schema'\n\nexport default migration({\n"
  const created = /^create_([a-z0-9_]+?)_table$/.exec(name)
  if (created?.[1] !== undefined) {
    const table = created[1]
    return `${header}  up(schema) {
    schema.create('${table}', (t) => {
      t.id()
      // Add your columns here, for example:
      // t.string('title', 200)
      // t.slug('slug').from('title')
      t.timestamps()
    })
  },
  down(schema) {
    schema.dropIfExists('${table}')
  },
})
`
  }
  const altered = /_(?:to|from|in|on)_([a-z0-9_]+?)_table$/.exec(name)
  if (altered?.[1] !== undefined) {
    const table = altered[1]
    return `${header}  up(schema) {
    schema.table('${table}', (t) => {
      // Add, rename or drop columns here.
    })
  },
  down(schema) {
    schema.table('${table}', (t) => {
      // Undo exactly what up() did, in reverse order.
    })
  },
})
`
  }
  return `${header}  up(schema) {},
  down(schema) {},
})
`
}

/**
 * A model with behaviour only; columns come from the migrations.
 *
 * @example
 * modelStub({ model: 'Post', singular: 'post', variable: 'post', table: 'posts' })
 */
export function modelStub(names: StubNames): string {
  return `import { Model } from '#strutvane/model'

/**
 * A ${names.singular}. Its columns come from database/migrations (run \`node strut migrate\` to
 * refresh the types); add relations, scopes and computed attributes here.
 */
export class ${names.model} extends Model('${names.table}') {
  /**
   * Columns the API may write. Empty on purpose: list the columns clients may send, and any
   * column you don't list stays read-only (owners, flags and timestamps are set by your code).
   */
  static override readonly fillable: readonly string[] = []
}
`
}

/**
 * A policy that denies everything except admins until edited (security review F-02).
 *
 * @example
 * policyStub({ model: 'Post', singular: 'post', variable: 'post', table: 'posts' })
 */
export function policyStub(names: StubNames): string {
  const record = names.variable
  return `import { hasAdminRole, type AuthUser, type Policy } from '#strutvane/auth'
import type { ${names.model} } from '../models/${names.singular}.ts'

/**
 * Who may do what with ${names.table}. Generated to deny everyone except admins: open up each
 * method deliberately. A method you delete also denies.
 */
export class ${names.model}Policy implements Policy<${names.model}> {
  /** Admins may do everything. */
  before(user: AuthUser | null): boolean | undefined {
    return hasAdminRole(user) ? true : undefined
  }

  /** TODO: who may list ${names.table}? */
  viewAny(_user: AuthUser | null): boolean {
    return false
  }

  /** TODO: who may see one ${record}? */
  view(_user: AuthUser | null, _${record}: ${names.model}): boolean {
    return false
  }

  /** TODO: who may create a ${record}? */
  create(_user: AuthUser | null): boolean {
    return false
  }

  /** TODO: who may change this ${record}? */
  update(_user: AuthUser | null, _${record}: ${names.model}): boolean {
    return false
  }

  /** TODO: who may delete this ${record}? */
  delete(_user: AuthUser | null, _${record}: ${names.model}): boolean {
    return false
  }
}
`
}

/**
 * An empty controller.
 *
 * @example
 * plainControllerStub('ReportController')
 */
export function plainControllerStub(className: string): string {
  return `import { Controller, type HttpContext } from '#strutvane/http'

/** TODO: say what this controller is for. */
export class ${className} extends Controller {
  // Add actions, then route them in routes/api.ts or routes/web.ts, for example:
  // Route.get('/reports', [${className}, 'index']).name('reports.index')
  index(ctx: HttpContext): Response {
    return ctx.json({ data: [] })
  }
}
`
}

/**
 * A controller that inherits all five API actions from `ResourceController`.
 *
 * @example
 * modelControllerStub('PostController', { model: 'Post', singular: 'post', variable: 'post', table: 'posts' })
 */
export function modelControllerStub(className: string, names: StubNames): string {
  return `import { ResourceController } from '#strutvane/http'
import { ${names.model} } from '../../models/${names.singular}.ts'
import { ${names.model}Policy } from '../../policies/${names.singular}.policy.ts'

/**
 * The ${names.table} API: index, show, store, update and destroy come from ResourceController
 * (search, sort, filters, pagination, validation, policies). Override any step here.
 */
export class ${className} extends ResourceController<typeof ${names.model}> {
  protected readonly model = ${names.model}
  protected readonly policy = new ${names.model}Policy()
}
`
}

/**
 * An owned resource controller: every action written out, and every action authorizes first
 * (security review F-11). `api` leaves out the `create` and `edit` form pages.
 *
 * @example
 * resourceControllerStub('PostController', { model: 'Post', singular: 'post', variable: 'post', table: 'posts' }, true)
 */
export function resourceControllerStub(className: string, names: StubNames, api: boolean): string {
  const { model, singular, table, variable } = names
  const formActions = api
    ? ''
    : `
  /** GET /${table}/create: what the React form page needs to build the form. */
  async create(ctx: HttpContext): Promise<Response> {
    await authorize(this.policy, 'create', ctx.user, undefined, '${singular}')
    return ctx.json({ data: { fields: formFields() } })
  }

  /** GET /${table}/{${singular}}/edit: the current values plus the form description. */
  async edit(ctx: HttpContext): Promise<Response> {
    const ${variable} = ctx.model(${model})
    await authorize(this.policy, 'update', ctx.user, ${variable}, '${singular}')
    return ctx.json({ data: ${variable}, meta: { fields: formFields() } })
  }
`
  const formHelper = api
    ? ''
    : `
/** The writable fields of the form, from the metadata. */
function formFields(): unknown[] {
  return ${model}.metadata().fields.filter((field) => !field.hidden && (${model}.fillable ?? []).includes(field.name))
}
`
  return `import { authorize } from '#strutvane/auth'
import { parseListQuery } from '#strutvane/database'
import { Controller, ValidationError, type HttpContext } from '#strutvane/http'
import { MetadataRequest } from '#strutvane/validation'
import { ${model} } from '../../models/${singular}.ts'
import { ${model}Policy } from '../../policies/${singular}.policy.ts'

/**
 * The ${table} controller. You own every line: each action checks the policy first, so a
 * request the policy doesn't allow gets a 403 before any data is read or written.
 */
export class ${className} extends Controller {
  protected readonly policy = new ${model}Policy()

  /** GET /${table}: one page, with ?search, ?sort, ?filter[…] and ?page. */
  async index(ctx: HttpContext): Promise<Response> {
    await authorize(this.policy, 'viewAny', ctx.user, undefined, '${singular}')
    const query = parseListQuery(${model}.metadata(), ctx.query)
    if (!query.ok) throw new ValidationError(query.issues)
    const page = await ${model}.paginate(query.request)
    return ctx.json({ data: page.data, meta: page.meta })
  }
${formActions}
  /** POST /${table} */
  async store(ctx: HttpContext): Promise<Response> {
    await authorize(this.policy, 'create', ctx.user, undefined, '${singular}')
    const input = await new MetadataRequest(${model}.metadata(), 'create', ${model}.fillable).validate(ctx)
    const ${variable} = await ${model}.createFromValidated(input)
    return ctx.json({ data: ${variable} }, 201)
  }

  /** GET /${table}/{${singular}} */
  async show(ctx: HttpContext): Promise<Response> {
    const ${variable} = ctx.model(${model})
    await authorize(this.policy, 'view', ctx.user, ${variable}, '${singular}')
    return ctx.json({ data: ${variable} })
  }

  /** PUT/PATCH /${table}/{${singular}} */
  async update(ctx: HttpContext): Promise<Response> {
    const ${variable} = ctx.model(${model})
    await authorize(this.policy, 'update', ctx.user, ${variable}, '${singular}')
    const input = await new MetadataRequest(${model}.metadata(), 'update', ${model}.fillable).validate(ctx)
    await ${variable}.updateFromValidated(input)
    return ctx.json({ data: ${variable} })
  }

  /** DELETE /${table}/{${singular}} */
  async destroy(ctx: HttpContext): Promise<Response> {
    const ${variable} = ctx.model(${model})
    await authorize(this.policy, 'delete', ctx.user, ${variable}, '${singular}')
    await ${variable}.delete()
    return ctx.noContent()
  }
}
${formHelper}`
}

/**
 * A seeder class.
 *
 * @example
 * seederStub({ model: 'Post', singular: 'post', variable: 'post', table: 'posts' })
 */
export function seederStub(names: StubNames): string {
  return `import { ${names.model} } from '../../app/models/${names.singular}.ts'

/** Seeds the \`${names.table}\` table. Call it from database/seeders/database.seeder.ts. */
export class ${names.model}Seeder {
  async run(): Promise<void> {
    // Create a few rows, for example:
    // await ${names.model}.create({ … })
    void ${names.model}
  }
}
`
}

/**
 * A factory definition (the real factory API is the ORM's, spike 11).
 *
 * @example
 * factoryStub({ model: 'Post', singular: 'post', variable: 'post', table: 'posts' })
 */
export function factoryStub(names: StubNames): string {
  return `/**
 * Fake \`${names.table}\` rows for tests and seeders. \`sequence\` makes each row unique.
 */
export function ${names.singular}Definition(sequence: number): Record<string, unknown> {
  // Return one row's columns, for example: return { title: \`${names.model} \${sequence}\` }
  void sequence
  return {}
}
`
}
