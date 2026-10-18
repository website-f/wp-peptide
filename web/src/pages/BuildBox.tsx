import { CheckIcon, DropIcon, LockSimpleIcon, PlusIcon, SpinnerIcon, XIcon } from '@phosphor-icons/react'
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router'
import { toast } from 'sonner'
import { ProductImage } from '@/components/brand/ProductImage'
import { PageHeader } from '@/components/brand/bits'
import { CodeField, ContactFields, emptyContact, FormSection, PaymentChoice, toAddress, validateContact, type ContactForm } from '@/components/checkout/Fields'
import { ResearchDisclaimer } from '@/components/layout/SiteFooter'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { api, errorMessage } from '@/lib/api'
import { money, moneyExact } from '@/lib/format'
import { useMe, usePrograms, useProducts, useSettings } from '@/lib/queries'
import { getRefCode } from '@/lib/referral'
import type { PlaceOrderResult, ProductCard, Quote } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useSeo } from '@/lib/seo'

interface Pick {
  variantId: string
  productId: string
  name: string
  label: string
  image: string | null
  priceCents: number
}

// Picks survive the round trip through sign-in.
const PICKS_KEY = 'kyvo-box-picks'

export default function BuildBox() {
  useSeo({ title: 'Build a Box', description: 'Choose your research peptides for a monthly box at a lower price, shipped on schedule.' })
  const programs = usePrograms()
  // Switched off in Admin > Settings: the page is not reachable.
  if (programs.loaded && !programs.box) return <Navigate to="/shop" replace />
  return <BuildBoxPage />
}

