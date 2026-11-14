/**
 * The four exit codes of the installer, in one place.
 *
 * Why fixed codes: CI scripts and the `node strut setup` resume command need to tell "nothing was
 * created" apart from "the project exists but setup is unfinished" without parsing text.
 *
 * @module
 */

/**
 * Process exit codes returned by {@link import('./main.ts').main}.
 *
 * - `ok` (0): the project was created and every setup step finished.
 * - `failed` (1): invalid input, or writing the files failed. Nothing was left on disk.
 * - `incomplete` (2): the project exists, but a setup step failed or was skipped.
 *   The message tells the user to fix the cause and run `npm run setup`.
 * - `cancelled` (130): the user pressed Ctrl+C before anything was written (130 = 128 + SIGINT,
 *   the shell convention).
 *
 * @example
 * process.exitCode = EXIT.incomplete // CI sees 2 and can print "run npm run setup"
 */
export const EXIT = Object.freeze({
  ok: 0,
  failed: 1,
  incomplete: 2,
  cancelled: 130,
} as const)

/** One of the values of {@link EXIT}. */
export type ExitCode = (typeof EXIT)[keyof typeof EXIT]
