import { readFileSync } from 'node:fs'
import { validate } from '@readme/openapi-parser'
import { beforeAll, describe, expect, test } from 'vitest'
import { render, SPEC_PATH, TYPES_PATH } from '../scripts/generate-client.ts'
import { createApp } from '../src/app.ts'

type Json = Record<string, unknown>
let doc: Json

beforeAll(async () => {
  doc = (await (await createApp().request('/openapi.json')).json()) as Json
})

const schemas = (): Record<string, Json> => (doc.components as { schemas: Record<string, Json> }).schemas
const paths = (): Record<string, Record<string, Json>> => doc.paths as Record<string, Record<string, Json>>

describe('OpenAPI document', () => {
  test('is a valid OpenAPI 3.1 document (validated against the official schema)', async () => {
    expect(doc.openapi).toBe('3.1.0')
    const result = await validate(structuredClone(doc) as Parameters<typeof validate>[0])
    expect(result.valid, JSON.stringify(result)).toBe(true)
    expect(result.warnings).toEqual([])
  })

  test('names every model schema as a reusable component', () => {
    expect(Object.keys(schemas()).sort()).toEqual(
      ['Customer', 'CustomerCreate', 'CustomerList', 'CustomerUpdate', 'Invoice', 'InvoiceCreate', 'InvoiceList', 'InvoiceUpdate', 'PageMeta', 'Problem', 'ValidationIssue'].sort(),
    )
  })

  test('carries x-strutvane-resource on the resource schema', () => {
    expect(schemas().Invoice?.['x-strutvane-resource']).toEqual({
      name: 'Invoice',
      path: 'invoices',
      label: 'Invoice',
      pluralLabel: 'Invoices',
      titleField: 'number',
    })
  })

  test('carries x-strutvane-field (label, operators, widget) on fields, in read AND write schemas', () => {
    for (const name of ['Invoice', 'InvoiceCreate', 'InvoiceUpdate']) {
      const amount = (schemas()[name]?.properties as Record<string, Json>).amount
      expect(amount?.['x-strutvane-field'], name).toEqual({
        label: 'Amount',
        filterOperators: ['eq', 'gt', 'gte', 'lt', 'lte', 'between'],
        sortable: true,
        widget: 'money',
      })
    }
  })

  test('keeps validation rules: enums, ranges, formats, nullability, required, no unknown keys on input', () => {
    const invoice = schemas().InvoiceCreate as { properties: Record<string, Json>; required: string[]; additionalProperties: unknown }
    expect(invoice.properties.status?.enum).toEqual(['draft', 'sent', 'paid', 'void'])
    expect(invoice.properties.amount).toMatchObject({ type: 'number', minimum: 0, maximum: 1_000_000_000 })
    expect(invoice.properties.dueDate).toMatchObject({ type: 'string', format: 'date' })
    expect(invoice.required.sort()).toEqual(['amount', 'customerId', 'dueDate', 'number', 'status'])
    expect(invoice.additionalProperties).toBe(false)
    const region = (schemas().Customer?.properties as Record<string, Json>).region
    expect(region?.type).toEqual(['string', 'null'])
  })

  test('documents every error response as application/problem+json referencing Problem', () => {
    let checked = 0
    for (const [path, ops] of Object.entries(paths())) {
      for (const [method, op] of Object.entries(ops)) {
        for (const [status, response] of Object.entries(op.responses as Record<string, Json>)) {
          if (Number(status) < 400) continue
          const content = response.content as Record<string, { schema: { $ref?: string } }>
          expect(Object.keys(content), `${method} ${path} ${status}`).toEqual(['application/problem+json'])
          expect(content['application/problem+json']?.schema.$ref).toBe('#/components/schemas/Problem')
          checked++
        }
      }
    }
    expect(checked).toBeGreaterThanOrEqual(20)
    const issue = schemas().ValidationIssue as { required: string[] }
    expect(issue.required.sort()).toEqual(['code', 'message', 'path'])
  })

  test('documents the list protocol with typed filter, sort, page and search parameters', () => {
    const params = paths()['/invoices']?.get?.parameters as Json[]
    expect(params.map((p) => p.name)).toEqual(['filter', 'sort', 'page', 'search'])
    const filter = params[0] as { style: string; schema: { properties: Record<string, { properties: Record<string, Json> }> } }
    expect(filter.style).toBe('deepObject')
    expect(Object.keys(filter.schema.properties).sort()).toEqual(['amount', 'customerId', 'dueDate', 'id', 'number', 'status'])
    expect(filter.schema.properties.status?.properties.in).toMatchObject({ type: 'array', items: { enum: ['draft', 'sent', 'paid', 'void'] } })
    expect(Object.keys(filter.schema.properties.amount?.properties ?? {})).toEqual(['eq', 'gt', 'gte', 'lt', 'lte', 'between'])
    const sort = params[1] as { schema: { items: { enum: string[] } } }
    expect(sort.schema.items.enum).toContain('-amount')
    expect(sort.schema.items.enum).not.toContain('notes')
  })

  test('serves interactive docs at /docs (Scalar) pointing at /openapi.json', async () => {
    const res = await createApp().request('/docs')
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/html')
    expect(await res.text()).toContain('/openapi.json')
  })
})

describe('determinism and drift', () => {
  test('two independent renders are byte-identical', async () => {
    const a = await render()
    const b = await render()
    expect(a.spec).toBe(b.spec)
    expect(a.types).toBe(b.types)
  })

  test('committed openapi.json and client types match the current models (no drift)', async () => {
    const { spec, types } = await render()
    expect(readFileSync(SPEC_PATH, 'utf8')).toBe(spec)
    expect(readFileSync(TYPES_PATH, 'utf8')).toBe(types)
  })
})
