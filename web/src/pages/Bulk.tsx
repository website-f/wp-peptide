import { LockSimpleIcon, MagnifyingGlassIcon, SpinnerIcon, StackIcon } from '@phosphor-icons/react'
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router'
import { toast } from 'sonner'
import { ProductImage } from '@/components/brand/ProductImage'
import { EmptyState, PageHeader, Purity } from '@/components/brand/bits'
import { CodeField, ContactFields, emptyContact, FormSection, PaymentChoice, toAddress, validateContact, type ContactForm } from '@/components/checkout/Fields'
import { QtyStepper } from '@/components/layout/CartDrawer'
import { ResearchDisclaimer } from '@/components/layout/SiteFooter'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { api, errorMessage } from '@/lib/api'
import { money, moneyExact, num } from '@/lib/format'
import { useMe, usePrograms, useProducts, useSettings } from '@/lib/queries'
import { getRefCode } from '@/lib/referral'
import type { Ladder, PlaceOrderResult, ProductCard, Quote } from '@/lib/types'
import { cn } from '@/lib/utils'

const pctFor = (qty: number, ladder: Ladder[]) => ladder.reduce((a, t) => (qty >= t.min ? t.pct : a), 0)

export default function Bulk() {
  const programs = usePrograms()
  // Switched off in Admin > Settings: the page is not reachable.
  if (programs.loaded && !programs.bulk) return <Navigate to="/shop" replace />
  return <BulkPage />
}

