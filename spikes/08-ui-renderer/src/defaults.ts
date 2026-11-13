/** The built-in registry: default widgets + cells + English messages, with no per-field overrides. */
import { defaultCells } from './cells.tsx'
import { defaultMessages } from './messages.ts'
import type { Registry } from './registry.tsx'
import { defaultWidgets } from './widgets.tsx'

export const defaultRegistry: Registry = Object.freeze({
  widgets: defaultWidgets,
  fieldWidgets: {},
  cells: defaultCells,
  fieldCells: {},
  messages: defaultMessages,
})
