/**
 * Group 3, part 2: the SSRF-safe HTTP client. Every blocked case also proves that *no connection
 * was made*: a real local server counts its hits, and blocked requests leave the count at zero.
 */
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { blockedReason, HttpClientError, parseIp, safeFetch, type Resolver } from '#strutvane/security'

let server: Server
let port = 0
let hits = 0

beforeAll(async () => {
  server = createServer((request, response) => {
    hits++
    if (request.url === '/hang') return
    if (request.url === '/big') {
      response.end('x'.repeat(64 * 1024))
      return
    }
    if (request.url?.startsWith('/redirect')) {
      response.writeHead(302, { location: decodeURIComponent(request.url.slice('/redirect?to='.length)) })
      response.end()
      return
    }
    response.setHeader('content-type', 'text/plain')
    response.end(`hello ${request.headers.host ?? ''}`)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  port = (server.address() as AddressInfo).port
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

/** Resolves `service.test` to the local server; counts its calls. */
function resolverTo(...answers: (readonly string[])[]): Resolver & { calls: number } {
  const resolver = Object.assign(
    async (): Promise<readonly string[]> => {
      const answer = answers[Math.min(resolver.calls, answers.length - 1)] ?? []
      resolver.calls++
      return answer
    },
    { calls: 0 },
  )
  return resolver
}

async function blocked(url: string, options: Parameters<typeof safeFetch>[1] = {}): Promise<HttpClientError> {
  const before = hits
  const error = await safeFetch(url, { timeoutMs: 2000, ...options }).then(() => undefined, (caught: unknown) => caught)
  expect(hits, `${url} must not connect`).toBe(before)
  if (error instanceof HttpClientError) return error
  throw new Error(`Expected ${url} to be refused, got ${String(error)}`)
}

describe('the special-range table', () => {
  it.each([
    ['127.0.0.1', 'loopback'],
    ['10.1.2.3', 'private (10/8)'],
    ['172.31.255.255', 'private (172.16/12)'],
    ['192.168.0.1', 'private (192.168/16)'],
    ['169.254.169.254', 'link-local (includes cloud metadata 169.254.169.254)'],
    ['100.100.100.200', 'carrier-grade NAT (includes cloud metadata 100.100.100.200)'],
    ['0.0.0.0', 'this network'],
    ['::1', 'loopback'],
    ['::', 'unspecified'],
    ['fe80::1', 'link-local'],
    ['fd00:ec2::254', 'unique local (includes AWS metadata fd00:ec2::254)'],
    ['::ffff:127.0.0.1', 'loopback'],
    ['::ffff:7f00:1', 'loopback'],
    ['64:ff9b::a9fe:a9fe', 'link-local (includes cloud metadata 169.254.169.254)'],
    ['2002:7f00:1::', 'loopback'],
    ['224.0.0.1', 'multicast'],
  ])('%s is blocked (%s)', (address, reason) => {
    const ip = parseIp(address)
    expect(ip).toBeDefined()
    if (ip !== undefined) expect(blockedReason(ip)).toBe(reason)
  })

  it('leaves public addresses alone', () => {
    for (const address of ['93.184.216.34', '8.8.8.8', '2606:4700:4700::1111', '172.32.0.1', '11.0.0.1']) {
      const ip = parseIp(address)
      expect(ip !== undefined && blockedReason(ip), address).toBeUndefined()
    }
  })
})

describe('safeFetch refuses private, loopback, link-local and metadata targets', () => {
  it.each([
    'http://127.0.0.1:PORT/',
    'http://localhost:PORT/',
    'http://api.localhost:PORT/',
    'http://[::1]:PORT/',
    'http://[::ffff:127.0.0.1]:PORT/',
    'http://[::ffff:7f00:1]:PORT/',
    'http://2130706433:PORT/',
    'http://0x7f.0.0.1:PORT/',
    'http://0177.0.0.1:PORT/',
    'http://127.1:PORT/',
    'http://0:PORT/',
    'http://169.254.169.254/latest/meta-data/',
    'http://[fd00:ec2::254]/latest/meta-data/',
    'http://100.100.100.200/latest/meta-data/',
    'http://10.0.0.1/',
  ])('%s', async (template) => {
    const error = await blocked(template.replace('PORT', String(port)))
    expect(error.code).toBe('SSRF_BLOCKED')
  })

  it('refuses names that resolve to a blocked address, even when mixed with public ones', async () => {
    expect((await blocked(`http://service.test:${port}/`, { resolver: resolverTo(['127.0.0.1']) })).code).toBe('SSRF_BLOCKED')
    expect((await blocked(`http://service.test:${port}/`, { resolver: resolverTo(['93.184.216.34', '169.254.169.254']) })).code).toBe('SSRF_BLOCKED')
  })

  it('refuses non-http schemes and URLs with credentials', async () => {
    for (const url of ['file:///etc/passwd', 'gopher://127.0.0.1/', 'ftp://example.com/', `http://user:pass@service.test:${port}/`, 'not a url']) {
      expect((await blocked(url)).code, url).toBe('INVALID_URL')
    }
  })
})

describe('safeFetch connects to the address it checked (DNS rebinding)', () => {
  it('resolves once and pins the socket to the checked address', async () => {
    // First answer: an address the app allows. Every later answer: cloud metadata.
    const resolver = resolverTo(['127.0.0.1'], ['169.254.169.254'])
    const response = await safeFetch(`http://service.test:${port}/hello`, { resolver, allow: ['127.0.0.1/32'] })
    expect(response.status).toBe(200)
    expect(response.text()).toBe(`hello service.test:${port}`)
    expect(resolver.calls).toBe(1)
  })

  it('re-checks every redirect hop', async () => {
    const resolver = resolverTo(['127.0.0.1'])
    const options = { resolver, allow: ['127.0.0.1/32'] }
    const before = hits
    const error = await safeFetch(`http://service.test:${port}/redirect?to=${encodeURIComponent('http://169.254.169.254/latest/meta-data/')}`, options).then(() => undefined, (caught: unknown) => caught)
    expect(error).toBeInstanceOf(HttpClientError)
    expect((error as HttpClientError).code).toBe('SSRF_BLOCKED')
    expect(hits - before).toBe(1)
    const followed = await safeFetch(`http://service.test:${port}/redirect?to=${encodeURIComponent('/hello')}`, options)
    expect(followed.text()).toBe(`hello service.test:${port}`)
  })

  it('enforces the timeout, the size cap and the redirect limit', async () => {
    const options = { resolver: resolverTo(['127.0.0.1']), allow: ['127.0.0.1/32'] }
    const hang = await safeFetch(`http://service.test:${port}/hang`, { ...options, timeoutMs: 200 }).then(() => undefined, (caught: unknown) => caught)
    expect((hang as HttpClientError).code).toBe('TIMEOUT')
    const big = await safeFetch(`http://service.test:${port}/big`, { ...options, maxBytes: 1024 }).then(() => undefined, (caught: unknown) => caught)
    expect((big as HttpClientError).code).toBe('RESPONSE_TOO_LARGE')
    const loop = `http://service.test:${port}/redirect?to=${encodeURIComponent(`http://service.test:${port}/redirect?to=%2Fredirect%3Fto%3D%252Fhello`)}`
    const tooMany = await safeFetch(loop, { ...options, maxRedirects: 1 }).then(() => undefined, (caught: unknown) => caught)
    expect((tooMany as HttpClientError).code).toBe('TOO_MANY_REDIRECTS')
  })
})
