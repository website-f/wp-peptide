import { ArrowRightIcon, CircleNotchIcon, HourglassMediumIcon, SealCheckIcon, WarningIcon } from '@phosphor-icons/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { api, errorMessage } from '@/lib/api'
import { useMe } from '@/lib/queries'
import type { Me } from '@/lib/types'
import { Field, FieldError, FormError, PasswordInput, apiFieldErrors, cleanApiMessage, isEmail } from './Field'
import { BankFields, emptyBank, validateBank, type BankValue } from './BankFields'
import { ErrorState } from './bits'

export const PLATFORMS = ['TikTok', 'Instagram', 'YouTube', 'X', 'Facebook', 'Snapchat', 'Twitch', 'Podcast', 'Newsletter / Blog', 'Other'] as const

type Key = 'name' | 'email' | 'password' | 'phone' | 'platform' | 'handle' | 'otherHandles' | 'website' | 'promotionPlan' | 'agree' | keyof BankValue
type Errors = Partial<Record<Key, string>>

const STATUS_COPY: Record<NonNullable<Me['affiliate']>['status'], { title: string; body: string; icon: typeof SealCheckIcon }> = {
  APPROVED: { title: 'You are an approved partner', body: 'Your link, code and live earnings are on your dashboard.', icon: SealCheckIcon },
  PENDING: { title: 'Your application is in review', body: 'We read every application by hand. Your dashboard shows the status and switches on the moment you are approved.', icon: HourglassMediumIcon },
  REJECTED: { title: 'Application not approved', body: 'Your dashboard explains what happens next and how to reach us.', icon: WarningIcon },
  SUSPENDED: { title: 'Partner account paused', body: 'Your dashboard explains why and how to reach us.', icon: WarningIcon },
}

/** Application form, or a status card for people who already have a partner account. */
export function PartnerApply() {
  const me = useMe()
  if (me.isPending)
    return (
      <div className="grid gap-5 rounded-xl border bg-card p-5 sm:p-8" aria-busy aria-label="Loading form">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="grid gap-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-11 w-full" />
          </div>
        ))}
      </div>
    )
  if (me.isError) return <ErrorState error={me.error} onRetry={() => void me.refetch()} title="Could not load the form" />

  const aff = me.data.affiliate
  if (aff) {
    const c = STATUS_COPY[aff.status]
    return (
      <div className="rounded-xl border border-gold/30 bg-card p-6 sm:p-8">
        <div className="grid size-12 place-items-center rounded-full bg-gold/10 text-gold-ink">
          <c.icon className="size-6" weight="fill" aria-hidden />
        </div>
        <h3 className="display mt-5 text-4xl">{c.title}</h3>
        <p className="mt-2 max-w-md text-muted-foreground">{c.body}</p>
        <p className="mt-4 text-sm text-muted-foreground">
          Partner code <span className="font-mono text-foreground tabular-nums">{aff.code}</span>
        </p>
        <Button asChild size="lg" className="mt-6 w-full sm:w-auto">
          <Link to="/partners/dashboard">
            Open partner dashboard <ArrowRightIcon />
          </Link>
        </Button>
      </div>
    )
  }
  return <ApplyForm user={me.data.user} />
}

