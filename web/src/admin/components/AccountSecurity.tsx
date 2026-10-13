// Admin sign-in security: the first sign-in setup screen and the "My account" dialog.
// Both use PATCH /api/auth/me, which needs the current password for email or password changes.
import { EyeIcon, EyeSlashIcon, KeyIcon, LockKeyIcon, MoonIcon, ShieldCheckIcon, SignOutIcon, SunIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Logo } from '@/components/brand/Logo'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { api, errorMessage } from '@/lib/api'
import { useTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { CONTROL, Field, TextInput } from './kit'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MIN_PASSWORD = 8

/** Password input with a show/hide toggle. */
export function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  invalid,
  autoFocus,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  autoComplete: 'current-password' | 'new-password'
  invalid?: boolean
  autoFocus?: boolean
}) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative min-w-0">
      <Input
        id={id}
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        aria-invalid={invalid || undefined}
        maxLength={128}
        spellCheck={false}
        autoCapitalize="none"
        className={cn(CONTROL, 'pr-10 font-mono')}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
        aria-pressed={show}
        className="absolute top-1/2 right-1 grid size-7 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        {show ? <EyeSlashIcon className="size-4" /> : <EyeIcon className="size-4" />}
      </button>
    </div>
  )
}

function FormAlert({ message }: { message: string | null }) {
  if (!message) return null
  return (
    <div role="alert" className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
      <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
      <span>{message}</span>
    </div>
  )
}

type Errors = Partial<Record<'name' | 'email' | 'current' | 'next' | 'confirm', string>>

function passwordErrors(current: string, next: string, confirm: string, required: boolean): Errors {
  const e: Errors = {}
  if (!required && !next && !confirm) return e
  if (next.length < MIN_PASSWORD) e.next = `Use at least ${MIN_PASSWORD} characters`
  else if (next === current) e.next = 'Choose a password different from the current one'
  if (!e.next && confirm !== next) e.confirm = 'The two passwords do not match'
  return e
}

// ---------------------------------------------------------------------------
// First sign-in setup
// ---------------------------------------------------------------------------

/**
 * Shown instead of the admin panel while the account still uses a one-time password.
 * Nothing in the panel loads until a new password is set (the API refuses admin calls anyway).
 */
