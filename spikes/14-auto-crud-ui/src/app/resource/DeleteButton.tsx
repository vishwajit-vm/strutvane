/**
 * `<DeleteButton>` and `<RestoreButton>`: row actions with a confirmation for delete.
 *
 * The confirmation says what will really happen: "moves to the trash and can be restored" on
 * soft-delete tables, "cannot be undone" otherwise (design doc §4.10).
 *
 * @module
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { IconArrowBackUp, IconTrash } from '@tabler/icons-react'
import { useId, useRef, useState, type ReactElement } from 'react'
import type { ResolvedResourceUi } from '../../shared/resolve-ui.ts'
import { ApiError, type ApiRow } from '../api/client.ts'
import { Alert } from '../components/ui/alert.tsx'
import { Button } from '../components/ui/button.tsx'
import { Dialog } from '../components/ui/dialog.tsx'
import { Input } from '../components/ui/input.tsx'
import { useToast } from '../components/ui/toast.tsx'
import { invalidateResource, recordId, recordTitle } from '../data/queries.ts'
import { useApi } from '../registry.tsx'

/**
 * Props of {@link DeleteButton}.
 *
 * @example
 * const props: DeleteButtonProps = { resource: posts, row, onDeleted: () => navigate({ to: '/posts' }) }
 */
export interface DeleteButtonProps {
  readonly resource: ResolvedResourceUi
  readonly row: ApiRow
  readonly onDeleted?: () => void
  /** `icon` in table rows, `full` (icon + text) on the detail page. */
  readonly variant?: 'icon' | 'full'
}

/**
 * A delete button that asks first.
 *
 * @example
 * <DeleteButton resource={posts} row={post} onDeleted={goToList} variant="full" />
 */
export function DeleteButton({ resource, row, onDeleted, variant = 'icon' }: DeleteButtonProps): ReactElement {
  const api = useApi()
  const queryClient = useQueryClient()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const titleId = useId()
  const descriptionId = useId()
  const cancel = useRef<HTMLButtonElement>(null)
  const title = recordTitle(resource, row)
  const singular = resource.label.singular.toLowerCase()
  const permanent = !resource.metadata.softDeletes
  // Permanent deletes need the record's name typed: one slip of the Enter key is not enough.
  const [typed, setTyped] = useState('')
  const confirmed = !permanent || typed.trim() === title
  const confirmId = useId()

  const remove = useMutation({
    mutationFn: async () => {
      const id = recordId(resource, row)
      if (id === undefined) throw new ApiError(0, 'missing_id', 'Cannot delete', 'This row has no id, so it cannot be deleted.')
      await api.remove(resource.metadata, id)
    },
    onSuccess: async () => {
      close()
      await invalidateResource(queryClient, resource.name)
      if (permanent) toast(`“${title}” deleted.`)
      else toast(`“${title}” moved to the trash.`, { label: 'Undo', onAction: () => void undo() })
      onDeleted?.()
    },
  })

  // Undo = restore. The same is always possible later via "Deleted records" → Restore.
  const undo = async (): Promise<void> => {
    const id = recordId(resource, row)
    if (id === undefined) return
    try {
      await api.restore(resource.metadata, id)
      await invalidateResource(queryClient, resource.name)
      toast(`“${title}” restored.`)
    } catch {
      toast(`Could not restore “${title}”. Find it under Deleted records.`)
    }
  }

  const close = (): void => {
    setOpen(false)
    setTyped('')
  }

  return (
    <>
      <Button variant={variant === 'icon' ? 'ghost' : 'outline'} size={variant === 'icon' ? 'icon' : 'default'} aria-label={variant === 'icon' ? `Delete ${title}` : undefined} onClick={() => setOpen(true)}>
        <IconTrash aria-hidden="true" />
        {variant === 'full' && 'Delete'}
      </Button>
      <Dialog open={open} onClose={close} role="alertdialog" labelledBy={titleId} describedBy={descriptionId} initialFocus={cancel}>
        <span aria-hidden="true" className="mb-4 flex size-12 items-center justify-center rounded-full bg-destructive-soft text-destructive">
          <IconTrash className="size-6" />
        </span>
        <h2 id={titleId} className="text-lg font-semibold">
          Delete this {singular}?
        </h2>
        <p id={descriptionId} className="mt-2 text-sm text-muted-foreground">
          “{title}” {resource.metadata.softDeletes ? 'moves to the trash. You can restore it later.' : 'will be deleted. This cannot be undone.'}
        </p>
        {permanent && (
          <div className="mt-4 space-y-1.5">
            <label htmlFor={confirmId} className="block text-sm font-medium">
              Type <span className="font-semibold">{title}</span> to confirm
            </label>
            <Input id={confirmId} value={typed} autoComplete="off" onChange={(event) => setTyped(event.target.value)} />
          </div>
        )}
        {remove.isError && (
          <Alert className="mt-3" title="Could not delete">
            {remove.error instanceof ApiError ? remove.error.message : 'Please try again.'}
          </Alert>
        )}
        <div className="mt-5 flex justify-end gap-2">
          {/* Cancel gets focus first: the safe answer is the default one. */}
          <Button ref={cancel} variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={remove.isPending || !confirmed} onClick={() => remove.mutate()}>
            {remove.isPending ? 'Deleting…' : `Delete ${singular}`}
          </Button>
        </div>
      </Dialog>
    </>
  )
}

/**
 * Restore a soft-deleted row (mock API extension; spike 10 has no restore endpoint yet).
 *
 * @example
 * <RestoreButton resource={posts} row={post} />
 */
export function RestoreButton({ resource, row }: { readonly resource: ResolvedResourceUi; readonly row: ApiRow }): ReactElement {
  const api = useApi()
  const queryClient = useQueryClient()
  const toast = useToast()
  const restore = useMutation({
    mutationFn: async () => {
      const id = recordId(resource, row)
      if (id !== undefined) await api.restore(resource.metadata, id)
    },
    onSuccess: async () => {
      await invalidateResource(queryClient, resource.name)
      toast(`“${recordTitle(resource, row)}” restored.`)
    },
  })
  return (
    <Button variant="ghost" size="sm" disabled={restore.isPending} onClick={() => restore.mutate()} aria-label={`Restore ${recordTitle(resource, row)}`}>
      <IconArrowBackUp aria-hidden="true" />
      Restore
    </Button>
  )
}
