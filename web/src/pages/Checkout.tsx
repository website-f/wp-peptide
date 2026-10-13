import { ArrowLeftIcon, CaretDownIcon, CoinsIcon, LockSimpleIcon, ShoppingBagIcon, SpinnerIcon, TagIcon } from '@phosphor-icons/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { ProductImage } from '@/components/brand/ProductImage'
import { EmptyState } from '@/components/brand/bits'
import { ContactFields, emptyContact, Field, FormSection, PaymentChoice, toAddress, validateContact, type ContactForm } from '@/components/checkout/Fields'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { api, errorMessage } from '@/lib/api'
import { useCart } from '@/lib/cart'
import { money, moneyExact, num, pointsCents } from '@/lib/format'
import { useCartQuote, useMe, useSettings } from '@/lib/queries'
import { getRefCode } from '@/lib/referral'
import type { PlaceOrderResult, Quote } from '@/lib/types'
import { cn } from '@/lib/utils'

export default function Checkout() {
  const { items, couponCode, setCoupon, clear } = useCart()
  const { data: me } = useMe()
  const { data: settings } = useSettings()
  const user = me?.user ?? null
  const [usePoints, setUsePoints] = useState(false)
  const [redeem, setRedeem] = useState(0)
  const quote = useCartQuote(usePoints ? redeem : 0)
  const q = quote.data
  const navigate = useNavigate()
  const qc = useQueryClient()

  const [form, setForm] = useState<ContactForm>(emptyContact)
  const [errors, setErrors] = useState<Partial<Record<keyof ContactForm, string>>>({})
  const [method, setMethod] = useState('')
  const [note, setNote] = useState('')
  const [confirm, setConfirm] = useState(false)
  const [createAccount, setCreateAccount] = useState(false)
  const [password, setPassword] = useState('')
  const [codeInput, setCodeInput] = useState(couponCode)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const prefilled = useRef(false)

  useEffect(() => {
    if (user && !prefilled.current) {
      prefilled.current = true
      setForm((f) => ({ ...f, email: user.email, name: f.name || user.name, phone: f.phone || user.phone || '' }))
    }
  }, [user])
  useEffect(() => {
    if (!method && settings?.paymentMethods[0]) setMethod(settings.paymentMethods[0].id)
  }, [settings, method])
  useEffect(() => {
    if (q && usePoints && redeem === 0) setRedeem(q.maxRedeemablePoints)
  }, [q, usePoints, redeem])

  const place = useMutation({
    mutationFn: () =>
      api.post<PlaceOrderResult>('/api/orders', {
        items: items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
        mode: 'standard',
        couponCode: couponCode || null,
        refCode: getRefCode(),
        redeemPoints: usePoints ? redeem : 0,
        email: form.email.trim(),
        name: form.name.trim(),
        phone: form.phone.trim(),
        address: toAddress(form),
        paymentMethod: method,
        note: note.trim() || undefined,
        confirmResearch: true,
        createPassword: !user && createAccount ? password : undefined,
      }),
    onSuccess: (r) => {
      clear()
      void qc.invalidateQueries({ queryKey: ['me'] })
      if (r.paymentUrl) {
        window.location.assign(r.paymentUrl)
        return
      }
      if (r.paymentError) toast.error(`Order saved, but payment could not start: ${r.paymentError}`)
      navigate(`/order/${r.number}?key=${r.accessKey}`)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const errs = validateContact(form)
    setErrors(errs)
    if (Object.keys(errs).length) {
      document.getElementById(Object.keys(errs)[0])?.focus()
      toast.error('Please check the highlighted fields')
      return
    }
    if (!user && createAccount && password.length < 8) return toast.error('Choose a password of at least 8 characters')
    if (!confirm) return toast.error('Please confirm the research-use terms')
    place.mutate()
  }

  if (items.length === 0 && !place.isPending && !place.isSuccess) {
    return (
      <div className="container-x py-20">
        <EmptyState
          icon={<ShoppingBagIcon />}
          title="Your cart is empty"
          body="Add a compound to start an order."
          action={
            <Button asChild>
              <Link to="/shop">Browse compounds</Link>
            </Button>
          }
        />
      </div>
    )
  }

  const gateway = settings?.paymentMethods.find((m) => m.id === method)?.type === 'gateway'
  const submitLabel = place.isPending ? (gateway ? 'Opening secure payment' : 'Placing order') : gateway ? `Pay ${q ? moneyExact(q.totalCents) : ''}` : 'Place order'

  return (
    <div className="container-x py-8 md:py-12">
      <Link to="/shop" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeftIcon className="size-4" /> Continue shopping
      </Link>
      <h1 className="display mt-4 text-5xl md:text-6xl">Checkout</h1>

      {/* Mobile summary toggle */}
      <button
        type="button"
        onClick={() => setSummaryOpen((o) => !o)}
        className="mt-6 flex w-full items-center justify-between rounded-xl border bg-card px-4 py-3.5 lg:hidden"
        aria-expanded={summaryOpen}
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <ShoppingBagIcon className="size-4 text-gold-ink" /> {summaryOpen ? 'Hide' : 'Show'} order summary
          <CaretDownIcon className={cn('size-3.5 transition-transform', summaryOpen && 'rotate-180')} />
        </span>
        <span className="font-mono font-semibold">{q ? moneyExact(q.totalCents) : '...'}</span>
      </button>

      <form onSubmit={submit} className="mt-6 grid gap-8 lg:mt-10 lg:grid-cols-[1fr_420px] lg:gap-12" noValidate>
        <div className={cn('lg:order-2', !summaryOpen && 'hidden lg:block')}>
          <div className="lg:sticky lg:top-24">
            <Summary
              quote={q}
              loading={quote.isLoading}
              error={quote.isError ? errorMessage(quote.error) : null}
              codeInput={codeInput}
              setCodeInput={setCodeInput}
              applyCode={() => setCoupon(codeInput.trim().toUpperCase())}
              removeCode={() => {
                setCoupon('')
                setCodeInput('')
              }}
              appliedCode={couponCode}
            />
          </div>
        </div>

        <div className="grid gap-5 lg:order-1">
          {!user && (
            <p className="rounded-xl border bg-surface px-4 py-3 text-sm">
              Have an account?{' '}
              <Link to="/login" state={{ from: '/checkout' }} className="font-medium text-gold-ink hover:underline">
                Sign in
              </Link>{' '}
              to earn and use KYVO Points.
            </p>
          )}

          <FormSection title="Shipping">
            <ContactFields value={form} onChange={setForm} errors={errors} lockEmail={!!user} />
          </FormSection>

          {user && q && q.maxRedeemablePoints > 0 && (
            <FormSection
              title="KYVO Points"
              aside={<span className="font-mono text-sm text-muted-foreground">{num(user.pointsBalance)} available</span>}
            >
              <div className="flex items-center justify-between gap-4">
                <Label htmlFor="use-points" className="flex items-center gap-2 font-normal">
                  <CoinsIcon className="size-5 text-gold-ink" />
                  Use {num(q.maxRedeemablePoints)} points to save {money(pointsCents(q.maxRedeemablePoints, settings?.points.valueCentsPer100))}
                </Label>
                <Switch
                  id="use-points"
                  checked={usePoints}
                  onCheckedChange={(v) => {
                    setUsePoints(v)
                    setRedeem(v ? q.maxRedeemablePoints : 0)
                  }}
                />
              </div>
              <p className="mt-2 text-[12px] text-muted-foreground">Points can cover up to {settings?.points.maxRedeemPct ?? 50}% of an order. 100 points = {money(settings?.points.valueCentsPer100 ?? 100)}.</p>
            </FormSection>
          )}

          <FormSection title="Payment">
            <PaymentChoice methods={settings?.paymentMethods ?? []} value={method} onChange={setMethod} />
          </FormSection>

          <FormSection title="Notes">
            <Field id="note" label="Order notes (optional)" hint="Delivery instructions, PO number or lab reference.">
              <Textarea id="note" rows={3} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
            </Field>
            {!user && (
              <div className="mt-5 rounded-lg border p-4">
                <div className="flex items-start gap-3">
                  <Checkbox id="create-account" checked={createAccount} onCheckedChange={(v) => setCreateAccount(v === true)} className="mt-0.5" />
                  <Label htmlFor="create-account" className="grid gap-1 font-normal">
                    <span className="font-medium">Create an account and earn points on this order</span>
                    <span className="text-[13px] text-muted-foreground">Track orders and get {settings?.points.perDollar.MEMBER ?? 2.5} points for every RM1 spent.</span>
                  </Label>
                </div>
                {createAccount && (
                  <Field id="password" label="Password" hint="At least 8 characters." className="mt-4">
                    <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                  </Field>
                )}
              </div>
            )}
          </FormSection>

          <div className="rounded-xl border border-gold/30 bg-gold/5 p-5">
            <div className="flex items-start gap-3">
              <Checkbox id="confirm" checked={confirm} onCheckedChange={(v) => setConfirm(v === true)} className="mt-0.5" />
              <Label htmlFor="confirm" className="block text-[13.5px] leading-relaxed font-normal">
                I am 21 or older and a qualified researcher. I am buying these products for laboratory, in vitro research only, not for human or
                veterinary use. I accept the{' '}
                <Link to="/policies/terms" className="text-gold-ink underline" target="_blank">
                  terms
                </Link>{' '}
                and{' '}
                <Link to="/policies/research-use" className="text-gold-ink underline" target="_blank">
                  research use policy
                </Link>
                .
              </Label>
            </div>
          </div>

          <Button type="submit" size="lg" className="h-14 w-full text-base" disabled={place.isPending || !q || quote.isError}>
            {place.isPending ? <SpinnerIcon className="size-5 animate-spin" /> : <LockSimpleIcon className="size-5" />}
            {submitLabel}
          </Button>
          {gateway && <p className="-mt-2 text-center text-[12px] text-muted-foreground">You will be redirected to ToyyibPay to complete payment by FPX or card.</p>}
        </div>
      </form>
    </div>
  )
}

function Summary({
  quote: q,
  loading,
  error,
  codeInput,
  setCodeInput,
  applyCode,
  removeCode,
  appliedCode,
}: {
  quote?: Quote
  loading: boolean
  error: string | null
  codeInput: string
  setCodeInput: (v: string) => void
  applyCode: () => void
  removeCode: () => void
  appliedCode: string
}) {
  return (
    <div className="rounded-xl border bg-card">
      <h2 className="border-b px-5 py-4 font-display text-2xl font-semibold uppercase">Order summary</h2>
      {loading && !q ? (
        <div className="space-y-3 p-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : (
        q && (
          <>
            <ul className="max-h-[360px] divide-y overflow-y-auto">
              {q.lines.map((l) => (
                <li key={l.variantId} className="flex items-center gap-3 px-5 py-3">
                  <div className="relative shrink-0">
                    <ProductImage src={l.image} alt={l.name} sizes="56px" className="size-14 rounded-lg" />
                    <span className="absolute -top-1.5 -right-1.5 grid min-w-5 place-items-center rounded-full bg-foreground px-1 font-mono text-[10px] leading-5 text-background">{l.quantity}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{l.name}</p>
                    <p className="text-[12px] text-muted-foreground">
                      {l.variantLabel}
                      {l.discountPct > 0 && <span className="text-gold-ink">, {l.discountPct}% tier</span>}
                    </p>
                  </div>
                  <p className="font-mono text-sm">{moneyExact(l.lineTotalCents)}</p>
                </li>
              ))}
            </ul>
            <div className="border-t px-5 py-4">
              {appliedCode && !q.couponError ? (
                <div className="flex items-center justify-between rounded-lg border border-gold/30 bg-gold/8 px-3 py-2 text-sm">
                  <span className="flex items-center gap-2">
                    <TagIcon className="size-4 text-gold-ink" />
                    <span className="font-mono">{appliedCode}</span>
                    <span className="text-muted-foreground">{q.coupon?.label}</span>
                  </span>
                  <button type="button" onClick={removeCode} className="text-[12px] text-muted-foreground underline hover:text-foreground">
                    Remove
                  </button>
                </div>
              ) : (
                <div className="grid gap-1.5">
                  <Label htmlFor="code" className="text-[13px]">
                    Discount or partner code
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      id="code"
                      value={codeInput}
                      onChange={(e) => setCodeInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          applyCode()
                        }
                      }}
                      className="font-mono uppercase"
                      autoCapitalize="characters"
                    />
                    <Button type="button" variant="outline" className="h-11" onClick={applyCode} disabled={!codeInput.trim()}>
                      Apply
                    </Button>
                  </div>
                  {appliedCode && q.couponError && <p className="text-[12px] text-destructive">{q.couponError}</p>}
                </div>
              )}
              {q.partnerApplied && !q.coupon && <p className="mt-2 text-[12px] text-muted-foreground">Referred by a KYVO partner.</p>}
            </div>
            <dl className="space-y-2 border-t px-5 py-4 text-sm">
              <Line label="Subtotal" value={moneyExact(q.subtotalCents)} />
              {q.tierDiscountCents > 0 && <Line label="Quantity savings" value={`-${moneyExact(q.tierDiscountCents)}`} accent />}
              {q.couponDiscountCents > 0 && <Line label={q.coupon?.label ?? 'Discount'} value={`-${moneyExact(q.couponDiscountCents)}`} accent />}
              {q.pointsDiscountCents > 0 && <Line label={`${num(q.pointsRedeemed)} points`} value={`-${moneyExact(q.pointsDiscountCents)}`} accent />}
              <Line label="Shipping" value={q.shippingCents === 0 ? 'Free' : moneyExact(q.shippingCents)} />
              {q.taxCents > 0 && <Line label="Tax" value={moneyExact(q.taxCents)} />}
              <div className="flex items-baseline justify-between border-t pt-3">
                <dt className="font-display text-xl font-semibold uppercase">Total</dt>
                <dd className="font-mono text-xl font-semibold">{moneyExact(q.totalCents)}</dd>
              </div>
              <p className="flex items-center gap-1.5 pt-1 text-[12px] text-muted-foreground">
                <CoinsIcon className="size-3.5 text-gold-ink" /> Earns {num(q.pointsEarned)} KYVO Points
              </p>
            </dl>
          </>
        )
      )}
      {error && <p className="border-t px-5 py-3 text-sm text-destructive">{error}</p>}
    </div>
  )
}

function Line({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn('font-mono', accent && 'text-gold-ink')}>{value}</dd>
    </div>
  )
}
