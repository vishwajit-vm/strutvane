import { defineConfig } from '#strutvane/foundation'

/**
 * Application settings, Laravel's config/app.php. Every value is read from the environment with
 * its type, and a wrong value stops the app at boot with a list of everything to fix.
 */
export default defineConfig((env) => ({
  name: env.string('APP_NAME', 'Strutvane Blog'),
  env: env.oneOf('APP_ENV', ['local', 'testing', 'production'], 'production'),
  debug: env.boolean('APP_DEBUG', false),
  url: env.url('APP_URL', 'http://localhost:3000'),
  /** Signs CSRF tokens (and, in the product, encrypted cookies). Required: no safe default exists. */
  key: env.string('APP_KEY'),
  /** Retired keys, comma-separated, still accepted for decryption and signatures (`node strut key:rotate`). */
  previous_keys: env.string('APP_PREVIOUS_KEYS', ''),
}))
