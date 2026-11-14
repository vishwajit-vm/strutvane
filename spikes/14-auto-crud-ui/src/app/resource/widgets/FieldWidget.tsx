/**
 * `<FieldWidget>`: the input for one field, chosen from the metadata's `input` hint and the
 * column name (Filament's proven name heuristics: `email` → email input, `url` → url input).
 *
 * | input / kind   | widget                                         |
 * |----------------|------------------------------------------------|
 * | text           | text input (`type=email/url/tel` by name)      |
 * | slug           | slug input with live URL preview (SlugField)    |
 * | textarea       | textarea                                       |
 * | number         | text input, numeric keyboard                   |
 * | decimal        | text input, decimal keyboard, keeps "12."      |
 * | switch         | switch                                         |
 * | date/datetime  | native date / datetime-local pickers           |
 * | select (enum)  | native select                                  |
 * | relation       | async searchable select (RelationSelect)       |
 * | json           | monospace textarea                             |
 *
 * @module
 */
import type { ReactElement } from 'react'
import type { FieldMetadata } from '../../../shared/metadata.ts'
import { Input, Textarea } from '../../components/ui/input.tsx'
import { NativeSelect } from '../../components/ui/native-select.tsx'
import { Switch } from '../../components/ui/switch.tsx'
import { useRegistry } from '../../registry.tsx'
import type { FormValue } from '../form-values.ts'
import { RelationSelect } from './RelationSelect.tsx'

/**
 * Props every widget receives. `describedBy` and `invalid` come from `<FormField>`, so a custom
 * widget gets correct labelling and error wiring for free.
 *
 * @example
 * const props: WidgetProps = { id: 'f-title', field: titleField, value: '', onChange: set, invalid: false, describedBy: undefined }
 */
export interface WidgetProps {
  readonly id: string
  readonly field: FieldMetadata
  readonly value: FormValue
  readonly onChange: (value: FormValue) => void
  readonly invalid: boolean
  readonly describedBy: string | undefined
}

/**
 * The widget for one field.
 *
 * @example
 * <FieldWidget id="f-status" field={statusField} value="draft" onChange={set} invalid={false} describedBy={undefined} />
 */
export function FieldWidget(props: WidgetProps): ReactElement {
  const { id, field, value, onChange, invalid, describedBy } = props
  const text = typeof value === 'string' ? value : ''
  const common = { id, 'aria-invalid': invalid, 'aria-describedby': describedBy } as const
  switch (field.input) {
    case 'textarea':
      return <Textarea {...common} rows={5} value={text} onChange={(event) => onChange(event.target.value)} />
    case 'json':
      return <Textarea {...common} rows={5} className="font-mono text-xs" spellCheck={false} value={text} onChange={(event) => onChange(event.target.value)} />
    case 'number':
      return <Input {...common} inputMode="numeric" value={text} onChange={(event) => onChange(event.target.value)} />
    case 'decimal':
      // Text, not type=number: a number input reports "12." as empty and loses the decimal point.
      return <Input {...common} inputMode="decimal" value={text} onChange={(event) => onChange(event.target.value)} />
    case 'switch':
      return <Switch id={id} aria-invalid={invalid} aria-describedby={describedBy} checked={value === true} onCheckedChange={onChange} />
    case 'date':
      return <Input {...common} type="date" value={text} onChange={(event) => onChange(event.target.value)} />
    case 'datetime':
      return <Input {...common} type="datetime-local" value={text} onChange={(event) => onChange(event.target.value)} />
    case 'select':
      return <EnumSelect {...props} />
    case 'relation':
      return <RelationWidget {...props} />
    default:
      return <Input {...common} type={textInputType(field.name)} maxLength={field.maxLength} value={text} onChange={(event) => onChange(event.target.value)} />
  }
}

/**
 * The HTML input type a column name suggests.
 *
 * @example
 * textInputType('contact_email') // 'email'
 * textInputType('website_url') // 'url'
 */
export function textInputType(name: string): 'email' | 'url' | 'tel' | 'text' {
  if (name.includes('email')) return 'email'
  if (name === 'url' || name === 'website' || name.endsWith('_url')) return 'url'
  if (name.includes('phone') || name === 'tel' || name === 'mobile') return 'tel'
  return 'text'
}

function EnumSelect({ id, field, value, onChange, invalid, describedBy }: WidgetProps): ReactElement {
  // An empty choice only when "nothing" is a valid answer (nullable, or the column has a default).
  const allowEmpty = field.nullable || field.default === undefined
  return (
    <NativeSelect id={id} aria-invalid={invalid} aria-describedby={describedBy} value={typeof value === 'string' ? value : ''} onChange={(event) => onChange(event.target.value)}>
      {allowEmpty && <option value="">{field.nullable ? 'None' : 'Choose…'}</option>}
      {(field.options ?? []).map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </NativeSelect>
  )
}

function RelationWidget({ id, field, value, onChange, invalid, describedBy }: WidgetProps): ReactElement {
  const { byName } = useRegistry()
  const target = field.references === undefined ? undefined : byName.get(field.references)
  if (target === undefined) {
    // The related table has no screen (internal, or not visible): fall back to the raw id.
    return <Input id={id} inputMode="numeric" aria-invalid={invalid} aria-describedby={describedBy} value={value === null ? '' : String(value)} onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))} />
  }
  return <RelationSelect id={id} target={target} value={typeof value === 'number' ? value : null} onChange={onChange} clearable={field.nullable} invalid={invalid} describedBy={describedBy} />
}
