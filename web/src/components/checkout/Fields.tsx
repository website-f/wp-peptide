import { BankIcon, CreditCardIcon, LockSimpleIcon, TagIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import type { ReactNode } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import type { Settings } from '@/lib/types'
import { cn } from '@/lib/utils'

export const MY_STATES = [
  'Johor',
  'Kedah',
  'Kelantan',
  'Melaka',
  'Negeri Sembilan',
  'Pahang',
  'Perak',
  'Perlis',
  'Pulau Pinang',
  'Sabah',
  'Sarawak',
  'Selangor',
  'Terengganu',
  'W.P. Kuala Lumpur',
  'W.P. Labuan',
  'W.P. Putrajaya',
]

export interface ContactForm {
  email: string
  name: string
  phone: string
  line1: string
  line2: string
  city: string
  state: string
  postalCode: string
}

export const emptyContact: ContactForm = { email: '', name: '', phone: '', line1: '', line2: '', city: '', state: '', postalCode: '' }

export function Field({ id, label, hint, error, children, className }: { id: string; label: string; hint?: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('grid gap-2', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint && !error && <p className="text-[12px] text-muted-foreground">{hint}</p>}
      {error && (
        <p className="text-[12px] text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export function FormSection({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <fieldset className="rounded-xl border bg-card p-5 sm:p-6">
      <div className="mb-5 flex items-baseline justify-between gap-3">
        <legend className="font-display text-2xl font-semibold uppercase">{title}</legend>
        {aside}
      </div>
      {children}
    </fieldset>
  )
}

export function validateContact(f: ContactForm): Partial<Record<keyof ContactForm, string>> {
  const e: Partial<Record<keyof ContactForm, string>> = {}
  if (!/^\S+@\S+\.\S+$/.test(f.email)) e.email = 'Enter a valid email'
  if (!f.name.trim()) e.name = 'Enter the recipient name'
  if (f.phone.replace(/\D/g, '').length < 9) e.phone = 'Enter a phone number, the courier and payment page need it'
  if (!f.line1.trim()) e.line1 = 'Enter your street address'
  if (!f.city.trim()) e.city = 'Enter your city'
  if (!f.state) e.state = 'Choose a state'
  if (!/^\d{5}$/.test(f.postalCode.trim())) e.postalCode = 'Malaysian postcodes have 5 digits'
  return e
}

export function ContactFields({
  value,
  onChange,
  errors,
  lockEmail = false,
}: {
  value: ContactForm
  onChange: (v: ContactForm) => void
  errors: Partial<Record<keyof ContactForm, string>>
  lockEmail?: boolean
}) {
  const set = (k: keyof ContactForm) => (e: React.ChangeEvent<HTMLInputElement>) => onChange({ ...value, [k]: e.target.value })
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field id="email" label="Email" error={errors.email} hint={lockEmail ? 'Signed in as this email.' : 'Your payment receipt is sent here.'}>
        <Input id="email" type="email" autoComplete="email" value={value.email} onChange={set('email')} readOnly={lockEmail} aria-invalid={!!errors.email} />
      </Field>
      <Field id="phone" label="Phone" error={errors.phone}>
        <Input id="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="012 345 6789" value={value.phone} onChange={set('phone')} aria-invalid={!!errors.phone} />
      </Field>
      <Field id="name" label="Full name" error={errors.name} className="sm:col-span-2">
        <Input id="name" autoComplete="name" value={value.name} onChange={set('name')} aria-invalid={!!errors.name} />
      </Field>
      <Field id="line1" label="Address" error={errors.line1} className="sm:col-span-2">
        <Input id="line1" autoComplete="address-line1" placeholder="Unit, street, area" value={value.line1} onChange={set('line1')} aria-invalid={!!errors.line1} />
      </Field>
      <Field id="line2" label="Address line 2 (optional)" className="sm:col-span-2">
        <Input id="line2" autoComplete="address-line2" placeholder="Building, lab, department" value={value.line2} onChange={set('line2')} />
      </Field>
      <Field id="postalCode" label="Postcode" error={errors.postalCode}>
        <Input id="postalCode" inputMode="numeric" autoComplete="postal-code" maxLength={5} value={value.postalCode} onChange={set('postalCode')} aria-invalid={!!errors.postalCode} />
      </Field>
      <Field id="city" label="City" error={errors.city}>
        <Input id="city" autoComplete="address-level2" value={value.city} onChange={set('city')} aria-invalid={!!errors.city} />
      </Field>
      <Field id="state" label="State" error={errors.state}>
        <Select value={value.state} onValueChange={(v) => onChange({ ...value, state: v })}>
          <SelectTrigger id="state" className="w-full" aria-invalid={!!errors.state}>
            <SelectValue placeholder="Choose a state" />
          </SelectTrigger>
          <SelectContent>
            {MY_STATES.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field id="country" label="Country">
        <Input id="country" value="Malaysia" readOnly className="text-muted-foreground" />
      </Field>
    </div>
  )
}

export function toAddress(f: ContactForm) {
  return { line1: f.line1.trim(), line2: f.line2.trim(), city: f.city.trim(), state: f.state, postalCode: f.postalCode.trim(), country: 'Malaysia' }
}

export function PaymentChoice({ methods, value, onChange }: { methods: Settings['paymentMethods']; value: string; onChange: (id: string) => void }) {
  if (methods.length === 0) return <p className="text-sm text-destructive">No payment methods are available right now. Please contact us.</p>
  return (
    <div className="grid gap-2.5" role="radiogroup" aria-label="Payment method">
      {methods.map((m) => (
        <button
          type="button"
          key={m.id}
          role="radio"
          aria-checked={value === m.id}
          onClick={() => onChange(m.id)}
          className={cn('flex items-start gap-3 rounded-lg border p-4 text-left transition-colors', value === m.id ? 'border-gold bg-gold/8' : 'hover:border-foreground/25')}
        >
          <span className={cn('mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2', value === m.id ? 'border-gold' : 'border-muted-foreground/40')}>
            {value === m.id && <span className="size-2.5 rounded-full bg-gold" />}
          </span>
          <span className="flex-1">
            <span className="flex items-center gap-2 font-medium">
              {m.type === 'gateway' ? <CreditCardIcon className="size-4 text-gold-ink" /> : <BankIcon className="size-4 text-gold-ink" />}
              {m.label}
            </span>
            <span className="mt-1 block text-[13px] text-muted-foreground">
              {m.type === 'gateway' ? m.instructions : 'Payment details are shown after you place the order. We ship once the transfer clears.'}
            </span>
            {m.type === 'gateway' && (
              <span className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <LockSimpleIcon className="size-3.5" /> Secured by ToyyibPay. FPX: Maybank2u, CIMB Clicks, Public Bank, RHB, Hong Leong and more.
              </span>
            )}
          </span>
        </button>
      ))}
    </div>
  )
}

/**
 * Discount or partner code entry for the Bulk and Build a Box checkouts. The server decides
 * whether the code applies (order type, limits, dates); this only shows the outcome.
 */
export function CodeField({
  id,
  applied,
  label,
  error,
  onApply,
  onRemove,
}: {
  id: string
  applied: string
  label: string | null
  error: string | null
  onApply: (code: string) => void
  onRemove: () => void
}) {
  const [value, setValue] = useState(applied)
  if (applied && !error) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-gold/30 bg-gold/8 px-3 py-2.5 text-sm">
        <span className="flex min-w-0 items-center gap-2">
          <TagIcon className="size-4 shrink-0 text-gold-ink" />
          <span className="font-mono">{applied}</span>
          {label && <span className="truncate text-muted-foreground">{label}</span>}
        </span>
        <button
          type="button"
          onClick={() => {
            setValue('')
            onRemove()
          }}
          className="shrink-0 text-[12px] text-muted-foreground underline hover:text-foreground"
        >
          Remove
        </button>
      </div>
    )
  }
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-[13px]">
        Discount or partner code (optional)
      </Label>
      <div className="flex gap-2">
        <Input
          id={id}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (value.trim()) onApply(value.trim().toUpperCase())
            }
          }}
          className="font-mono uppercase"
          autoCapitalize="characters"
        />
        <Button type="button" variant="outline" className="h-11" disabled={!value.trim()} onClick={() => onApply(value.trim().toUpperCase())}>
          Apply
        </Button>
      </div>
      {applied && error && <p className="text-[12px] text-destructive">{error}</p>}
    </div>
  )
}