export function FirstSignInSetup({ user, onSignOut }: { user: { name: string; email: string }; onSignOut: () => void }) {
  const qc = useQueryClient()
  const { theme, toggle } = useTheme()
  const [email, setEmail] = useState(user.email)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [touched, setTouched] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const errors: Errors = {
    ...(EMAIL_RE.test(email.trim()) ? {} : { email: 'Enter a valid email address' }),
    ...(current ? {} : { current: 'Enter the one-time password' }),
    ...passwordErrors(current, next, confirm, true),
  }
  const shown: Errors = touched ? errors : {}

  async function submit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    setApiError(null)
    if (Object.keys(errors).length) return
    setPending(true)
    try {
      await api.patch('/api/auth/me', { email: email.trim().toLowerCase(), currentPassword: current, newPassword: next })
      toast.success('Password set. Welcome to the admin panel.')
      await qc.invalidateQueries({ queryKey: ['me'] })
    } catch (err) {
      const msg = errorMessage(err)
      setApiError(/current password is incorrect/i.test(msg) ? 'That one-time password is not right. Copy it again exactly as shown in the logs.' : msg)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header className="flex h-14 items-center gap-2 border-b px-4 sm:px-6">
        <Logo to={null} compact />
        <span className="rounded-md border border-gold/30 bg-gold/10 px-1.5 py-0.5 font-mono text-[10px] tracking-[0.16em] text-gold-ink uppercase">Admin</span>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={toggle} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>
            {theme === 'dark' ? <SunIcon className="size-5" /> : <MoonIcon className="size-5" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={onSignOut}>
            <SignOutIcon />
            Sign out
          </Button>
        </div>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 py-8 sm:items-center sm:py-12">
        <div className="w-full max-w-md">
          <div className="mb-6 text-center">
            <div className="mx-auto mb-4 grid size-12 place-items-center rounded-full bg-gold/10 text-gold-ink">
              <ShieldCheckIcon className="size-6" weight="duotone" />
            </div>
            <h1 className="font-display text-3xl leading-tight font-semibold tracking-wide uppercase">Secure your account</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              You signed in with a one-time password. Choose your own password to open the admin panel.
            </p>
          </div>

          <form onSubmit={submit} noValidate className="space-y-4 rounded-xl border bg-card p-4 sm:p-6">
            <div className="flex items-start gap-2.5 rounded-md border bg-surface px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
              <KeyIcon className="mt-0.5 size-4 shrink-0 text-gold-ink" />
              <span>
                The one-time password is the one shown in the server logs when the store was first set up, or the latest one issued with a password reset.
                It stops working as soon as you save a new password.
              </span>
            </div>

            <FormAlert message={apiError} />

            <Field label="Sign-in email" htmlFor="setup-email" error={shown.email} hint="You can change it now or later from My account.">
              <TextInput
                id="setup-email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                aria-invalid={Boolean(shown.email) || undefined}
                maxLength={160}
              />
            </Field>
            <Field label="One-time password" htmlFor="setup-current" error={shown.current}>
              <PasswordInput id="setup-current" value={current} onChange={setCurrent} autoComplete="current-password" invalid={Boolean(shown.current)} autoFocus />
            </Field>
            <Field label="New password" htmlFor="setup-new" error={shown.next} hint={`At least ${MIN_PASSWORD} characters. A short phrase is easier to remember and harder to guess.`}>
              <PasswordInput id="setup-new" value={next} onChange={setNext} autoComplete="new-password" invalid={Boolean(shown.next)} />
            </Field>
            <Field label="Confirm new password" htmlFor="setup-confirm" error={shown.confirm}>
              <PasswordInput id="setup-confirm" value={confirm} onChange={setConfirm} autoComplete="new-password" invalid={Boolean(shown.confirm)} />
            </Field>

            <Button type="submit" className="h-10 w-full" disabled={pending}>
              <LockKeyIcon />
              {pending ? 'Saving...' : 'Save password and continue'}
            </Button>
          </form>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            Signed in as <span className="text-foreground">{user.name}</span>
          </p>
        </div>
      </main>
    </div>
  )
}

// ---------------------------------------------------------------------------
// My account dialog
// ---------------------------------------------------------------------------

export function MyAccountDialog({
  user,
  open,
  onOpenChange,
}: {
  user: { name: string; email: string }
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const qc = useQueryClient()
  const [name, setName] = useState(user.name)
  const [email, setEmail] = useState(user.email)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [touched, setTouched] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const reset = () => {
    setName(user.name)
    setEmail(user.email)
    setCurrent('')
    setNext('')
    setConfirm('')
    setTouched(false)
    setApiError(null)
  }

  // Start fresh every time the dialog opens.
  useEffect(() => {
    if (open) reset()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const emailChanged = email.trim().toLowerCase() !== user.email.toLowerCase()
  const nameChanged = name.trim() !== user.name
  const passwordChanging = Boolean(next || confirm)
  const needsCurrent = emailChanged || passwordChanging
  const dirty = emailChanged || nameChanged || passwordChanging

  const errors: Errors = {
    ...(name.trim() ? {} : { name: 'Enter your name' }),
    ...(EMAIL_RE.test(email.trim()) ? {} : { email: 'Enter a valid email address' }),
    ...(needsCurrent && !current ? { current: 'Enter your current password to confirm this change' } : {}),
    ...passwordErrors(current, next, confirm, false),
  }
  const shown: Errors = touched ? errors : {}

  async function submit(e: FormEvent) {
    e.preventDefault()
    setTouched(true)
    setApiError(null)
    if (Object.keys(errors).length || !dirty) return
    setPending(true)
    try {
      const body: Record<string, string> = {}
      if (nameChanged) body.name = name.trim()
      if (emailChanged) body.email = email.trim().toLowerCase()
      if (needsCurrent) body.currentPassword = current
      if (passwordChanging) body.newPassword = next
      await api.patch('/api/auth/me', body)
      await qc.invalidateQueries({ queryKey: ['me'] })
      toast.success(passwordChanging ? 'Account saved. Use your new password next time you sign in.' : 'Account saved')
      onOpenChange(false)
    } catch (err) {
      setApiError(errorMessage(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!pending) onOpenChange(o)
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-semibold tracking-wide uppercase">My account</DialogTitle>
          <DialogDescription>Your admin name, sign-in email and password. Changing the email or password needs your current password.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          <FormAlert message={apiError} />
          <Field label="Name" htmlFor="acct-name" error={shown.name}>
            <TextInput id="acct-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="name" />
          </Field>
          <Field label="Sign-in email" htmlFor="acct-email" error={shown.email}>
            <TextInput id="acct-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={160} autoComplete="username" />
          </Field>
          <div className="space-y-4 rounded-md border bg-surface p-3">
            <p className="text-[13px] font-medium">Change password</p>
            <Field label="New password" htmlFor="acct-new" error={shown.next} optional hint={`Leave empty to keep your current password. At least ${MIN_PASSWORD} characters.`}>
              <PasswordInput id="acct-new" value={next} onChange={setNext} autoComplete="new-password" invalid={Boolean(shown.next)} />
            </Field>
            {passwordChanging && (
              <Field label="Confirm new password" htmlFor="acct-confirm" error={shown.confirm}>
                <PasswordInput id="acct-confirm" value={confirm} onChange={setConfirm} autoComplete="new-password" invalid={Boolean(shown.confirm)} />
              </Field>
            )}
          </div>
          {needsCurrent && (
            <Field label="Current password" htmlFor="acct-current" error={shown.current} hint="Confirms it is really you.">
              <PasswordInput id="acct-current" value={current} onChange={setCurrent} autoComplete="current-password" invalid={Boolean(shown.current)} />
            </Field>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending || !dirty}>
              {pending ? 'Saving...' : 'Save changes'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