function ApplyForm({ user }: { user: Me['user'] }) {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const [f, setF] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    platform: '' as string,
    handle: '',
    otherHandles: '',
    website: '',
    promotionPlan: '',
  })
  const [agree, setAgree] = useState(false)
  const [bank, setBank] = useState<BankValue>(emptyBank)
  const [errors, setErrors] = useState<Errors>({})
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }))

  const apply = useMutation({
    mutationFn: () =>
      api.post<{ status: string; code: string }>('/api/affiliate/apply', {
        // Signed-in applicants are identified by their session.
        name: user ? undefined : f.name.trim(),
        email: user ? undefined : f.email.trim(),
        password: user ? undefined : f.password,
        phone: (user ? user.phone ?? '' : f.phone.trim()) || undefined,
        platform: f.platform,
        handle: f.handle.trim(),
        otherHandles: f.otherHandles.trim() || undefined,
        website: f.website.trim() || undefined,
        bankName: bank.bankName.trim(),
        bankAccountName: bank.bankAccountName.trim(),
        bankAccountNumber: bank.bankAccountNumber.replace(/[s-]/g, ''),
        promotionPlan: f.promotionPlan.trim() || undefined,
        agree: true,
      }),
    onSuccess: async () => {
      toast.success('Application received. Welcome to the KYVO partner program.')
      await qc.invalidateQueries({ queryKey: ['me'] })
      qc.removeQueries({ queryKey: ['affiliate'] })
      navigate('/partners/dashboard')
    },
    onError: (e) => setErrors(apiFieldErrors(e) as Errors),
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const errs: Errors = {}
    if (!user) {
      if (!f.name.trim()) errs.name = 'Tell us your name'
      if (!isEmail(f.email)) errs.email = 'Enter a valid email address'
      if (f.password.length < 8) errs.password = 'Use at least 8 characters'
    }
    if (!f.platform) errs.platform = 'Pick the platform where most of your audience is'
    if (!f.handle.trim()) errs.handle = 'Add your main handle or channel link'
    Object.assign(errs, validateBank(bank))
    if (!agree) errs.agree = 'Please accept the partner terms to apply'
    setErrors(errs)
    if (Object.keys(errs).length) {
      const first = Object.keys(errs)[0]
      document.getElementById(`ap-${first}`)?.focus()
      return
    }
    apply.mutate()
  }

  const generic = apply.isError && !Object.keys(errors).length ? cleanApiMessage(errorMessage(apply.error)) : null
  const signInHref = `/login?next=${encodeURIComponent('/partners#apply')}`

  return (
    <form onSubmit={submit} noValidate className="grid gap-8 rounded-xl border bg-card p-5 sm:p-8">
      <fieldset className="grid gap-5">
        <legend className="sr-only">About you</legend>
        <p aria-hidden className="font-display text-2xl font-semibold tracking-wide uppercase">
          About you
        </p>
        {user ? (
          <div className="rounded-md border bg-surface/60 px-4 py-3 text-sm">
            Applying as <span className="font-medium">{user.name}</span> <span className="text-muted-foreground">({user.email})</span>
          </div>
        ) : (
          <>
            <p className="-mt-1 text-sm text-muted-foreground">
              This also creates your KYVO account. Already have one?{' '}
              <Link to={signInHref} className="font-medium text-gold-ink underline-offset-4 hover:underline">
                Sign in first
              </Link>
              .
            </p>
            <Field id="ap-name" label="Full name" error={errors.name}>
              <Input autoComplete="name" autoCapitalize="words" value={f.name} onChange={set('name')} />
            </Field>
            <Field id="ap-email" label="Email" error={errors.email} hint="Your sign-in and where we send partner updates.">
              <Input type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={f.email} onChange={set('email')} />
            </Field>
            <Field id="ap-password" label="Password" error={errors.password} hint="At least 8 characters.">
              <PasswordInput autoComplete="new-password" minLength={8} value={f.password} onChange={set('password')} />
            </Field>
            <Field id="ap-phone" label="Phone" optional error={errors.phone}>
              <Input type="tel" inputMode="tel" autoComplete="tel" value={f.phone} onChange={set('phone')} />
            </Field>
          </>
        )}
      </fieldset>

      <fieldset className="grid gap-5 border-t pt-8">
        <legend className="sr-only">Your audience</legend>
        <p aria-hidden className="font-display text-2xl font-semibold tracking-wide uppercase">
          Your audience
        </p>
        <Field id="ap-platform" label="Primary platform" error={errors.platform}>
          {(aria) => (
            <Select value={f.platform} onValueChange={(v) => setF((x) => ({ ...x, platform: v }))}>
              <SelectTrigger {...aria} className="w-full">
                <SelectValue placeholder="Choose a platform" />
              </SelectTrigger>
              <SelectContent>
                {PLATFORMS.map((p) => (
                  <SelectItem key={p} value={p} className="min-h-10">
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </Field>
        <Field id="ap-handle" label="Primary handle or channel URL" error={errors.handle} hint="We use this to suggest your partner code.">
          <Input autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="@yourhandle or https://" value={f.handle} onChange={set('handle')} />
        </Field>
        <Field id="ap-otherHandles" label="Other handles" optional error={errors.otherHandles}>
          <Input autoComplete="off" autoCapitalize="none" spellCheck={false} placeholder="Comma separated" value={f.otherHandles} onChange={set('otherHandles')} />
        </Field>
        <Field id="ap-website" label="Website" optional error={errors.website}>
          <Input type="url" inputMode="url" autoComplete="url" autoCapitalize="none" spellCheck={false} placeholder="https://" value={f.website} onChange={set('website')} />
        </Field>
        <Field
          id="ap-promotionPlan"
          label="How you will promote us"
          optional
          error={errors.promotionPlan}
          hint="Formats, audience, cadence. Keep it to research and lab content."
        >
          <Textarea rows={4} maxLength={2000} value={f.promotionPlan} onChange={set('promotionPlan')} />
        </Field>
      </fieldset>

      <fieldset className="grid gap-5 border-t pt-8">
        <legend className="sr-only">Getting paid</legend>
        <p aria-hidden className="font-display text-2xl font-semibold tracking-wide uppercase">
          Getting paid
        </p>
        <BankFields idPrefix="ap" value={bank} onChange={setBank} errors={errors} />
      </fieldset>

      <div className="grid gap-2 border-t pt-8">
        <label htmlFor="ap-agree" className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border bg-surface/60 p-3.5 text-sm leading-snug">
          <Checkbox
            id="ap-agree"
            className="mt-0.5"
            checked={agree}
            onCheckedChange={(v) => setAgree(v === true)}
            aria-invalid={Boolean(errors.agree) || undefined}
            aria-describedby={errors.agree ? 'ap-agree-error' : undefined}
          />
          <span>
            I agree to the partner section of the{' '}
            <Link to="/policies/terms" target="_blank" className="text-gold-ink underline underline-offset-2">
              terms
            </Link>{' '}
            and the{' '}
            <Link to="/policies/research-use" target="_blank" className="text-gold-ink underline underline-offset-2">
              research use policy
            </Link>
            . I will not give dosing advice or make health claims, and I am 21 or older.
          </span>
        </label>
        {errors.agree && <FieldError id="ap-agree-error">{errors.agree}</FieldError>}
      </div>

      <FormError message={generic} />
      <Button type="submit" size="lg" className="w-full" disabled={apply.isPending}>
        {apply.isPending && <CircleNotchIcon className="animate-spin" />}
        {apply.isPending ? 'Sending application' : 'Submit application'}
      </Button>
    </form>
  )
}
