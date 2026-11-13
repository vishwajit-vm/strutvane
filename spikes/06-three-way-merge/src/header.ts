/**
 * Every ejected file starts with a one-line header naming the template that produced it:
 *
 *   // @strutvane-template framework/controller@1.2.0 (ejected: this file is yours to edit)
 *
 * The header is how `sv upgrade` finds a file the user MOVED or RENAMED: the lock still points to
 * the old path, but the header travels with the content.
 */

export interface TemplateHeader {
  readonly template: string
  readonly version: string
}

const HEADER = /^﻿?\/\/ @strutvane-template ([a-z0-9][a-z0-9/-]*)@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\b/

/** The header line for a template output. */
export function formatHeader(h: TemplateHeader): string {
  return `// @strutvane-template ${h.template}@${h.version} (ejected: this file is yours to edit)`
}

/** Parse the header from the first line of a file, if present. */
export function parseHeader(text: string): TemplateHeader | undefined {
  const match = HEADER.exec(text)
  if (!match?.[1] || !match[2]) return undefined
  return { template: match[1], version: match[2] }
}
