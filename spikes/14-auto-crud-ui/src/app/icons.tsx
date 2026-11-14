/**
 * Map sidebar icon names (from owned files) to Lucide components.
 *
 * Why an explicit map instead of "import everything": importing all of Lucide would add every
 * icon to the bundle. The closed `IconName` list keeps it small and typo-proof.
 *
 * @module
 */
import {
  ChartBar,
  CheckSquare,
  Contact,
  CreditCard,
  FileText,
  Folder,
  FolderKanban,
  Package,
  Receipt,
  Settings,
  ShoppingCart,
  Table,
  Tag,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { ReactElement } from 'react'
import type { IconName } from '../shared/icons.ts'

const ICONS: Readonly<Record<IconName, LucideIcon>> = {
  table: Table,
  users: Users,
  receipt: Receipt,
  'shopping-cart': ShoppingCart,
  package: Package,
  contact: Contact,
  settings: Settings,
  'chart-bar': ChartBar,
  'file-text': FileText,
  'folder-kanban': FolderKanban,
  'check-square': CheckSquare,
  'credit-card': CreditCard,
  tag: Tag,
  folder: Folder,
}

/**
 * Render a sidebar icon. Always decorative (`aria-hidden`): the link text names the entry.
 *
 * @example
 * <ResourceIcon name="file-text" />
 */
export function ResourceIcon({ name, className = 'size-4' }: { readonly name: IconName; readonly className?: string }): ReactElement {
  const Icon = ICONS[name]
  return <Icon aria-hidden="true" className={className} />
}
