/**
 * Sidebar icon names (Lucide names, shadcn's default icon set) and the keyword rule that picks one
 * for a table when the developer has not chosen one.
 *
 * Why names and not components: this file is shared by the Node generator (which writes the name
 * into an owned file) and the React app (which maps the name to a component). Keeping it to plain
 * strings means the generator never loads React.
 *
 * @module
 */

/**
 * Every icon the spike can render. A closed list, so `icon: 'reciept'` (typo) is a type error in an
 * owned file instead of a blank square at runtime.
 *
 * @example
 * const icon: IconName = 'file-text'
 */
export type IconName =
  | 'table'
  | 'users'
  | 'receipt'
  | 'shopping-cart'
  | 'package'
  | 'contact'
  | 'settings'
  | 'chart-bar'
  | 'file-text'
  | 'folder-kanban'
  | 'check-square'
  | 'credit-card'
  | 'tag'
  | 'folder'

/**
 * Keyword → icon, checked in order against the table name. The first keyword the name contains
 * wins, so `invoice_lines` gets `receipt`. The list follows the design doc (§4.9).
 */
const KEYWORD_ICONS: readonly (readonly [keyword: string, icon: IconName])[] = [
  ['user', 'users'],
  ['invoice', 'receipt'],
  ['order', 'shopping-cart'],
  ['product', 'package'],
  ['customer', 'contact'],
  ['contact', 'contact'],
  ['setting', 'settings'],
  ['report', 'chart-bar'],
  ['post', 'file-text'],
  ['file', 'file-text'],
  ['document', 'file-text'],
  ['project', 'folder-kanban'],
  ['task', 'check-square'],
  ['payment', 'credit-card'],
  ['categor', 'folder'],
  ['tag', 'tag'],
]

/**
 * Pick a sidebar icon for a table from its name, falling back to a plain table icon.
 *
 * @example
 * guessIcon('invoice_lines') // 'receipt'
 * guessIcon('widgets') // 'table'
 */
export function guessIcon(table: string): IconName {
  const lower = table.toLowerCase()
  for (const [keyword, icon] of KEYWORD_ICONS) {
    if (lower.includes(keyword)) return icon
  }
  return 'table'
}
