/**
 * Team members: role counters, a searchable members table with inline role changes, status,
 * 2FA and last-active columns, and an invite dialog.
 */
import { IconClockHour4, IconDots, IconMailForward, IconSearch, IconShieldCheck, IconShieldOff, IconUserCheck, IconUserMinus, IconUserPlus, IconUsers } from '@tabler/icons-react'
import { useState, type ReactElement } from 'react'
import { TagsInput } from '../../components/form-widgets.tsx'
import { PageHeader } from '../../components/page-header.tsx'
import { Badge } from '../../components/ui/badge.tsx'
import { Button } from '../../components/ui/button.tsx'
import { ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../../components/ui/dialog.tsx'
import { Field } from '../../components/ui/field.tsx'
import { Input, InputGroup, Textarea } from '../../components/ui/input.tsx'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../../components/ui/menu.tsx'
import { Avatar, IconChip } from '../../components/ui/misc.tsx'
import { RadioCards } from '../../components/ui/radio-cards.tsx'
import { Select } from '../../components/ui/select.tsx'
import { toast } from '../../components/ui/toast.tsx'
import type { Tone } from '../../components/ui/tone.ts'
import { team, type Member, type Role } from '../../data/people.ts'
import { formatRelative, TODAY } from '../../lib/format.ts'

const ROLES: readonly Role[] = ['Owner', 'Admin', 'Billing', 'Editor', 'Viewer']
const STATUS_TONE: Readonly<Record<Member['status'], Tone>> = { active: 'success', invited: 'warning', suspended: 'neutral' }

function lastActive(member: Member): string {
  if (member.lastActiveMinutes === null) return 'Never signed in'
  if (member.lastActiveMinutes === 0) return 'Online now'
  return formatRelative(new Date(TODAY.getTime() - member.lastActiveMinutes * 60_000))
}

export function TeamPage({ inviteOpen = false }: { readonly inviteOpen?: boolean }): ReactElement {
  const [members, setMembers] = useState(team)
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState('all')
  const [inviting, setInviting] = useState(inviteOpen)
  const [removing, setRemoving] = useState<Member | null>(null)

  const visible = members.filter((member) => (roleFilter === 'all' || member.role === roleFilter) && `${member.name} ${member.email} ${member.title}`.toLowerCase().includes(query.trim().toLowerCase()))
  const stats: readonly { readonly label: string; readonly value: number; readonly tone: Tone; readonly icon: ReactElement }[] = [
    { label: 'Members', value: members.length, tone: 'primary', icon: <IconUsers /> },
    { label: 'Active', value: members.filter((member) => member.status === 'active').length, tone: 'success', icon: <IconUserCheck /> },
    { label: 'Pending invites', value: members.filter((member) => member.status === 'invited').length, tone: 'warning', icon: <IconClockHour4 /> },
    { label: 'Using 2FA', value: members.filter((member) => member.twoFactor).length, tone: 'info', icon: <IconShieldCheck /> },
  ]

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Workspace' }, { label: 'Team' }]}
        back="/dashboard"
        title="Team members"
        count={members.length}
        actions={
          <Button variant="primary" onClick={() => setInviting(true)}>
            <IconUserPlus /> Invite members
          </Button>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-4 sm:gap-6 xl:grid-cols-4">
        {stats.map((stat) => (
          <section key={stat.label} aria-label={stat.label} className="flex items-center gap-4 rounded-xl border border-border/70 bg-card p-5 shadow-sm dark:border-border">
            <IconChip icon={stat.icon} tone={stat.tone} size="lg" className="max-sm:size-10" />
            <div>
              <p className="text-2xl font-bold leading-8 tabular">{stat.value}</p>
              <p className="text-label text-muted-foreground">{stat.label}</p>
            </div>
          </section>
        ))}
      </div>
      <section aria-label="Members" className="flex min-w-0 flex-col gap-4 overflow-hidden rounded-xl border border-border/70 bg-card pt-5 shadow-sm sm:pt-6 dark:border-border">
        <div className="flex flex-wrap items-center gap-2 px-5 sm:px-6">
          <InputGroup start={<IconSearch />} className="w-full sm:w-72">
            <Input type="search" aria-label="Search members" placeholder="Search name, email or title…" value={query} onChange={(event) => setQuery(event.target.value)} />
          </InputGroup>
          <Select aria-label="Filter by role" className="w-full sm:w-44" value={roleFilter} onValueChange={setRoleFilter} options={[{ value: 'all', label: 'All roles' }, ...ROLES.map((role) => ({ value: role, label: role }))]} />
        </div>
        <div className="scrollbar-thin relative overflow-x-auto border-t border-border">
          <table className="w-full min-w-[54rem] text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-left text-overline font-semibold uppercase text-muted-foreground">
                <th scope="col" className="py-3 pl-5 pr-3 font-semibold sm:pl-6">Member</th>
                <th scope="col" className="px-3 py-3 font-semibold">Role</th>
                <th scope="col" className="px-3 py-3 font-semibold">Status</th>
                <th scope="col" className="px-3 py-3 font-semibold">2FA</th>
                <th scope="col" className="px-3 py-3 font-semibold">Last active</th>
                <th scope="col" className="py-3 pl-3 pr-5 sm:pr-6"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((member) => (
                <tr key={member.id} className="border-b border-border transition-colors last:border-b-0 hover:bg-muted/50">
                  <td className="py-3.5 pl-5 pr-3 sm:pl-6">
                    <span className="flex items-center gap-3">
                      <Avatar name={member.name} tone={member.tone} {...(member.lastActiveMinutes === 0 ? { status: 'online' as const } : {})} />
                      <span className="min-w-0">
                        <span className="block truncate font-semibold">{member.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {member.email} · {member.title}
                        </span>
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-3.5">
                    {member.role === 'Owner' ? (
                      <Badge tone="primary">Owner</Badge>
                    ) : (
                      <Select
                        aria-label={`Role of ${member.name}`}
                        size="sm"
                        className="w-32"
                        value={member.role}
                        onValueChange={(value) => {
                          const role = ROLES.find((item) => item === value) ?? member.role
                          setMembers(members.map((item) => (item.id === member.id ? { ...item, role } : item)))
                          toast({ tone: 'success', title: `${member.name.split(' ')[0] ?? member.name} is now ${role}` })
                        }}
                        options={ROLES.filter((role) => role !== 'Owner').map((role) => ({ value: role, label: role }))}
                      />
                    )}
                  </td>
                  <td className="px-3 py-3.5">
                    <Badge tone={STATUS_TONE[member.status]} dot>
                      {member.status === 'active' ? 'Active' : member.status === 'invited' ? 'Invited' : 'Suspended'}
                    </Badge>
                  </td>
                  <td className="px-3 py-3.5">
                    {member.twoFactor ? (
                      <span className="inline-flex items-center gap-1.5 text-success"><IconShieldCheck aria-hidden className="size-4.5" /> On</span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-muted-foreground"><IconShieldOff aria-hidden className="size-4.5" /> Off</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3.5 text-muted-foreground">{lastActive(member)}</td>
                  <td className="py-3.5 pl-3 pr-5 text-right sm:pr-6">
                    {member.role === 'Owner' ? null : (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${member.name}`} className="text-muted-foreground">
                            <IconDots />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {member.status === 'invited' ? (
                            <DropdownMenuItem onSelect={() => toast({ tone: 'success', title: 'Invite resent', description: member.email })}>
                              <IconMailForward /> Resend invite
                            </DropdownMenuItem>
                          ) : null}
                          <DropdownMenuItem onSelect={() => toast({ tone: 'info', title: '2FA reminder sent' })}>
                            <IconShieldCheck /> Require 2FA
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="danger" onSelect={() => setRemoving(member)}>
                            <IconUserMinus /> Remove from team
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {visible.length === 0 ? <p className="px-6 py-10 text-center text-sm text-muted-foreground">No members match “{query}”.</p> : null}
        </div>
      </section>
      <InviteDialog open={inviting} onOpenChange={setInviting} />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => (open ? undefined : setRemoving(null))}
        title={`Remove ${removing?.name ?? 'member'}?`}
        description="They lose access immediately. Invoices they own are reassigned to you."
        confirmLabel="Remove member"
        onConfirm={() => {
          setMembers(members.filter((member) => member.id !== removing?.id))
          toast({ tone: 'success', title: `${removing?.name ?? 'Member'} removed` })
        }}
      />
    </>
  )
}

function InviteDialog({ open, onOpenChange }: { readonly open: boolean; readonly onOpenChange: (open: boolean) => void }): ReactElement {
  const [emails, setEmails] = useState<readonly string[]>([])
  const [role, setRole] = useState('Editor')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Invite team members</DialogTitle>
          <DialogDescription>They’ll get an email with a link that expires in 7 days.</DialogDescription>
        </DialogHeader>
        <Field id="invite-emails" label="Email addresses" hint="Press Enter after each address.">
          <TagsInput id="invite-emails" value={emails} onChange={setEmails} max={20} />
        </Field>
        <div className="flex flex-col gap-1.5">
          <span id="invite-role" className="text-label font-semibold">
            Role
          </span>
          <RadioCards
            aria-labelledby="invite-role"
            value={role}
            onValueChange={setRole}
            options={[
              { value: 'Admin', title: 'Admin', description: 'Everything, incl. billing and members' },
              { value: 'Editor', title: 'Editor', description: 'Create and edit invoices' },
              { value: 'Viewer', title: 'Viewer', description: 'Read-only access' },
            ]}
          />
        </div>
        <Field id="invite-message" label="Personal message (optional)">
          <Textarea id="invite-message" rows={3} placeholder="Welcome aboard! You’ll be handling EU invoices." />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={emails.length === 0}
            onClick={() => {
              onOpenChange(false)
              toast({ tone: 'success', title: `${emails.length} invite${emails.length === 1 ? '' : 's'} sent`, description: `As ${role}.` })
              setEmails([])
            }}
          >
            <IconMailForward /> Send {emails.length > 0 ? emails.length : ''} invite{emails.length === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
