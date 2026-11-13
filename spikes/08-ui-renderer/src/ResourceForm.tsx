/**
 * Create / edit form for one resource, built from its descriptor with TanStack Form.
 *
 * Flow (RFC-0003 §4):
 * 1. Client validation from the manifest runs on blur and on submit (`validateField`). If anything
 *    is invalid, submission stops and focus moves to the first invalid field.
 * 2. Server 422 `issues` are routed to the deepest rendered field (`routeIssues`), including array
 *    items such as `lines[1].amount`, stored in the field's `onServer` error slot, and focus moves
 *    to the first invalid field. Issues with no matching field become form-level errors.
 * 3. Any other problem (409, 404, 5xx…) shows a banner (role="alert") built by
 *    `problemBannerText` — never raw internals — and the typed values are kept.
 * 4. Editing a field clears its server error immediately (the message is now stale).
 *
 * Read-only rules: `readOnly` fields are shown read-only on edit and hidden on create; `writeOnce`
 * fields are editable on create and read-only on edit. Read-only values are never submitted.
 */
import { useForm } from '@tanstack/react-form'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { ApiRecord, FieldDescriptor, ResourceDescriptor, ValidationIssue } from './contracts.ts'
import { ApiProblemError, fieldDomId, firstInvalidField, problemBannerText, routeIssues } from './errors.ts'
import { resolveWidget, useUI, type Widget } from './registry.tsx'
import { itemFieldDescriptor, itemProperties, validateField } from './validation.ts'

type Values = Record<string, unknown>
type Mode = 'create' | 'edit'

/** Fields the form renders, and whether each is editable, for a given mode. */
export function formFields(resource: ResourceDescriptor, mode: Mode): { field: FieldDescriptor; readOnly: boolean }[] {
  return resource.fields
    .filter((f) => f.type !== 'id' && !(mode === 'create' && f.readOnly))
    .map((f) => ({ field: f, readOnly: f.readOnly || (mode === 'edit' && f.writeOnce) }))
}

function emptyValue(field: FieldDescriptor): unknown {
  if (field.type === 'array') return []
  if (field.type === 'boolean') return false
  return null
}

/** Field names in visual order, expanding array items (`lines`, `lines[0].description`, …). */
export function orderedFieldNames(fields: readonly FieldDescriptor[], values: Values): string[] {
  const names: string[] = []
  for (const f of fields) {
    names.push(f.name)
    if (f.type === 'array') {
      const items = Array.isArray(values[f.name]) ? (values[f.name] as unknown[]) : []
      const props = Object.keys(itemProperties(f))
      items.forEach((_, i) => {
        for (const p of props) names.push(`${f.name}[${i}].${p}`)
      })
    }
  }
  return names
}

function focusField(name: string): void {
  // Defer to after React commits the error state, so screen readers announce the message.
  queueMicrotask(() => document.getElementById(fieldDomId(name))?.focus())
}

export interface ResourceFormProps {
  readonly resource: ResourceDescriptor
  /** Present = edit mode. */
  readonly recordId?: string
  readonly onSaved?: (record: ApiRecord) => void
  readonly onCancel?: () => void
}

export function ResourceForm(props: ResourceFormProps) {
  const { api } = useUI()
  const record = useQuery({
    queryKey: ['strutvane', 'record', props.resource.path, props.recordId],
    enabled: props.recordId !== undefined,
    queryFn: () => api.get(props.resource.path, props.recordId as string),
  })
  if (props.recordId !== undefined) {
    if (record.isLoading) return <p role="status">Loading {props.resource.label.toLowerCase()}…</p>
    if (record.error) {
      const text = record.error instanceof ApiProblemError ? problemBannerText(record.error.problem) : 'Could not load this record.'
      return <p role="alert">{text}</p>
    }
  }
  return <ResourceFormInner {...props} initial={record.data} />
}

