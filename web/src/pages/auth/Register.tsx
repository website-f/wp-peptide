import { CircleNotchIcon } from '@phosphor-icons/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { AuthShell } from '@/components/account/AuthShell'
import { Field, FieldError, FormError, PasswordInput, apiFieldErrors, cleanApiMessage, isEmail } from '@/components/account/Field'
import { GoTo, PageSkeleton, leaveTo, safeNext } from '@/components/account/bits'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { api, errorMessage } from '@/lib/api'
import { useMe, useSettings } from '@/lib/queries'
import { useSeo } from '@/lib/seo'

type Errors = Partial<Record<'name' | 'email' | 'phone' | 'password' | 'confirmAge', string>>

export default function Register() {
  useSeo({ title: 'Create an account', noindex: true })
  const me = useMe()
  const settings = useSettings()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' })
  const [confirmAge, setConfirmAge] = useState(false)
  const [errors, setErrors] = useState<Errors>({})
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const register = useMutation({
    mutationFn: () =>
      api.post('/api/auth/register', {
        name: form.name.trim(),
        email: form.email.trim(),
        password: form.password,
        phone: form.phone.trim() || undefined,
        confirmAge: true,
      }),
    onSuccess: async () => {
      qc.removeQueries({ queryKey: ['account'] })
      qc.removeQueries({ queryKey: ['affiliate'] })
      await qc.invalidateQueries({ queryKey: ['me'] })
      leaveTo(navigate, next ?? '/account')
    },
    onError: (e) => setErrors(apiFieldErrors(e) as Errors),
  })

  if (me.isPending) return <PageSkeleton />
  if (me.data?.user && !register.isPending && !register.isSuccess) return <GoTo to={next ?? '/account'} />

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const errs: Errors = {}
    if (!form.name.trim()) errs.name = 'Tell us your name'
    if (!isEmail(form.email)) errs.email = 'Enter a valid email address'
    if (form.password.length < 8) errs.password = 'Use at least 8 characters'
    if (!confirmAge) errs.confirmAge = 'Please confirm you are 21 or older and buying for research use'
    setErrors(errs)
    if (Object.keys(errs).length) return
    register.mutate()
  }

  const apiMsg = register.isError ? cleanApiMessage(errorMessage(register.error)) : null
  const pts = settings.data?.points.perDollar.MEMBER

  return (
    <AuthShell
      title="Create account"
      intro={pts ? `Members earn ${pts} points for every RM1 spent, from the first order.` : 'Earn points from your first order and track every shipment.'}
      footer={
        <>
          Already have an account?{' '}
          <Link to={`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-medium text-foreground underline-offset-4 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="grid gap-5">
        <Field id="reg-name" label="Full name" error={errors.name}>
          <Input autoComplete="name" autoCapitalize="words" value={form.name} onChange={set('name')} />
        </Field>
        <Field id="reg-email" label="Email" error={errors.email} hint="Order updates and receipts go here.">
          <Input type="email" autoComplete="email" inputMode="email" autoCapitalize="none" spellCheck={false} value={form.email} onChange={set('email')} />
        </Field>
        <Field id="reg-phone" label="Phone" optional error={errors.phone} hint="Only used by the courier if they cannot reach you.">
          <Input type="tel" autoComplete="tel" inputMode="tel" placeholder="012 345 6789" value={form.phone} onChange={set('phone')} />
        </Field>
        <Field id="reg-password" label="Password" error={errors.password} hint="At least 8 characters.">
          <PasswordInput autoComplete="new-password" minLength={8} value={form.password} onChange={set('password')} />
        </Field>

        <div className="grid gap-2">
          <label htmlFor="reg-age" className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border bg-surface/60 p-3.5 text-sm leading-snug">
            <Checkbox
              id="reg-age"
              className="mt-0.5"
              checked={confirmAge}
              onCheckedChange={(v) => setConfirmAge(v === true)}
              aria-invalid={Boolean(errors.confirmAge) || undefined}
              aria-describedby={errors.confirmAge ? 'reg-age-error' : undefined}
            />
            <span>
              I am 21 or older and I am buying for laboratory research use only, as set out in the{' '}
              <Link to="/policies/research-use" className="text-gold-ink underline underline-offset-2" target="_blank">
                research use policy
              </Link>{' '}
              and{' '}
              <Link to="/policies/terms" className="text-gold-ink underline underline-offset-2" target="_blank">
                terms
              </Link>
              .
            </span>
          </label>
          {errors.confirmAge && <FieldError id="reg-age-error">{errors.confirmAge}</FieldError>}
        </div>

        <FormError message={apiMsg && !Object.keys(errors).length ? apiMsg : null} />
        <Button type="submit" size="lg" className="w-full" disabled={register.isPending}>
          {register.isPending && <CircleNotchIcon className="animate-spin" />}
          {register.isPending ? 'Creating account' : 'Create account'}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          We handle your details under our{' '}
          <Link to="/policies/privacy" className="underline underline-offset-2 hover:text-foreground">
            privacy policy
          </Link>
          .
        </p>
      </form>
    </AuthShell>
  )
}
