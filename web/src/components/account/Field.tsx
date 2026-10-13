import { EyeIcon, EyeSlashIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { Children, cloneElement, isValidElement, useState, type ReactElement, type ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ApiError } from '@/lib/api'
import { cn } from '@/lib/utils'

type Ariaable = { id?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }

/**
 * Label above, control, helper text, error below. Injects id + aria wiring into its single child
 * so every form on these pages gets the same accessible structure.
 */
export function Field({
  id,
  label,
  hint,
  error,
  optional,
  className,
  children,
}: {
  id: string
  label: ReactNode
  hint?: ReactNode
  error?: string | null
  optional?: boolean
  className?: string
  /** A single control (id + aria are injected) or a render function for composite controls. */
  children: ReactElement<Ariaable> | ((aria: { id: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }) => ReactNode)
}) {
  const hintId = hint ? `${id}-hint` : undefined
  const errId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined
  const aria = { id, 'aria-invalid': Boolean(error) || undefined, 'aria-describedby': describedBy }
  return (
    <div className={cn('grid gap-2', className)}>
      <Label htmlFor={id} className="leading-snug">
        {label}
        {optional && <span className="text-xs font-normal text-muted-foreground">Optional</span>}
      </Label>
      {typeof children === 'function' ? children(aria) : renderChild(children, aria)}
      {hint && (
        <p id={hintId} className="text-[13px] leading-snug text-muted-foreground">
          {hint}
        </p>
      )}
      {error && <FieldError id={errId}>{error}</FieldError>}
    </div>
  )
}

function renderChild(children: ReactElement<Ariaable>, aria: Ariaable) {
  const child = Children.only(children)
  return isValidElement(child) ? cloneElement(child, aria) : child
}

export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} role="alert" className="flex items-start gap-1.5 text-[13px] leading-snug text-destructive">
      <WarningCircleIcon weight="fill" className="mt-px size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  )
}

/** Form-level error banner for API failures that do not map to a single field. */
export function FormError({ message }: { message: string | null | undefined }) {
  if (!message) return null
  return (
    <div role="alert" className="flex items-start gap-2.5 rounded-md border border-destructive/30 bg-destructive/10 px-3.5 py-3 text-sm text-destructive">
      <WarningCircleIcon weight="fill" className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </div>
  )
}

export function PasswordInput(props: Omit<React.ComponentProps<typeof Input>, 'type'>) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Input {...props} type={show ? 'text' : 'password'} className={cn('pr-12', props.className)} />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-md text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        aria-label={show ? 'Hide password' : 'Show password'}
        aria-pressed={show}
      >
        {show ? <EyeSlashIcon className="size-5" /> : <EyeIcon className="size-5" />}
      </button>
    </div>
  )
}

/** Pulls per-field messages out of a zod-style API error ({ details: [{ path, message }] }). */
export function apiFieldErrors(e: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (!(e instanceof ApiError) || !Array.isArray(e.details)) return out
  for (const issue of e.details as { path?: unknown[]; message?: string }[]) {
    const key = issue?.path?.[0]
    if (typeof key === 'string' && issue.message && !out[key]) out[key] = issue.message
  }
  return out
}

/** Strip the "field: " prefix the API puts on validation errors when we show the message inline. */
export function cleanApiMessage(msg: string) {
  return msg.replace(/^[a-zA-Z.]+: /, '')
}

export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim())
