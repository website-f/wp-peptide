import {
  ArrowClockwiseIcon,
  ArrowUpRightIcon,
  CalendarCheckIcon,
  CheckCircleIcon,
  ClockIcon,
  CopyIcon,
  CreditCardIcon,
  HouseLineIcon,
  LockSimpleIcon,
  PackageIcon,
  ReceiptIcon,
  SpinnerIcon,
  TruckIcon,
  WarningCircleIcon,
  XCircleIcon,
} from '@phosphor-icons/react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { ProductImage } from '@/components/brand/ProductImage'
import { EmptyState } from '@/components/brand/bits'
import { Button } from '@/components/ui/button'
import { api, errorMessage } from '@/lib/api'
import { date, moneyExact, num } from '@/lib/format'
import { useMe, useSettings } from '@/lib/queries'
import { STATUS_LABEL, type Address, type PublicOrder } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useSeo } from '@/lib/seo'

type VerifyResult = { result: 'paid' | 'pending' | 'failed' | 'unchanged'; status: PublicOrder['status']; note: string | null }

const STEPS = [
  { key: 'PAID', label: 'Paid', icon: CreditCardIcon },
  { key: 'PROCESSING', label: 'Packed', icon: PackageIcon },
  { key: 'SHIPPED', label: 'Shipped', icon: TruckIcon },
  { key: 'DELIVERED', label: 'Delivered', icon: HouseLineIcon },
] as const
const RANK: Record<string, number> = { PENDING_PAYMENT: -1, PAID: 0, PROCESSING: 1, SHIPPED: 2, DELIVERED: 3 }

