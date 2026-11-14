/**
 * An HTTP client for requests to URLs that users (or webhooks, or imported data) control, with an
 * SSRF guard: it refuses private, loopback, link-local, cloud-metadata and other special ranges.
 *
 * DNS rebinding is the subtle part: a name can resolve to a public address when checked and to
 * `127.0.0.1` a millisecond later when the socket connects. So the client resolves **once**,
 * checks **every** address, and then connects to the checked address itself (a pinned `lookup`),
 * keeping the real host name for the `Host` header and TLS (SNI and certificate checks).
 * Redirects are followed by hand, and each hop is checked again.
 */
import { lookup as dnsLookup } from 'node:dns/promises'
import { request as httpRequest, type IncomingMessage } from 'node:http'
import { request as httpsRequest } from 'node:https'
import type { LookupFunction } from 'node:net'
import { blockedReason, formatIp, inCidr, parseCidr, parseIp, type Cidr, type ParsedIp } from './ip.ts'

/**
 * Resolves a host name to addresses. Tests inject one; the default uses the OS resolver.
 *
 * @example
 * const resolver: Resolver = async () => ['93.184.216.34']
 */
export type Resolver = (hostname: string) => Promise<readonly string[]>

/**
 * Options for {@link safeFetch}.
 *
 * @example
 * await safeFetch(url, { timeoutMs: 5000, maxBytes: 1024 * 1024 })
 */
export interface SafeFetchOptions {
  readonly method?: string
  readonly headers?: Readonly<Record<string, string>>
  readonly body?: string | Uint8Array
  /** The whole exchange, every redirect included. Default 10 s. */
  readonly timeoutMs?: number
  /** The largest response body read. Default 5 MiB. */
  readonly maxBytes?: number
  /** Default 3; each hop is checked like the first. */
  readonly maxRedirects?: number
  readonly resolver?: Resolver
  /** Ranges you deliberately allow (an internal service), as CIDRs. Empty by default. */
  readonly allow?: readonly string[]
}

/**
 * A response, already read (bounded by `maxBytes`).
 *
 * @example
 * const { status, body } = await safeFetch('https://example.com/feed.xml')
 */
export interface SafeResponse {
  readonly status: number
  readonly headers: Headers
  /** The final URL after redirects. */
  readonly url: string
  readonly body: Buffer
  text(): string
}

/**
 * Why a request failed.
 *
 * @example
 * const code: HttpClientErrorCode = 'SSRF_BLOCKED'
 */
export type HttpClientErrorCode = 'SSRF_BLOCKED' | 'INVALID_URL' | 'TIMEOUT' | 'RESPONSE_TOO_LARGE' | 'TOO_MANY_REDIRECTS' | 'DNS_FAILED' | 'CONNECTION_FAILED'

/**
 * Thrown by {@link safeFetch}. `SSRF_BLOCKED` means nothing was sent at all.
 *
 * @example
 * try { await safeFetch(url) } catch (error) { if (error instanceof HttpClientError && error.code === 'SSRF_BLOCKED') … }
 */
export class HttpClientError extends Error {
  readonly code: HttpClientErrorCode

  constructor(code: HttpClientErrorCode, message: string) {
    super(message)
    this.name = 'HttpClientError'
    this.code = code
  }
}

const REDIRECTS = new Set([301, 302, 303, 307, 308])

/**
 * Fetch a URL with the SSRF guard, a timeout and a size cap.
 *
 * @example
 * const response = await safeFetch('https://example.com/webhook', { method: 'POST', body: JSON.stringify(event) })
 */
export async function safeFetch(target: string, options: SafeFetchOptions = {}): Promise<SafeResponse> {
  const allow = (options.allow ?? []).map((entry) => {
    const cidr = parseCidr(entry)
    if (cidr === undefined) throw new HttpClientError('INVALID_URL', `allow: "${entry}" is not a CIDR range.`)
    return cidr
  })
  const deadline = Date.now() + (options.timeoutMs ?? 10_000)
  let url = parseTarget(target)
  let method = (options.method ?? 'GET').toUpperCase()
  let body = options.body
  for (let hop = 0; ; hop++) {
    const address = await checkedAddress(url, options.resolver ?? defaultResolver, allow)
    const response = await send(url, address, { method, headers: options.headers ?? {}, body, deadline, maxBytes: options.maxBytes ?? 5 * 1024 * 1024 })
    const next = response.headers.get('location')
    if (!REDIRECTS.has(response.status) || next === null) return response
    if (hop >= (options.maxRedirects ?? 3)) throw new HttpClientError('TOO_MANY_REDIRECTS', `More than ${options.maxRedirects ?? 3} redirects.`)
    url = parseTarget(new URL(next, url).href)
    // 303 (and, as browsers do, 301/302 after POST) continues as a GET without a body.
    if (response.status === 303 || ((response.status === 301 || response.status === 302) && method === 'POST')) {
      method = 'GET'
      body = undefined
    }
  }
}

