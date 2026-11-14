/**
 * The "?" dialog: every keyboard shortcut, grouped, rendered from the same table that installs
 * them (`shortcuts.ts`), so the help can never drift from the behaviour.
 */
import { Kbd } from '../components/ui/badge.tsx'
import { Dialog, DialogContent } from '../components/ui/dialog.tsx'
import { useOverlays } from './overlays.tsx'
import { GENERAL, GO_TO, LIST, type Shortcut } from './shortcuts.ts'

function Group({ title, items }: { title: string; items: readonly Shortcut[] }) {
  return (
    <section>
      <h3 className="mb-1 text-xs font-medium text-fg-subtle">{title}</h3>
      <dl className="divide-y divide-border">
        {items.map((item) => (
          <div key={item.label} className="flex h-9 items-center justify-between gap-4">
            <dt className="text-sm text-fg">{item.label}</dt>
            <dd className="flex items-center gap-1">
              {item.keys.map((key, index) => (
                <span key={key} className="flex items-center gap-1">
                  {index > 0 && item.keys.length === 2 && item.keys[0] === 'G' && <span className="text-2xs text-fg-subtle">then</span>}
                  <Kbd>{key}</Kbd>
                </span>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export function ShortcutsDialog() {
  const { shortcutsOpen, setShortcutsOpen } = useOverlays()
  return (
    <Dialog.Root open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
      <DialogContent title="Keyboard shortcuts" description="Everything in Strutvane can be reached without a mouse." className="max-w-xl">
        <div className="grid gap-6 pb-2 sm:grid-cols-2">
          <div className="flex flex-col gap-6">
            <Group title="General" items={GENERAL} />
            <Group title="Lists" items={LIST} />
          </div>
          <Group title="Navigation" items={GO_TO} />
        </div>
      </DialogContent>
    </Dialog.Root>
  )
}
