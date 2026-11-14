/**
 * Team members: seat usage, search and role filter, a members table with inline role changes,
 * pending invitations, and an invite dialog (also reachable from the command palette, which links
 * here with `?invite=1`). Owners can't be demoted from this screen: ownership transfer is its own,
 * deliberate flow.
 */
import { ChevronDown, Ellipsis, Mail, Search, UserMinus, UserPlus } from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import { useState } from 'react'
import { Avatar } from '../../components/ui/avatar.tsx'
import { Badge, StatusBadge } from '../../components/ui/badge.tsx'
import { Button } from '../../components/ui/button.tsx'
import { Segmented, Select } from '../../components/ui/controls.tsx'
import { Dialog, DialogContent } from '../../components/ui/dialog.tsx'
import { Field } from '../../components/ui/field.tsx'
import { Input, InputGroup, Textarea } from '../../components/ui/input.tsx'
import { Menu, MenuContent, MenuItem, MenuRadioItem, MenuSeparator } from '../../components/ui/menu.tsx'
import { useToast } from '../../components/ui/toast.tsx'
import { type Member, members as seed, type Role, ROLE_DESCRIPTIONS, ROLE_LABELS } from '../../data/people.ts'
import { formatRelative } from '../../lib/format.ts'
import { useRouter, withParams } from '../../lib/router.tsx'
import { useOverlays } from '../../shell/overlays.tsx'
import { SettingsHeader } from './SettingsPage.tsx'

const SEATS = 10
const ROLES: readonly Role[] = ['owner', 'admin', 'member', 'viewer']

function RoleMenu({ member, onChange }: { member: Member; onChange: (role: Role) => void }) {
  if (member.role === 'owner') return <Badge tone="accent">Owner</Badge>
  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <Button variant="ghost" size="sm" className="-ml-2 text-fg" aria-label={`Role for ${member.name}: ${ROLE_LABELS[member.role]}`}>
          {ROLE_LABELS[member.role]} <ChevronDown aria-hidden className="size-3.5! text-fg-subtle" />
        </Button>
      </Menu.Trigger>
      <MenuContent align="start" className="w-72">
        <DropdownMenu.RadioGroup value={member.role} onValueChange={(value) => onChange(value as Role)}>
          {ROLES.filter((role) => role !== 'owner').map((role) => (
            <MenuRadioItem key={role} value={role} className="h-auto items-start py-2">
              <span>
                <span className="block font-medium">{ROLE_LABELS[role]}</span>
                <span className="block text-xs text-fg-muted">{ROLE_DESCRIPTIONS[role]}</span>
              </span>
            </MenuRadioItem>
          ))}
        </DropdownMenu.RadioGroup>
      </MenuContent>
    </Menu.Root>
  )
}

