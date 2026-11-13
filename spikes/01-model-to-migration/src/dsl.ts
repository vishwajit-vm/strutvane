/**
 * Minimal Strutvane model DSL (spike). Produces plain, serialisable data:
 * a ModelDefinition can be compared, diffed, stored as a snapshot and compiled
 * for any SQL dialect. Builders are immutable: every modifier returns a new builder.
 */

export type FieldKind = 'string' | 'text' | 'integer' | 'decimal' | 'boolean' | 'enum' | 'date' | 'belongsTo'

export type DefaultValue = string | number | boolean

/** Fully-resolved description of one field. Plain data only (no functions). */
export interface FieldDef {
  readonly kind: FieldKind
  /** Fields are required (NOT NULL) unless `.optional()` is called. */
  readonly required: boolean
  readonly unique: boolean
  readonly index: boolean
  readonly default?: DefaultValue
  /** `string` only: max length. */
  readonly length?: number
  /** `decimal` only. */
  readonly precision?: number
  readonly scale?: number
  /** `enum` only: allowed values, in order. */
  readonly values?: readonly string[]
  /** `belongsTo` only: target model name. */
  readonly target?: string
}

export interface ModelOptions {
  /** Adds created_at / updated_at. Default: true. */
  readonly timestamps?: boolean
  /** Adds deleted_at. Default: false. */
  readonly softDeletes?: boolean
  /** Adds tenant_id, a tenant index, and makes unique fields unique per tenant. Default: false. */
  readonly tenant?: boolean
}

export interface ModelDefinition {
  readonly name: string
  readonly table: string
  readonly fields: Readonly<Record<string, FieldDef>>
  readonly options: Required<ModelOptions>
}

export class FieldBuilder {
  /** @internal */
  constructor(readonly def: FieldDef) {}

  private with(patch: Partial<FieldDef>): FieldBuilder {
    return new FieldBuilder({ ...this.def, ...patch })
  }

  required(): FieldBuilder {
    return this.with({ required: true })
  }
  optional(): FieldBuilder {
    return this.with({ required: false })
  }
  unique(): FieldBuilder {
    return this.with({ unique: true })
  }
  index(): FieldBuilder {
    return this.with({ index: true })
  }
  default(value: DefaultValue): FieldBuilder {
    if (this.def.kind === 'enum' && (typeof value !== 'string' || !this.def.values?.includes(value))) {
      throw new TypeError(`Default "${String(value)}" is not one of the enum values [${this.def.values?.join(', ')}]`)
    }
    return this.with({ default: value })
  }
}

const base = (kind: FieldKind, extra: Partial<FieldDef> = {}): FieldBuilder =>
  new FieldBuilder({ kind, required: true, unique: false, index: false, ...extra })

export const field = {
  string: (length = 255) => {
    if (!Number.isInteger(length) || length < 1) throw new RangeError('string length must be a positive integer')
    return base('string', { length })
  },
  text: () => base('text'),
  integer: () => base('integer'),
  decimal: (precision = 12, scale = 2) => {
    if (!Number.isInteger(precision) || !Number.isInteger(scale) || scale < 0 || precision < 1 || scale > precision) {
      throw new RangeError('decimal(precision, scale) requires integers with 0 <= scale <= precision')
    }
    return base('decimal', { precision, scale })
  },
  boolean: () => base('boolean'),
  enum: (values: readonly string[]) => {
    if (values.length === 0) throw new RangeError('enum needs at least one value')
    if (new Set(values).size !== values.length) throw new RangeError('enum values must be unique')
    return base('enum', { values: [...values] })
  },
  date: () => base('date'),
  belongsTo: (target: string) => base('belongsTo', { target }),
} as const

/** "InvoiceLine" -> "invoice_line" */
export const snake = (s: string): string =>
  s
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .toLowerCase()

/** Naive English pluralisation, good enough for the spike: "category" -> "categories". */
export const plural = (s: string): string =>
  /[^aeiou]y$/.test(s) ? `${s.slice(0, -1)}ies` : /(s|x|z|ch|sh)$/.test(s) ? `${s}es` : `${s}s`

/** Column name for a field key; belongsTo fields become `<key>_id`. */
export const columnName = (key: string, def: FieldDef): string =>
  def.kind === 'belongsTo' ? `${snake(key)}_id` : snake(key)

export function defineModel(
  name: string,
  fields: Record<string, FieldBuilder>,
  options: ModelOptions = {},
): ModelDefinition {
  if (!/^[A-Z][A-Za-z0-9]*$/.test(name)) throw new TypeError(`Model name "${name}" must be PascalCase`)
  const reserved = new Set(['id', 'created_at', 'updated_at', 'deleted_at', 'tenant_id'])
  const resolved: Record<string, FieldDef> = {}
  for (const [key, builder] of Object.entries(fields)) {
    const col = columnName(key, builder.def)
    if (reserved.has(col)) throw new TypeError(`Field "${key}" uses reserved column name "${col}"`)
    resolved[key] = builder.def
  }
  return Object.freeze({
    name,
    table: plural(snake(name)),
    fields: Object.freeze(resolved),
    options: Object.freeze({
      timestamps: options.timestamps ?? true,
      softDeletes: options.softDeletes ?? false,
      tenant: options.tenant ?? false,
    }),
  })
}
