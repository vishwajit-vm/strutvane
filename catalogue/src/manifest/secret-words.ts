/**
 * "Does this question ask for a credential?"
 *
 * The installer never asks for a key, secret, token or password. Anything typed into it can end
 * up in shell history (`--feature-option x=…`), CI logs, `strutvane.json` (committed) or a screen
 * recording. Credentials belong in `.env` only, which is why a package lists them under
 * `installs.env` with `secret: true`, and the developer types them into `.env` later.
 *
 * The check is deliberately blunt: it refuses any question whose id, label, help or placeholder
 * contains a credential word, in any spelling (`apiKey`, `API_KEY`, "API key", full-width
 * letters, accents). A harmless question that trips it ("Primary key column?") is reworded;
 * that is the price of failing closed.
 *
 * @module
 */
import { words } from './text.ts'

/**
 * Credential words, folded (lower case, no accents). English first, plus the common words in the
 * languages contributors are most likely to write in. Matching is per word, so "keyboard" and
 * "monkey" are fine but "key" and "keys" are not.
 */
export const SECRET_WORDS: ReadonlySet<string> = new Set([
  // English
  'key',
  'keys',
  'apikey',
  'apikeys',
  'secret',
  'secrets',
  'token',
  'tokens',
  'password',
  'passwords',
  'passwd',
  'pwd',
  'passphrase',
  'passphrases',
  'passcode',
  'passcodes',
  'credential',
  'credentials',
  'privatekey',
  // German, French, Spanish, Portuguese, Italian
  'passwort',
  'kennwort',
  'schlussel',
  'geheimnis',
  'cle',
  'cles',
  'jeton',
  'motdepasse',
  'contrasena',
  'clave',
  'senha',
  'chave',
  'segredo',
  'secreto',
  'segreto',
])

/**
 * The credential word found in `text`, or `undefined`. Adjacent words are also tried joined, so
 * `passWord` (split to "pass" + "word") and "mot de passe" are still caught.
 *
 * @example
 * findSecretWord('Stripe API key')   // 'key'
 * findSecretWord('stripeSecretKey')  // 'secret'
 * findSecretWord('Which keyboard?')  // undefined
 */
export function findSecretWord(text: string): string | undefined {
  const list = words(text)
  for (let index = 0; index < list.length; index += 1) {
    const one = list[index] ?? ''
    if (SECRET_WORDS.has(one)) return one
    const two = one + (list[index + 1] ?? '')
    if (index + 1 < list.length && SECRET_WORDS.has(two)) return two
    const three = two + (list[index + 2] ?? '')
    if (index + 2 < list.length && SECRET_WORDS.has(three)) return three
  }
  return undefined
}
