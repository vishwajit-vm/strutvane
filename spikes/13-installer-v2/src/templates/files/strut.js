#!/usr/bin/env node
// The Strutvane command line for this project. Run: node strut <command>   (node strut help)
//
// Why a plain file run by node: no npm shim, no PowerShell execution policy, and no "--" needed
// before flags (npm run would swallow them). It works the same in PowerShell, cmd, bash and zsh.
//
// Docker mode (.strutvane/env.json says "docker"): like Laravel Sail, every command runs inside
// the app container. On the host this file forwards `node strut <cmd>` to
// `docker compose exec app node strut <cmd>`; inside the container (STRUTVANE_IN_CONTAINER=1) it
// runs the command itself. Only setup and services:* always run on the host. That covers
// everything: `npm run dev` (= node strut dev: API, Vite, queue worker, scheduler), migrate, and
// the Sail-style pass-throughs `node strut npm|npx|node <args>` and `node strut shell`.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { delimiter, dirname, extname, isAbsolute, join } from 'node:path'
import { parseEnv } from 'node:util'

const root = import.meta.dirname
const argv = process.argv.slice(2)
const command = argv[0] ?? 'help'

/** Read a JSON file, or undefined when it is missing or damaged. */
function readJson(relative) {
  try {
    return JSON.parse(readFileSync(join(root, relative), 'utf8'))
  } catch {
    return undefined
  }
}

/** Print a friendly message and stop with an exit code. */
function stop(message, code = 1) {
  process.stderr.write(`${message}\n`)
  process.exit(code)
}

/**
 * The docker program. Resolved through absolute PATH entries only (never the current folder), and
 * never a .cmd/.bat shim. STRUT_CONTAINER_CLI may name another binary (or, for tests, a .js file
 * run with node).
 */
function dockerCommand() {
  const wanted = process.env.STRUT_CONTAINER_CLI || 'docker'
  if (/\.[cm]?js$/.test(wanted)) return [process.execPath, wanted]
  if (/[/\\]/.test(wanted)) return [wanted]
  const extensions = process.platform === 'win32' && extname(wanted) === '' ? ['.exe', '.com'] : ['']
  for (const folder of (process.env.PATH ?? '').split(delimiter)) {
    const clean = folder.replace(/^"|"$/g, '')
    if (clean === '' || !isAbsolute(clean)) continue
    for (const extension of extensions) {
      const candidate = join(clean, wanted + extension)
      try {
        if (statSync(candidate).isFile()) return [candidate]
      } catch {}
    }
  }
  return stop(`Docker was not found. Install Docker Desktop (https://docs.docker.com/get-docker/), or run without Docker.`)
}

/** Run docker compose for this project (always -p, so other projects are never touched). */
function compose(args, options = {}) {
  const env = existsSync(join(root, '.env')) ? parseEnv(readFileSync(join(root, '.env'), 'utf8')) : {}
  const [program, ...prefix] = dockerCommand()
  const project = env.COMPOSE_PROJECT_NAME
  if (!project) stop('COMPOSE_PROJECT_NAME is missing in .env. Run: npm run setup')
  const full = [...prefix, 'compose', '-p', project, '--env-file', join(root, '.env'), '-f', join(root, 'docker', 'compose.yaml'), ...args]
  const result = spawnSync(program, full, { stdio: options.capture ? 'pipe' : 'inherit', encoding: 'utf8', windowsHide: true })
  if (result.error) stop(`Docker could not start: ${result.error.message}. Is Docker installed and running?`)
  return result
}

/**
 * Run a program inside the running app container. `inner` is an argument list handed to
 * `docker compose exec` as separate arguments: no shell on our side, so `a&b` or `$(x)` arrive
 * as plain text.
 */
function forwardRaw(inner) {
  const running = compose(['ps', '--status', 'running', '--services'], { capture: true })
  if (running.status !== 0) stop(`Docker is not answering (${String(running.stderr).trim()}). Start Docker Desktop, then: node strut services:up`)
  if (!String(running.stdout).split(/\r?\n/).includes('app')) {
    stop('The app container is not running. Start it with: node strut services:up')
  }
  // -T (no terminal) when our output is not a terminal, e.g. in CI or when piped.
  const tty = process.stdin.isTTY && process.stdout.isTTY ? [] : ['-T']
  return compose(['exec', ...tty, 'app', ...inner]).status ?? 1
}

