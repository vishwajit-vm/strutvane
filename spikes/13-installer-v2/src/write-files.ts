/**
 * Write the generated project to disk, all or nothing.
 *
 * Failure scenarios and what happens:
 * - **The folder exists and is not empty (or is a file):** refused before anything is written.
 *   Existing files are never overwritten or deleted.
 * - **Writing fails halfway** (disk full, permissions, antivirus lock): everything this run wrote
 *   is removed again; the folder is deleted if this run created it, or emptied if it was empty.
 *
 * @module
 */
import { existsSync, readdirSync, statSync } from 'node:fs'
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { GeneratedFile } from './templates/app-files.ts'

/** The target folder cannot be used. The message says why and what to do. */
export class TargetNotEmptyError extends Error {
  readonly directory: string

  /** @param directory - the folder that was refused */
  constructor(directory: string, reason: string) {
    super(reason)
    this.name = 'TargetNotEmptyError'
    this.directory = directory
  }
}

/**
 * Why a folder cannot hold a new project, or `undefined` when it can (missing, or empty).
 * Synchronous so the name question can validate as the user types.
 *
 * @example
 * targetProblem('C:/code/my-app') // undefined when the folder does not exist yet
 */
export function targetProblem(directory: string): string | undefined {
  if (!existsSync(directory)) return undefined
  if (!statSync(directory).isDirectory()) {
    return `${directory} exists and is a file. Choose another name.`
  }
  if (readdirSync(directory).length > 0) {
    return `${directory} already exists and is not empty. Choose another name (nothing is ever overwritten).`
  }
  return undefined
}

/** Writes one file. Injectable so tests can make the disk fail halfway. */
export type FileWriter = (path: string, content: string) => Promise<void>

/** The real writer: creates parent folders, writes UTF-8 with `\n` line endings as generated. */
const diskWriter: FileWriter = async (path, content) => {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content, { encoding: 'utf8', flag: 'wx' }) // wx: never overwrite
}

/**
 * Write every file into `directory`, rolling back completely on any failure.
 * Throws {@link TargetNotEmptyError} before writing when the folder is not usable.
 *
 * @example
 * await writeProjectFiles('C:/code/my-app', renderProject(options))
 */
export async function writeProjectFiles(
  directory: string,
  files: readonly GeneratedFile[],
  write: FileWriter = diskWriter,
): Promise<void> {
  const problem = targetProblem(directory)
  if (problem !== undefined) throw new TargetNotEmptyError(directory, problem)
  const existed = existsSync(directory)
  await mkdir(directory, { recursive: true })
  try {
    for (const file of files) await write(join(directory, file.path), file.content)
  } catch (error) {
    await rollBack(directory, existed)
    throw error
  }
}

/** Put the folder back the way it was: removed if we created it, emptied if it was empty. */
async function rollBack(directory: string, existed: boolean): Promise<void> {
  if (!existed) {
    await rm(directory, { recursive: true, force: true })
    return
  }
  for (const entry of await readdir(directory)) {
    await rm(join(directory, entry), { recursive: true, force: true })
  }
}
