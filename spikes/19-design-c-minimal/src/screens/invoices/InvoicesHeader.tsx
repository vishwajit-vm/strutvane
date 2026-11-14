/**
 * The header shared by the three invoice views (table, board, calendar), plus the view switch, so
 * changing view keeps the title, count and actions perfectly still: only the content changes.
 */
import { CalendarDays, Download, Plus, SquareKanban, TableProperties, Upload } from 'lucide-react'
import { PageHeader } from '../../components/page-header.tsx'
import { Button } from '../../components/ui/button.tsx'
import { Segmented } from '../../components/ui/controls.tsx'
import { Tooltip } from '../../components/ui/menu.tsx'
import { useToast } from '../../components/ui/toast.tsx'
import { Link, useRouter } from '../../lib/router.tsx'

export type InvoiceView = 'table' | 'board' | 'calendar'

const VIEW_PATHS: Record<InvoiceView, string> = { table: '/invoices', board: '/invoices/board', calendar: '/invoices/calendar' }

/** Table / Board / Calendar. Icon-only below 640 px, with the label kept as the accessible name. */
export function ViewSwitch({ value }: { value: InvoiceView }) {
  const { navigate } = useRouter()
  return (
    <Segmented
      aria-label="View"
      value={value}
      onValueChange={(view) => navigate(VIEW_PATHS[view])}
      items={[
        { value: 'table', label: 'Table', icon: <TableProperties aria-hidden /> },
        { value: 'board', label: 'Board', icon: <SquareKanban aria-hidden /> },
        { value: 'calendar', label: 'Calendar', icon: <CalendarDays aria-hidden /> },
      ]}
    />
  )
}

export function InvoicesHeader({ count, loading = false }: { count: number; loading?: boolean }) {
  const toast = useToast()
  return (
    <PageHeader
      breadcrumbs={[{ label: 'Billing', to: '/' }, { label: 'Invoices' }]}
      back="/"
      title="Invoices"
      {...(loading ? {} : { count })}
      actions={
        <>
          <Tooltip content="Import from CSV">
            <Button aria-label="Import" onClick={() => toast({ title: 'Import', description: 'Drop a CSV with number, customer and amount columns.', tone: 'info' })}>
              <Upload aria-hidden /> <span className="max-sm:hidden">Import</span>
            </Button>
          </Tooltip>
          <Tooltip content="Export the current view">
            <Button aria-label="Export" onClick={() => toast({ title: 'Export ready', description: `${count} invoices exported to invoices.csv.` })}>
              <Download aria-hidden /> <span className="max-sm:hidden">Export</span>
            </Button>
          </Tooltip>
          <Button asChild variant="primary">
            <Link to="/invoices/new" aria-keyshortcuts="C">
              <Plus aria-hidden /> New invoice
            </Link>
          </Button>
        </>
      }
    />
  )
}
