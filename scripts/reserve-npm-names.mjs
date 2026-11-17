#!/usr/bin/env node
/**
 * reserve-npm-names: publishes a tiny "reserved" placeholder (version 0.0.0-reserved.0, dist-tag
 * `reserved`) for every planned @strutvane package whose name does not exist on npm yet.
 *
 * Why: the @strutvane scope already belongs to the project, so nobody else can take these names.
 * But a package must EXIST on npm before its trusted publisher (GitHub Actions OIDC) can be set up,
 * and the project lead wants every planned name visible on npm. A placeholder does both.
 *
 * Who runs it: the project lead, never an AI agent. Publishing needs the lead's own npm login and
 * 2FA (security key), which only the lead may use.
 *
 * Usage (from the hub root):
 *   npm login                                  # once; sign in with your security key
 *   node scripts/reserve-npm-names.mjs --dry-run   # shows what would be published
 *   node scripts/reserve-npm-names.mjs             # publishes; npm asks for 2FA on each publish
 *
 * Safe to re-run: names that already exist on npm are skipped. Nothing is ever unpublished.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const ORG = 'vishwajit-vm'
const dry = process.argv.includes('--dry-run')

/** npm name (without the scope) → GitHub repo. Every planned package from the docs Packages menu. */
const PACKAGES = {
  'log-viewer': 'strutvane-log-viewer',
  'design-crisp': 'strutvane-design-crisp',
  'design-vivid': 'strutvane-design-vivid',
  'design-glass': 'strutvane-design-glass',
  files: 'strutvane-files',
}
for (const id of [
  'agent-tools', 'queue-dashboard', 'redis', 'social-login', 'charts', 'dashboards', 'health',
  'import-export', 'inspector', 'observability', 'search', 'activity-log', 'api-explorer', 'backup',
  'comments', 'media-library', 'pdf', 'privacy', 'settings', 'tags', 'sso', 'feature-flags',
  'graphql', 'mcp-server', 'oauth-server', 'webhooks', 'billing', 'resource-views', 'invoicing',
  'mail-templates', 'notification-channels', 'realtime', 'ai', 'browser-testing', 'cms',
  'form-builder', 'translations', 'workflows', 'geo', 'payments',
]) {
  PACKAGES[id] = `strutvane-${id}`
}

/** True when the name already exists on npm (any version). */
function exists(name) {
  const r = spawnSync('npm', ['view', name, 'name'], { encoding: 'utf8', shell: process.platform === 'win32' })
  return r.status === 0 && r.stdout.trim() === name
}

if (!dry) {
  const who = spawnSync('npm', ['whoami'], { encoding: 'utf8', shell: process.platform === 'win32' })
  if (who.status !== 0) {
    console.error('Not logged in to npm. Run `npm login` first, then run this script again.')
    process.exit(1)
  }
  console.log(`Publishing as npm user: ${who.stdout.trim()}\n`)
}

let done = 0
let skipped = 0
const failed = []
for (const [id, repo] of Object.entries(PACKAGES)) {
  const name = `@strutvane/${id}`
  if (exists(name)) {
    console.log(`skip     ${name} (already on npm)`)
    skipped++
    continue
  }
  if (dry) {
    console.log(`would    ${name}  ← github.com/${ORG}/${repo}`)
    continue
  }
  const dir = mkdtempSync(join(tmpdir(), 'sv-reserve-'))
  try {
    writeFileSync(
      join(dir, 'package.json'),
      `${JSON.stringify(
        {
          name,
          version: '0.0.0-reserved.0',
          description: 'Reserved name for a planned Strutvane package. Not built yet: do not install.',
          license: 'MIT',
          repository: { type: 'git', url: `git+https://github.com/${ORG}/${repo}.git` },
          homepage: 'https://vishwajit-vm.github.io/strutvane-docs/',
          files: ['README.md'],
          publishConfig: { access: 'public', tag: 'reserved' },
        },
        null,
        2,
      )}\n`,
    )
    writeFileSync(
      join(dir, 'README.md'),
      `# ${name}\n\n**Reserved name, not built yet. Do not install.**\n\nThis package will be part of [Strutvane](https://github.com/${ORG}/strutvane). Source: https://github.com/${ORG}/${repo}\n`,
    )
    // stdio inherit so npm can ask for 2FA (security key / browser) interactively.
    execFileSync('npm', ['publish', '--access', 'public', '--tag', 'reserved'], {
      cwd: dir,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })
    console.log(`reserved ${name}`)
    done++
  } catch {
    console.error(`FAILED   ${name}: see npm's message above; re-run the script later to retry`)
    failed.push(name)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

console.log(`\n${dry ? 'Dry run' : `Reserved ${done}`}; already on npm: ${skipped}; failed: ${failed.length}`)
if (failed.length > 0) process.exit(1)
