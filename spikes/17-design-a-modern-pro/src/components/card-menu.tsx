/**
 * `<CardMenu>`: the "⋯" menu in a card header (refresh, export, share). Mock actions toast.
 *
 * @example
 * <CardHeader><CardTitle>Revenue</CardTitle><CardMenu label="Revenue options" /></CardHeader>
 */
import { IconDotsVertical, IconDownload, IconRefresh, IconShare } from '@tabler/icons-react'
import type { ReactElement } from 'react'
import { Button } from './ui/button.tsx'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/menu.tsx'
import { toast } from './ui/toast.tsx'

export function CardMenu({ label }: { readonly label: string }): ReactElement {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} className="-mr-1.5 -mt-1 text-muted-foreground">
          <IconDotsVertical />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-44">
        <DropdownMenuItem onSelect={() => toast({ tone: 'info', title: 'Refreshed', description: 'Figures are up to date.' })}>
          <IconRefresh /> Refresh
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => toast({ tone: 'success', title: 'Export started', description: 'We’ll email you the CSV.' })}>
          <IconDownload /> Export CSV
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => toast({ tone: 'success', title: 'Link copied' })}>
          <IconShare /> Share
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
