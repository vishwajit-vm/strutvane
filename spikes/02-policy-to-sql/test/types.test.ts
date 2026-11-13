/**
 * Compile-time guarantees of the typed builder. These are checked by `tsc --noEmit` (pnpm typecheck):
 * every `@ts-expect-error` line MUST be a type error, or the typecheck fails. Vitest only runs the
 * policy definition to make sure the valid lines also work at runtime.
 */
import { describe, expect, it } from 'vitest'
import { and, or } from '../src/ast.js'
import { definePolicy } from '../src/policy.js'
import { type ActorAttrs, type Invoice, invoiceSchema } from './fixtures.js'

describe('typed builder', () => {
  it('accepts valid rules and rejects invalid ones at compile time', () => {
    const p = definePolicy<Invoice, ActorAttrs>('invoice', invoiceSchema, ({ allow, deny }) => {
      // ✅ valid
      allow('read', { when: ({ row, actor }) => row.ownerId.eq(actor.id) })
      allow('read', { when: ({ row, actor }) => row.customer.region.eq(actor.attrs.region) })
      allow('read', { when: ({ row, actor }) => and(row.amount.lte(10_000), row.amount.gt(actor.attrs.limit)) })
      allow('read', { when: ({ row }) => or(row.status.contains('ok'), row.archived.eq(false), row.customer.tier.isNull()) })
      deny('read', { when: ({ row }) => row.status.in(['paid', 'void']) })

      // ❌ unknown field
      // @ts-expect-error `amout` is not a field of Invoice
      allow('read', { when: ({ row }) => row.amout.eq(1) })
      // ❌ unknown relation field
      // @ts-expect-error `country` is not a field of customer
      allow('read', { when: ({ row }) => row.customer.country.eq('x') })
      // ❌ wrong value type
      // @ts-expect-error amount is a number
      allow('read', { when: ({ row }) => row.amount.eq('100') })
      // ❌ ordering on text
      // @ts-expect-error gt does not exist on text fields
      allow('read', { when: ({ row }) => row.status.gt('a') })
      // ❌ contains on a number
      // @ts-expect-error contains does not exist on numeric fields
      allow('read', { when: ({ row }) => row.amount.contains('1') })
      // ❌ actor attribute of the wrong type
      // @ts-expect-error actor.attrs.limit is a number, ownerId is text
      allow('read', { when: ({ row, actor }) => row.ownerId.eq(actor.attrs.limit) })
      // ❌ unknown actor attribute
      // @ts-expect-error `department` is not declared in ActorAttrs
      allow('read', { when: ({ row, actor }) => row.ownerId.eq(actor.attrs.department) })
    })
    expect(p.resource).toBe('invoice')
  })
})
