#!/usr/bin/env node
/**
 * The `create-strutvane` executable: wires the real terminal, disk, programs and clock into
 * {@link main}. Run it with `node src/cli.ts my-app` (Node 24 runs TypeScript directly).
 *
 * @module
 */
import { setTimeout as sleep } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import { clackPrompter } from './clack-prompter.ts'
import { generateReadablePassword, generateSecret } from './env-file.ts'
import { main } from './main.ts'
import { resolveNpmCli } from './npm-cli.ts'
import { isPortFree } from './ports.ts'
import { clackReporter, plainReporter } from './reporter.ts'
import { nodeSpawner } from './spawn.ts'

const entry = fileURLToPath(import.meta.url)

process.exitCode = await main({
  argv: process.argv.slice(2),
  cwd: process.cwd(),
  env: process.env,
  interactiveTerminal: process.stdin.isTTY === true && process.stdout.isTTY === true,
  nodeVersion: process.versions.node,
  execPath: process.execPath,
  // `node strut setup` appends the project folder to this command.
  resumeWith: [process.execPath, entry, '--resume'],
  out: (text) => process.stdout.write(text),
  prompter: clackPrompter,
  reporter: (interactive) => (interactive ? clackReporter() : plainReporter((text) => process.stdout.write(text))),
  spawn: nodeSpawner,
  isPortFree,
  npmCli: () => resolveNpmCli(process.env, process.execPath),
  sleep: (ms) => sleep(ms),
  now: () => new Date(),
  generateSecret: () => generateSecret(),
  generatePassword: generateReadablePassword,
  // Only Linux needs it: Docker Desktop (Windows, macOS) maps file ownership itself.
  hostUser:
    process.platform === 'linux' && process.getuid !== undefined && process.getgid !== undefined
      ? { uid: process.getuid(), gid: process.getgid() }
      : undefined,
})
