import { CircleNotchIcon, SignOutIcon } from '@phosphor-icons/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { api, errorMessage } from '@/lib/api'
import { date } from '@/lib/format'
import type { Me } from '@/lib/types'
import { Field, FormError, PasswordInput, apiFieldErrors, cleanApiMessage } from './Field'

type User = NonNullable<Me['user']>

export function useSignOut() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: () => api.post('/api/auth/logout'),
    onSuccess: () => {
      navigate('/', { replace: true })
      qc.removeQueries({ queryKey: ['account'] })
      qc.removeQueries({ queryKey: ['affiliate'] })
      qc.setQueryData<Me>(['me'], { user: null, affiliate: null })
      void qc.invalidateQueries({ queryKey: ['me'] })
      toast.success('Signed out')
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
}

export function AccountProfile({ user }: { user: User }) {
  const signOut = useSignOut()
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
      <DetailsForm user={user} />
      <div className="grid gap-6">
        <PasswordForm />
        <section className="rounded-xl border bg-surface/60 p-5 sm:p-6">
          <h3 className="display text-3xl">Sign out</h3>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Signed in as <span className="text-foreground">{user.email}</span> since {date(user.createdAt)}.
          </p>
          <Button variant="outline" className="mt-4 h-11 w-full sm:w-auto" onClick={() => signOut.mutate()} disabled={signOut.isPending}>
            {signOut.isPending ? <CircleNotchIcon className="animate-spin" /> : <SignOutIcon />}
            Sign out
          </Button>
        </section>
      </div>
    </div>
  )
}

function DetailsForm({ user }: { user: User }) {
  const qc = useQueryClient()
  const [name, setName] = useState(user.name)
  const [phone, setPhone] = useState(user.phone ?? '')
  const [errors, setErrors] = useState<{ name?: string; phone?: string }>({})
  const save = useMutation({
    mutationFn: () => api.patch<User>('/api/auth/me', { name: name.trim(), phone: phone.trim() || null }),
    onSuccess: async () => {
      toast.success('Details saved')
      await qc.invalidateQueries({ queryKey: ['me'] })
    },
    onError: (e) => setErrors(apiFieldErrors(e)),
  })
  const dirty = name.trim() !== user.name || (phone.trim() || null) !== (user.phone || null)
  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setErrors({ name: 'Your name cannot be empty' })
    setErrors({})
    save.mutate()
  }
  const generic = save.isError && !Object.keys(errors).length ? cleanApiMessage(errorMessage(save.error)) : null

  return (
    <form onSubmit={submit} noValidate className="grid gap-5 rounded-xl border bg-card p-5 sm:p-6">
      <div>
        <h3 className="display text-3xl">Your details</h3>
        <p className="mt-1 text-sm text-muted-foreground">Used on orders and shipping labels.</p>
      </div>
      <Field id="pf-email" label="Email" hint="Need to change your email? Contact support and we will move your account.">
        <Input type="email" value={user.email} readOnly disabled autoComplete="email" />
      </Field>
      <Field id="pf-name" label="Full name" error={errors.name}>
        <Input autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field id="pf-phone" label="Phone" optional error={errors.phone} hint="For the courier, if they need to reach you.">
        <Input type="tel" inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </Field>
      <FormError message={generic} />
      <Button type="submit" className="h-11 w-full sm:w-auto sm:justify-self-start" disabled={!dirty || save.isPending}>
        {save.isPending && <CircleNotchIcon className="animate-spin" />}
        Save details
      </Button>
    </form>
  )
}

function PasswordForm() {
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [errors, setErrors] = useState<{ currentPassword?: string; newPassword?: string }>({})
  const save = useMutation({
    mutationFn: () => api.patch('/api/auth/me', { currentPassword: current, newPassword: next }),
    onSuccess: () => {
      toast.success('Password updated')
      setCurrent('')
      setNext('')
      setErrors({})
    },
    onError: (e) => {
      const f = apiFieldErrors(e)
      const msg = errorMessage(e)
      // The API reports a wrong current password as a plain 400.
      if (!Object.keys(f).length && /current password/i.test(msg)) f.currentPassword = msg
      setErrors(f)
    },
  })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const errs: typeof errors = {}
    if (!current) errs.currentPassword = 'Enter your current password'
    if (next.length < 8) errs.newPassword = 'Use at least 8 characters'
    else if (next === current) errs.newPassword = 'Choose a password you have not used here'
    setErrors(errs)
    if (Object.keys(errs).length) return
    save.mutate()
  }
  const generic = save.isError && !Object.keys(errors).length ? cleanApiMessage(errorMessage(save.error)) : null

  return (
    <form onSubmit={submit} noValidate className="grid gap-5 rounded-xl border bg-card p-5 sm:p-6">
      <div>
        <h3 className="display text-3xl">Password</h3>
        <p className="mt-1 text-sm text-muted-foreground">You stay signed in on this device after changing it.</p>
      </div>
      <Field id="pw-current" label="Current password" error={errors.currentPassword}>
        <PasswordInput autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </Field>
      <Field id="pw-new" label="New password" error={errors.newPassword} hint="At least 8 characters.">
        <PasswordInput autoComplete="new-password" minLength={8} value={next} onChange={(e) => setNext(e.target.value)} />
      </Field>
      <FormError message={generic} />
      <Button type="submit" variant="secondary" className="h-11 w-full sm:w-auto sm:justify-self-start" disabled={save.isPending}>
        {save.isPending && <CircleNotchIcon className="animate-spin" />}
        Update password
      </Button>
    </form>
  )
}
