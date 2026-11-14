/**
 * Map sidebar icon names (from owned files) to Tabler Icons (MIT).
 *
 * Why an explicit map instead of "import everything": importing the whole icon set would put
 * thousands of icons in the bundle. The closed `IconName` list keeps it small and typo-proof.
 * Icon names are Lucide-style (shared with the generator); the map picks the Tabler equivalent.
 *
 * @module
 */
import {
  IconAddressBook,
  IconChartBar,
  IconCreditCard,
  IconFileText,
  IconFolder,
  IconLayoutKanban,
  IconPackage,
  IconReceipt,
  IconSettings,
  IconShoppingCart,
  IconSquareCheck,
  IconTable,
  IconTag,
  IconUsers,
  type Icon,
} from '@tabler/icons-react'
import type { ReactElement } from 'react'
import type { IconName } from '../shared/icons.ts'

const ICONS: Readonly<Record<IconName, Icon>> = {
  table: IconTable,
  users: IconUsers,
  receipt: IconReceipt,
  'shopping-cart': IconShoppingCart,
  package: IconPackage,
  contact: IconAddressBook,
  settings: IconSettings,
  'chart-bar': IconChartBar,
  'file-text': IconFileText,
  'folder-kanban': IconLayoutKanban,
  'check-square': IconSquareCheck,
  'credit-card': IconCreditCard,
  tag: IconTag,
  folder: IconFolder,
}

/**
 * Render a resource icon. Always decorative (`aria-hidden`): the visible text names the entry.
 * Stroke 1.75 at 20 px is the standard menu icon (DESIGN.md, Iconography).
 *
 * @example
 * <ResourceIcon name="file-text" />
 */
export function ResourceIcon({ name, className = 'size-5' }: { readonly name: IconName; readonly className?: string }): ReactElement {
  const Glyph = ICONS[name]
  return <Glyph aria-hidden="true" stroke={1.75} className={className} />
}