function InviteDialog({ open, onOpenChange, onInvite }: { open: boolean; onOpenChange: (open: boolean) => void; onInvite: (emails: string[], role: Role) => void }) {
  const [emails, setEmails] = useState('')
  const [role, setRole] = useState<Role>('member')
  const [error, setError] = useState<string | undefined>()

  const submit = () => {
    const list = emails.split(/[\s,;]+/).filter(Boolean)
    const invalid = list.filter((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    if (list.length === 0) return setError('Add at least one e-mail address.')
    if (invalid.length > 0) return setError(`Check ${invalid.length === 1 ? 'this address' : 'these addresses'}: ${invalid.join(', ')}`)
    onInvite(list, role)
    setEmails('')
    setError(undefined)
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Invite to Northwind Labs"
        description="Invitations expire after 7 days. Members join with the role you choose."
        footer={
          <>
            <Button onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button variant="primary" onClick={submit}>
              <Mail aria-hidden /> Send invites
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <Field label="E-mail addresses" description="Separate several with commas or new lines." error={error}>
            {(control) => <Textarea {...control} rows={3} placeholder="name@company.com, other@company.com" value={emails} onChange={(event) => setEmails(event.target.value)} />}
          </Field>
          <Field label="Role" description={ROLE_DESCRIPTIONS[role]}>
            {(control) => (
              <Select
                value={role}
                onValueChange={(value) => setRole(value as Role)}
                triggerProps={{ id: control.id }}
                options={ROLES.filter((option) => option !== 'owner').map((option) => ({ value: option, label: ROLE_LABELS[option] }))}
              />
            )}
          </Field>
        </div>
      </DialogContent>
    </Dialog.Root>
  )
}

export function Team() {
  const { search, pathname, navigate } = useRouter()
  const { confirm } = useOverlays()
  const toast = useToast()
  const [people, setPeople] = useState<readonly Member[]>(seed)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'active' | 'invited'>('all')
  const inviteOpen = search.get('invite') === '1'
  const setInviteOpen = (open: boolean) => navigate(`${pathname}${withParams(search, { invite: open ? '1' : null })}`, { replace: true })

  const shown = people.filter(
    (person) => (filter === 'all' || person.status === filter) && `${person.name} ${person.email}`.toLowerCase().includes(query.trim().toLowerCase()),
  )
  const used = people.length

  const remove = async (member: Member) => {
    const ok = await confirm({
      title: member.status === 'invited' ? `Cancel invite for ${member.email}?` : `Remove ${member.name}?`,
      description: member.status === 'invited' ? 'The invitation link stops working.' : `${member.name.split(' ')[0]} loses access immediately. Their invoices stay, owned by you.`,
      confirmLabel: member.status === 'invited' ? 'Cancel invite' : 'Remove member',
    })
    if (!ok) return
    setPeople((current) => current.filter((person) => person.id !== member.id))
    toast({ title: member.status === 'invited' ? 'Invite cancelled' : `${member.name} removed` })
  }

  return (
    <div>
      <SettingsHeader
        title="Team members"
        description="Manage who can access Northwind Labs and what they can do."
        actions={
          <Button variant="primary" onClick={() => setInviteOpen(true)}>
            <UserPlus aria-hidden /> Invite member
          </Button>
        }
      />

      <div className="mt-6 flex flex-wrap items-center gap-4 rounded-lg border border-border p-4">
        <div className="min-w-48 flex-1">
          <p className="text-sm font-medium text-fg">
            <span className="num">{used}</span> of <span className="num">{SEATS}</span> seats used
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Seats used" aria-valuenow={used} aria-valuemin={0} aria-valuemax={SEATS}>
            <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${(used / SEATS) * 100}%` }} />
          </div>
        </div>
        <p className="text-sm text-fg-muted">Business plan · €12 per seat / month</p>
        <Button size="sm">Add seats</Button>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <InputGroup leading={<Search aria-hidden />} className="w-full sm:w-64">
          <Input type="search" aria-label="Search members" placeholder="Search name or e-mail" value={query} onChange={(event) => setQuery(event.target.value)} />
        </InputGroup>
        <Segmented
          aria-label="Member status"
          value={filter}
          onValueChange={setFilter}
          className="ml-auto"
          items={[
            { value: 'all', label: 'All' },
            { value: 'active', label: 'Active' },
            { value: 'invited', label: 'Invited' },
          ]}
        />
      </div>

      <div className="relative mt-3 overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[640px] text-sm">
          <caption className="sr-only">Team members</caption>
          <thead>
            <tr className="h-9 border-b border-border bg-subtle/60 text-left text-xs text-fg-muted">
              <th scope="col" className="pl-4 font-medium">
                Member
              </th>
              <th scope="col" className="w-36 font-medium">
                Role
              </th>
              <th scope="col" className="w-28 font-medium">
                Status
              </th>
              <th scope="col" className="w-32 font-medium">
                Last active
              </th>
              <th scope="col" className="w-12 pr-3">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {shown.map((member) => (
              <tr key={member.id} className="h-14 hover:bg-subtle/50">
                <td className="pl-4">
                  <span className="flex items-center gap-3">
                    <Avatar name={member.name} tint={member.tint} size="md" />
                    <span className="min-w-0">
                      <span className="flex items-center gap-2 font-medium text-fg">
                        {member.name}
                        {member.id === 'u1' && <span className="text-xs font-normal text-fg-subtle">(you)</span>}
                      </span>
                      <span className="block truncate text-xs text-fg-subtle">
                        {member.email} · {member.title}
                      </span>
                    </span>
                  </span>
                </td>
                <td>
                  <RoleMenu
                    member={member}
                    onChange={(role) => {
                      setPeople((current) => current.map((person) => (person.id === member.id ? { ...person, role } : person)))
                      toast({ title: 'Role updated', description: `${member.name} is now ${ROLE_LABELS[role]}.` })
                    }}
                  />
                </td>
                <td>{member.status === 'active' ? <StatusBadge tone="success">Active</StatusBadge> : <StatusBadge tone="warning">Invited</StatusBadge>}</td>
                <td className="whitespace-nowrap text-fg-muted">{member.lastActiveAt === null ? <span className="text-fg-subtle">Never</span> : formatRelative(member.lastActiveAt)}</td>
                <td className="pr-3 text-right">
                  {member.role !== 'owner' && (
                    <Menu.Root>
                      <Menu.Trigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${member.name}`}>
                          <Ellipsis aria-hidden />
                        </Button>
                      </Menu.Trigger>
                      <MenuContent align="end">
                        {member.status === 'invited' && (
                          <MenuItem onSelect={() => toast({ title: 'Invite resent', description: member.email, tone: 'info' })}>
                            <Mail aria-hidden /> Resend invite
                          </MenuItem>
                        )}
                        <MenuItem>View activity</MenuItem>
                        <MenuSeparator />
                        <MenuItem destructive onSelect={() => void remove(member)}>
                          <UserMinus aria-hidden /> {member.status === 'invited' ? 'Cancel invite' : 'Remove from team'}
                        </MenuItem>
                      </MenuContent>
                    </Menu.Root>
                  )}
                </td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td colSpan={5} className="py-10 text-center text-sm text-fg-muted">
                  No members match “{query}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInvite={(emails, role) => {
          setPeople((current) => [
            ...current,
            ...emails.map((email, index): Member => ({ id: `new-${current.length + index}`, name: email.split('@')[0] ?? email, email, title: 'Invited', role, tint: 5, lastActiveAt: null, status: 'invited' })),
          ])
          setInviteOpen(false)
          toast({ title: emails.length === 1 ? 'Invite sent' : `${emails.length} invites sent`, description: `They’ll join as ${ROLE_LABELS[role]}.` })
        }}
      />
    </div>
  )
}
