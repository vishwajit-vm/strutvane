/**
 * Notification preferences: a matrix of events × channels (checkboxes), a digest choice (radio
 * cards) and quiet hours (switch). Each checkbox has a full accessible name ("Invoice paid by
 * e-mail") so the matrix makes sense without seeing the column header.
 */
import { CalendarRange, Mail, Zap } from 'lucide-react'
import { useState } from 'react'
import { Section, SwitchRow } from '../../components/section.tsx'
import { Button } from '../../components/ui/button.tsx'
import { Checkbox, RadioCards } from '../../components/ui/controls.tsx'
import { useToast } from '../../components/ui/toast.tsx'
import { SettingsHeader } from './SettingsPage.tsx'

const CHANNELS = [
  { id: 'email', label: 'E-mail' },
  { id: 'inapp', label: 'In-app' },
  { id: 'slack', label: 'Slack' },
] as const

type Channel = (typeof CHANNELS)[number]['id']

const EVENTS = [
  { id: 'paid', label: 'Invoice paid', description: 'A customer pays in full or in part.' },
  { id: 'overdue', label: 'Invoice overdue', description: 'An invoice you own passes its due date.' },
  { id: 'mentions', label: 'Mentions and comments', description: 'Someone mentions you or replies to you.' },
  { id: 'signin', label: 'New sign-in', description: 'Your account is used on a new device.' },
  { id: 'members', label: 'Team changes', description: 'Members join, leave or change role.' },
] as const

type EventId = (typeof EVENTS)[number]['id']

const DEFAULTS: Record<EventId, Record<Channel, boolean>> = {
  paid: { email: true, inapp: true, slack: true },
  overdue: { email: true, inapp: true, slack: false },
  mentions: { email: false, inapp: true, slack: true },
  signin: { email: true, inapp: true, slack: false },
  members: { email: false, inapp: true, slack: false },
}

export function NotificationSettings() {
  const toast = useToast()
  const [matrix, setMatrix] = useState(DEFAULTS)
  const [digest, setDigest] = useState('daily')
  const [quiet, setQuiet] = useState(true)

  const toggle = (event: EventId, channel: Channel, value: boolean) => setMatrix((current) => ({ ...current, [event]: { ...current[event], [channel]: value } }))

  return (
    <div>
      <SettingsHeader title="Notifications" description="Choose what reaches you, and where. Security alerts by e-mail can’t be turned off." />
      <Section title="Events" description="Per event and channel. Slack messages go to #finance-alerts.">
        <div className="relative overflow-x-auto rounded-lg border border-border">
          <table className="w-full min-w-[480px] text-sm">
            <caption className="sr-only">Notification channels per event</caption>
            <thead>
              <tr className="h-9 border-b border-border bg-subtle/60 text-xs text-fg-muted">
                <th scope="col" className="pl-4 text-left font-medium">
                  Event
                </th>
                {CHANNELS.map((channel) => (
                  <th key={channel.id} scope="col" className="w-20 text-center font-medium">
                    {channel.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {EVENTS.map((event) => (
                <tr key={event.id}>
                  <th scope="row" className="py-3 pl-4 text-left font-normal">
                    <span className="block font-medium text-fg">{event.label}</span>
                    <span className="block text-xs text-fg-muted">{event.description}</span>
                  </th>
                  {CHANNELS.map((channel) => {
                    const locked = event.id === 'signin' && channel.id === 'email'
                    return (
                      <td key={channel.id} className="text-center">
                        <Checkbox
                          aria-label={`${event.label} by ${channel.label}${locked ? ' (required)' : ''}`}
                          checked={matrix[event.id][channel.id]}
                          disabled={locked}
                          onCheckedChange={(value) => toggle(event.id, channel.id, value === true)}
                          className="disabled:cursor-not-allowed disabled:opacity-60"
                        />
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
      <Section title="E-mail digest" description="Bundle non-urgent e-mails into one message.">
        <RadioCards
          aria-label="E-mail digest"
          value={digest}
          onValueChange={setDigest}
          className="sm:grid-cols-3"
          options={[
            { value: 'realtime', title: 'Real-time', description: 'Every e-mail as it happens.', icon: <Zap aria-hidden /> },
            { value: 'daily', title: 'Daily', description: 'One summary at 08:00.', icon: <Mail aria-hidden /> },
            { value: 'weekly', title: 'Weekly', description: 'Mondays at 08:00.', icon: <CalendarRange aria-hidden /> },
          ]}
        />
      </Section>
      <Section title="Quiet hours" description="Pause in-app and Slack notifications outside working hours.">
        <SwitchRow id="quiet" title="Mute 19:00 – 08:00 and weekends" description="Urgent security alerts still come through." checked={quiet} onChange={setQuiet} />
      </Section>
      <div className="flex justify-end gap-2 border-t border-border pt-5">
        <Button variant="primary" onClick={() => toast({ title: 'Notification preferences saved' })}>
          Save preferences
        </Button>
      </div>
    </div>
  )
}
