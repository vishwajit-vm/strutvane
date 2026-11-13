/**
 * Build the OpenAPI 3.1 document for the app: everything `@hono/zod-openapi` generates from the
 * route definitions, plus the list-protocol parameters (injected per list operation, see crud.ts),
 * plus the document-level `x-strutvane` info.
 *
 * Deterministic: same models in → byte-identical JSON out (asserted by tests), which is what makes
 * client generation reproducible and drift detectable in CI.
 *
 * @module
 */
import type { OpenAPIHono } from '@hono/zod-openapi'
import type { z } from 'zod'
import { listQueryParameters } from './list-query.ts'
import type { Resource } from './resource.ts'

/** The OpenAPI document type produced by `@hono/zod-openapi`. */
export type OpenApiDocument = ReturnType<OpenAPIHono['getOpenAPI31Document']>

/** Generate the document. */
export function buildOpenApiDocument(
  app: OpenAPIHono,
  resources: readonly Resource<z.ZodRawShape>[],
): OpenApiDocument {
  const doc = app.getOpenAPI31Document({
    openapi: '3.1.0',
    info: {
      title: 'Strutvane spike 05 API',
      version: '0.0.0',
      description: 'Generated from Zod model definitions. Errors are RFC 9457 problem+json with RFC-0003 issues.',
    },
    servers: [{ url: '/' }],
  })
  for (const resource of resources) {
    const operation = doc.paths?.[`/${resource.meta.path}`]?.get
    if (!operation) throw new Error(`list operation missing for ${resource.meta.name}`)
    operation.parameters = listQueryParameters(resource) as unknown as NonNullable<typeof operation.parameters>
  }
  return doc
}
