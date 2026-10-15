import { CircleNotchIcon, EnvelopeSimpleIcon } from '@phosphor-icons/react'
import { useMutation } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { AuthShell } from '@/components/account/AuthShell'
import { Field, FormError, cleanApiMessage, isEmail } from '@/components/account/Field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api, errorMessage } from '@/lib/api'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | undefined>()
  const send = useMutation({ mutationFn: () => api.post('/api/auth/forgot', { email: email.trim() }) })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!isEmail(email)) return setError('Enter the email you registered with')
    setError(undefined)
    send.mutate()
  }

  if (send.isSuccess) {
    return (
      <AuthShell title="Check your email" intro="If an account uses that address, a reset link is on its way.">
        <div className="grid gap-5">
          <p className="flex items-start gap-3 rounded-lg border bg-surface p-4 text-sm">
            <EnvelopeSimpleIcon className="mt-0.5 size-5 shrink-0 text-gold-ink" aria-hidden />
            <span>
              We sent a link to <b className="break-all">{email.trim()}</b>. It works once, for the next hour. Check the spam folder if it is not there in a few minutes.
            </span>
          </p>
          <Button variant="outline" onClick={() => send.reset()}>
            Use a different email
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            <Link to="/login" className="font-medium text-gold-ink underline-offset-4 hover:underline">
              Back to sign in
            </Link>
          </p>
        </div>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Forgot password" intro="Enter your email and we will send you a link to choose a new password.">
      <form onSubmit={submit} noValidate className="grid gap-5">
        <Field id="forgot-email" label="Email" error={error}>
          <Input type="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </Field>
        <FormError message={send.isError ? cleanApiMessage(errorMessage(send.error)) : null} />
        <Button type="submit" size="lg" className="w-full" disabled={send.isPending}>
          {send.isPending && <CircleNotchIcon className="animate-spin" />}
          {send.isPending ? 'Sending' : 'Send reset link'}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          Remembered it?{' '}
          <Link to="/login" className="font-medium text-gold-ink underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  )
}
