/**
 * API tokens: list with prefix, scopes, last use and expiry; create (the secret is shown exactly
 * once, with a copy button and a warning) and revoke (confirmed). Only the non-secret prefix is
 * ever displayed afterwards, matching how the backend stores only a hash.
 */
import { Check, Copy, Ellipsis, KeyRound, Plus, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { EmptyState } from '../../components/empty-state.tsx'
import { Badge } from '../../components/ui/badge.tsx'
import { Button } from '../../components/ui/button.tsx'
import { Checkbox, Select } from '../../components/ui/controls.tsx'
import { Dialog, DialogContent } from '../../components/ui/dialog.tsx'
import { Field } from '../../components/ui/field.tsx'
import { Input } from '../../components/ui/input.tsx'
import { Menu, MenuContent, MenuItem } from '../../components/ui/menu.tsx'
import { useToast } from '../../components/ui/toast.tsx'
import { type ApiToken, apiTokens as seed, type TokenScope } from '../../data/activity.ts'
import { formatDate, formatRelative } from '../../lib/format.ts'
import { useOverlays } from '../../shell/overlays.tsx'
import { SettingsHeader } from './SettingsPage.tsx'

const SCOPES: readonly { id: TokenScope; label: string }[] = [
  { id: 'invoices:read', label: 'Read invoices' },
  { id: 'invoices:write', label: 'Create and edit invoices' },
  { id: 'customers:read', label: 'Read customers' },
  { id: 'webhooks', label: 'Manage webhooks' },
]

function CreateTokenDialog({ open, onOpenChange, onCreate }: { open: boolean; onOpenChange: (open: boolean) => void; onCreate: (token: ApiToken) => void }) {
  const [name, setName] = useState('')
  const [scopes, setScopes] = useState<TokenScope[]>(['invoices:read'])
  const [expiry, setExpiry] = useState('90')
  const [error, setError] = useState<string | undefined>()
  const [secret, setSecret] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const reset = () => {
    setName('')
    setScopes(['invoices:read'])
    setSecret(null)
    setCopied(false)
    setError(undefined)
  }

  const create = () => {
    if (name.trim() === '') {
      setError('Name the token after what uses it, e.g. “ERP sync”.')
      return
    }
    const value = 'sv_live_Q9vT3kLm8RzXw2NpH4cYb7Ef'
    setSecret(value)
    onCreate({ id: `t${Date.now()}`, name: name.trim(), prefix: value.slice(0, 12), scopes, createdAt: '2026-11-14T09:30:00Z', lastUsedAt: null, expiresAt: expiry === 'never' ? null : '2027-02-12T09:30:00Z' })
  }

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) reset()
      }}
    >
      {secret === null ? (
        <DialogContent
          title="Create API token"
          description="Tokens act on behalf of this workspace. Give each integration its own token."
          footer={
            <>
              <Button onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button variant="primary" onClick={create}>
                Create token
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-5">
            <Field label="Name" error={error}>
              {(control) => <Input {...control} placeholder="ERP sync (production)" value={name} onChange={(event) => setName(event.target.value)} />}
            </Field>
            <fieldset>
              <legend className="mb-2 text-sm font-medium text-fg">Permissions</legend>
              <div className="flex flex-col gap-1">
                {SCOPES.map((scope) => (
                  <label key={scope.id} className="flex h-8 cursor-pointer items-center gap-2.5 text-sm text-fg">
                    <Checkbox checked={scopes.includes(scope.id)} onCheckedChange={(value) => setScopes((current) => (value === true ? [...current, scope.id] : current.filter((id) => id !== scope.id)))} />
                    {scope.label}
                    <span className="num ml-auto text-xs text-fg-subtle">{scope.id}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <Field label="Expires">
              {(control) => (
                <Select
                  value={expiry}
                  onValueChange={setExpiry}
                  triggerProps={{ id: control.id }}
                  options={[
                    { value: '30', label: 'In 30 days' },
                    { value: '90', label: 'In 90 days' },
                    { value: '365', label: 'In 1 year' },
                    { value: 'never', label: 'Never (not recommended)' },
                  ]}
                />
              )}
            </Field>
          </div>
        </DialogContent>
      ) : (
        <DialogContent title="Copy your new token" description="This is the only time the full token is shown." footer={<Button variant="primary" onClick={() => onOpenChange(false)}>Done</Button>}>
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-subtle p-1.5 pl-3">
              <code className="num min-w-0 flex-1 truncate text-sm text-fg">{secret}</code>
              <Button
                size="sm"
                onClick={() => {
                  void navigator.clipboard?.writeText(secret).catch(() => undefined)
                  setCopied(true)
                }}
              >
                {copied ? <Check aria-hidden /> : <Copy aria-hidden />} {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>
            <p className="flex gap-2 rounded-lg bg-warning-subtle p-3 text-sm text-warning-text">
              <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
              Store it in your secrets manager now. If you lose it, revoke it and create a new one.
            </p>
          </div>
        </DialogContent>
      )}
    </Dialog.Root>
  )
}

export function ApiTokens() {
  const [items, setItems] = useState<readonly ApiToken[]>(seed)
  const [open, setOpen] = useState(false)
  const { confirm } = useOverlays()
  const toast = useToast()

  const revoke = async (token: ApiToken) => {
    const ok = await confirm({ title: `Revoke “${token.name}”?`, description: 'Anything using this token stops working immediately. This cannot be undone.', confirmLabel: 'Revoke token' })
    if (!ok) return
    setItems((current) => current.filter((item) => item.id !== token.id))
    toast({ title: 'Token revoked', description: token.name })
  }

  return (
    <div>
      <SettingsHeader
        title="API tokens"
        description="Personal tokens for scripts and integrations. Treat them like passwords."
        actions={
          <Button variant="primary" onClick={() => setOpen(true)}>
            <Plus aria-hidden /> Create token
          </Button>
        }
      />
      {items.length === 0 ? (
        <EmptyState illustration="files" title="No tokens" description="Create a token to connect your ERP, BI tool or scripts." />
      ) : (
        <div className="relative mt-6 overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[640px] text-sm">
            <caption className="sr-only">API tokens</caption>
            <thead>
              <tr className="h-9 border-b border-border bg-subtle/60 text-left text-xs text-fg-muted">
                <th scope="col" className="pl-4 font-medium">
                  Token
                </th>
                <th scope="col" className="font-medium">
                  Permissions
                </th>
                <th scope="col" className="font-medium">
                  Last used
                </th>
                <th scope="col" className="font-medium">
                  Expires
                </th>
                <th scope="col" className="w-12 pr-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((token) => (
                <tr key={token.id} className="h-14">
                  <td className="pl-4">
                    <span className="flex items-center gap-2.5">
                      <KeyRound aria-hidden className="size-4 shrink-0 text-fg-subtle" />
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-fg">{token.name}</span>
                        <span className="num block text-xs text-fg-subtle">{token.prefix}••••••••</span>
                      </span>
                    </span>
                  </td>
                  <td>
                    <span className="flex flex-wrap gap-1">
                      {token.scopes.map((scope) => (
                        <Badge key={scope} className="num">
                          {scope}
                        </Badge>
                      ))}
                    </span>
                  </td>
                  <td className="whitespace-nowrap text-fg-muted">{token.lastUsedAt === null ? <span className="text-fg-subtle">Never</span> : formatRelative(token.lastUsedAt)}</td>
                  <td className="whitespace-nowrap text-fg-muted">{token.expiresAt === null ? <Badge tone="warning">Never</Badge> : formatDate(token.expiresAt)}</td>
                  <td className="pr-3 text-right">
                    <Menu.Root>
                      <Menu.Trigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${token.name}`}>
                          <Ellipsis aria-hidden />
                        </Button>
                      </Menu.Trigger>
                      <MenuContent align="end">
                        <MenuItem>Rename</MenuItem>
                        <MenuItem>Roll token</MenuItem>
                        <MenuItem destructive onSelect={() => void revoke(token)}>
                          Revoke
                        </MenuItem>
                      </MenuContent>
                    </Menu.Root>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <CreateTokenDialog open={open} onOpenChange={setOpen} onCreate={(token) => setItems((current) => [token, ...current])} />
    </div>
  )
}
