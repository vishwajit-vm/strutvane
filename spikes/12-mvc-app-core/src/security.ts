/**
 * `#strutvane/security`: the security kit's building blocks for apps and packages. In the
 * product: `@strutvane/framework/security`.
 */
export { SecuritySettings, SecurityToken, type ResolvedSecurity, type SecurityEnvironment } from './security/settings.ts'
export type { BodyLimitOptions, CorsOptions, CsrfOptions, HeaderOptions, TrustHostsOptions, TrustProxiesOptions } from './security/settings.ts'
export { exactOrigin, matchesPathPattern } from './security/csrf-settings.ts'
export { JsonLimitError, measureJson, parseJsonSafely, type JsonLimitCode, type JsonLimits } from './security/safe-json.ts'
export { blockedReason, embeddedIpv4, formatIp, inCidr, parseCidr, parseIp, type Cidr, type ParsedIp } from './security/ip.ts'
export { cspValue, cspWeakness, CSP_REPORT_PATH } from './security/secure-headers.ts'
export { isTrustedHost } from './security/trusted-hosts.ts'
export { forwardedClient, type ForwardedClient } from './security/trusted-proxies.ts'
