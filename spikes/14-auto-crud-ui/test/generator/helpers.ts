/**
 * Helpers for generator tests: the blog metadata at three points in its migration history, and
 * throwaway app folders.
 *
 * The history mirrors spike 10's real migrations: `subtitle` and `category_id` were added to posts
 * by later migrations, which is exactly the "add a column after customising" scenario.
 */
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseAppMetadata, type AppMetadata } from '../../src/shared/metadata.ts'
import { withoutFields } from '../fixtures.ts'

export { commentsResource, stringField, withField, withoutFields, withoutResource, withResource } from '../fixtures.ts'

/** The spike's root folder. */
export const SPIKE_ROOT = fileURLToPath(new URL('../..', import.meta.url))
/** The example app shipped with the spike. */
export const EXAMPLE_ROOT = join(SPIKE_ROOT, 'example')

/** The blog metadata today (spike 10's committed `resources.json`). */
export function blogToday(): AppMetadata {
  return parseAppMetadata(JSON.parse(readFileSync(join(EXAMPLE_ROOT, '.strutvane', 'resources.json'), 'utf8')))
}

/** The blog before the "add subtitle" and "add category" migrations. */
export function blogBeforeNewColumns(): AppMetadata {
  return withoutFields(blogToday(), 'posts', ['subtitle', 'category_id'])
}

/** The blog after a migration that drops `posts.subtitle`. */
export function blogAfterDroppingSubtitle(): AppMetadata {
  return withoutFields(blogToday(), 'posts', ['subtitle'])
}

const tempDirs: string[] = []

/**
 * A fresh app folder inside the spike (so `#strutvane/ui` resolves through the spike's
 * package.json), with `resources.json` written. Removed by {@link cleanupApps}.
 */
export function makeApp(metadata: AppMetadata): string {
  const parent = join(SPIKE_ROOT, '.tmp')
  mkdirSync(parent, { recursive: true })
  const root = mkdtempSync(join(parent, 'app-'))
  tempDirs.push(root)
  writeMetadata(root, metadata)
  return root
}

/** Simulate `migrate`: write a new `resources.json` into an app. */
export function writeMetadata(root: string, metadata: AppMetadata): void {
  mkdirSync(join(root, '.strutvane'), { recursive: true })
  writeFileSync(join(root, '.strutvane', 'resources.json'), `${JSON.stringify(metadata, null, 2)}\n`)
}

/** Read a file of an app. */
export function readAppFile(root: string, path: string): string {
  return readFileSync(join(root, path), 'utf8')
}

/** Write a file of an app (a developer edit). */
export function writeAppFile(root: string, path: string, text: string): void {
  writeFileSync(join(root, path), text)
}

/** Remove every app folder this test file created. */
export function cleanupApps(): void {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
}