function ResourceFormInner({ resource, recordId, onSaved, onCancel, initial }: ResourceFormProps & { initial: ApiRecord | undefined }) {
  const { api, registry } = useUI()
  const queryClient = useQueryClient()
  const ids = useId()
  const mode: Mode = recordId === undefined ? 'create' : 'edit'
  const fields = useMemo(() => formFields(resource, mode), [resource, mode])
  const [banner, setBanner] = useState<string[]>([])
  const bannerRef = useRef<HTMLDivElement>(null)
  // Focus must happen AFTER React has rendered the banner, so it is requested via state + effect.
  const [bannerFocusRequest, setBannerFocusRequest] = useState(0)
  useEffect(() => {
    if (bannerFocusRequest > 0) bannerRef.current?.focus()
  }, [bannerFocusRequest])

  const defaultValues = useMemo<Values>(() => {
    const v: Values = {}
    for (const { field } of fields) v[field.name] = initial?.[field.name] ?? emptyValue(field)
    return v
  }, [fields, initial])

  const showBanner = (messages: string[]) => {
    setBanner(messages)
    setBannerFocusRequest((n) => n + 1)
  }

  const form = useForm({
    defaultValues,
    onSubmitInvalid: ({ formApi }) => {
      const names = orderedFieldNames(fields.map((f) => f.field), formApi.state.values)
      const errors = new Map(names.map((n) => [n, (formApi.getFieldMeta(n as never)?.errors ?? []) as string[]]))
      const first = firstInvalidField(names, errors)
      if (first) focusField(first)
    },
    onSubmit: async ({ value }) => {
      setBanner([])
      const payload: Values = {}
      for (const { field, readOnly } of fields) if (!readOnly) payload[field.name] = value[field.name]
      try {
        const saved = mode === 'create' ? await api.create(resource.path, payload) : await api.update(resource.path, recordId as string, payload)
        await queryClient.invalidateQueries({ queryKey: ['strutvane', 'list', resource.path] })
        onSaved?.(saved)
      } catch (error) {
        if (!(error instanceof ApiProblemError)) {
          showBanner(['Something went wrong. Your changes are kept. Please try again.'])
          return
        }
        const problem = error.problem
        if (problem.status !== 422 || !problem.issues) {
          showBanner([problemBannerText(problem)])
          return
        }
        applyServerIssues(problem.issues, value)
      }
    },
  })

  /** Route 422 issues onto rendered fields (deepest match), then focus the first invalid field. */
  function applyServerIssues(issues: readonly ValidationIssue[], values: Values): void {
    const names = orderedFieldNames(fields.map((f) => f.field), values)
    const routed = routeIssues(issues, new Set(names))
    for (const [name, messages] of routed.fieldErrors) {
      form.setFieldMeta(name as never, (prev) => ({ ...prev, errorMap: { ...prev.errorMap, onServer: messages.join(' ') } }))
    }
    if (routed.formErrors.length > 0) setBanner([...routed.formErrors])
    const first = firstInvalidField(names, routed.fieldErrors)
    if (first) focusField(first)
    else if (routed.formErrors.length > 0) setBannerFocusRequest((n) => n + 1)
  }

  return (
    <form
      aria-labelledby={`${ids}-title`}
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        void form.handleSubmit()
      }}
    >
      <h2 id={`${ids}-title`}>
        {mode === 'create' ? `New ${resource.label.toLowerCase()}` : `Edit ${resource.label.toLowerCase()}`}
      </h2>

      {banner.length > 0 && (
        <div ref={bannerRef} role="alert" tabIndex={-1}>
          {banner.map((m) => (
            <p key={m}>{m}</p>
          ))}
        </div>
      )}

      {fields.map(({ field, readOnly }) =>
        field.type === 'array' ? (
          <ArrayFieldEditor key={field.name} form={form} resource={resource} field={field} readOnly={readOnly} />
        ) : (
          <form.Field
            key={field.name}
            name={field.name}
            validators={{
              onBlur: ({ value }) => validateField(field, value, registry.messages)[0]?.message,
              onSubmit: ({ value }) => validateField(field, value, registry.messages)[0]?.message,
            }}
          >
            {(f) => (
              <FieldShell
                name={field.name}
                field={field}
                widget={resolveWidget(registry, resource, field)}
                value={f.state.value}
                errors={f.state.meta.errors as unknown[]}
                readOnly={readOnly}
                onBlur={f.handleBlur}
                onChange={(v) => {
                  f.handleChange(v)
                  if (f.state.meta.errorMap.onServer) f.setMeta((prev) => ({ ...prev, errorMap: { ...prev.errorMap, onServer: undefined } }))
                }}
              />
            )}
          </form.Field>
        ),
      )}

      <form.Subscribe selector={(s) => s.isSubmitting}>
        {(isSubmitting) => (
          <div>
            <button type="submit" disabled={isSubmitting} aria-disabled={isSubmitting || undefined}>
              {mode === 'create' ? `Create ${resource.label.toLowerCase()}` : 'Save changes'}
            </button>
            {onCancel && (
              <button type="button" onClick={onCancel}>
                Cancel
              </button>
            )}
          </div>
        )}
      </form.Subscribe>
    </form>
  )
}

interface FieldShellProps {
  readonly name: string
  readonly field: FieldDescriptor
  readonly widget: Widget
  readonly value: unknown
  readonly errors: readonly unknown[]
  readonly readOnly: boolean
  readonly onChange: (value: unknown) => void
  readonly onBlur: () => void
}

