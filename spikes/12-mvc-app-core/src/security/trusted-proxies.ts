/**
 * Trusted proxies: `X-Forwarded-For`, `-Proto` and `-Host` are believed **only** when the socket
 * peer is a proxy the app listed. From anyone else they are ignored, because any client can send
 * them (spoofing its IP past rate limits, or claiming HTTPS to get secure-only behaviour).
 *
 * The client address is found by walking `X-Forwarded-For` from the right and skipping trusted
 * proxies: the left-most entries are written by the client and prove nothing.
 */
import { failIfAny } from './setting-error.ts'
import { formatIp, inCidr, parseCidr, parseIp, type Cidr } from './ip.ts'

/**
 * The forwarded headers a proxy may set.
 *
 * @example
 * const header: ForwardedHeader = 'proto'
 */
export type ForwardedHeader = 'for' | 'proto' | 'host'

/**
 * Options for `withMiddleware((m) => m.trustProxies({ … }))`.
 *
 * @example
 * const options: TrustProxiesOptions = { at: ['10.0.0.0/8', '192.168.1.10'] }
 */
export interface TrustProxiesOptions {
  /** Proxy addresses or CIDR ranges. There is no "trust everyone" value on purpose. */
  readonly at: readonly string[]
  /** Which `X-Forwarded-*` headers to read. Default: all three. */
  readonly headers?: readonly ForwardedHeader[]
}

/**
 * The checked proxy settings.
 *
 * @example
 * const proxies: ResolvedProxies = { ranges: [], headers: ['for', 'proto', 'host'] }
 */
export interface ResolvedProxies {
  readonly ranges: readonly Cidr[]
  readonly headers: readonly ForwardedHeader[]
}

/**
 * Validate the proxy list.
 *
 * @example
 * resolveTrustedProxies({ at: ['10.0.0.0/8'] })
 */
export function resolveTrustedProxies(options: TrustProxiesOptions): ResolvedProxies {
  const problems: string[] = []
  const ranges: Cidr[] = []
  for (const entry of options.at) {
    const cidr = parseCidr(entry)
    if (cidr === undefined) problems.push(`trustProxies: "${entry}" is not an IP address or CIDR range (to trust a load balancer, list its address or subnet, never "*").`)
    else ranges.push(cidr)
  }
  failIfAny(problems)
  return { ranges, headers: options.headers ?? ['for', 'proto', 'host'] }
}

/**
 * Who the client is, as far as the trusted proxies say.
 *
 * @example
 * const client: ForwardedClient = { ip: '203.0.113.7', secure: true, host: 'blog.example.com' }
 */
export interface ForwardedClient {
  readonly ip: string
  readonly secure: boolean
  readonly host: string
}

/**
 * Work out the client's address, scheme and host. Without a trusted peer this is just the socket
 * address and the request URL.
 *
 * @example
 * forwardedClient('10.0.0.5', request, proxies) // { ip: '203.0.113.7', secure: true, host: 'blog.example.com' }
 */
export function forwardedClient(peer: string | undefined, request: Request, proxies: ResolvedProxies): ForwardedClient {
  const url = new URL(request.url)
  const direct: ForwardedClient = { ip: peer ?? 'unknown', secure: url.protocol === 'https:', host: url.hostname.toLowerCase() }
  if (peer === undefined || !isTrusted(peer, proxies)) return direct
  const headers = request.headers
  const proto = proxies.headers.includes('proto') ? lastValue(headers.get('x-forwarded-proto'))?.toLowerCase() : undefined
  const host = proxies.headers.includes('host') ? forwardedHost(lastValue(headers.get('x-forwarded-host'))) : undefined
  return {
    ip: proxies.headers.includes('for') ? (clientAddress(peer, headers.get('x-forwarded-for'), proxies) ?? direct.ip) : direct.ip,
    secure: proto === undefined ? direct.secure : proto === 'https',
    host: host ?? direct.host,
  }
}

function isTrusted(address: string, proxies: ResolvedProxies): boolean {
  const ip = parseIp(address)
  return ip !== undefined && proxies.ranges.some((range) => inCidr(ip, range))
}

/**
 * The right-most untrusted address of `X-Forwarded-For` + peer. Any malformed entry makes the
 * whole header untrustworthy (`undefined`): guessing around garbage is how spoofing gets in.
 */
function clientAddress(peer: string, header: string | null, proxies: ResolvedProxies): string | undefined {
  if (header === null) return undefined
  const chain = [...header.split(','), peer].map((entry) => entry.trim())
  const parsed = chain.map((entry) => parseIp(entry))
  if (parsed.some((ip) => ip === undefined)) return undefined
  for (let index = parsed.length - 1; index >= 0; index--) {
    const ip = parsed[index]
    if (ip !== undefined && !proxies.ranges.some((range) => inCidr(ip, range))) return formatIp(ip)
  }
  const first = parsed[0]
  return first === undefined ? undefined : formatIp(first)
}

/** The nearest proxy appends last, so the last value is the one it vouches for. */
function lastValue(header: string | null): string | undefined {
  if (header === null) return undefined
  const value = header.split(',').at(-1)?.trim()
  return value === '' ? undefined : value
}

/** A forwarded host must be a plain host name (or address), optionally with a port. */
function forwardedHost(value: string | undefined): string | undefined {
  if (value === undefined || !/^[a-z0-9.\-[\]:]+$/i.test(value) || !URL.canParse(`http://${value}`)) return undefined
  return new URL(`http://${value}`).hostname.toLowerCase()
}
