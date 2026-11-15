/**
 * Progress output for the setup steps: one line per step with its duration, like
 * "✔ Dependencies installed with npm  4.2s".
 *
 * Two implementations share one interface: {@link plainReporter} (CI logs, pipes, tests) and the
 * clack one in clack-reporter.ts (spinners in a real terminal).
 *
 * @module
 */
import * as clack from '@clack/prompts'
import { EXIT } from './exit-codes.ts'

/** The handle for one running step. Call exactly one of `done`, `skipped` or `failed`. */
export interface StepProgress {
  /** Finished. `message` is the past-tense line, e.g. "Files written (23 files)". */
  done(message: string): void
  /** Not done, on purpose or because it cannot run yet. `reason` says why and what to do. */
  skipped(reason: string): void
  /** Failed. `message` says what went wrong. */
  failed(message: string): void
}

/**
 * Where the installer writes what it is doing.
 *
 * @example
 * const step = reporter.step('Installing dependencies with npm')
 * step.done('Dependencies installed (1 package)')
 */
export interface Reporter {
  intro(title: string): void
  step(title: string): StepProgress
  info(message: string): void
  warn(message: string): void
  error(message: string): void
  box(title: string, lines: readonly string[]): void
  outro(message: string): void
}

/**
 * Format a duration the way people read it: "120ms", "4.2s", "1m 3s".
 *
 * @example
 * formatDuration(4210) // '4.2s'
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`
  const minutes = Math.floor(ms / 60_000)
  return `${minutes}m ${Math.round((ms % 60_000) / 1000)}s`
}

/**
 * A reporter that writes plain lines, for CI logs, pipes and tests (no cursor tricks).
 *
 * @param write - where text goes (usually `process.stdout.write`)
 * @param now - the clock in milliseconds (tests pass a fixed one for stable durations)
 *
 * @example
 * const reporter = plainReporter((text) => process.stdout.write(text))
 */
export function plainReporter(write: (text: string) => void, now: () => number = Date.now): Reporter {
  const line = (text: string) => write(`${text}\n`)
  return {
    intro: (title) => line(`\n${title}\n`),
    step(title) {
      const started = now()
      line(`… ${title}`)
      const took = () => formatDuration(now() - started)
      return {
        done: (message) => line(`✔ ${message}  ${took()}`),
        skipped: (reason) => line(`○ ${reason}`),
        failed: (message) => line(`✖ ${message}`),
      }
    },
    info: (message) => line(`│ ${message}`),
    warn: (message) => line(`▲ ${message}`),
    error: (message) => line(`✖ ${message}`),
    box: (title, lines) => {
      line(`\n── ${title} ${'─'.repeat(Math.max(0, 60 - title.length))}`)
      for (const text of lines) line(`   ${text}`)
      line('─'.repeat(64))
    },
    outro: (message) => line(`\n${message}\n`),
  }
}

/** The message shown when a step is interrupted. */
export const INTERRUPTED_MESSAGE = 'Stopped (Ctrl+C). Finished steps are saved: run npm run setup in the project folder to continue.'

/**
 * A reporter with clack's look (boxes, log lines) and its own small spinner, for a real terminal.
 *
 * Why not clack's spinner: it puts stdin into raw mode while it spins, so Ctrl+C no longer reaches
 * the running program (npm, docker) as SIGINT, and clack then calls `process.exit(0)`. Driven in a
 * real pseudo-terminal, Ctrl+C during "Installing dependencies" ended the installer with exit code
 * 0 (as if it had succeeded), and npm, never told to stop, could carry on in the background. This
 * spinner leaves the terminal alone: Ctrl+C reaches the whole foreground process group, the child
 * stops, and the installer exits 130 with how to continue (every finished step is already saved).
 * SIGTERM to the installer alone does the same.
 *
 * @param exit - ends the process (tests pass a recorder)
 * @param output - where the spinner draws (tests pass a sink)
 *
 * @example
 * const reporter = clackReporter()
 */
export function clackReporter(
  now: () => number = Date.now,
  exit: (code: number) => void = (code) => process.exit(code),
  output: { write(text: string): unknown; isTTY?: boolean } = process.stdout,
): Reporter {
  return {
    intro: (title) => clack.intro(title),
    step(title) {
      const started = now()
      const frames = ['◒', '◐', '◓', '◑']
      let frame = 0
      const draw = () => {
        output.write(`\r\u001b[2K${frames[frame % frames.length] ?? '◒'}  ${title}`)
        frame += 1
      }
      draw()
      const timer = setInterval(draw, 120)
      timer.unref()
      const clear = () => {
        clearInterval(timer)
        process.removeListener('SIGINT', interrupted)
        process.removeListener('SIGTERM', interrupted)
        output.write('\r\u001b[2K')
      }
      function interrupted(): void {
        clear()
        clack.log.warn(INTERRUPTED_MESSAGE)
        exit(EXIT.cancelled)
      }
      process.once('SIGINT', interrupted)
      process.once('SIGTERM', interrupted)
      const took = () => formatDuration(now() - started)
      return {
        done: (message) => {
          clear()
          clack.log.step(`${message}  ${took()}`)
        },
        skipped: (reason) => {
          clear()
          clack.log.warn(`○ ${reason}`)
        },
        failed: (message) => {
          clear()
          clack.log.error(message)
        },
      }
    },
    info: (message) => clack.log.info(message),
    warn: (message) => clack.log.warn(message),
    error: (message) => clack.log.error(message),
    box: (title, lines) => clack.note(lines.join('\n'), title),
    outro: (message) => clack.outro(message),
  }
}
