/**
 * FileDrop: a drop zone that is also a real file input, so it works with a mouse (drag or click),
 * the keyboard (Tab + Enter/Space opens the picker) and screen readers (it is a labelled button).
 *
 * Files are validated before they are listed: too large or the wrong type gives an inline error
 * naming the file and the limit, instead of a silent drop. Uploads are simulated with a progress
 * bar; a real implementation would hand each file to `@strutvane/files` (RFC-0002).
 *
 * @example <FileDrop accept={['application/pdf', 'image/png']} maxBytes={10 * 1024 * 1024} />
 */
import { FileText, ImageIcon, UploadCloud, X } from 'lucide-react'
import { type DragEvent, useEffect, useId, useRef, useState } from 'react'
import { cn } from '../../lib/cn.ts'
import { formatBytes } from '../../lib/format.ts'
import { FieldError } from '../ui/field.tsx'

interface Upload {
  id: string
  name: string
  size: number
  type: string
  /** 0–100; 100 means stored. */
  progress: number
}

interface FileDropProps {
  accept: readonly string[]
  maxBytes: number
  /** Files already attached (e.g. when editing). */
  initial?: readonly { name: string; size: number; type: string }[]
  label?: string
}

/** Check one file against the rules; returns a friendly message or `null` when it is fine. */
export function validateFile(file: { name: string; size: number; type: string }, accept: readonly string[], maxBytes: number): string | null {
  if (!accept.includes(file.type)) return `${file.name} is not a supported type. Use PDF, PNG or JPG.`
  if (file.size > maxBytes) return `${file.name} is ${formatBytes(file.size)}; the limit is ${formatBytes(maxBytes)}.`
  return null
}

export function FileDrop({ accept, maxBytes, initial = [], label = 'Attachments' }: FileDropProps) {
  const inputId = useId()
  const errorId = useId()
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [uploads, setUploads] = useState<Upload[]>(() => initial.map((file, index) => ({ ...file, id: `initial-${index}`, progress: 100 })))

  // Simulated upload: advance unfinished files every 120 ms; stop the timer when all are done.
  const uploading = uploads.some((upload) => upload.progress < 100)
  useEffect(() => {
    if (!uploading) return undefined
    const timer = window.setInterval(() => {
      setUploads((current) => current.map((upload) => (upload.progress < 100 ? { ...upload, progress: Math.min(100, upload.progress + 18) } : upload)))
    }, 120)
    return () => window.clearInterval(timer)
  }, [uploading])

  const addFiles = (files: readonly File[]) => {
    const problems: string[] = []
    const accepted: Upload[] = []
    for (const file of files) {
      const problem = validateFile(file, accept, maxBytes)
      if (problem === null) accepted.push({ id: `${file.name}-${file.size}-${Date.now()}`, name: file.name, size: file.size, type: file.type, progress: 6 })
      else problems.push(problem)
    }
    setErrors(problems)
    setUploads((current) => [...current, ...accepted])
  }

  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault()
    setDragging(false)
    addFiles(Array.from(event.dataTransfer.files))
  }

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={inputId}
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong bg-subtle/60 px-4 py-6 text-center transition-colors duration-150',
          'hover:border-fg-subtle hover:bg-subtle has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-ring',
          dragging && 'border-accent bg-accent-subtle',
        )}
      >
        <span className="flex size-9 items-center justify-center rounded-lg border border-border bg-surface shadow-xs">
          <UploadCloud aria-hidden className="size-4 text-fg-muted" />
        </span>
        <span className="text-sm text-fg">
          <span className="font-medium text-accent-text">Choose files</span> or drag them here
        </span>
        <span className="text-xs text-fg-subtle">PDF, PNG or JPG, up to {formatBytes(maxBytes)} each</span>
        <input
          ref={input}
          id={inputId}
          type="file"
          multiple
          accept={accept.join(',')}
          aria-label={label}
          {...(errors.length > 0 ? { 'aria-describedby': errorId } : {})}
          className="sr-only"
          onChange={(event) => {
            addFiles(Array.from(event.target.files ?? []))
            event.target.value = ''
          }}
        />
      </label>
      {errors.length > 0 && (
        <div id={errorId} className="flex flex-col gap-1">
          {errors.map((error) => (
            <FieldError key={error}>{error}</FieldError>
          ))}
        </div>
      )}
      {uploads.length > 0 && (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border" aria-label="Attached files">
          {uploads.map((upload) => (
            <li key={upload.id} className="flex items-center gap-3 px-3 py-2">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-subtle text-fg-muted">
                {upload.type.startsWith('image/') ? <ImageIcon aria-hidden className="size-4" /> : <FileText aria-hidden className="size-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-fg">{upload.name}</span>
                {upload.progress < 100 ? (
                  <span className="mt-1 block h-1 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={`Uploading ${upload.name}`} aria-valuenow={upload.progress} aria-valuemin={0} aria-valuemax={100}>
                    <span className="block h-full rounded-full bg-accent transition-[width] duration-150" style={{ width: `${upload.progress}%` }} />
                  </span>
                ) : (
                  <span className="block text-xs text-fg-subtle">{formatBytes(upload.size)}</span>
                )}
              </span>
              <button
                type="button"
                aria-label={`Remove ${upload.name}`}
                onClick={() => setUploads((current) => current.filter((item) => item.id !== upload.id))}
                className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-fg-subtle hover:bg-subtle hover:text-fg"
              >
                <X aria-hidden className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