function BulkPage() {
  const { data: settings } = useSettings()
  const products = useProducts()
  const ladder = useMemo(() => settings?.wholesale ?? [], [settings])
  const min = ladder[0]?.min ?? 10
  // 'product': each compound reaches the ladder on its own. 'order': all units in the order count together.
  const byOrder = settings?.bulk.countBy === 'order'
  const freeShip = settings?.bulk.freeShipping ?? true
  const maxUnits = settings?.bulk.maxUnitsPerOrder ?? 0
  const topPct = ladder.reduce((a, t) => Math.max(a, t.pct), 0)
  const [q, setQ] = useState('')
  // productId -> { variantId, qty }
  const [sel, setSel] = useState<Record<string, { variantId: string; qty: number }>>({})
  const [open, setOpen] = useState(false)

  const rows = (products.data ?? []).filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()))
  const chosen = Object.entries(sel).filter(([, s]) => s.qty > 0)
  const orderUnits = chosen.reduce((a, [, s]) => a + s.qty, 0)
  const pctOf = (qty: number) => pctFor(byOrder ? orderUnits : qty, ladder)
  const totals = chosen.reduce(
    (acc, [pid, s]) => {
      const p = products.data?.find((x) => x.id === pid)
      const v = p?.variants.find((x) => x.id === s.variantId)
      if (!v) return acc
      const list = v.priceCents * s.qty
      acc.units += s.qty
      acc.list += list
      acc.net += Math.round((list * (100 - pctOf(s.qty))) / 100)
      return acc
    },
    { units: 0, list: 0, net: 0 },
  )
  const setQty = (p: ProductCard, qty: number) =>
    setSel((x) => ({ ...x, [p.id]: { variantId: x[p.id]?.variantId ?? (p.variants.find((v) => v.inStock) ?? p.variants[0]).id, qty: Math.max(0, qty) } }))
  const setVariant = (p: ProductCard, variantId: string) => setSel((x) => ({ ...x, [p.id]: { variantId, qty: x[p.id]?.qty ?? 0 } }))

  return (
    <>
      <PageHeader
        title={topPct ? `Buy in bulk. Save up to ${topPct}%.` : 'Buy in bulk.'}
        intro={`Wholesale pricing from ${min} units ${byOrder ? 'per order' : 'of a product'}${freeShip ? ', with free tracked delivery' : ''} and same-day dispatch.`}
      />

      <section className="container-x">
        <div className="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-3">
          {ladder.map((t, i) => (
            <div key={t.min} className="bg-card p-6">
              <p className="font-mono text-xs text-muted-foreground">
                {t.min}
                {ladder[i + 1] ? `-${ladder[i + 1].min - 1}` : '+'} units {byOrder ? 'in the order' : 'of a product'}
              </p>
              <p className="display mt-3 text-6xl text-gold-ink">{t.pct}%</p>
              <p className="mt-1 text-sm text-muted-foreground">off list price</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[13px] text-muted-foreground">
          {byOrder ? 'Rates use the total units in your order, across all compounds.' : 'Rates apply per product, based on how many units of that compound you order.'}{' '}
          Wholesale pricing replaces the normal quantity discounts.{maxUnits > 0 ? ` Up to ${maxUnits} units per order.` : ''}
        </p>
      </section>

      <div className="container-x grid gap-8 py-12 lg:grid-cols-[1fr_360px] lg:gap-10">
        <section aria-label="Bulk catalogue">
          <div className="relative mb-4 max-w-sm">
            <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input type="search" placeholder="Search compounds" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" aria-label="Search compounds" />
          </div>
          <ul className="divide-y rounded-xl border bg-card">
            {products.isLoading && Array.from({ length: 6 }).map((_, i) => <li key={i} className="h-24 animate-pulse bg-muted/40" />)}
            {rows.map((p) => {
              const s = sel[p.id]
              const v = p.variants.find((x) => x.id === s?.variantId) ?? p.variants.find((x) => x.inStock) ?? p.variants[0]
              const qty = s?.qty ?? 0
              const pct = qty > 0 ? pctOf(qty) : 0
              const nextTier = ladder.find((t) => t.min > (byOrder ? orderUnits : qty))
              return (
                <li key={p.id} className="grid grid-cols-[64px_1fr] gap-x-4 gap-y-3 p-4 sm:grid-cols-[72px_1fr_auto] sm:items-center">
                  <ProductImage src={p.image} alt={p.name} sizes="72px" className="row-span-2 size-16 rounded-lg sm:row-span-1 sm:size-[72px]" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link to={`/shop/${p.slug}`} className="font-display text-xl leading-none font-semibold uppercase hover:text-gold-ink">
                        {p.name}
                      </Link>
                      <Purity value={p.purity} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {p.variants.map((x) => (
                        <button
                          key={x.id}
                          disabled={!x.inStock}
                          onClick={() => setVariant(p, x.id)}
                          className={cn('h-7 rounded-md border px-2 font-mono text-[11px] disabled:opacity-40', x.id === v.id ? 'border-gold text-gold-ink' : 'text-muted-foreground')}
                        >
                          {x.label}
                        </button>
                      ))}
                    </div>
                    <p className="mt-2 font-mono text-[12px] text-muted-foreground">
                      {money(v.priceCents)} list
                      {qty >= min ? (
                        <span className="text-gold-ink">
                          {' '}
                          {money(Math.round((v.priceCents * (100 - pct)) / 100))} each at {pct}% off
                        </span>
                      ) : (
                        <span> from {money(Math.round((v.priceCents * (100 - (ladder[0]?.pct ?? 0))) / 100))} at {min}+</span>
                      )}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                    {qty === 0 ? (
                      <Button variant="outline" disabled={!v.inStock} onClick={() => setQty(p, min)}>
                        Add {min} units
                      </Button>
                    ) : (
                      <>
                        <QtyStepper value={qty} onChange={(n) => setQty(p, !byOrder && n < min ? 0 : n)} min={0} />
                        <Button variant="ghost" size="sm" onClick={() => setQty(p, qty + 10)}>
                          +10
                        </Button>
                      </>
                    )}
                    {qty > 0 && nextTier && nextTier.min - qty <= 20 && (
                      <p className="w-full text-[11px] text-gold-ink sm:text-right">
                        {nextTier.min - qty} more for {nextTier.pct}% off
                      </p>
                    )}
                  </div>
                </li>
              )
            })}
            {products.data && rows.length === 0 && (
              <li className="p-6">
                <EmptyState icon={<MagnifyingGlassIcon />} title="No matches" body="Try the compound's short name." />
              </li>
            )}
          </ul>
        </section>

        <aside>
          <div className="sticky top-24 rounded-xl border bg-card p-5">
            <p className="flex items-center gap-2 font-display text-2xl font-semibold uppercase">
              <StackIcon className="size-5 text-gold-ink" /> Bulk order
            </p>
            {chosen.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">Add {min} or more units of any compound to see wholesale pricing.</p>
            ) : (
              <dl className="mt-4 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Units</dt>
                  <dd className="font-mono">{num(totals.units)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">List price</dt>
                  <dd className="font-mono text-muted-foreground line-through">{money(totals.list)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">You save</dt>
                  <dd className="font-mono text-gold-ink">-{money(totals.list - totals.net)}</dd>
                </div>
                <div className="flex items-baseline justify-between border-t pt-2.5">
                  <dt className="font-display text-xl font-semibold uppercase">Wholesale</dt>
                  <dd className="font-mono text-xl font-semibold">{moneyExact(totals.net)}</dd>
                </div>
              </dl>
            )}
            <Button size="lg" className="mt-5 w-full" disabled={chosen.length === 0} onClick={() => setOpen(true)}>
              Checkout
            </Button>
            <p className="mt-3 text-[12px] text-muted-foreground">{freeShip ? 'Free tracked delivery. ' : ''}Need an invoice or a larger quote? Use the contact page.</p>
          </div>
        </aside>
      </div>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="gap-0 overflow-y-auto p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-lg">
          <div className="border-b px-5 py-4">
            <SheetTitle className="font-display text-3xl font-semibold uppercase">Bulk checkout</SheetTitle>
            <SheetDescription>Wholesale prices are confirmed by the server before payment.</SheetDescription>
          </div>
          {open && <BulkCheckout items={chosen.map(([, s]) => ({ variantId: s.variantId, quantity: s.qty }))} />}
        </SheetContent>
      </Sheet>
      <ResearchDisclaimer />
    </>
  )
}

function BulkCheckout({ items }: { items: { variantId: string; quantity: number }[] }) {
  const { data: me } = useMe()
  const { data: settings } = useSettings()
  const user = me?.user
  const [form, setForm] = useState<ContactForm>({ ...emptyContact, email: user?.email ?? '', name: user?.name ?? '', phone: user?.phone ?? '' })
  const [errors, setErrors] = useState<Partial<Record<keyof ContactForm, string>>>({})
  const [method, setMethod] = useState('')
  const [confirm, setConfirm] = useState(false)
  useEffect(() => {
    if (!method && settings?.paymentMethods[0]) setMethod(settings.paymentMethods[0].id)
  }, [settings, method])
  const [code, setCode] = useState('')
  const quote = useQuery({
    queryKey: ['bulk-quote', items, code],
    queryFn: () => api.post<Quote>('/api/cart/quote', { items, mode: 'wholesale', couponCode: code || null, refCode: getRefCode() }),
    retry: false,
    placeholderData: keepPreviousData,
  })
  const codeOk = !code || !quote.data?.couponError

  const place = useMutation({
    mutationFn: () =>
      api.post<PlaceOrderResult>('/api/orders', {
        items,
        mode: 'wholesale',
        refCode: getRefCode(),
        couponCode: code || undefined,
        email: form.email.trim(),
        name: form.name.trim(),
        phone: form.phone.trim(),
        address: toAddress(form),
        paymentMethod: method,
        confirmResearch: true,
      }),
    onSuccess: (r) => {
      if (r.paymentUrl) return window.location.assign(r.paymentUrl)
      if (r.paymentError) toast.error(`Order saved, but payment could not start: ${r.paymentError}`)
      window.location.assign(`/order/${r.number}?key=${r.accessKey}`)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  return (
    <form
      className="grid gap-4 p-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        const errs = validateContact(form)
        setErrors(errs)
        if (Object.keys(errs).length) return toast.error('Please check the highlighted fields')
        if (!confirm) return toast.error('Please confirm the research-use terms')
        place.mutate()
      }}
    >
      <div className="rounded-xl border bg-surface p-4 text-sm">
        {quote.isLoading && <p className="text-muted-foreground">Confirming wholesale prices...</p>}
        {quote.isError && <p className="text-destructive">{errorMessage(quote.error)}</p>}
        {quote.data && (
          <ul className="space-y-1.5">
            {quote.data.lines.map((l) => (
              <li key={l.variantId} className="flex justify-between gap-3">
                <span>
                  {l.quantity} x {l.name} {l.variantLabel} <span className="text-gold-ink">({l.discountPct}% off)</span>
                </span>
                <span className="font-mono">{moneyExact(l.lineTotalCents)}</span>
              </li>
            ))}
            {quote.data.couponDiscountCents > 0 && (
              <li className="flex justify-between gap-3 text-gold-ink">
                <span>{quote.data.coupon?.label}</span>
                <span className="font-mono">-{moneyExact(quote.data.couponDiscountCents)}</span>
              </li>
            )}
            <li className="flex justify-between gap-3">
              <span>Delivery</span>
              <span className="font-mono">{quote.data.shippingCents === 0 ? 'Free' : moneyExact(quote.data.shippingCents)}</span>
            </li>
            <li className="flex justify-between border-t pt-2 font-medium">
              <span>Total</span>
              <span className="font-mono">{moneyExact(quote.data.totalCents)}</span>
            </li>
          </ul>
        )}
      </div>
      <FormSection title="Delivery">
        <ContactFields value={form} onChange={setForm} errors={errors} lockEmail={!!user} />
      </FormSection>
      <FormSection title="Payment">
        <PaymentChoice methods={settings?.paymentMethods ?? []} value={method} onChange={setMethod} />
        <div className="mt-4">
          <CodeField id="bulk-code" applied={code} label={quote.data?.coupon?.label ?? null} error={quote.data?.couponError ?? null} onApply={setCode} onRemove={() => setCode('')} />
        </div>
      </FormSection>
      <div className="flex items-start gap-3 rounded-xl border border-gold/30 bg-gold/5 p-4">
        <Checkbox id="bulk-confirm" checked={confirm} onCheckedChange={(v) => setConfirm(v === true)} className="mt-0.5" />
        <Label htmlFor="bulk-confirm" className="text-[13px] leading-relaxed font-normal">
          I am 21+ and purchasing for laboratory, in vitro research only, not for human or veterinary use.
        </Label>
      </div>
      <Button type="submit" size="lg" className="h-14 text-base" disabled={place.isPending || !quote.data || !codeOk}>
        {place.isPending ? <SpinnerIcon className="size-5 animate-spin" /> : <LockSimpleIcon className="size-5" />}
        Pay {quote.data ? moneyExact(quote.data.totalCents) : ''}
      </Button>
    </form>
  )
}