export default function OrderPage() {
  useSeo({ title: 'Your order', noindex: true })
  const { number } = useParams()
  const [params, setParams] = useSearchParams()
  const key = params.get('key') ?? undefined
  const returnedStatus = params.get('status_id') // set by ToyyibPay on redirect back
  const { data: settings } = useSettings()
  const { data: me } = useMe()
  const [checking, setChecking] = useState(false)
  const [failedNotice, setFailedNotice] = useState(returnedStatus === '3')
  const polls = useRef(0)

  const order = useQuery({
    queryKey: ['order', number, key],
    queryFn: () => api.get<PublicOrder>(`/api/orders/${number}`, { key }),
    enabled: Boolean(number),
    retry: false,
  })
  const o = order.data
  const method = settings?.paymentMethods.find((m) => m.id === o?.paymentMethod)
  const isGateway = o?.paymentMethod === 'toyyibpay' || method?.type === 'gateway'

  const verify = async () => {
    if (!number) return
    setChecking(true)
    try {
      const r = await api.post<VerifyResult>('/api/payments/toyyibpay/verify', { number, key })
      if (r.result === 'paid') {
        toast.success('Payment received. Thank you!')
        setFailedNotice(false)
      }
      if (r.result === 'failed') setFailedNotice(true)
      await order.refetch()
      return r
    } catch {
      return null
    } finally {
      setChecking(false)
    }
  }

  // Coming back from ToyyibPay: confirm with the gateway, then poll briefly while FPX settles.
  useEffect(() => {
    if (!o || o.status !== 'PENDING_PAYMENT' || !isGateway) return
    if (!returnedStatus && polls.current > 0) return
    let stop = false
    const run = async () => {
      while (!stop && polls.current < 8) {
        polls.current++
        const r = await verify()
        if (!r || r.result !== 'pending' || !returnedStatus) break
        await new Promise((res) => setTimeout(res, 5000))
      }
      // Drop gateway params so a refresh does not re-trigger the flow.
      if (returnedStatus) {
        const next = new URLSearchParams(params)
        ;['status_id', 'billcode', 'order_id', 'msg', 'transaction_id'].forEach((k) => next.delete(k))
        setParams(next, { replace: true })
      }
    }
    void run()
    return () => {
      stop = true
    }
  }, [o?.status, isGateway]) // eslint-disable-line react-hooks/exhaustive-deps

  const pay = useMutation({
    mutationFn: () => api.post<{ paid: boolean; paymentUrl?: string }>('/api/payments/toyyibpay/start', { number, key }),
    onSuccess: (r) => {
      if (r.paid) {
        toast.success('This order is already paid')
        void order.refetch()
      } else if (r.paymentUrl) window.location.assign(r.paymentUrl)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  if (order.isLoading) {
    return (
      <div className="container-x max-w-4xl py-14">
        <div className="h-12 w-72 animate-pulse rounded bg-muted" />
        <div className="mt-6 h-40 animate-pulse rounded-xl bg-muted" />
        <div className="mt-6 h-64 animate-pulse rounded-xl bg-muted" />
      </div>
    )
  }
  if (order.isError || !o) {
    return (
      <div className="container-x py-20">
        <EmptyState
          icon={<ReceiptIcon />}
          title="Order not found"
          body={me?.user ? 'This order is not on your account.' : 'Open the link from your confirmation, or sign in to see your orders.'}
          action={
            <Button asChild>
              <Link to={me?.user ? '/account' : '/login'}>{me?.user ? 'My orders' : 'Sign in'}</Link>
            </Button>
          }
        />
      </div>
    )
  }

  const pending = o.status === 'PENDING_PAYMENT'
  const closed = o.status === 'CANCELLED' || o.status === 'REFUNDED'
  const rank = RANK[o.status] ?? -1
  const address = o.shippingAddress as Address
  const hasAddress = Boolean(address && 'line1' in address && address.line1)
  const pageUrl = `${window.location.origin}/order/${o.number}?key=${o.accessKey}`

  return (
    <div className="container-x max-w-5xl py-10 md:py-14">
      {/* Status header */}
      <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="font-mono text-sm text-muted-foreground">Order {o.number}</p>
          <h1 className="display mt-2 text-5xl md:text-6xl">
            {pending ? 'Awaiting payment' : closed ? STATUS_LABEL[o.status] : o.status === 'DELIVERED' ? 'Delivered' : 'Thank you.'}
          </h1>
          <p className="mt-3 max-w-[56ch] text-muted-foreground">
            {pending
              ? isGateway
                ? 'Your order is reserved. Complete payment to confirm it.'
                : 'Your order is reserved. Send payment using the details below and we will ship as soon as it clears.'
              : closed
                ? `This order was ${o.status.toLowerCase()}. Contact us if you have questions.`
                : `Payment received ${date(o.paidAt)}. This page updates as your order is packed and shipped.`}
          </p>
        </div>
        <span
          className={cn(
            'inline-flex w-fit items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium',
            pending && 'border-warning/40 bg-warning/10 text-warning',
            closed && 'border-destructive/30 bg-destructive/10 text-destructive',
            !pending && !closed && 'border-gold/40 bg-gold/10 text-gold-ink',
          )}
        >
          {pending ? <ClockIcon className="size-4" /> : closed ? <XCircleIcon className="size-4" /> : <CheckCircleIcon weight="fill" className="size-4" />}
          {STATUS_LABEL[o.status]}
        </span>
      </div>

      {/* Payment block */}
      {pending && (
        <div className="mt-8 rounded-xl border border-gold/30 bg-card p-5 sm:p-6">
          {failedNotice && (
            <p className="mb-4 flex items-start gap-2 rounded-lg bg-destructive/10 px-3.5 py-3 text-sm text-destructive">
              <WarningCircleIcon className="mt-0.5 size-4 shrink-0" /> The last payment attempt did not go through. No money was taken. You can try again below.
            </p>
          )}
          {isGateway ? (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-display text-2xl font-semibold uppercase">Pay {moneyExact(o.totalCents)}</p>
                <p className="mt-1 text-sm text-muted-foreground">FPX online banking or card, secured by ToyyibPay.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="lg" onClick={() => void verify()} disabled={checking}>
                  {checking ? <SpinnerIcon className="animate-spin" /> : <ArrowClockwiseIcon />} I have paid
                </Button>
                <Button size="lg" onClick={() => pay.mutate()} disabled={pay.isPending}>
                  {pay.isPending ? <SpinnerIcon className="animate-spin" /> : <LockSimpleIcon />} Pay now
                </Button>
              </div>
            </div>
          ) : (
            <div>
              <p className="font-display text-2xl font-semibold uppercase">{method?.label ?? 'Payment'} details</p>
              <p className="mt-3 text-sm whitespace-pre-line text-muted-foreground">{o.paymentInstructions}</p>
              <p className="mt-4 text-sm">
                Amount: <strong className="font-mono">{moneyExact(o.totalCents)}</strong>. Reference: <strong className="font-mono">{o.number}</strong>
              </p>
            </div>
          )}
          {!me?.user && (
            <div className="mt-5 flex flex-wrap items-center gap-2 border-t pt-4 text-[13px] text-muted-foreground">
              Save this private link to come back to your order:
              <button
                className="inline-flex items-center gap-1 text-gold-ink hover:underline"
                onClick={() => {
                  void navigator.clipboard?.writeText(pageUrl)
                  toast.success('Order link copied')
                }}
              >
                <CopyIcon className="size-3.5" /> Copy link
              </button>
            </div>
          )}
        </div>
      )}

      {/* Progress */}
      {!closed && o.kind !== 'MEMBERSHIP' && (
        <ol className="mt-10 grid grid-cols-4 gap-2">
          {STEPS.map((s, i) => {
            const done = rank >= i
            return (
              <li key={s.key} className="relative flex flex-col items-center text-center">
                {i < STEPS.length - 1 && <span className={cn('absolute top-5 left-[calc(50%+24px)] h-px w-[calc(100%-48px)]', rank > i ? 'bg-gold' : 'bg-border')} aria-hidden />}
                <span className={cn('grid size-10 place-items-center rounded-full border', done ? 'border-gold bg-gold text-primary-foreground' : 'text-muted-foreground')}>
                  <s.icon className="size-4" weight={done ? 'bold' : 'regular'} />
                </span>
                <span className={cn('mt-2 text-[13px] font-medium', !done && 'text-muted-foreground')}>{s.label}</span>
              </li>
            )
          })}
        </ol>
      )}
      {o.trackingNumber && (
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-surface px-5 py-4">
          <span className="flex items-center gap-2 text-sm">
            <TruckIcon className="size-5 text-gold-ink" /> {o.carrier ?? 'Courier'} tracking number
          </span>
          <button
            className="inline-flex items-center gap-1.5 font-mono text-sm hover:text-gold-ink"
            onClick={() => {
              void navigator.clipboard?.writeText(o.trackingNumber!)
              toast.success('Tracking number copied')
            }}
          >
            {o.trackingNumber} <CopyIcon className="size-3.5" />
          </button>
        </div>
      )}

      <div className="mt-10 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-xl border bg-card">
          <h2 className="border-b px-5 py-4 font-display text-2xl font-semibold uppercase">Items</h2>
          <ul className="divide-y">
            {o.items.map((it, i) => (
              <li key={i} className="flex items-center gap-4 px-5 py-4">
                <ProductImage src={it.image} alt={it.name} sizes="64px" className="size-16 shrink-0 rounded-lg" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{it.name}</p>
                  <p className="text-[13px] text-muted-foreground">
                    {it.variantLabel}, qty {it.quantity}
                    {it.discountPct > 0 && <span className="text-gold-ink">, {it.discountPct}% off</span>}
                  </p>
                </div>
                <p className="font-mono text-sm">{it.lineTotalCents === 0 ? 'Included' : moneyExact(it.lineTotalCents)}</p>
              </li>
            ))}
          </ul>
          <dl className="space-y-2 border-t px-5 py-4 text-sm">
            <Row k="Subtotal" v={moneyExact(o.subtotalCents)} />
            {o.tierDiscountCents > 0 && <Row k="Quantity savings" v={`-${moneyExact(o.tierDiscountCents)}`} gold />}
            {o.couponDiscountCents > 0 && <Row k={`Code ${o.couponCode ?? ''}`} v={`-${moneyExact(o.couponDiscountCents)}`} gold />}
            {o.pointsDiscountCents > 0 && <Row k={`${num(o.pointsRedeemed)} points`} v={`-${moneyExact(o.pointsDiscountCents)}`} gold />}
            {o.kind !== 'MEMBERSHIP' && <Row k="Shipping" v={o.shippingCents ? moneyExact(o.shippingCents) : 'Free'} />}
            <div className="flex justify-between border-t pt-3">
              <dt className="font-display text-xl font-semibold uppercase">Total</dt>
              <dd className="font-mono text-xl font-semibold">{moneyExact(o.totalCents)}</dd>
            </div>
            {o.pointsEarned > 0 && (
              <p className="pt-1 text-[12px] text-muted-foreground">
                {pending ? 'Earns' : 'Earned'} {num(o.pointsEarned)} KYVO Points{pending ? ' once paid' : ''}.
              </p>
            )}
          </dl>
        </section>

        <div className="grid content-start gap-6">
          {settings?.trackerUrl && !pending && !closed && o.kind !== 'MEMBERSHIP' && (
            <a
              href={settings.trackerUrl}
              target="_blank"
              rel="noopener"
              className="group flex items-center gap-4 rounded-xl border border-gold/30 bg-gold/5 p-5 transition-colors hover:border-gold/50"
            >
              <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-gold/15 text-gold-ink">
                <CalendarCheckIcon className="size-6" weight="fill" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-display text-lg font-semibold tracking-wide uppercase">Track it in KYVO Tracker</span>
                <span className="text-sm text-muted-foreground">Sign in with this account and these vials are already in your stash, with reminders and a log.</span>
              </span>
              <ArrowUpRightIcon className="size-5 shrink-0 text-gold-ink transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden />
            </a>
          )}
          {hasAddress && (
            <section className="rounded-xl border bg-card p-5">
              <h2 className="font-display text-xl font-semibold uppercase">Ship to</h2>
              <address className="mt-2 text-sm leading-relaxed text-muted-foreground not-italic">
                {o.name}
                <br />
                {address.line1}
                {address.line2 ? (
                  <>
                    <br />
                    {address.line2}
                  </>
                ) : null}
                <br />
                {address.postalCode} {address.city}, {address.state}
                <br />
                {o.phone}
              </address>
            </section>
          )}
          <section className="rounded-xl border bg-card p-5">
            <h2 className="font-display text-xl font-semibold uppercase">History</h2>
            <ol className="mt-3 space-y-3">
              {[...o.events].reverse().map((e, i) => (
                <li key={i} className="grid grid-cols-[auto_1fr] gap-3 text-sm">
                  <span className={cn('mt-1.5 size-2 rounded-full', i === 0 ? 'bg-gold' : 'bg-border')} aria-hidden />
                  <span>
                    {e.message}
                    <span className="block text-[12px] text-muted-foreground">{date(e.createdAt, true)}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>
          <p className="text-[13px] text-muted-foreground">
            Questions about this order? Email{' '}
            <a className="text-gold-ink hover:underline" href={`mailto:${settings?.supportEmail}?subject=Order ${o.number}`}>
              {settings?.supportEmail}
            </a>{' '}
            with your order number.
          </p>
        </div>
      </div>
    </div>
  )
}

function Row({ k, v, gold }: { k: string; v: string; gold?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className={cn('font-mono', gold && 'text-gold-ink')}>{v}</dd>
    </div>
  )
}
