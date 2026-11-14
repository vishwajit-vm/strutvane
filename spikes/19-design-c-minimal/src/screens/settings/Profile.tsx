/**
 * Profile: photo, name, e-mail (with verification state), title, time zone and language.
 */
import { BadgeCheck } from 'lucide-react'
import { useState } from 'react'
import { Section } from '../../components/section.tsx'
import { Avatar } from '../../components/ui/avatar.tsx'
import { Button } from '../../components/ui/button.tsx'
import { Select } from '../../components/ui/controls.tsx'
import { Field } from '../../components/ui/field.tsx'
import { Input, Textarea } from '../../components/ui/input.tsx'
import { useToast } from '../../components/ui/toast.tsx'
import { me } from '../../data/people.ts'
import { SettingsHeader } from './SettingsPage.tsx'

const TIME_ZONES = [
  { value: 'Europe/Amsterdam', label: 'Amsterdam', hint: 'UTC+1' },
  { value: 'Europe/London', label: 'London', hint: 'UTC+0' },
  { value: 'America/New_York', label: 'New York', hint: 'UTC−5' },
  { value: 'Asia/Kolkata', label: 'Kolkata', hint: 'UTC+5:30' },
  { value: 'Asia/Tokyo', label: 'Tokyo', hint: 'UTC+9' },
] as const

const LANGUAGES = [
  { value: 'en-GB', label: 'English (UK)' },
  { value: 'en-US', label: 'English (US)' },
  { value: 'nl', label: 'Nederlands' },
  { value: 'de', label: 'Deutsch' },
  { value: 'fr', label: 'Français' },
] as const

export function Profile() {
  const toast = useToast()
  const [name, setName] = useState(me.name)
  const [title, setTitle] = useState(me.title)
  const [bio, setBio] = useState('Finance at Northwind. Ask me about close, collections and anything with a spreadsheet.')
  const [zone, setZone] = useState('Europe/Amsterdam')
  const [language, setLanguage] = useState('en-GB')
  const [error, setError] = useState<string | undefined>()

  const save = () => {
    if (name.trim().length < 2) {
      setError('Enter your full name, at least 2 characters.')
      return
    }
    setError(undefined)
    toast({ title: 'Profile updated', description: 'Teammates see the change right away.' })
  }

  return (
    <div>
      <SettingsHeader title="Profile" description="How you appear to teammates and on invoices you send." />
      <Section title="Photo" description="Shown next to your comments and activity. Square images work best.">
        <div className="flex items-center gap-4">
          <Avatar name={name || me.name} tint={me.tint} size="xl" />
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <Button size="sm">Upload photo</Button>
              <Button size="sm" variant="ghost">
                Remove
              </Button>
            </div>
            <p className="text-xs text-fg-subtle">PNG or JPG, at least 256 × 256 px, up to 2 MB.</p>
          </div>
        </div>
      </Section>
      <Section title="Personal details" description="Your name and title appear on invoices you send.">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Full name" error={error}>
            {(control) => <Input {...control} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} />}
          </Field>
          <Field label="Job title" optional>
            {(control) => <Input {...control} autoComplete="organization-title" value={title} onChange={(event) => setTitle(event.target.value)} />}
          </Field>
        </div>
        <Field
          label="E-mail"
          description="Changing your e-mail sends a confirmation link to the new address."
          labelAside={
            <span className="inline-flex items-center gap-1 text-xs font-medium text-success-text">
              <BadgeCheck aria-hidden className="size-3.5" /> Verified
            </span>
          }
        >
          {(control) => <Input {...control} type="email" value={me.email} readOnly className="bg-subtle text-fg-muted" />}
        </Field>
        <Field label="Bio" optional description="A sentence or two for your profile card.">
          {(control) => <Textarea {...control} rows={3} value={bio} onChange={(event) => setBio(event.target.value)} />}
        </Field>
      </Section>
      <Section title="Preferences" description="Dates and times across Strutvane use these settings.">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Time zone">{(control) => <Select value={zone} onValueChange={setZone} options={TIME_ZONES} triggerProps={{ id: control.id }} />}</Field>
          <Field label="Language">{(control) => <Select value={language} onValueChange={setLanguage} options={LANGUAGES} triggerProps={{ id: control.id }} />}</Field>
        </div>
      </Section>
      <div className="flex justify-end gap-2 border-t border-border pt-5">
        <Button>Cancel</Button>
        <Button variant="primary" onClick={save}>
          Save changes
        </Button>
      </div>
    </div>
  )
}
