import { CircleNotchIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { AuthShell } from '@/components/account/AuthShell'
import { Field, FormError, PasswordInput, cleanApiMessage } from '@/components/account/Field'
import { PageSkeleton } from '@/components/account/bits'
import { Button } from '@/components/ui/button'
import { api, errorMessage } from '@/lib/api'
import type { Me } from '@/lib/types'

export default function ResetPassword() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<{ password?: string; confirm?: string }>({})
  const valid = token.length >= 20

  const check = useQuery({
    queryKey: ['reset-token', token],
    queryFn: () => api.get<{ email: string }>(`/api/auth/reset/${encodeURIComponent(token)}`),
    enabled: valid,
    retry: false,
  })
  const reset = useMutation({
    mutationFn: () => api.post<NonNullable<Me['user']>>('/api/auth/reset', { token, password }),
    onSuccess: async (user) => {
      await qc.invalidateQueries({ queryKey: ['me'] })
      navigate(user.role === 'ADMIN' ? '/admin' : '/account', { replace: true })
    },
  })

  if (valid && check.isPending) return <PageSkeleton />
  if (!valid || check.isError) {
    return (
      <AuthShell title="Link expired" intro="This reset link has expired or was already used.">
        <div className="grid gap-5">
          <p className="flex items-start gap-3 rounded-lg border bg-surface p-4 text-sm">
            <WarningCircleIcon className="mt-0.5 size-5 shrink-0 text-warning" aria-hidden />
            Reset links work once, for one hour. Request a new one and use the newest email.
          </p>
          <Button asChild size="lg">
            <Link to="/forgot-password">Send a new link</Link>
          </Button>
        </div>
      </AuthShell>
    )
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const errs: typeof errors = {}
    if (password.length < 8) errs.password = 'Use at least 8 characters'
    if (confirm !== password) errs.confirm = 'The passwords do not match'
    setErrors(errs)
    if (!Object.keys(errs).length) reset.mutate()
  }

  return (
    <AuthShell title="Choose a new password" intro={`For ${check.data?.email}. Every other device will be signed out.`}>
      <form onSubmit={submit} noValidate className="grid gap-5">
        <Field id="reset-password" label="New password" error={errors.password}>
          <PasswordInput autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        </Field>
        <Field id="reset-confirm" label="Repeat new password" error={errors.confirm}>
          <PasswordInput autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <FormError message={reset.isError ? cleanApiMessage(errorMessage(reset.error)) : null} />
        <Button type="submit" size="lg" className="w-full" disabled={reset.isPending}>
          {reset.isPending && <CircleNotchIcon className="animate-spin" />}
          {reset.isPending ? 'Saving' : 'Save new password'}
        </Button>
      </form>
    </AuthShell>
  )
}
