/**
 * Flush logs on shutdown without ever blocking it.
 *
 * - `SIGTERM` / `SIGINT`: flush with a deadline, then exit with 128 + signal number. Installing a
 *   signal listener disables Node's default "exit immediately", so we must exit ourselves.
 * - `beforeExit`: the event loop is empty; flush (bounded). Guarded so it runs once.
 *
 * Windows note (proved in tests): `child.kill('SIGTERM')` on Windows is TerminateProcess — it cannot
 * be caught, so nothing can flush. Containers (Linux) receive a real SIGTERM, which this handles.
 * In the real framework, @strutvane/core owns signal handling and calls `logger.flush()`; this
 * helper is what the core would do.
 */
import type { Logger } from './logger.ts'

export interface ShutdownOptions {
  readonly timeoutMs?: number
  readonly signals?: readonly NodeJS.Signals[]
  /** Exit after flushing on a signal (default true). */
  readonly exitOnSignal?: boolean
}

const SIGNAL_NUMBERS: Partial<Record<NodeJS.Signals, number>> = { SIGINT: 2, SIGTERM: 15, SIGHUP: 1 }

export function registerShutdownFlush(logger: Logger, options: ShutdownOptions = {}): () => void {
  const timeoutMs = options.timeoutMs ?? 2_000
  const signals = options.signals ?? ['SIGTERM', 'SIGINT']
  let flushing = false

  const onSignal = (signal: NodeJS.Signals): void => {
    if (flushing) return
    flushing = true
    const started = Date.now()
    const code = 128 + (SIGNAL_NUMBERS[signal] ?? 0)
    let exited = false
    const exit = (): void => {
      if (exited || options.exitOnSignal === false) return
      exited = true
      process.exit(code)
    }
    // A REF'D deadline timer keeps the process alive while we flush. Without it, a transport whose
    // promise never settles leaves the event loop empty, Node exits on its own with code 0 and the
    // signal exit code is lost (found by this spike).
    const deadline = setTimeout(() => {
      try {
        process.stderr.write(`logs: shutdown flush timed out after ${Date.now() - started} ms\n`)
      } catch {}
      exit()
    }, timeoutMs)
    logger
      .flush(timeoutMs)
      .catch(() => ({ flushed: false, pending: -1 }))
      .then((result) => {
        if (result.flushed) {
          clearTimeout(deadline)
          exit()
        }
        // Not flushed: the deadline timer exits.
      })
  }

  let beforeExitDone = false
  const onBeforeExit = (): void => {
    if (beforeExitDone) return
    beforeExitDone = true
    void logger.flush(timeoutMs)
  }

  for (const s of signals) process.on(s, onSignal)
  process.on('beforeExit', onBeforeExit)
  return () => {
    for (const s of signals) process.off(s, onSignal)
    process.off('beforeExit', onBeforeExit)
  }
}
