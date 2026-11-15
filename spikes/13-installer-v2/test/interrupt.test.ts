/**
 * Ctrl+C (SIGINT) and SIGTERM while a setup step runs in a real terminal.
 *
 * Regression (class: a signal swallowed by a progress spinner). clack's spinner puts stdin into raw
 * mode, so Ctrl+C never reaches the running program as SIGINT, and then calls process.exit(0).
 * Driven in a real pseudo-terminal, Ctrl+C during "Installing dependencies" ended the installer
 * with exit code 0 (as if it had succeeded), and npm never got the SIGINT. Now a signal
 * during a step stops the installer with exit 130 and says how to continue; progress up to the
 * last finished step is already saved. (The PTY run itself is in the README's evidence.)
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { EXIT } from '../src/exit-codes.ts'
import { clackReporter } from '../src/reporter.ts'

const sink = { write: () => true }

describe('a signal while a setup step runs (interactive terminal)', () => {
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    it(`${signal}: stops with exit 130 instead of carrying on or exiting 0`, () => {
      const exits: number[] = []
      const step = clackReporter(Date.now, (code) => void exits.push(code), sink).step('Installing dependencies with npm')
      process.emit(signal)
      expect(exits).toEqual([EXIT.cancelled])
      step.done('not reached in real life')
    })
  }

  it('no signal: nothing exits, and the step leaves no signal handler behind', () => {
    const before = [process.listenerCount('SIGINT'), process.listenerCount('SIGTERM')]
    const exits: number[] = []
    const step = clackReporter(Date.now, (code) => void exits.push(code), sink).step('Checking ports')
    step.done('Ports checked')
    expect(exits).toEqual([])
    expect([process.listenerCount('SIGINT'), process.listenerCount('SIGTERM')]).toEqual(before)
  })

  it('never uses a spinner that takes the terminal into raw mode (clack.spinner)', () => {
    const source = readFileSync(new URL('../src/reporter.ts', import.meta.url), 'utf8')
    expect(source).not.toMatch(/clack\.spinner\(/)
  })
})
