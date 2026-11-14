/**
 * `<CreatePage>` (`/posts/new`) and `<EditPage>` (`/posts/my-first-post/edit`): one form, built
 * from the resolved form fields, with:
 *
 * - client checks for instant feedback, then the server's 422 `issues` on the same fields;
 * - focus moved to the first field with an error, and a summary announced with `role="alert"`;
 * - a slug that follows the title on create until the user edits it, with a URL preview;
 * - only changed fields sent on edit.
 *
 * @module
 */
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from '@tanstack/react-router'
import { useEffect, useId, useState, type FormEvent, type ReactElement, type ReactNode } from 'react'
import type { FieldMetadata } from '../../shared/metadata.ts'
import type { ResolvedResourceUi } from '../../shared/resolve-ui.ts'
import { slugify } from '../../shared/slug.ts'
import { ApiError, type ApiRow } from '../api/client.ts'
import { PageHeader } from '../components/PageHeader.tsx'
import { Alert } from '../components/ui/alert.tsx'
import { Button, buttonVariants } from '../components/ui/button.tsx'
import { Card } from '../components/ui/card.tsx'
import { Skeleton } from '../components/ui/skeleton.tsx'
import { useToast } from '../components/ui/toast.tsx'
import { invalidateResource, recordId, recordRouteKey, recordTitle, useRecord } from '../data/queries.ts'
import { useApi } from '../registry.tsx'
import { FormField } from './FormField.tsx'
import { buildBody, initialValues, validateValues, type FormErrors, type FormValue, type FormValues } from './form-values.ts'
import { LoadError, ResourceGate } from './states.tsx'
import { FieldWidget } from './widgets/FieldWidget.tsx'

/**
 * The create screen.
 *
 * @example
 * createRoute({ getParentRoute: () => appRoute, path: '$resource/new', component: CreatePage })
 */
export function CreatePage(): ReactElement {
  return <ResourceGate ability="create">{(resource) => <ResourceForm key={resource.name} resource={resource} row={undefined} />}</ResourceGate>
}

/**
 * The edit screen. Loads the record by its route key first.
 *
 * @example
 * createRoute({ getParentRoute: () => appRoute, path: '$resource/$key/edit', component: EditPage })
 */
export function EditPage(): ReactElement {
  return <ResourceGate ability="update">{(resource) => <EditLoader key={resource.name} resource={resource} />}</ResourceGate>
}

function EditLoader({ resource }: { readonly resource: ResolvedResourceUi }): ReactElement {
  const params = useParams({ strict: false })
  const record = useRecord(resource, params.key ?? '')
  if (record.isError) return <LoadError what={`this ${resource.label.singular.toLowerCase()}`} error={record.error} onRetry={() => void record.refetch()} />
  if (record.data === undefined) return <Skeleton className="h-64 w-full max-w-2xl" />
  return <ResourceForm resource={resource} row={record.data} />
}

/**
 * Props of {@link ResourceForm}.
 *
 * @example
 * const props: ResourceFormProps = { resource: posts, row: undefined }
 */
export interface ResourceFormProps {
  readonly resource: ResolvedResourceUi
  /** The record being edited, or `undefined` to create one. */
  readonly row: ApiRow | undefined
}

/**
 * The create/edit form.
 *
 * @example
 * <ResourceForm resource={posts} row={post} />
 */
