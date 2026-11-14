/**
 * Team members: summary cards, a members table (avatar + e-mail, role, status, 2FA, activity
 * sparkline, last active, actions) and an invite dialog with role radio cards.
 */
import { IconDots, IconMailForward, IconSearch, IconShieldCheck, IconShieldX, IconUserMinus, IconUserPlus, IconUserShield } from '@tabler/icons-react'
import { useState, type FormEvent } from 'react'
import { Sparkline } from '../../components/data-display.tsx'
import { PageHeader } from '../../components/PageHeader.tsx'
import { Avatar } from '../../components/ui/avatar.tsx'
import { Badge, type BadgeTone } from '../../components/ui/badge.tsx'
import { Button } from '../../components/ui/button.tsx'
import { Card } from '../../components/ui/card.tsx'
import { useConfirm } from '../../components/ui/confirm.tsx'
import { Dialog } from '../../components/ui/dialog.tsx'
import { Field } from '../../components/ui/field.tsx'
import { Input, InputGroup } from '../../components/ui/input.tsx'
import { DropdownMenu, MenuContent, MenuItem, MenuSeparator } from '../../components/ui/menu.tsx'
import { Progress } from '../../components/ui/misc.tsx'
import { RadioCards } from '../../components/ui/toggles.tsx'
import { useToast } from '../../components/ui/toast.tsx'
import { TEAM, type MemberStatus, type Person, type Role } from '../../data/people.ts'
import { seeded } from '../../lib/random.ts'

const STATUS: Readonly<Record<MemberStatus, { label: string; tone: BadgeTone }>> = {
  active: { label: 'Active', tone: 'success' },
  invited: { label: 'Invited', tone: 'info' },
  suspended: { label: 'Suspended', tone: 'danger' },
}

const ROLE_TONE: Readonly<Record<Role, BadgeTone>> = { Owner: 'primary', Admin: 'primary', Finance: 'info', Sales: 'warning', Viewer: 'neutral' }

function lastActive(person: Person): string {
  if (person.status === 'invited') return 'Invite pending'
  if (person.lastActiveHours === 0) return 'Online now'
  if (person.lastActiveHours < 24) return `${person.lastActiveHours} h ago`
  return `${Math.round(person.lastActiveHours / 24)} days ago`
}

/** 12 weeks of activity per member, deterministic from the id. */
function activitySeries(person: Person): number[] {
  const random = seeded(person.id.length * 97 + Number(person.id.slice(1)))
  return Array.from({ length: 12 }, (_, index) => (person.status === 'active' ? 8 + random.between(0, 14) + index : person.status === 'suspended' ? Math.max(0, 14 - index * 2) : 0))
}

