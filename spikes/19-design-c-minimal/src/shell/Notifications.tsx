/**
 * Notifications popover: the bell in the top bar. Unread items carry an accent dot and a slightly
 * stronger title; "Mark all as read" clears them in place. Tabs filter All / Unread.
 */
import { Bell, CheckCheck, CircleDollarSign, LogIn, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { EmptyState } from '../components/empty-state.tsx'
import { Avatar } from '../components/ui/avatar.tsx'
import { Button } from '../components/ui/button.tsx'
import { Popover, PopoverContent, Tooltip } from '../components/ui/menu.tsx'
import { Segmented } from '../components/ui/controls.tsx'
import { notifications as seed, type Notification } from '../data/activity.ts'
import { cn } from '../lib/cn.ts'
import { formatRelative } from '../lib/format.ts'
import { Link } from '../lib/router.tsx'
import { useOverlays } from './overlays.tsx'

/** System notifications get an icon instead of a face, chosen from the title. */
function SystemIcon({ title }: { title: string }) {
  const icon = title.startsWith('Payment') ? <CircleDollarSign aria-hidden /> : title.includes('overdue') ? <TriangleAlert aria-hidden /> : <LogIn aria-hidden />
  return <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-subtle text-fg-muted [&_svg]:size-3.5">{icon}</span>
}

export function NotificationsButton() {
  const { notificationsOpen, setNotificationsOpen } = useOverlays()
  const [items, setItems] = useState<readonly Notification[]>(seed)
  const [filter, setFilter] = useState<'all' | 'unread'>('all')
  const unread = items.filter((item) => item.unread).length
  const shown = filter === 'all' ? items : items.filter((item) => item.unread)

  return (
    <Popover.Root open={notificationsOpen} onOpenChange={setNotificationsOpen}>
      <Tooltip content="Notifications">
        <Popover.Trigger asChild>
          <Button variant="ghost" size="icon" aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'} className="relative">
            <Bell aria-hidden />
            {unread > 0 && <span aria-hidden className="absolute right-2 top-2 size-1.5 rounded-full bg-accent ring-2 ring-surface" />}
          </Button>
        </Popover.Trigger>
      </Tooltip>
      <PopoverContent align="end" className="w-[min(380px,calc(100vw-24px))] p-0" aria-label="Notifications">
        <div className="flex items-center gap-2 px-3 pb-2 pt-3">
          <h2 className="flex-1 text-sm font-semibold text-fg">Notifications</h2>
          <Segmented
            aria-label="Filter notifications"
            value={filter}
            onValueChange={setFilter}
            items={[
              { value: 'all', label: 'All' },
              { value: 'unread', label: `Unread${unread > 0 ? ` ${unread}` : ''}` },
            ]}
            className="h-7"
          />
        </div>
        {shown.length === 0 ? (
          <EmptyState illustration="inbox" title="You’re all caught up" description="New mentions, payments and alerts will appear here." className="py-8" />
        ) : (
          <ul className="scroll-quiet max-h-96 overflow-y-auto border-t border-border">
            {shown.map((item) => (
              <li key={item.id} className="border-b border-border last:border-b-0">
                <Link
                  to={item.href}
                  onClick={() => {
                    setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, unread: false } : entry)))
                    setNotificationsOpen(false)
                  }}
                  className="flex gap-3 px-3 py-3 outline-offset-[-2px] hover:bg-subtle"
                >
                  {item.actor === null ? <SystemIcon title={item.title} /> : <Avatar name={item.actor.name} tint={item.actor.tint} size="sm" />}
                  <span className="min-w-0 flex-1">
                    <span className={cn('block text-sm', item.unread ? 'font-semibold text-fg' : 'font-medium text-fg-muted')}>{item.title}</span>
                    <span className="mt-0.5 block text-sm text-fg-muted">{item.body}</span>
                    <span className="mt-1 block text-xs text-fg-subtle">{formatRelative(item.at)}</span>
                  </span>
                  {item.unread && (
                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-accent">
                      <span className="sr-only">Unread</span>
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <div className="flex items-center justify-between border-t border-border px-2 py-1.5">
          <Button variant="ghost" size="sm" disabled={unread === 0} onClick={() => setItems((current) => current.map((entry) => ({ ...entry, unread: false })))}>
            <CheckCheck aria-hidden /> Mark all as read
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to="/settings/notifications" onClick={() => setNotificationsOpen(false)}>
              Settings
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover.Root>
  )
}
