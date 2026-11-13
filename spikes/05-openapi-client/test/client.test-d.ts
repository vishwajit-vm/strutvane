// Type-level tests (run by vitest typecheck mode). Each `@ts-expect-error` FAILS the run if the line
// ever starts compiling, proving the generated client rejects that misuse.
import { describe, expectTypeOf, test } from 'vitest'
import type { z } from 'zod'
import type { components, operations } from '../src/client.gen/schema.d.ts'
import type { ApiClient } from '../src/client.ts'
import type { Invoice as InvoiceResource } from '../src/models.ts'

type ClientInvoice = components['schemas']['Invoice']
type ServerInvoice = z.output<typeof InvoiceResource.read>
type ListQueryParams = NonNullable<operations['listInvoices']['parameters']['query']>

/** Mutual assignability. */
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false
/**
 * Zod types optional keys as `k?: T | undefined`; generated types use `k?: T`. Under
 * `exactOptionalPropertyTypes` those differ, but on the wire they are identical (JSON never carries
 * `undefined`). So compare value types with `undefined` removed, and compare required keys separately.
 */
type Wire<T> = { [K in keyof T]: Exclude<T[K], undefined> }
type RequiredKeys<T> = { [K in keyof T]-?: {} extends Pick<T, K> ? never : K }[keyof T]

declare const api: ApiClient

describe('generated client types match the server models', () => {
  test('client Invoice and server Invoice describe the same wire shape (both directions)', () => {
    expectTypeOf<Same<Wire<ClientInvoice>, Wire<ServerInvoice>>>().toEqualTypeOf<true>()
    expectTypeOf<RequiredKeys<ClientInvoice>>().toEqualTypeOf<RequiredKeys<ServerInvoice>>()
  })

  test('enum and required/optional fields are exact', () => {
    expectTypeOf<ClientInvoice['status']>().toEqualTypeOf<'draft' | 'sent' | 'paid' | 'void'>()
    expectTypeOf<ClientInvoice['amount']>().toEqualTypeOf<number>()
    expectTypeOf<undefined extends ClientInvoice['notes'] ? true : false>().toEqualTypeOf<true>()
  })

  test('create input does not accept server-managed fields', () => {
    type Create = components['schemas']['InvoiceCreate']
    expectTypeOf<'id' extends keyof Create ? true : false>().toEqualTypeOf<false>()
  })
})

describe('list parameters are typed per field and operator', () => {
  test('allowed filters compile', () => {
    const q: ListQueryParams = {
      filter: { status: { in: ['sent'] }, amount: { between: [1, 2] }, dueDate: { gte: '2026-01-01' } },
      sort: ['-amount', 'dueDate'],
      page: { size: 10, cursor: 'abc' },
    }
    void q
  })

  test('misuse fails to compile', () => {
    // @ts-expect-error notes is not filterable
    const notFilterable: ListQueryParams = { filter: { notes: { eq: 'x' } } }
    // @ts-expect-error status does not support gt
    const badOperator: ListQueryParams = { filter: { status: { gt: 'paid' } } }
    // @ts-expect-error 'lost' is not a status
    const badEnum: ListQueryParams = { filter: { status: { in: ['lost'] } } }
    // @ts-expect-error between needs exactly two values
    const badTuple: ListQueryParams = { filter: { amount: { between: [1] } } }
    // @ts-expect-error notes is not sortable
    const badSort: ListQueryParams = { sort: ['notes'] }
    // @ts-expect-error page size must be a number
    const badPage: ListQueryParams = { page: { size: '10' } }
    void [notFilterable, badOperator, badEnum, badTuple, badSort, badPage]
  })

  test('calls are checked end to end', () => {
    void api.GET('/invoices', { params: { query: { filter: { status: { eq: 'paid' } } } } })
    // @ts-expect-error unknown path
    void api.GET('/invoicez')
    // @ts-expect-error amount must be a number in the body
    void api.POST('/invoices', { body: { number: 'X', customerId: 'u', amount: '5', status: 'draft', dueDate: '2026-01-01' } })
  })
})

describe('errors are typed', () => {
  test('error bodies are the Problem schema with structured issues', async () => {
    const { error } = await api.POST('/invoices', {
      body: { number: 'X', customerId: 'u', amount: 5, status: 'draft', dueDate: '2026-01-01' },
    })
    if (error) {
      expectTypeOf(error.code).toEqualTypeOf<string>()
      expectTypeOf(error.issues).toEqualTypeOf<components['schemas']['ValidationIssue'][] | undefined>()
    }
  })
})