export function TeamPage() {
  const toast = useToast()
  const confirm = useConfirm()
  const [members, setMembers] = useState<readonly Person[]>(TEAM)
  const [search, setSearch] = useState('')
  const [inviteOpen, setInviteOpen] = useState(false)
  const visible = members.filter((member) => `${member.name} ${member.email} ${member.role}`.toLowerCase().includes(search.toLowerCase().trim()))
  const twoFactor = members.filter((member) => member.twoFactor).length

  const remove = async (member: Person): Promise<void> => {
    if (await confirm({ title: `Remove ${member.name}?`, description: 'They lose access right away. Invoices they own move to you.', confirmLabel: 'Remove member', destructive: true })) {
      setMembers((list) => list.filter((candidate) => candidate.id !== member.id))
      toast({ title: `${member.name} removed` })
    }
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Workspace' }, { label: 'Team members' }]}
        title="Team members"
        count={members.length}
        description="Invite people, set their role, and see who has two-factor turned on."
        actions={
          <Button onClick={() => setInviteOpen(true)}>
            <IconUserPlus aria-hidden /> Invite member
          </Button>
        }
      />
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-fg-muted">Seats used</h2>
          <p className="mt-1 text-2xl font-bold text-fg tabular">{members.length} / 15</p>
          <Progress value={(members.length / 15) * 100} label={`${members.length} of 15 seats used`} className="mt-3" />
        </Card>
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-fg-muted">Two-factor adoption</h2>
          <p className="mt-1 text-2xl font-bold text-fg tabular">{Math.round((twoFactor / members.length) * 100)}%</p>
          <Progress value={(twoFactor / members.length) * 100} tone="success" label={`${twoFactor} of ${members.length} members use two-factor`} className="mt-3" />
        </Card>
        <Card className="p-5">
          <h2 className="text-sm font-semibold text-fg-muted">Pending invites</h2>
          <p className="mt-1 text-2xl font-bold text-fg tabular">{members.filter((member) => member.status === 'invited').length}</p>
          <p className="mt-2 text-xs text-fg-muted">Invites expire after 7 days.</p>
        </Card>
      </div>
      <Card material="solid" className="overflow-hidden">
        <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center">
          <InputGroup start={<IconSearch />} className="w-full sm:max-w-xs">
            <Input type="search" aria-label="Search members" placeholder="Search name, e-mail or role…" value={search} onChange={(event) => setSearch(event.target.value)} className="h-9" />
          </InputGroup>
          <p className="text-sm text-fg-muted sm:ml-auto" aria-live="polite">
            {visible.length} of {members.length} members
          </p>
        </div>
        <div className="scroll-thin overflow-x-auto border-t border-border">
          <table className="w-full min-w-[52rem] text-base">
            <thead>
              <tr className="bg-surface-muted text-left text-2xs font-semibold tracking-[0.08em] text-fg-muted uppercase">
                <th scope="col" className="py-3 pr-3 pl-5">
                  Member
                </th>
                <th scope="col" className="px-3 py-3">
                  Role
                </th>
                <th scope="col" className="px-3 py-3">
                  Status
                </th>
                <th scope="col" className="px-3 py-3">
                  2FA
                </th>
                <th scope="col" className="px-3 py-3">
                  Activity (12 wk)
                </th>
                <th scope="col" className="px-3 py-3">
                  Last active
                </th>
                <th scope="col" className="py-3 pr-5 pl-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((member) => (
                <tr key={member.id} className="border-t border-border transition-fast hover:bg-surface-hover">
                  <td className="py-3.5 pr-3 pl-5">
                    <div className="flex items-center gap-3">
                      <Avatar name={member.name} size="md" {...(member.lastActiveHours === 0 && member.status === 'active' ? { status: 'online' as const } : {})} />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-fg">{member.name}</p>
                        <p className="truncate text-xs text-fg-muted">
                          {member.title} · {member.email}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3.5">
                    <Badge tone={ROLE_TONE[member.role]}>{member.role}</Badge>
                  </td>
                  <td className="px-3 py-3.5">
                    <Badge tone={STATUS[member.status].tone} dot>
                      {STATUS[member.status].label}
                    </Badge>
                  </td>
                  <td className="px-3 py-3.5">
                    {member.twoFactor ? (
                      <span className="flex items-center gap-1.5 text-sm text-success">
                        <IconShieldCheck className="size-4" aria-hidden /> On
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-sm text-fg-muted">
                        <IconShieldX className="size-4" aria-hidden /> Off
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3.5">
                    {member.status === 'invited' ? <span className="text-sm text-fg-muted">—</span> : <Sparkline values={activitySeries(member)} tone={member.status === 'suspended' ? 'danger' : 'primary'} label={`${member.name}: activity over 12 weeks`} />}
                  </td>
                  <td className="px-3 py-3.5 text-sm whitespace-nowrap text-fg-muted">{lastActive(member)}</td>
                  <td className="py-3.5 pr-5 pl-3 text-right">
                    <DropdownMenu.Root>
                      <DropdownMenu.Trigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${member.name}`}>
                          <IconDots aria-hidden />
                        </Button>
                      </DropdownMenu.Trigger>
                      <MenuContent align="end">
                        <MenuItem icon={<IconUserShield />} onSelect={() => toast({ title: `Role editor for ${member.name}`, tone: 'info' })}>
                          Change role
                        </MenuItem>
                        {member.status === 'invited' && (
                          <MenuItem icon={<IconMailForward />} onSelect={() => toast({ title: `Invite re-sent to ${member.email}` })}>
                            Resend invite
                          </MenuItem>
                        )}
                        <MenuSeparator />
                        <MenuItem icon={<IconUserMinus />} destructive disabled={member.role === 'Owner'} onSelect={() => void remove(member)}>
                          Remove from team
                        </MenuItem>
                      </MenuContent>
                    </DropdownMenu.Root>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <InviteDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        onInvite={(email, role) => {
          setMembers((list) => [...list, { id: `u${String(list.length + 20)}`, name: email.split('@')[0] ?? email, email, role, title: 'Invited member', status: 'invited', lastActiveHours: 0, twoFactor: false }])
          toast({ title: 'Invite sent', description: `${email} will join as ${role}.` })
        }}
      />
    </>
  )
}

function InviteDialog({ open, onOpenChange, onInvite }: { open: boolean; onOpenChange: (open: boolean) => void; onInvite: (email: string, role: Role) => void }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<Role>('Finance')
  const [error, setError] = useState<string | undefined>(undefined)
  const submit = (event?: FormEvent): void => {
    event?.preventDefault()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a work e-mail address, like name@company.com.')
      return
    }
    onInvite(email.trim(), role)
    setEmail('')
    setError(undefined)
    onOpenChange(false)
  }
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Invite a team member"
      description="They get an e-mail with a link that expires in 7 days."
      className="max-w-xl"
      footer={
        <>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => submit()}>Send invite</Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-5">
        <Field label="E-mail" required error={error}>
          {(control) => <Input {...control} type="email" autoFocus value={email} placeholder="name@company.com" onChange={(event) => setEmail(event.target.value)} />}
        </Field>
        <div>
          <p id="invite-role" className="mb-2 text-sm font-semibold text-fg">
            Role
          </p>
          <RadioCards
            aria-labelledby="invite-role"
            value={role}
            onValueChange={(value) => setRole(value as Role)}
            className="sm:grid-cols-3"
            options={[
              { value: 'Admin', label: 'Admin', description: 'Everything, incl. billing' },
              { value: 'Finance', label: 'Finance', description: 'Invoices and payments' },
              { value: 'Viewer', label: 'Viewer', description: 'Read-only access' },
            ]}
          />
        </div>
      </form>
    </Dialog>
  )
}