function BuildBoxPage() {
  const { data: settings } = useSettings()
  const { data: me } = useMe()
  const products = useProducts({ box: true })
  const reduce = useReducedMotion()
  const slots = settings?.box.slots ?? 4
  const included = settings?.box.includedItem.trim() ?? ''
  const freeShip = settings?.box.freeShipping ?? true
  const perks = [...(freeShip ? ['free tracked delivery'] : []), ...(included ? [included.toLowerCase()] : [])]
  const pct = settings?.box.pct ?? 40
  const [picks, setPicks] = useState<Pick[]>(() => {
    try {
      return JSON.parse(sessionStorage.getItem(PICKS_KEY) ?? "[]") as Pick[]
    } catch {
      return []
    }
  })
  useEffect(() => {
    try {
      sessionStorage.setItem(PICKS_KEY, JSON.stringify(picks))
    } catch {
      /* storage blocked */
    }
  }, [picks])
  const [open, setOpen] = useState(false)
  const full = picks.length >= slots

  const add = (p: ProductCard, v: ProductCard['variants'][number]) => {
    if (full) return toast.message(`Your box holds ${slots}. Remove one to swap.`)
    setPicks((x) => [...x, { variantId: v.id, productId: p.id, name: p.name, label: v.label, image: p.image, priceCents: v.priceCents }])
  }
  const removeAt = (i: number) => setPicks((x) => x.filter((_, j) => j !== i))

  const listCents = picks.reduce((a, p) => a + p.priceCents, 0)
  const boxCents = picks.reduce((a, p) => a + Math.round((p.priceCents * (100 - pct)) / 100), 0)

  return (
    <>
      <PageHeader
        title="Build your box"
        intro={`Pick any ${slots} research compounds and we pack them into one monthly box, ${pct}% off list price${perks.length ? ` with ${perks.join(' and ')} included` : ''}.`}
      >
        <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {[`${pct}% off, locked for your subscription`, ...(included ? [`${included} included`] : []), ...(freeShip ? ['Free tracked delivery'] : []), 'Every lot third-party tested'].map((t) => (
            <li key={t} className="flex items-center gap-2">
              <CheckIcon weight="bold" className="size-4 text-gold-ink" /> {t}
            </li>
          ))}
        </ul>
      </PageHeader>

      <div className="container-x grid gap-8 pb-28 lg:grid-cols-[1fr_380px] lg:gap-10 lg:pb-20">
        {/* Catalogue */}
        <section aria-label="Choose compounds">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {products.isLoading
              ? Array.from({ length: 8 }).map((_, i) => <div key={i} className="aspect-[3/4] animate-pulse rounded-xl bg-muted" />)
              : products.data?.map((p) => <BoxProduct key={p.id} product={p} pct={pct} onAdd={add} picks={picks} full={full} />)}
          </div>
        </section>

        {/* Summary (desktop) */}
        <aside className="hidden lg:block">
          <div className="sticky top-24">
            <BoxSummary picks={picks} slots={slots} removeAt={removeAt} listCents={listCents} boxCents={boxCents} commit={settings?.box.commitMonths ?? 3} onContinue={() => setOpen(true)} />
          </div>
        </aside>
      </div>

      {/* Mobile bottom bar */}
      <motion.div
        initial={reduce ? false : { y: 80 }}
        animate={{ y: 0 }}
        className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl lg:hidden"
      >
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            {Array.from({ length: slots }).map((_, i) => (
              <div key={i} className="size-9 overflow-hidden rounded-full border-2 border-background bg-muted">
                {picks[i] && <ProductImage src={picks[i].image} alt={picks[i].name} sizes="36px" className="size-full" />}
              </div>
            ))}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium">
              {picks.length} of {slots} picked
            </p>
            <p className="font-mono text-[12px] text-muted-foreground">{money(boxCents)} / month</p>
          </div>
          <Button onClick={() => setOpen(true)} disabled={picks.length === 0}>
            {full ? 'Continue' : 'Review'}
          </Button>
        </div>
      </motion.div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="gap-0 overflow-y-auto p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-lg">
          <div className="border-b px-5 py-4">
            <SheetTitle className="font-display text-3xl font-semibold uppercase">Your monthly box</SheetTitle>
            <SheetDescription>
              {full ? 'Confirm delivery details to start your subscription.' : `Pick ${slots - picks.length} more to complete your box.`}
            </SheetDescription>
          </div>
          <div className="p-5 lg:hidden">
            <BoxSummary picks={picks} slots={slots} removeAt={removeAt} listCents={listCents} boxCents={boxCents} commit={settings?.box.commitMonths ?? 3} />
          </div>
          {full ? (
            me?.user ? (
              <BoxCheckout picks={picks} onDone={() => setOpen(false)} />
            ) : (
              <SignInPrompt />
            )
          ) : (
            <div className="p-5 pt-0 lg:pt-5">
              <Button variant="outline" className="w-full" onClick={() => setOpen(false)}>
                Keep picking
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
      <ResearchDisclaimer />
    </>
  )
}

function BoxProduct({ product: p, pct, onAdd, picks, full }: { product: ProductCard; pct: number; onAdd: (p: ProductCard, v: ProductCard['variants'][number]) => void; picks: Pick[]; full: boolean }) {
  const [vid, setVid] = useState((p.variants.find((v) => v.inStock) ?? p.variants[0])?.id)
  const v = p.variants.find((x) => x.id === vid) ?? p.variants[0]
  const count = picks.filter((x) => x.productId === p.id).length
  return (
    <div className={cn('flex flex-col overflow-hidden rounded-xl border bg-card transition-colors', count > 0 && 'border-gold/50')}>
      <ProductImage src={p.image} alt={p.name} sizes="(min-width:1280px) 18vw, (min-width:640px) 30vw, 48vw" className="aspect-square" />
      <div className="flex flex-1 flex-col p-3.5">
        <p className="font-display text-xl leading-none font-semibold uppercase">{p.name}</p>
        {p.variants.length > 1 ? (
          <div className="mt-2.5 flex flex-wrap gap-1">
            {p.variants.map((x) => (
              <button
                key={x.id}
                disabled={!x.inStock}
                onClick={() => setVid(x.id)}
                className={cn('h-7 rounded-md border px-1.5 font-mono text-[10.5px] disabled:opacity-40', x.id === vid ? 'border-gold text-gold-ink' : 'text-muted-foreground')}
              >
                {x.label}
              </button>
            ))}
          </div>
        ) : (
          <p className="mt-2.5 font-mono text-[11px] text-muted-foreground">{v?.label}</p>
        )}
        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <div>
            <p className="font-mono text-[11px] text-muted-foreground line-through">{v ? money(v.priceCents) : ''}</p>
            <p className="font-mono text-sm font-medium text-gold-ink">{v ? money(Math.round((v.priceCents * (100 - pct)) / 100)) : ''}</p>
          </div>
          <Button size="icon-sm" className="size-9" disabled={!v?.inStock || full} onClick={() => v && onAdd(p, v)} aria-label={`Add ${p.name} ${v?.label ?? ''} to box`}>
            {count > 0 && full ? <CheckIcon weight="bold" /> : <PlusIcon weight="bold" />}
          </Button>
        </div>
        {count > 0 && <p className="mt-2 text-[11px] font-medium text-gold-ink">{count} in your box</p>}
      </div>
    </div>
  )
}

function BoxSummary({
  picks,
  slots,
  removeAt,
  listCents,
  boxCents,
  commit,
  onContinue,
}: {
  picks: Pick[]
  slots: number
  removeAt: (i: number) => void
  listCents: number
  boxCents: number
  commit: number
  onContinue?: () => void
}) {
  const { data: settings } = useSettings()
  const included = settings?.box.includedItem.trim() ?? ''
  // Delivery follows the box settings: free, or the normal flat rate below the free-shipping threshold.
  const shippingCents = !settings || settings.box.freeShipping || boxCents >= settings.shipping.freeThresholdCents ? 0 : settings.shipping.flatCents
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-baseline justify-between">
        <p className="font-display text-2xl font-semibold uppercase">Your box</p>
        <p className="font-mono text-sm text-muted-foreground">
          {picks.length} of {slots} picked
        </p>
      </div>
      <ul className="mt-4 grid gap-2">
        {Array.from({ length: slots }).map((_, i) => {
          const p = picks[i]
          return (
            <li key={i} className={cn('flex h-16 items-center gap-3 rounded-lg border px-2.5', !p && 'border-dashed')}>
              {p ? (
                <>
                  <ProductImage src={p.image} alt={p.name} sizes="44px" className="size-11 shrink-0 rounded-md" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <p className="font-mono text-[11px] text-muted-foreground">{p.label}</p>
                  </div>
                  <button onClick={() => removeAt(i)} className="p-2 text-muted-foreground hover:text-destructive" aria-label={`Remove ${p.name}`}>
                    <XIcon className="size-4" />
                  </button>
                </>
              ) : (
                <span className="pl-1 text-[13px] text-muted-foreground">Slot {i + 1}: choose a compound</span>
              )}
            </li>
          )
        })}
        {included && (
          <li className="flex items-center gap-3 rounded-lg bg-surface px-3 py-2.5 text-[13px]">
            <DropIcon className="size-5 text-gold-ink" />
            <span className="flex-1">{included}</span>
            <span className="font-mono text-gold-ink">Included</span>
          </li>
        )}
      </ul>
      <dl className="mt-4 space-y-1.5 border-t pt-4 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">List price</dt>
          <dd className="font-mono text-muted-foreground line-through">{money(listCents)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Box savings</dt>
          <dd className="font-mono text-gold-ink">-{money(listCents - boxCents)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Delivery</dt>
          <dd className="font-mono">{shippingCents === 0 ? 'Free' : money(shippingCents)}</dd>
        </div>
        <div className="flex items-baseline justify-between border-t pt-2.5">
          <dt className="font-display text-xl font-semibold uppercase">Monthly</dt>
          <dd className="font-mono text-xl font-semibold">{moneyExact(boxCents + shippingCents)}</dd>
        </div>
      </dl>
      <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
        {commit} monthly deliveries, each paid when it is prepared. After that it continues month to month and you can cancel any time.
      </p>
      {onContinue && (
        <Button size="lg" className="mt-4 w-full" disabled={picks.length < slots} onClick={onContinue}>
          {picks.length < slots ? `Pick ${slots - picks.length} more` : 'Continue'}
        </Button>
      )}
    </div>
  )
}

function SignInPrompt() {
  const location = useLocation()
  return (
    <div className="grid gap-3 p-5">
      <p className="text-sm text-muted-foreground">A box is a subscription, so it lives on your account. Sign in or create a free account to continue. Your picks stay here.</p>
      <Button asChild size="lg">
        <Link to="/login" state={{ from: location.pathname }}>
          Sign in
        </Link>
      </Button>
      <Button asChild variant="outline" size="lg">
        <Link to="/register" state={{ from: location.pathname }}>
          Create account
        </Link>
      </Button>
    </div>
  )
}

function BoxCheckout({ picks, onDone }: { picks: Pick[]; onDone: () => void }) {
  const { data: me } = useMe()
  const { data: settings } = useSettings()
  const user = me!.user!
  const [form, setForm] = useState<ContactForm>({ ...emptyContact, email: user.email, name: user.name, phone: user.phone ?? '' })
  const [errors, setErrors] = useState<Partial<Record<keyof ContactForm, string>>>({})
  const [method, setMethod] = useState('')
  const [confirm, setConfirm] = useState(false)
  useEffect(() => {
    if (!method && settings?.paymentMethods[0]) setMethod(settings.paymentMethods[0].id)
  }, [settings, method])

  const items = useMemo(() => picks.map((p) => ({ variantId: p.variantId, quantity: 1 })), [picks])
  const [code, setCode] = useState('')
  const quote = useQuery({
    queryKey: ['box-quote', items, code],
    queryFn: () => api.post<Quote>('/api/cart/quote', { items, mode: 'box', couponCode: code || null, refCode: getRefCode() }),
    placeholderData: keepPreviousData,
  })
  const codeOk = !code || !quote.data?.couponError

  const start = useMutation({
    mutationFn: () =>
      api.post<PlaceOrderResult>('/api/box', {
        items,
        email: user.email,
        name: form.name.trim(),
        phone: form.phone.trim(),
        address: toAddress(form),
        paymentMethod: method,
        couponCode: code || undefined,
        refCode: getRefCode(),
        confirmResearch: true,
      }),
    onSuccess: (r) => {
      try {
        sessionStorage.removeItem(PICKS_KEY)
      } catch {
        /* ignore */
      }
      if (r.paymentUrl) return window.location.assign(r.paymentUrl)
      if (r.paymentError) toast.error(`Box saved, but payment could not start: ${r.paymentError}`)
      onDone()
      window.location.assign(`/order/${r.number}?key=${r.accessKey}`)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  return (
    <form
      className="grid gap-4 p-5 pt-0 lg:pt-5"
      onSubmit={(e) => {
        e.preventDefault()
        const errs = validateContact(form)
        setErrors(errs)
        if (Object.keys(errs).length) return toast.error('Please check the highlighted fields')
        if (!confirm) return toast.error('Please confirm the research-use terms')
        start.mutate()
      }}
      noValidate
    >
      <FormSection title="Delivery">
        <ContactFields value={form} onChange={setForm} errors={errors} lockEmail />
      </FormSection>
      <FormSection title="Payment">
        <PaymentChoice methods={settings?.paymentMethods ?? []} value={method} onChange={setMethod} />
        <div className="mt-4">
          <CodeField id="box-code" applied={code} label={quote.data?.coupon?.label ?? null} error={quote.data?.couponError ?? null} onApply={setCode} onRemove={() => setCode('')} />
        </div>
        {quote.data && (
          <dl className="mt-4 space-y-1.5 border-t pt-4 text-sm">
            {quote.data.couponDiscountCents > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{quote.data.coupon?.label}</dt>
                <dd className="font-mono text-gold-ink">-{moneyExact(quote.data.couponDiscountCents)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Delivery</dt>
              <dd className="font-mono">{quote.data.shippingCents === 0 ? 'Free' : moneyExact(quote.data.shippingCents)}</dd>
            </div>
          </dl>
        )}
      </FormSection>
      <div className="flex items-start gap-3 rounded-xl border border-gold/30 bg-gold/5 p-4">
        <Checkbox id="box-confirm" checked={confirm} onCheckedChange={(v) => setConfirm(v === true)} className="mt-0.5" />
        <Label htmlFor="box-confirm" className="text-[13px] leading-relaxed font-normal">
          I am 21+ and buying for laboratory, in vitro research only. I agree to a {settings?.box.commitMonths ?? 3}-month minimum box subscription.
        </Label>
      </div>
      {quote.isError && <p className="text-sm text-destructive">{errorMessage(quote.error)}</p>}
      <Button type="submit" size="lg" className="h-14 text-base" disabled={start.isPending || !quote.data || !codeOk}>
        {start.isPending ? <SpinnerIcon className="size-5 animate-spin" /> : <LockSimpleIcon className="size-5" />}
        Pay first box {quote.data ? moneyExact(quote.data.totalCents) : ''}
      </Button>
    </form>
  )
}