export function ResourceForm({ resource, row }: ResourceFormProps): ReactElement {
  const api = useApi()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const toast = useToast()
  const formId = useId()
  const mode = row === undefined ? 'create' : 'edit'
  const fields = resource.formFields
  const [initial] = useState(() => initialValues(fields, row))
  const [values, setValues] = useState<FormValues>(initial)
  const [errors, setErrors] = useState<FormErrors>({})
  const [formIssues, setFormIssues] = useState<readonly string[]>([])
  const [slugTouched, setSlugTouched] = useState(mode === 'edit')
  const [focusRequest, setFocusRequest] = useState(0)
  const fieldId = (name: string): string => `${formId}-${name}`
  useFocusFirstError(errors, fields, fieldId, focusRequest)

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) => {
      const id = row === undefined ? undefined : recordId(resource, row)
      return id === undefined ? api.create(resource.metadata, body) : api.update(resource.metadata, id, body)
    },
    onSuccess: async (saved) => {
      await invalidateResource(queryClient, resource.name)
      toast(mode === 'create' ? `${resource.label.singular} “${recordTitle(resource, saved)}” created.` : 'Changes saved.')
      void navigate({ to: '/$resource/$key', params: { resource: resource.metadata.route, key: recordRouteKey(resource, saved) } })
    },
    onError: (error) => showServerErrors(error, fields, setErrors, setFormIssues, () => setFocusRequest((count) => count + 1)),
  })

  const setValue = (field: FieldMetadata, value: FormValue): void => {
    setValues((current) => followSlug(resource, { ...current, [field.name]: value }, field, slugTouched))
    if (field.kind === 'slug') setSlugTouched(true)
    // The user is fixing this field: its old error no longer applies.
    if (errors[field.name] !== undefined) setErrors((current) => withoutError(current, field.name))
  }

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    const found = validateValues(fields, values, mode)
    setErrors(found)
    setFormIssues([])
    if (Object.keys(found).length > 0) {
      setFocusRequest((count) => count + 1)
      return
    }
    save.mutate(withoutUntouchedSlug(resource, buildBody(fields, values, mode, initial), slugTouched))
  }

  const errorCount = Object.keys(errors).length + formIssues.length
  const heading = mode === 'create' ? `New ${resource.label.singular.toLowerCase()}` : `Edit ${row === undefined ? '' : recordTitle(resource, row)}`
  const crumbs = [
    { label: 'Home', to: '/' as const },
    { label: resource.label.plural, to: '/$resource' as const, params: { resource: resource.metadata.route } },
    { label: mode === 'create' ? 'New' : 'Edit' },
  ]
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={heading} crumbs={crumbs} />
      {errorCount > 0 && (
        <Alert className="mb-4" title={errorCount === 1 ? '1 field needs attention' : `${errorCount} fields need attention`}>
          {formIssues.length > 0 && (
            <ul className="list-disc pl-5">
              {formIssues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}
        </Alert>
      )}
      <Card>
        <form noValidate onSubmit={submit} className="grid gap-x-6 gap-y-5 p-6 md:grid-cols-2" aria-label={heading}>
          {fields.map((field) => (
            <FormField key={field.name} wide={isWide(field)} id={fieldId(field.name)} field={field} error={errors[field.name]} help={helpFor(resource, field, values, mode)}>
              {({ invalid, describedBy }) => <FieldWidget id={fieldId(field.name)} field={field} value={values[field.name] ?? null} onChange={(value) => setValue(field, value)} invalid={invalid} describedBy={describedBy} />}
            </FormField>
          ))}
          <div className="flex justify-end gap-3 border-t pt-5 md:col-span-2">
            {row === undefined ? (
              <Link to="/$resource" params={{ resource: resource.metadata.route }} className={buttonVariants({ variant: 'outline' })}>
                Cancel
              </Link>
            ) : (
              <Link to="/$resource/$key" params={{ resource: resource.metadata.route, key: recordRouteKey(resource, row) }} className={buttonVariants({ variant: 'outline' })}>
                Cancel
              </Link>
            )}
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving…' : mode === 'create' ? `Create ${resource.label.singular.toLowerCase()}` : 'Save changes'}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  )
}

/** Long inputs take the full form width; short ones share a row (two columns from `md`). */
function isWide(field: FieldMetadata): boolean {
  return field.input === 'textarea' || field.input === 'json'
}

/** On create, keep the slug in step with its source field until the user types a slug. */
function followSlug(resource: ResolvedResourceUi, values: FormValues, changed: FieldMetadata, slugTouched: boolean): FormValues {
  const slug = resource.metadata.slug
  if (slug === undefined || slugTouched || changed.name !== slug.from) return values
  const source = values[slug.from]
  return { ...values, [slug.field]: typeof source === 'string' ? slugify(source) : '' }
}

/** The slug preview (and its warning on edit); nothing for other fields. */
function helpFor(resource: ResolvedResourceUi, field: FieldMetadata, values: FormValues, mode: 'create' | 'edit'): ReactNode {
  if (field.kind !== 'slug') return undefined
  const slug = values[field.name]
  const shown = typeof slug === 'string' && slug !== '' ? slug : '…'
  const url = `/${resource.metadata.route}/${shown}`
  if (mode === 'edit') return <>URL: <code>{url}</code>. Changing the slug breaks links that were already shared.</>
  return <>URL: <code>{url}</code>. Filled in from the {resource.metadata.slug?.from ?? 'title'} (a number is added if it is taken); edit it to choose your own.</>
}

/**
 * Put a failed save's problems where people look: 422 issues on their fields (or in the summary
 * when the field is not on this form), anything else in the summary.
 */
function showServerErrors(error: Error, fields: readonly FieldMetadata[], setErrors: (errors: FormErrors) => void, setFormIssues: (issues: readonly string[]) => void, requestFocus: () => void): void {
  if (!(error instanceof ApiError)) {
    setFormIssues(['Something unexpected happened. Please try again.'])
    return
  }
  const onForm: Record<string, string> = {}
  const elsewhere: string[] = []
  for (const issue of error.issues) {
    if (fields.some((field) => field.name === issue.field) && onForm[issue.field] === undefined) onForm[issue.field] = issue.message
    else elsewhere.push(issue.message)
  }
  if (error.issues.length === 0) elsewhere.push(error.message)
  setErrors(onForm)
  setFormIssues(elsewhere)
  requestFocus()
}

/** After a failed submit, move focus to the first field (in form order) that has an error. */
function useFocusFirstError(errors: FormErrors, fields: readonly FieldMetadata[], fieldId: (name: string) => string, request: number): void {
  useEffect(() => {
    if (request === 0) return
    const first = fields.find((field) => errors[field.name] !== undefined)
    if (first !== undefined) document.getElementById(fieldId(first.name))?.focus()
    // Only a new submit attempt moves focus; typing must not.
  }, [request])
}

/**
 * On create, a slug the user never edited is left to the server: it builds the same slug from the
 * title and adds `-2`, `-3` when it is taken, instead of answering "already taken".
 */
function withoutUntouchedSlug(resource: ResolvedResourceUi, body: Record<string, unknown>, slugTouched: boolean): Record<string, unknown> {
  const slug = resource.metadata.slug
  if (slug === undefined || slugTouched) return body
  const rest: Record<string, unknown> = { ...body }
  delete rest[slug.field]
  return rest
}

/** A copy of the errors without one field's entry. */
function withoutError(errors: FormErrors, name: string): FormErrors {
  const next: Record<string, string> = { ...errors }
  delete next[name]
  return next
}
