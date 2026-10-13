import { CircleNotchIcon, HandshakeIcon } from '@phosphor-icons/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router'
import { AuthShell } from '@/components/account/AuthShell'
import { Field, FormError, PasswordInput, cleanApiMessage, isEmail } from '@/components/account/Field'
import { PageSkeleton, safeNext } from '@/components/account/bits'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api, errorMessage } from '@/lib/api'
import { useMe } from '@/lib/queries'
import type { Me } from '@/lib/types'

type PublicUser = NonNullable<Me['user']>

export default function Login() {
  const me = useMe()
  const navigate = useNavigate()
  const location = useLocation()
  const qc = useQueryClient()
  const [params] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({})

  const explicitNext = safeNext(params.get('next'))
  const stateFrom = safeNext((location.state as { from?: unknown } | null)?.from)
  // The header link always passes the current path; "/" is not a meaningful destination.
  const next = explicitNext ?? (stateFrom && stateFrom !== '/' ? stateFrom : null)
  const destination = (u: PublicUser) => next ?? (u.role === 'ADMIN' ? '/admin' : '/account')

  const login = useMutation({
    mutationFn: () => api.post<PublicUser>('/api/auth/login', { email: email.trim(), password }),
    onSuccess: async (user) => {
      qc.removeQueries({ queryKey: ['account'] })
      qc.removeQueries({ queryKey: ['affiliate'] })
      await qc.invalidateQueries({ queryKey: ['me'] })
      navigate(destination(user), { replace: true })
    },
  })

  if (me.isPending) return <PageSkeleton />
  if (me.data?.user && !login.isPending && !login.isSuccess) return <Navigate to={destination(me.data.user)} replace />

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const errs: typeof errors = {}
    if (!isEmail(email)) errs.email = 'Enter the email you registered with'
    if (!password) errs.password = 'Enter your password'
    setErrors(errs)
    if (Object.keys(errs).length) return
    login.mutate()
  }

  const nextQs = next ? `?next=${encodeURIComponent(next)}` : ''

  return (
    <AuthShell
      title="Sign in"
      intro="Track orders, spend points and manage your box."
      footer={
        <span className="inline-flex flex-wrap items-center justify-center gap-x-1.5 gap-y-1">
          <HandshakeIcon className="size-4 text-gold-ink" aria-hidden />
          Creator or publisher?
          <Link to="/partners#apply" className="font-medium text-foreground underline-offset-4 hover:underline">
            Apply to the partner program
          </Link>
        </span>
      }
    >
      <form onSubmit={submit} noValidate className="grid gap-5">
        <Field id="login-email" label="Email" error={errors.email}>
          <Input type="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field id="login-password" label="Password" error={errors.password}>
          <PasswordInput autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <FormError message={login.isError ? cleanApiMessage(errorMessage(login.error)) : null} />
        <Button type="submit" size="lg" className="w-full" disabled={login.isPending}>
          {login.isPending && <CircleNotchIcon className="animate-spin" />}
          {login.isPending ? 'Signing in' : 'Sign in'}
        </Button>
        <p className="text-center text-sm text-muted-foreground">
          New to KYVO?{' '}
          <Link to={`/register${nextQs}`} className="font-medium text-gold-ink underline-offset-4 hover:underline">
            Create an account
          </Link>
        </p>
        <p className="text-center text-xs text-muted-foreground">
          Forgot your password? Email us from the address on your account via the{' '}
          <Link to="/contact" className="underline underline-offset-2 hover:text-foreground">
            contact page
          </Link>{' '}
          and we will reset it.
        </p>
      </form>
    </AuthShell>
  )
}
