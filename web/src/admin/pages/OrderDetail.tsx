import {
  ArrowClockwiseIcon,
  ArrowSquareOutIcon,
  ArrowUUpLeftIcon,
  CheckCircleIcon,
  ClockIcon,
  CreditCardIcon,
  CubeIcon,
  EnvelopeSimpleIcon,
  HandshakeIcon,
  LockSimpleIcon,
  MapPinIcon,
  NoteIcon,
  PackageIcon,
  PencilSimpleIcon,
  PhoneIcon,
  ReceiptIcon,
  TruckIcon,
  UserIcon,
  XCircleIcon,
} from '@phosphor-icons/react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ArchiveOneButton, ArchivedNotice } from '../components/bulk'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useParams, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { ProductImage } from '@/components/brand/ProductImage'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { api, errorMessage } from '@/lib/api'
import { date, money, moneyExact, num, plural } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  CommissionStatusBadge,
  ConfirmDialog,
  CopyButton,
  DefRow,
  ErrorState,
  Field,
  Num,
  OrderStatusBadge,
  PageHeader,
  Panel,
  Pill,
  SubscriptionStatusBadge,
  TextInput,
  TierBadge,
} from '../components/kit'
import type { OrderDetail as Order, OrderStatus } from '../lib/types'
import { useLicensed } from '../lib/queries'
import { COMMISSION_STATUS, ORDER_STATUS, kindLabel, paymentLabel, useInvalidateAdmin } from '../lib/utils'

const CARRIERS = ['J&T Express', 'Pos Laju', 'DHL eCommerce', 'Ninja Van', 'City-Link']

type StatusBody = { status: OrderStatus; carrier?: string; trackingNumber?: string; paymentRef?: string; note?: string }

export default function OrderDetail() {
  const navigate = useNavigate()
  const { id = '' } = useParams()
  const licensed = useLicensed()
  const { data: o, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'order', id],
    queryFn: () => api.get<Order>(`/api/admin/orders/${id}`),
  })

  if (error && !o) {
    return (
      <div className="space-y-6">
        <PageHeader title="Order" back={{ to: '/admin/orders', label: 'Orders' }} />
        <ErrorState error={error} onRetry={() => refetch()} />
      </div>
    )
  }
  if (isLoading || !o) return <OrderSkeleton />

  const isMembership = o.kind === 'MEMBERSHIP'

  return (
    <div className="space-y-6">
      <PageHeader
        back={{ to: '/admin/orders', label: 'Orders' }}
        title={
          <>
            Order <span className="font-mono tracking-normal">{o.number}</span>
          </>
        }
        meta={
          <>
            <OrderStatusBadge status={o.status} />
            <Pill dot={false}>{kindLabel(o.kind, licensed.membership)}</Pill>
            <span>Placed {date(o.createdAt, true)}</span>
          </>
        }
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <a href={`/order/${o.number}?key=${o.accessKey}`} target="_blank" rel="noreferrer">
                <ArrowSquareOutIcon />
                Customer view
              </a>
            </Button>
            {!o.deletedAt && <ArchiveOneButton type="orders" id={o.id} after={() => navigate('/admin/orders')} />}
          </>
        }
      />
      {o.deletedAt && <ArchivedNotice type="orders" id={o.id} deletedAt={o.deletedAt} deletedBy={o.deletedBy} />}

      <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
        <div className="min-w-0 lg:col-start-3 lg:row-start-1">
          <ActionPanel o={o} />
        </div>

        <div className="min-w-0 space-y-6 lg:col-span-2 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <ItemsPanel o={o} />
          <Timeline o={o} />
        </div>

        <div className="min-w-0 space-y-6 lg:col-start-3 lg:row-start-2">
          <CustomerPanel o={o} />
          {!isMembership && <ShippingPanel o={o} />}
          <PaymentPanel o={o} />
          {(o.affiliate || o.commission) && <PartnerPanel o={o} />}
          {o.subscription && (
            <Panel title="Build a Box">
              <dl>
                <DefRow label="Subscription">
                  <SubscriptionStatusBadge status={o.subscription.status} />
                </DefRow>
                <DefRow label="Boxes shipped">
                  <Num>
                    {o.subscription.boxesShipped} of {o.subscription.commitMonths}
                  </Num>
                </DefRow>
              </dl>
              <Button variant="outline" size="sm" className="mt-3 w-full" asChild>
                <Link to="/admin/subscriptions">
                  <CubeIcon /> View subscriptions
                </Link>
              </Button>
            </Panel>
          )}
          <NotePanel o={o} />
        </div>
      </div>
    </div>
  )
}

