/**
 * Deals board (kanban): one glass column per stage with a total, cards with company avatar,
 * value, owner, due chip and counts. Cards move between stages with drag and drop, or with the
 * keyboard via the card menu ("Move to…"), so the board is fully usable without a mouse.
 */
import { IconCalendarDue, IconDots, IconMessageCircle, IconPaperclip, IconPlus } from '@tabler/icons-react'
import { useState, type DragEvent } from 'react'
import { PageHeader } from '../../components/PageHeader.tsx'
import { Avatar } from '../../components/ui/avatar.tsx'
import { Badge } from '../../components/ui/badge.tsx'
import { Button } from '../../components/ui/button.tsx'
import { DropdownMenu, MenuContent, MenuItem, MenuLabel } from '../../components/ui/menu.tsx'
import { useToast } from '../../components/ui/toast.tsx'
import { DEALS, STAGES, type Deal, type DealStage } from '../../data/workspace.ts'
import { cn } from '../../lib/cn.ts'
import { formatMoney } from '../../lib/format.ts'

const PRIORITY_TONE = { high: 'danger', medium: 'warning', low: 'neutral' } as const
const STAGE_DOT: Readonly<Record<DealStage, string>> = { lead: 'bg-chart-5', qualified: 'bg-chart-3', proposal: 'bg-chart-1', negotiation: 'bg-chart-2', won: 'bg-success' }

export function BoardPage() {
  const toast = useToast()
  const [deals, setDeals] = useState<readonly Deal[]>(DEALS)
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<DealStage | null>(null)

  const move = (id: string, stage: DealStage): void => {
    const deal = deals.find((candidate) => candidate.id === id)
    if (deal === undefined || deal.stage === stage) return
    setDeals((list) => list.map((candidate) => (candidate.id === id ? { ...candidate, stage } : candidate)))
    toast({ title: `Moved to ${STAGES.find((s) => s.id === stage)?.label ?? stage}`, description: `${deal.title} · ${deal.company}` })
  }
  const onDrop = (event: DragEvent, stage: DealStage): void => {
    event.preventDefault()
    const id = event.dataTransfer.getData('text/plain')
    if (id !== '') move(id, stage)
    setDragging(null)
    setOver(null)
  }
  const pipeline = deals.filter((deal) => deal.stage !== 'won').reduce((sum, deal) => sum + deal.value, 0)

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Billing' }, { label: 'Deals board' }]}
        title="Deals board"
        count={deals.length}
        description={`${formatMoney(pipeline, 'USD', true)} in the open pipeline. Drag cards, or use a card’s menu to move it.`}
        actions={
          <Button>
            <IconPlus aria-hidden /> New deal
          </Button>
        }
      />
      <div className="scroll-thin -mx-1 overflow-x-auto px-1 pb-4">
        <div className="grid auto-cols-[minmax(17rem,1fr)] grid-flow-col gap-4">
          {STAGES.map((stage) => {
            const cards = deals.filter((deal) => deal.stage === stage.id)
            const total = cards.reduce((sum, deal) => sum + deal.value, 0)
            return (
              <section
                key={stage.id}
                aria-labelledby={`stage-${stage.id}`}
                onDragOver={(event) => {
                  event.preventDefault()
                  setOver(stage.id)
                }}
                onDragLeave={() => setOver((current) => (current === stage.id ? null : current))}
                onDrop={(event) => onDrop(event, stage.id)}
                className={cn('glass-card flex min-h-[28rem] flex-col rounded-xl p-3 transition-base', over === stage.id && 'shadow-[0_0_0_2px_var(--ring)]')}
              >
                <header className="flex items-center gap-2 px-1.5 pt-1 pb-3">
                  <span className={cn('size-2.5 rounded-full', STAGE_DOT[stage.id])} aria-hidden />
                  <h2 id={`stage-${stage.id}`} className="text-base font-semibold text-fg">
                    {stage.label}
                  </h2>
                  <span className="rounded-full bg-neutral-soft px-2 text-2xs font-bold text-fg-muted tabular">{cards.length}</span>
                  <span className="ml-auto text-xs font-semibold text-fg-muted tabular">{formatMoney(total, 'USD', true)}</span>
                </header>
                <ul className="flex flex-1 flex-col gap-2.5">
                  {cards.map((deal) => (
                    <li
                      key={deal.id}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.setData('text/plain', deal.id)
                        setDragging(deal.id)
                      }}
                      onDragEnd={() => setDragging(null)}
                      className={cn(
                        'group cursor-grab rounded-lg border border-border bg-surface p-3.5 shadow-glass transition-base hover:-translate-y-0.5 hover:shadow-float active:cursor-grabbing',
                        dragging === deal.id && 'opacity-50',
                      )}
                    >
                      <div className="flex items-start gap-2.5">
                        <Avatar name={deal.company} shape="square" size="sm" />
                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-base leading-snug font-semibold text-fg">{deal.title}</p>
                          <p className="truncate text-xs text-fg-muted">{deal.company}</p>
                        </div>
                        <MoveMenu deal={deal} onMove={move} />
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-lg font-bold tracking-tight text-fg tabular">{formatMoney(deal.value, 'USD').replace(/\.00$/, '')}</span>
                        <Badge tone={PRIORITY_TONE[deal.priority]}>{deal.priority[0]?.toUpperCase() + deal.priority.slice(1)}</Badge>
                      </div>
                      <div className="mt-3 flex items-center gap-3 border-t border-border pt-3 text-xs text-fg-muted">
                        <Avatar name={deal.owner} size="xs" />
                        <span className={cn('flex items-center gap-1', deal.dueInDays <= 5 && deal.stage !== 'won' && 'font-semibold text-danger')}>
                          <IconCalendarDue className="size-3.5" aria-hidden />
                          {deal.stage === 'won' ? 'Closed' : `${deal.dueInDays}d`}
                        </span>
                        <span className="ml-auto flex items-center gap-1">
                          <IconMessageCircle className="size-3.5" aria-hidden />
                          <span className="sr-only">Comments:</span>
                          {deal.comments}
                        </span>
                        <span className="flex items-center gap-1">
                          <IconPaperclip className="size-3.5" aria-hidden />
                          <span className="sr-only">Attachments:</span>
                          {deal.attachments}
                        </span>
                      </div>
                    </li>
                  ))}
                  {cards.length === 0 && <li className="grid flex-1 place-items-center rounded-lg border-2 border-dashed border-input p-6 text-center text-sm text-fg-muted">Drop a deal here</li>}
                </ul>
                <button type="button" className="mt-3 flex h-9 items-center justify-center gap-1.5 rounded-md text-sm font-semibold text-fg-muted transition-fast hover:bg-glass-hover hover:text-fg">
                  <IconPlus className="size-4" aria-hidden /> Add deal
                </button>
              </section>
            )
          })}
        </div>
      </div>
    </>
  )
}

function MoveMenu({ deal, onMove }: { deal: Deal; onMove: (id: string, stage: DealStage) => void }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" size="icon-sm" className="-mt-1 -mr-1.5" aria-label={`Actions for ${deal.title}`}>
          <IconDots aria-hidden />
        </Button>
      </DropdownMenu.Trigger>
      <MenuContent align="end">
        <MenuLabel>Move to</MenuLabel>
        {STAGES.filter((stage) => stage.id !== deal.stage).map((stage) => (
          <MenuItem key={stage.id} onSelect={() => onMove(deal.id, stage.id)}>
            {stage.label}
          </MenuItem>
        ))}
      </MenuContent>
    </DropdownMenu.Root>
  )
}