/** Label + widget + help + error, wired for accessibility. Shared by every field and array item. */
function FieldShell({ name, field, widget: WidgetComponent, value, errors, readOnly, onChange, onBlur }: FieldShellProps) {
  const id = fieldDomId(name)
  // TanStack Form keeps one slot per trigger (blur, submit, server); the same message can sit in
  // several. Show each message once.
  const messages = [...new Set(errors.filter((e): e is string => typeof e === 'string' && e !== ''))]
  const helpId = field.help ? `${id}-help` : undefined
  const errorId = messages.length > 0 ? `${id}-error` : undefined
  const describedBy = [helpId, errorId].filter(Boolean).join(' ') || undefined
  return (
    <div>
      <label htmlFor={id}>
        {field.label}
        {field.required && !readOnly && <span aria-hidden="true"> *</span>}
      </label>
      <WidgetComponent
        field={field}
        id={id}
        name={name}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        readOnly={readOnly}
        invalid={messages.length > 0}
        describedBy={describedBy}
      />
      {field.help && <p id={helpId}>{field.help}</p>}
      {errorId && <p id={errorId}>{messages.join(' ')}</p>}
    </div>
  )
}

interface ArrayFieldEditorProps {
  // biome-ignore lint/suspicious/noExplicitAny: TanStack Form's generic form type is not nameable here.
  readonly form: any
  readonly resource: ResourceDescriptor
  readonly field: FieldDescriptor
  readonly readOnly: boolean
}

/**
 * Repeatable group for `array` fields whose JSON Schema describes object items. Each item property
 * is a normal FieldShell named `field[i].prop`, so client validation, server issue routing and focus
 * work exactly like top-level fields.
 */
function ArrayFieldEditor({ form, resource, field, readOnly }: ArrayFieldEditorProps) {
  const { registry } = useUI()
  const props = Object.entries(itemProperties(field))
  const blank = Object.fromEntries(props.map(([p]) => [p, null]))
  return (
    <form.Field name={field.name} mode="array">
      {(arrayField: { state: { value: unknown[]; meta: { errors: unknown[] } }; pushValue: (v: unknown) => void; removeValue: (i: number) => void }) => (
        <fieldset id={fieldDomId(field.name)} tabIndex={-1}>
          <legend>{field.label}</legend>
          {(arrayField.state.meta.errors as unknown[]).filter((e) => typeof e === 'string').length > 0 && (
            <p id={`${fieldDomId(field.name)}-error`}>{(arrayField.state.meta.errors as string[]).join(' ')}</p>
          )}
          {(arrayField.state.value ?? []).map((_, index) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: items have no stable id in this spike.
            <fieldset key={index}>
              <legend>
                {field.label} {index + 1}
              </legend>
              {props.map(([prop, schema]) => {
                const sub = itemFieldDescriptor(field, prop, schema)
                const name = `${field.name}[${index}].${prop}`
                return (
                  <form.Field
                    key={name}
                    name={name}
                    validators={{
                      onBlur: ({ value }: { value: unknown }) => validateField(sub, value, registry.messages)[0]?.message,
                      onSubmit: ({ value }: { value: unknown }) => validateField(sub, value, registry.messages)[0]?.message,
                    }}
                  >
                    {(f: { state: { value: unknown; meta: { errors: unknown[]; errorMap: Record<string, unknown> } }; handleChange: (v: unknown) => void; handleBlur: () => void; setMeta: (u: (p: { errorMap: Record<string, unknown> }) => unknown) => void }) => (
                      <FieldShell
                        name={name}
                        field={sub}
                        widget={resolveWidget(registry, resource, sub)}
                        value={f.state.value}
                        errors={f.state.meta.errors}
                        readOnly={readOnly}
                        onBlur={f.handleBlur}
                        onChange={(v) => {
                          f.handleChange(v)
                          if (f.state.meta.errorMap.onServer) f.setMeta((prev) => ({ ...prev, errorMap: { ...prev.errorMap, onServer: undefined } }))
                        }}
                      />
                    )}
                  </form.Field>
                )
              })}
              {!readOnly && (
                <button type="button" onClick={() => arrayField.removeValue(index)}>
                  Remove {field.label.toLowerCase()} {index + 1}
                </button>
              )}
            </fieldset>
          ))}
          {!readOnly && (
            <button type="button" onClick={() => arrayField.pushValue({ ...blank })}>
              Add {field.label.toLowerCase()}
            </button>
          )}
        </fieldset>
      )}
    </form.Field>
  )
}