// ---------- Actions ----------

function useSetStatus(id: string) {
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: (body: StatusBody) => api.post(`/api/admin/orders/${id}/status`, body),
    onSuccess: (_d, body) => {
      toast.success(`Order marked as ${ORDER_STATUS[body.status].label.toLowerCase()}`)
      invalidate()
    },
  })
}

function ActionPanel({ o }: { o: Order }) {
  const setStatus = useSetStatus(o.id)
  const invalidate = useInvalidateAdmin()
  const [dialog, setDialog] = useState<null | 'paid' | 'ship' | 'deliver' | 'cancel' | 'refund'>(null)
  const next = new Set(o.nextStatuses)
  const isMembership = o.kind === 'MEMBERSHIP'
  const licensed = useLicensed()

  const check = useMutation({
    mutationFn: () => api.post<{ result: 'paid' | 'pending' | 'failed' | 'unchanged' }>(`/api/admin/orders/${o.id}/check-payment`),
    onSuccess: ({ result }) => {
      const msg = {
        paid: 'Payment confirmed by ToyyibPay. The order is now paid.',
        pending: 'ToyyibPay has no completed payment for this order yet.',
        failed: 'The last payment attempt failed. The customer can try again from their order page.',
        unchanged: 'No change. ToyyibPay did not report a matching full payment.',
      }[result]
      if (result === 'paid') toast.success(msg)
      else toast.info(msg)
      invalidate()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  const run = (body: StatusBody) =>
    setStatus.mutate(body, {
      onError: (e) => toast.error(errorMessage(e)),
    })

  const closed = o.status === 'CANCELLED' || o.status === 'REFUNDED'
  const primary: ReactNode[] = []
  const secondary: ReactNode[] = []

  if (o.status === 'PENDING_PAYMENT') {
    if (o.billCode) {
      primary.push(
        <Button key="check" onClick={() => check.mutate()} disabled={check.isPending}>
          <ArrowClockwiseIcon className={cn(check.isPending && 'animate-spin')} />
          {check.isPending ? 'Checking ToyyibPay' : 'Check payment status'}
        </Button>,
      )
    }
    if (next.has('PAID')) {
      primary.push(
        <Button key="paid" variant={o.billCode ? 'outline' : 'default'} onClick={() => setDialog('paid')}>
          <CheckCircleIcon /> Mark as paid
        </Button>,
      )
    }
  }
  if (!isMembership && next.has('PROCESSING')) {
    primary.push(
      <Button key="pack" variant={o.status === 'PAID' ? 'default' : 'outline'} disabled={setStatus.isPending} onClick={() => run({ status: 'PROCESSING' })}>
        <PackageIcon /> Start packing
      </Button>,
    )
  }
  if (!isMembership && next.has('SHIPPED')) {
    primary.push(
      <Button key="ship" variant={o.status === 'PROCESSING' ? 'default' : 'outline'} onClick={() => setDialog('ship')}>
        <TruckIcon /> Mark as shipped
      </Button>,
    )
  }
  if (next.has('DELIVERED')) {
    primary.push(
      <Button key="deliver" variant={o.status === 'SHIPPED' || isMembership ? 'default' : 'outline'} onClick={() => setDialog('deliver')}>
        <CheckCircleIcon /> {isMembership ? 'Mark as complete' : 'Mark as delivered'}
      </Button>,
    )
  }
  if (next.has('CANCELLED')) {
    secondary.push(
      <Button key="cancel" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDialog('cancel')}>
        <XCircleIcon /> Cancel order
      </Button>,
    )
  }
  if (next.has('REFUNDED')) {
    secondary.push(
      <Button key="refund" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDialog('refund')}>
        <ArrowUUpLeftIcon /> Refund order
      </Button>,
    )
  }

  return (
    <Panel title="Next step" description={ORDER_STATUS[o.status].help} className={cn(!closed && 'border-gold/30')}>
      {closed ? (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <LockSimpleIcon className="mt-0.5 size-4 shrink-0" />
          This order is closed. {o.status === 'REFUNDED' ? `Refunded on ${date(o.refundedAt)}.` : `Cancelled on ${date(o.cancelledAt)}.`}
        </p>
      ) : (
        <div className="grid gap-2">
          {primary.map((b) => b)}
          {o.status === 'PENDING_PAYMENT' && o.billCode && (
            <p className="text-xs text-muted-foreground">
              Online payments usually confirm automatically. Use "Check payment status" if the customer says they paid but the order still shows unpaid.
            </p>
          )}
          {secondary.length > 0 && (
            <>
              <Separator className="my-1" />
              <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-1">{secondary.map((b) => b)}</div>
            </>
          )}
        </div>
      )}

      <MarkPaidDialog open={dialog === 'paid'} onOpenChange={(v) => setDialog(v ? 'paid' : null)} o={o} />
      <ShipDialog open={dialog === 'ship'} onOpenChange={(v) => setDialog(v ? 'ship' : null)} o={o} />
      <ConfirmDialog
        open={dialog === 'deliver'}
        onOpenChange={(v) => setDialog(v ? 'deliver' : null)}
        destructive={false}
        title={isMembership ? 'Mark as complete?' : 'Mark as delivered?'}
        description={
          isMembership
            ? licensed.membership
              ? 'Use this once the membership is active for the customer.'
              : 'Use this once the order is fulfilled for the customer.'
            : 'Confirm the customer has received the parcel. The status cannot go back to shipped.'
        }
        confirmLabel={isMembership ? 'Mark complete' : 'Mark delivered'}
        cancelLabel="Not yet"
        onConfirm={() => setStatus.mutateAsync({ status: 'DELIVERED' })}
      >
        {o.commission?.status === 'PENDING' && (
          <p className="rounded-md bg-gold/10 px-3 py-2 text-gold-ink">
            The partner commission of <Num>{money(o.commission.amountCents)}</Num> will be approved and become payable.
          </p>
        )}
      </ConfirmDialog>
      <ReverseDialog kind="cancel" open={dialog === 'cancel'} onOpenChange={(v) => setDialog(v ? 'cancel' : null)} o={o} />
      <ReverseDialog kind="refund" open={dialog === 'refund'} onOpenChange={(v) => setDialog(v ? 'refund' : null)} o={o} />
    </Panel>
  )
}

function MarkPaidDialog({ open, onOpenChange, o }: { open: boolean; onOpenChange: (v: boolean) => void; o: Order }) {
  const licensed = useLicensed()
  const setStatus = useSetStatus(o.id)
  const [ref, setRef] = useState(o.paymentRef ?? '')
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    if (open) {
      setRef(o.paymentRef ?? '')
      setErr(null)
    }
  }, [open, o.paymentRef])
  return (
    <Dialog open={open} onOpenChange={(v) => !setStatus.isPending && onOpenChange(v)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-semibold tracking-wide uppercase">Mark as paid</DialogTitle>
          <DialogDescription>
            Use this after you have confirmed the money of <Num className="text-foreground">{moneyExact(o.totalCents)}</Num> arrived, for example a bank
            transfer or DuitNow payment.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            setStatus.mutate(
              { status: 'PAID', paymentRef: ref.trim() || undefined },
              { onSuccess: () => onOpenChange(false), onError: (x) => setErr(errorMessage(x)) },
            )
          }}
        >
          <Field label="Payment reference" optional htmlFor="pay-ref" hint="Bank or DuitNow reference, so you can match it later." error={err}>
            <TextInput id="pay-ref" value={ref} onChange={(e) => setRef(e.target.value)} maxLength={120} className="font-mono" autoFocus />
          </Field>
          <ul className="grid gap-1 rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
            <li>The customer earns {num(o.pointsEarned)} points.</li>
            {o.affiliate && <li>Partner commission is recorded for {o.affiliate.code}.</li>}
            {licensed.membership && o.kind === 'MEMBERSHIP' && <li>The membership tier is activated on their account.</li>}
          </ul>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={setStatus.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={setStatus.isPending}>
              {setStatus.isPending ? 'Saving...' : 'Mark as paid'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ShipDialog({ open, onOpenChange, o }: { open: boolean; onOpenChange: (v: boolean) => void; o: Order }) {
  const setStatus = useSetStatus(o.id)
  const [carrier, setCarrier] = useState(o.carrier ?? '')
  const [tracking, setTracking] = useState(o.trackingNumber ?? '')
  const [note, setNote] = useState('')
  const [errors, setErrors] = useState<{ carrier?: string; tracking?: string; form?: string }>({})
  useEffect(() => {
    if (open) {
      setCarrier(o.carrier ?? '')
      setTracking(o.trackingNumber ?? '')
      setNote('')
      setErrors({})
    }
  }, [open, o.carrier, o.trackingNumber])

  return (
    <Dialog open={open} onOpenChange={(v) => !setStatus.isPending && onOpenChange(v)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-semibold tracking-wide uppercase">Mark as shipped</DialogTitle>
          <DialogDescription>Add the courier and tracking number. The customer can see these on their order page.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            const next: typeof errors = {}
            if (!carrier.trim()) next.carrier = 'Choose or type the courier'
            if (!tracking.trim()) next.tracking = 'Add the tracking number from the courier'
            setErrors(next)
            if (Object.keys(next).length) return
            setStatus.mutate(
              { status: 'SHIPPED', carrier: carrier.trim(), trackingNumber: tracking.trim(), note: note.trim() || undefined },
              { onSuccess: () => onOpenChange(false), onError: (x) => setErrors({ form: errorMessage(x) }) },
            )
          }}
        >
          <Field label="Courier" htmlFor="ship-carrier" error={errors.carrier}>
            <TextInput id="ship-carrier" value={carrier} onChange={(e) => setCarrier(e.target.value)} list="carrier-list" maxLength={60} autoFocus />
            <datalist id="carrier-list">
              {CARRIERS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <div className="flex flex-wrap gap-1.5">
              {CARRIERS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCarrier(c)}
                  className={cn(
                    'rounded-md border px-2 py-1 text-xs transition-colors',
                    carrier === c ? 'border-gold/50 bg-gold/12 text-gold-ink' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Tracking number" htmlFor="ship-tracking" error={errors.tracking}>
            <TextInput id="ship-tracking" value={tracking} onChange={(e) => setTracking(e.target.value)} maxLength={80} className="font-mono" />
          </Field>
          <Field label="Note for the timeline" optional htmlFor="ship-note">
            <TextInput id="ship-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="e.g. Sent with ice pack" />
          </Field>
          {errors.form && <p className="text-sm text-destructive">{errors.form}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={setStatus.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={setStatus.isPending}>
              <TruckIcon /> {setStatus.isPending ? 'Saving...' : 'Mark as shipped'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ReverseDialog({ kind, open, onOpenChange, o }: { kind: 'cancel' | 'refund'; open: boolean; onOpenChange: (v: boolean) => void; o: Order }) {
  const setStatus = useSetStatus(o.id)
  const [note, setNote] = useState('')
  const wasPaid = ['PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'].includes(o.status)
  const units = o.items.filter((i) => i.variantId).reduce((a, i) => a + i.quantity, 0)
  const c = o.commission
  const effects: ReactNode[] = []
  if (units > 0) effects.push(<>{plural(units, 'unit')} go back into stock.</>)
  if (o.userId && o.pointsRedeemed > 0) effects.push(<>The {num(o.pointsRedeemed)} points the customer used are given back.</>)
  if (o.userId && wasPaid && o.pointsEarned > 0) effects.push(<>The {num(o.pointsEarned)} points earned on this order are taken back.</>)
  if (c && (c.status === 'PENDING' || c.status === 'APPROVED') && !c.payoutId)
    effects.push(
      <>
        The partner commission of <Num>{money(c.amountCents)}</Num> is voided.
      </>,
    )
  if (c && (c.status === 'PAID' || c.payoutId))
    effects.push(
      <>
        The partner commission of <Num>{money(c.amountCents)}</Num> is {c.status === 'PAID' ? 'already paid' : 'in a payout request'}, so it does not change
        automatically.
      </>,
    )

  const isRefund = kind === 'refund'
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v)
        if (!v) setNote('')
      }}
      title={isRefund ? `Refund order ${o.number}?` : `Cancel order ${o.number}?`}
      description={
        isRefund
          ? 'This records the refund in KYVO. It does not send money: return the payment yourself through ToyyibPay or your bank first.'
          : wasPaid
            ? 'This customer has already paid. If you are returning their money, use Refund instead so your finance reports stay correct.'
            : 'Use this for orders that will not be paid, for example an abandoned checkout.'
      }
      confirmLabel={isRefund ? 'Refund order' : 'Cancel order'}
      cancelLabel="Keep order"
      onConfirm={() => setStatus.mutateAsync({ status: isRefund ? 'REFUNDED' : 'CANCELLED', note: note.trim() || undefined })}
    >
      <div className="grid gap-3">
        {effects.length > 0 && (
          <div>
            <p className="mb-1.5 font-medium">What happens</p>
            <ul className="grid list-disc gap-1 pl-5 text-muted-foreground">
              {effects.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          </div>
        )}
        <Field label="Reason" optional htmlFor={`reverse-note-${kind}`} hint="Saved on the order timeline.">
          <TextInput id={`reverse-note-${kind}`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        </Field>
        <p className="text-xs text-muted-foreground">This cannot be undone.</p>
      </div>
    </ConfirmDialog>
  )
}

// ---------- Items + totals ----------

function ItemsPanel({ o }: { o: Order }) {
  const discounts = o.tierDiscountCents + o.couponDiscountCents + o.pointsDiscountCents
  const netSales = o.subtotalCents - discounts
  const commission = o.commission && o.commission.status !== 'VOID' ? o.commission.amountCents : 0
  const profit = netSales - o.costCents - commission
  return (
    <Panel title="Items" description={plural(o.items.reduce((a, i) => a + i.quantity, 0), 'unit')} flush>
      <ul className="divide-y">
        {o.items.map((i) => (
          <li key={i.id} className="flex items-start gap-3 px-4 py-3">
            <ProductImage src={i.image} alt="" sizes="48px" className="size-12 shrink-0 rounded-md" />
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {i.productId ? (
                    <Link to={`/admin/products/${i.productId}`} className="font-medium hover:text-gold-ink">
                      {i.name}
                    </Link>
                  ) : (
                    <span className="font-medium">{i.name}</span>
                  )}
                  <p className="text-xs text-muted-foreground">{i.variantLabel}</p>
                </div>
                <Num className="shrink-0 font-medium">{moneyExact(i.lineTotalCents)}</Num>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>
                  <Num>{i.quantity}</Num> x <Num>{moneyExact(i.unitPriceCents)}</Num>
                </span>
                {i.discountPct > 0 && (
                  <Pill tone="gold" dot={false}>
                    {i.discountPct}% off
                  </Pill>
                )}
                {i.unitCostCents > 0 && (
                  <span>
                    Cost <Num>{moneyExact(i.unitCostCents * i.quantity)}</Num>
                  </span>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div className="border-t bg-surface/50 px-4 py-3">
        <dl className="ml-auto grid max-w-sm gap-0.5 text-sm">
          <TotalRow label="Subtotal" value={o.subtotalCents} />
          {o.tierDiscountCents > 0 && (
            <TotalRow label="Quantity discount" value={-o.tierDiscountCents} info="Automatic discount from quantity discounts, bulk pricing or the Build a Box discount." />
          )}
          {o.couponDiscountCents > 0 && <TotalRow label={`Coupon ${o.couponCode ?? ''}`} value={-o.couponDiscountCents} />}
          {o.pointsDiscountCents > 0 && <TotalRow label={`Points (${num(o.pointsRedeemed)} pts)`} value={-o.pointsDiscountCents} />}
          <TotalRow label="Shipping" value={o.shippingCents} free={o.shippingCents === 0 && o.kind !== 'MEMBERSHIP'} />
          {o.taxCents > 0 && <TotalRow label="Tax" value={o.taxCents} />}
          <div className="mt-1 flex items-baseline justify-between border-t pt-2">
            <dt className="font-medium">Total</dt>
            <dd className="font-mono text-lg font-semibold tabular-nums">{moneyExact(o.totalCents)}</dd>
          </div>
        </dl>
      </div>
      <div className="border-t px-4 py-3">
        <dl className="ml-auto grid max-w-sm gap-0.5 text-sm text-muted-foreground">
          <TotalRow label="Product cost" value={-o.costCents} info="COGS: what the products in this order cost you, from the cost price on each size." />
          {commission > 0 && <TotalRow label="Partner commission" value={-commission} />}
          <div className="flex items-baseline justify-between pt-1">
            <dt className="flex items-center gap-1.5 text-foreground">
              Estimated profit
              <span className="sr-only">:</span>
            </dt>
            <dd className={cn('font-mono font-medium tabular-nums', profit >= 0 ? 'text-success' : 'text-destructive')}>{moneyExact(profit)}</dd>
          </div>
          <p className="text-[11px]">Items after discounts, minus product cost and commission. Shipping is not included.</p>
        </dl>
      </div>
    </Panel>
  )
}

function TotalRow({ label, value, info, free }: { label: string; value: number; info?: string; free?: boolean }) {
  return (
    <DefRow label={label} info={info} className="py-0.5">
      {free ? <span className="text-success">Free</span> : <Num className={cn(value < 0 && 'text-muted-foreground')}>{moneyExact(value)}</Num>}
    </DefRow>
  )
}

// ---------- Side cards ----------

function CustomerPanel({ o }: { o: Order }) {
  const { membershipOn: membership } = useLicensed()
  return (
    <Panel
      title="Customer"
      action={
        o.user ? (
          <Button variant="ghost" size="sm" asChild>
            <Link to={`/admin/customers/${o.user.id}`}>Profile</Link>
          </Button>
        ) : (
          <Pill dot={false}>Guest</Pill>
        )
      }
    >
      <div className="grid gap-2 text-sm">
        <p className="flex items-center gap-2 font-medium">
          <UserIcon className="size-4 text-muted-foreground" />
          {o.name}
          {membership && o.user && <TierBadge tier={o.user.tier} />}
        </p>
        <p className="flex min-w-0 items-center gap-2">
          <EnvelopeSimpleIcon className="size-4 shrink-0 text-muted-foreground" />
          <a href={`mailto:${o.email}?subject=${encodeURIComponent(`Your KYVO order ${o.number}`)}`} className="truncate hover:text-gold-ink">
            {o.email}
          </a>
          <CopyButton text={o.email} label="Copy email" className="-my-1 ml-auto" />
        </p>
        {o.phone && (
          <p className="flex items-center gap-2">
            <PhoneIcon className="size-4 shrink-0 text-muted-foreground" />
            <a href={`tel:${o.phone}`} className="font-mono tabular-nums hover:text-gold-ink">
              {o.phone}
            </a>
            <CopyButton text={o.phone} label="Copy phone" className="-my-1 ml-auto" />
          </p>
        )}
        {o.user && (
          <p className="text-xs text-muted-foreground">
            {plural(o.user._count.orders, 'order')} in total, customer since {date(o.user.createdAt)}
          </p>
        )}
        {o.customerNote && (
          <div className="mt-1 rounded-md border border-gold/25 bg-gold/[0.06] px-3 py-2">
            <p className="text-xs font-medium text-gold-ink">Note from customer</p>
            <p className="mt-0.5 whitespace-pre-wrap">{o.customerNote}</p>
          </div>
        )}
      </div>
    </Panel>
  )
}

function ShippingPanel({ o }: { o: Order }) {
  const a = o.shippingAddress ?? {}
  const lines = [a.line1, a.line2, [a.postalCode, a.city].filter(Boolean).join(' '), a.state, a.country].filter(Boolean) as string[]
  const full = [o.name, ...lines, o.phone].filter(Boolean).join('\n')
  const [edit, setEdit] = useState(false)
  return (
    <Panel
      title="Shipping"
      action={lines.length > 0 && <CopyButton text={full} label="Copy address" />}
    >
      {lines.length ? (
        <address className="flex gap-2 text-sm not-italic">
          <MapPinIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
          <span>
            {lines.map((l, i) => (
              <span key={i} className="block">
                {l}
              </span>
            ))}
          </span>
        </address>
      ) : (
        <p className="text-sm text-muted-foreground">No address on this order.</p>
      )}
      <Separator className="my-3" />
      <div className="flex items-start justify-between gap-3">
        <dl className="min-w-0 text-sm">
          <dt className="text-xs text-muted-foreground">Tracking</dt>
          {o.trackingNumber ? (
            <dd className="mt-0.5">
              <span className="block">{o.carrier ?? 'Courier'}</span>
              <span className="flex items-center gap-1">
                <Num className="truncate">{o.trackingNumber}</Num>
                <CopyButton text={o.trackingNumber} label="Copy tracking number" className="-my-1" />
              </span>
              {o.shippedAt && <span className="block text-xs text-muted-foreground">Shipped {date(o.shippedAt, true)}</span>}
              {o.deliveredAt && <span className="block text-xs text-muted-foreground">Delivered {date(o.deliveredAt, true)}</span>}
            </dd>
          ) : (
            <dd className="mt-0.5 text-muted-foreground">Not added yet</dd>
          )}
        </dl>
        <Button variant="outline" size="sm" onClick={() => setEdit(true)}>
          <PencilSimpleIcon /> {o.trackingNumber ? 'Edit' : 'Add'}
        </Button>
      </div>
      <TrackingDialog open={edit} onOpenChange={setEdit} o={o} />
    </Panel>
  )
}

function TrackingDialog({ open, onOpenChange, o }: { open: boolean; onOpenChange: (v: boolean) => void; o: Order }) {
  const invalidate = useInvalidateAdmin()
  const [carrier, setCarrier] = useState(o.carrier ?? '')
  const [tracking, setTracking] = useState(o.trackingNumber ?? '')
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    if (open) {
      setCarrier(o.carrier ?? '')
      setTracking(o.trackingNumber ?? '')
      setErr(null)
    }
  }, [open, o.carrier, o.trackingNumber])
  const save = useMutation({
    mutationFn: () => api.patch(`/api/admin/orders/${o.id}`, { carrier: carrier.trim() || null, trackingNumber: tracking.trim() || null }),
    onSuccess: () => {
      toast.success('Tracking saved')
      invalidate()
      onOpenChange(false)
    },
    onError: (e) => setErr(errorMessage(e)),
  })
  return (
    <Dialog open={open} onOpenChange={(v) => !save.isPending && onOpenChange(v)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-semibold tracking-wide uppercase">Tracking details</DialogTitle>
          <DialogDescription>Correct the courier or tracking number. This does not change the order status.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            save.mutate()
          }}
        >
          <Field label="Courier" htmlFor="trk-carrier">
            <TextInput id="trk-carrier" value={carrier} onChange={(e) => setCarrier(e.target.value)} list="carrier-list-edit" maxLength={60} />
            <datalist id="carrier-list-edit">
              {CARRIERS.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="Tracking number" htmlFor="trk-number" error={err}>
            <TextInput id="trk-number" value={tracking} onChange={(e) => setTracking(e.target.value)} maxLength={80} className="font-mono" />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving...' : 'Save tracking'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function PaymentPanel({ o }: { o: Order }) {
  const isGateway = o.paymentMethod === 'toyyibpay'
  return (
    <Panel title="Payment">
      <dl>
        <DefRow label="Method">
          <span className="inline-flex items-center gap-1.5">
            <CreditCardIcon className="size-4 text-muted-foreground" />
            {paymentLabel(o.paymentMethod)}
          </span>
        </DefRow>
        <DefRow label="Status">{o.paidAt ? <span className="text-success">Paid {date(o.paidAt, true)}</span> : <span>Not paid</span>}</DefRow>
        {o.paymentRef && (
          <DefRow label="Payment ref" info={isGateway ? 'The ToyyibPay invoice number for this payment.' : 'The reference you entered when marking it paid.'}>
            <span className="inline-flex items-center gap-1">
              <Num className="break-all">{o.paymentRef}</Num>
              <CopyButton text={o.paymentRef} label="Copy payment reference" className="-my-1" />
            </span>
          </DefRow>
        )}
        {o.billCode && (
          <DefRow label="ToyyibPay bill" info="The bill created on ToyyibPay for this order. Search for it in your ToyyibPay dashboard.">
            <span className="inline-flex items-center gap-1">
              <Num>{o.billCode}</Num>
              <CopyButton text={o.billCode} label="Copy bill code" className="-my-1" />
            </span>
          </DefRow>
        )}
      </dl>
      {o.paymentStatusNote && (
        <p className="mt-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-[color-mix(in_oklch,var(--warning),var(--foreground)_30%)]">
          {o.paymentStatusNote}
        </p>
      )}
      {o.status === 'PENDING_PAYMENT' && o.paymentUrl && (
        <div className="mt-3 flex items-center gap-2 rounded-md bg-muted/60 px-3 py-2 text-xs">
          <span className="min-w-0 flex-1 text-muted-foreground">Payment link for the customer</span>
          <CopyButton text={o.paymentUrl} label="Copy payment link" className="-my-1" />
        </div>
      )}
    </Panel>
  )
}

function PartnerPanel({ o }: { o: Order }) {
  const c = o.commission
  const licensed = useLicensed()
  return (
    <Panel
      title="Partner"
      info="This order came through a partner's link or code. They earn a commission once the order is delivered."
      action={
        o.affiliate && (
          <Button variant="ghost" size="sm" asChild>
            <Link to={`/admin/partners/${o.affiliate.id}`}>Profile</Link>
          </Button>
        )
      }
    >
      {o.affiliate && (
        <p className="flex items-center gap-2 text-sm font-medium">
          <HandshakeIcon className="size-4 text-muted-foreground" />
          {o.affiliate.user.name}
          <Num className="text-xs text-muted-foreground">{o.affiliate.code}</Num>
        </p>
      )}
      {c ? (
        <dl className="mt-2">
          <DefRow label="Commission">
            <Num className="font-medium">{moneyExact(c.amountCents)}</Num>
          </DefRow>
          <DefRow label="Rate">
            <Num>
              {c.rate}% of {moneyExact(c.baseCents)}
            </Num>
          </DefRow>
          <DefRow label="Status" info={COMMISSION_STATUS[c.status].help}>
            <CommissionStatusBadge status={c.status} />
          </DefRow>
        </dl>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          {licensed.membership
            ? 'No commission recorded yet. It is created when the order is paid (only for approved partners, not for memberships).'
            : 'No commission recorded yet. It is created when the order is paid, for approved partners, on the order types that earn commission in Settings.'}
        </p>
      )}
    </Panel>
  )
}

function NotePanel({ o }: { o: Order }) {
  const invalidate = useInvalidateAdmin()
  const [note, setNote] = useState(o.adminNote ?? '')
  useEffect(() => setNote(o.adminNote ?? ''), [o.adminNote])
  const dirty = note !== (o.adminNote ?? '')
  const save = useMutation({
    mutationFn: () => api.patch(`/api/admin/orders/${o.id}`, { adminNote: note.trim() || null }),
    onSuccess: () => {
      toast.success('Note saved')
      invalidate()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  return (
    <Panel title="Internal note" description="Only admins can see this.">
      <Textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        maxLength={2000}
        rows={3}
        placeholder="e.g. Customer asked for discreet packaging"
        aria-label="Internal note"
        className="min-h-20 rounded-md"
      />
      {dirty && (
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setNote(o.adminNote ?? '')} disabled={save.isPending}>
            Discard
          </Button>
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Saving...' : 'Save note'}
          </Button>
        </div>
      )}
    </Panel>
  )
}

// ---------- Timeline ----------

const EVENT_ICON: Record<string, ReactNode> = {
  created: <ReceiptIcon />,
  paid: <CreditCardIcon />,
  processing: <PackageIcon />,
  shipped: <TruckIcon />,
  delivered: <CheckCircleIcon />,
  cancelled: <XCircleIcon />,
  refunded: <ArrowUUpLeftIcon />,
  tracking: <TruckIcon />,
  note: <NoteIcon />,
}

function Timeline({ o }: { o: Order }) {
  const events = [...o.events].reverse()
  return (
    <Panel title="Timeline" description="Everything that happened to this order, newest first.">
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">No activity yet.</p>
      ) : (
        <ol className="relative grid gap-4">
          {events.map((e, i) => (
            <li key={e.id} className="relative flex gap-3">
              {i < events.length - 1 && <span className="absolute top-8 bottom-[-16px] left-[13px] w-px bg-border" aria-hidden />}
              <span
                className={cn(
                  'relative grid size-7 shrink-0 place-items-center rounded-md border bg-card [&_svg]:size-3.5',
                  i === 0 ? 'border-gold/40 text-gold-ink' : 'text-muted-foreground',
                )}
              >
                {EVENT_ICON[e.type] ?? <ClockIcon />}
              </span>
              <div className="min-w-0 pt-0.5">
                <p className="text-sm">{e.message}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {date(e.createdAt, true)}
                  {e.actor && <> · {e.actor}</>}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  )
}

function OrderSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-5 w-72 max-w-full" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <div className="rounded-xl border bg-card">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex gap-3 border-b p-4 last:border-0">
                <Skeleton className="size-12 rounded-md" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
          <Skeleton className="h-64 rounded-xl" />
        </div>
        <div className="space-y-6">
          <Skeleton className="h-44 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </div>
    </div>
  )
}
