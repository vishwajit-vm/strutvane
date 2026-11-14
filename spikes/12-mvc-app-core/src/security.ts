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
export { DecryptError, openSealed, packSealed, seal, unpackSealed, IV_BYTES, TAG_BYTES, type Sealed } from './security/aead.ts'
export { decrypt, encrypt, Encrypter, EncrypterToken, type CryptOptions } from './security/encrypter.ts'
export { Keyring, KeyringToken, keyProblem, parseAppKey, MIN_KEY_BYTES, type AppKey } from './security/keyring.ts'
export { signUrl, verifySignedUrl, type SignatureVerdict } from './security/signed-url.ts'
export { safeRedirectPath } from './security/redirect.ts'
export { HttpClientError, safeFetch, type HttpClientErrorCode, type Resolver, type SafeFetchOptions, type SafeResponse } from './security/http-client.ts'