/** Forward one `node strut` command into the running app container. */
function forward(args) {
  return forwardRaw(['node', 'strut', ...args])
}

/**
 * Sail-style pass-throughs: `node strut npm|npx|node <args>` and `node strut shell`. In Docker mode
 * they run in the app container (so `npm install` builds for Linux, inside the named volume); on
 * this computer, or inside the container, they run right here. Arguments are passed verbatim and
 * the exit code is passed through.
 */
const PASS_THROUGH = new Set(['npm', 'npx', 'node', 'shell'])

/**
 * Inside the container: a fixed script (no user input in it) that prefers bash and falls back to
 * sh, because slim images often have no bash.
 */
const CONTAINER_SHELL = ['sh', '-c', 'if command -v bash >/dev/null 2>&1; then exec bash; else exec sh; fi']

/** npm's or npx's JS entry next to this node (Windows: node_modules; Linux/macOS: ../lib/node_modules). */
function npmEntry(tool) {
  const file = tool === 'npx' ? 'npx-cli.js' : 'npm-cli.js'
  const home = dirname(process.execPath)
  const candidates = [join(home, 'node_modules', 'npm', 'bin', file), join(home, '..', 'lib', 'node_modules', 'npm', 'bin', file)]
  return candidates.find((candidate) => existsSync(candidate))
}

/** Run a pass-through here (host mode, or already inside the container). Never through a shell. */
function runHere(tool, args) {
  let program
  let full
  if (tool === 'node') {
    program = process.execPath
    full = args
  } else if (tool === 'shell') {
    program = process.platform === 'win32' ? (process.env.ComSpec ?? 'cmd.exe') : (process.env.SHELL ?? 'sh')
    full = []
  } else {
    const entry = npmEntry(tool)
    // Without the JS entry, only a POSIX system can start npm by name without a shell (Windows
    // would need npm.cmd, which means cmd.exe parsing our arguments).
    if (entry === undefined && process.platform === 'win32') stop(`${tool} was not found next to node (${process.execPath}).`)
    program = entry === undefined ? tool : process.execPath
    full = entry === undefined ? args : [entry, ...args]
  }
  const result = spawnSync(program, full, { stdio: 'inherit', windowsHide: true })
  if (result.error) stop(`${tool} could not start: ${result.error.message}`)
  return result.status ?? 1
}

/** `node strut setup`: finish or repeat setup by resuming the installer (always on the host). */
function setup() {
  const state = readJson('.strutvane/setup.json')
  if (!state || !Array.isArray(state.resumeWith)) {
    stop('No .strutvane/setup.json found, so there is no setup to resume. (Spike: a fresh clone would run npx create-strutvane --resume here.)')
  }
  const [program, ...args] = state.resumeWith
  const result = spawnSync(program, [...args, root], { stdio: 'inherit', windowsHide: true })
  if (result.error) stop(`Could not start the installer: ${result.error.message}`)
  return result.status ?? 1
}

const mode = readJson('.strutvane/env.json')?.mode ?? 'host'
const inContainer = process.env.STRUTVANE_IN_CONTAINER === '1'

if (command === 'setup') process.exit(setup())

if (mode === 'docker' && !inContainer) {
  if (command === 'services:up') process.exit(compose(['up', '-d', '--wait', '--wait-timeout', '180']).status ?? 1)
  if (command === 'services:down') process.exit(compose(['down', ...(argv.includes('--volumes') ? ['-v'] : [])]).status ?? 1)
  if (command === 'services:status') process.exit(compose(['ps']).status ?? 1)
  if (command === 'shell') process.exit(forwardRaw(CONTAINER_SHELL))
  if (PASS_THROUGH.has(command)) process.exit(forwardRaw(argv))
  process.exit(forward(argv))
}

if (PASS_THROUGH.has(command)) process.exit(runHere(command, argv.slice(1)))

if (command.startsWith('services:')) {
  stop('This project runs without Docker, so there are no services to start or stop.')
}

// `npm run setup` installs dependencies, so this only appears when someone runs a command in a
// fresh clone before setup.
if (!existsSync(join(root, 'node_modules', '@strutvane', 'framework', 'package.json'))) {
  stop('Dependencies are not installed yet. Run: npm run setup')
}

const { run } = await import('@strutvane/framework/cli')
process.exitCode = await run(argv, { root })