function parseTarget(target: string): URL {
  if (!URL.canParse(target)) throw new HttpClientError('INVALID_URL', 'The URL could not be parsed.')
  const url = new URL(target)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new HttpClientError('INVALID_URL', `Only http and https URLs are fetched (got ${url.protocol}).`)
  if (url.username !== '' || url.password !== '') throw new HttpClientError('INVALID_URL', 'URLs with credentials are not fetched.')
  return url
}

async function defaultResolver(hostname: string): Promise<readonly string[]> {
  return (await dnsLookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address)
}

/**
 * Resolve once and check every address; the first one is what the socket will connect to.
 * Literal addresses arrive already normalised by the URL parser (`http://2130706433/` and
 * `http://0177.0.0.1/` are `127.0.0.1` here).
 */
async function checkedAddress(url: URL, resolver: Resolver, allow: readonly Cidr[]): Promise<ParsedIp> {
  const host = url.hostname
  const literal = parseIp(host)
  if (literal === undefined && (host === 'localhost' || host.endsWith('.localhost'))) throw new HttpClientError('SSRF_BLOCKED', `${host} is a loopback name.`)
  let addresses: ParsedIp[]
  if (literal !== undefined) addresses = [literal]
  else {
    let resolved: readonly string[]
    try {
      resolved = await resolver(host)
    } catch {
      throw new HttpClientError('DNS_FAILED', `${host} could not be resolved.`)
    }
    addresses = resolved.map((entry) => parseIp(entry)).filter((ip): ip is ParsedIp => ip !== undefined)
    if (addresses.length === 0 || addresses.length !== resolved.length) throw new HttpClientError('DNS_FAILED', `${host} did not resolve to valid addresses.`)
  }
  for (const ip of addresses) {
    if (allow.some((range) => inCidr(ip, range))) continue
    const reason = blockedReason(ip)
    // One bad address blocks the name: the OS could pick it on a retry or a second connection.
    if (reason !== undefined) throw new HttpClientError('SSRF_BLOCKED', `${host} resolves to ${formatIp(ip)}, a ${reason} address, which this client never connects to.`)
  }
  const [first] = addresses
  if (first === undefined) throw new HttpClientError('DNS_FAILED', `${host} did not resolve.`)
  return first
}

interface SendOptions {
  readonly method: string
  readonly headers: Readonly<Record<string, string>>
  readonly body: string | Uint8Array | undefined
  readonly deadline: number
  readonly maxBytes: number
}

/** One request to the pinned address, with the deadline and the byte cap enforced. */
function send(url: URL, address: ParsedIp, options: SendOptions): Promise<SafeResponse> {
  const pinned = formatIp(address)
  const family = address.version
  // Whatever name the socket layer asks for, it gets the address we checked.
  const lookup: LookupFunction = (_hostname, lookupOptions, callback) => {
    if (lookupOptions.all === true) callback(null, [{ address: pinned, family }])
    else callback(null, pinned, family)
  }
  const remaining = options.deadline - Date.now()
  if (remaining <= 0) return Promise.reject(new HttpClientError('TIMEOUT', 'The request timed out.'))
  const requester = url.protocol === 'https:' ? httpsRequest : httpRequest
  return new Promise<SafeResponse>((resolve, reject) => {
    const request = requester(
      url,
      { method: options.method, headers: options.headers, lookup, ...(url.protocol === 'https:' && parseIp(url.hostname) === undefined ? { servername: url.hostname } : {}) },
      (response) => readBody(response, url, options.maxBytes).then(resolve, reject),
    )
    const timer = setTimeout(() => request.destroy(new HttpClientError('TIMEOUT', 'The request timed out.')), remaining)
    request.on('close', () => clearTimeout(timer))
    request.on('error', (error) => {
      clearTimeout(timer)
      reject(error instanceof HttpClientError ? error : new HttpClientError('CONNECTION_FAILED', `The connection failed: ${error.message}`))
    })
    if (options.body !== undefined) request.write(options.body)
    request.end()
  })
}

function readBody(response: IncomingMessage, url: URL, maxBytes: number): Promise<SafeResponse> {
  return new Promise((resolve, reject) => {
    const tooLarge = (): HttpClientError => new HttpClientError('RESPONSE_TOO_LARGE', `The response is larger than ${maxBytes} bytes.`)
    if (Number(response.headers['content-length'] ?? '0') > maxBytes) {
      response.destroy(tooLarge())
      reject(tooLarge())
      return
    }
    const chunks: Buffer[] = []
    let size = 0
    response.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > maxBytes) {
        response.destroy()
        reject(tooLarge())
        return
      }
      chunks.push(chunk)
    })
    response.on('error', (error) => reject(error instanceof HttpClientError ? error : new HttpClientError('CONNECTION_FAILED', error.message)))
    response.on('end', () => {
      const headers = new Headers()
      for (const [name, value] of Object.entries(response.headers)) {
        if (typeof value === 'string') headers.set(name, value)
        else if (Array.isArray(value)) for (const item of value) headers.append(name, item)
      }
      const body = Buffer.concat(chunks)
      resolve({ status: response.statusCode ?? 0, headers, url: url.href, body, text: () => body.toString('utf8') })
    })
  })
}
