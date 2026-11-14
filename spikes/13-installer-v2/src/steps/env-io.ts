/**
 * Read and write a project's `.env` and `.env.example`, shared by the steps that edit them.
 *
 * @module
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseEnv } from '../env-file.ts'

/** Which env file. */
export type EnvFile = '.env' | '.env.example'

/**
 * The text of one env file.
 *
 * @example
 * readEnvFile('C:/code/my-app', '.env')
 */
export function readEnvFile(directory: string, file: EnvFile = '.env'): string {
  return readFileSync(join(directory, file), 'utf8')
}

/**
 * Replace the text of one env file.
 *
 * @example
 * writeEnvFile('C:/code/my-app', '.env', setEnvValue(text, 'APP_PORT', '3001'))
 */
export function writeEnvFile(directory: string, file: EnvFile, text: string): void {
  writeFileSync(join(directory, file), text)
}

/**
 * One value from `.env`, or `undefined` when the key is missing.
 *
 * @example
 * envValue('C:/code/my-app', 'DB_PORT') // '3306'
 */
export function envValue(directory: string, key: string): string | undefined {
  return parseEnv(readEnvFile(directory)).get(key)
}
