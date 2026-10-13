import { useQuery } from '@tanstack/react-query'
import { CalendarBlankIcon, PackageIcon, PauseIcon, PlayIcon, PlusIcon, XCircleIcon } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { EmptyState } from '@/components/brand/bits'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { api, errorMessage } from '@/lib/api'
import { date, money, num, relative } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ConfirmDialog, ErrorState, Field, Num, OrderStatusBadge, PageHeader, Pill, Segmented, SubscriptionStatusBadge, TextInput } from '../components/kit'
import type { SubscriptionRow, SubscriptionStatus } from '../lib/types'
import { isoDay, useInvalidateAdmin } from '../lib/utils'

type Filter = 'ALL' | SubscriptionStatus

const DAY = 86400_000

/** Whole days from today to the given date (negative when it has passed). */
function daysUntil(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const a = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())
  const b = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((a - b) / DAY)
}

export default function Subscriptions() {
  const [filter, setFilter] = useState<Filter>('ACTIVE')
  const q = useQuery({
    queryKey: ['admin', 'subscriptions'],
    queryFn: () => api.get<SubscriptionRow[]>('/api/admin/subscriptions'),
  })

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { ALL: 0, ACTIVE: 0, PAUSED: 0, CANCELLED: 0, COMPLETED: 0 }
    for (const s of q.data ?? []) {
      c.ALL++
      c[s.status]++
    }
    return c
  }, [q.data])

  const rows = useMemo(() => (q.data ?? []).filter((s) => filter === 'ALL' || s.status === filter), [q.data, filter])
  const dueSoon = useMemo(() => (q.data ?? []).filter((s) => s.status === 'ACTIVE' && daysUntil(s.nextShipAt) <= 3).length, [q.data])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Subscriptions"
        description="Build a Box subscriptions: the customer picks a set of compounds once and receives the same box every month at a discount, for at least the committed number of months. Each month you create the next box order here, the customer pays it, and you ship it like any other order."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'ALL', label: 'All', count: counts.ALL },
            { value: 'ACTIVE', label: 'Active', count: counts.ACTIVE },
            { value: 'PAUSED', label: 'Paused', count: counts.PAUSED },
            { value: 'CANCELLED', label: 'Cancelled', count: counts.CANCELLED },
            { value: 'COMPLETED', label: 'Completed', count: counts.COMPLETED },
          ]}
        />
        {dueSoon > 0 && (
          <p className="text-sm text-muted-foreground">
            <Num className="text-foreground">{num(dueSoon)}</Num> active {dueSoon === 1 ? 'box is' : 'boxes are'} due within 3 days or overdue
          </p>
        )}
      </div>

      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.isPending ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-72 rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<PackageIcon />}
          title={filter === 'ALL' ? 'No subscriptions yet' : `No ${filter.toLowerCase()} subscriptions`}
          body={
            filter === 'ALL'
              ? 'Subscriptions appear here when customers sign up to Build a Box on the shop.'
              : 'Nothing matches this filter right now.'
          }
          action={
            filter !== 'ALL' ? (
              <Button variant="outline" size="sm" onClick={() => setFilter('ALL')}>
                Show all subscriptions
              </Button>
            ) : (
              <Button asChild variant="outline" size="sm">
                <Link to="/admin/settings#box">Build a Box settings</Link>
              </Button>
            )
          }
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {rows.map((s) => (
            <SubscriptionCard key={s.id} sub={s} />
          ))}
        </div>
      )}
    </div>
  )
}

function SubscriptionCard({ sub }: { sub: SubscriptionRow }) {
  const invalidate = useInvalidateAdmin()
  const navigate = useNavigate()
  const [confirm, setConfirm] = useState<null | 'next' | 'cancel'>(null)
  const [dateOpen, setDateOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const days = daysUntil(sub.nextShipAt)
  const live = sub.status === 'ACTIVE'
  const open = sub.status === 'ACTIVE' || sub.status === 'PAUSED'
  const progress = sub.commitMonths > 0 ? Math.min(100, (sub.boxesShipped / sub.commitMonths) * 100) : 0
  const committed = sub.boxesShipped >= sub.commitMonths

  async function patch(body: { status?: SubscriptionStatus; nextShipAt?: string }, success: string) {
    setBusy(true)
    try {
      await api.patch(`/api/admin/subscriptions/${sub.id}`, body)
      await invalidate()
      toast.success(success)
    } finally {
      setBusy(false)
    }
  }

  async function createNext() {
    const res = await api.post<{ id: string; number: string }>(`/api/admin/subscriptions/${sub.id}/next-box`)
    await invalidate()
    toast.success(`Order ${res.number} created`, {
      description: 'It is waiting for the customer to pay.',
      action: { label: 'Open order', onClick: () => navigate(`/admin/orders/${res.id}`) },
    })
  }

  return (
    <article className="flex min-w-0 flex-col rounded-xl border bg-card">
      <header className="flex items-start justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {sub.userId ? (
              <Link to={`/admin/customers/${sub.userId}`} className="truncate font-medium hover:underline">
                {sub.name}
              </Link>
            ) : (
              <span className="truncate font-medium">{sub.name}</span>
            )}
            <SubscriptionStatusBadge status={sub.status} />
          </div>
          <p className="truncate text-sm text-muted-foreground">{sub.email}</p>
        </div>
        <div className="shrink-0 text-right">
          <Num className="text-lg font-medium">{money(sub.priceCents)}</Num>
          <p className="text-xs text-muted-foreground">per box</p>
        </div>
      </header>

      <div className="grid flex-1 gap-4 px-4 py-3 sm:grid-cols-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">In the box</p>
          <ul className="mt-1.5 space-y-1 text-sm">
            {sub.items.map((it, i) => (
              <li key={`${it.variantId}-${i}`} className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate">
                  {it.name ?? 'Item'}
                  {it.variantLabel && <span className="text-muted-foreground"> {it.variantLabel}</span>}
                </span>
                <Num className="shrink-0 text-muted-foreground">x{it.quantity}</Num>
              </li>
            ))}
          </ul>
        </div>

        <div className="min-w-0 space-y-3">
          <div>
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="font-medium text-muted-foreground">Boxes created</span>
              <span>
                <Num className="text-sm">{sub.boxesShipped}</Num>
                <span className="text-muted-foreground">
                  {' '}
                  of <Num>{sub.commitMonths}</Num> committed
                </span>
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className={cn('h-full rounded-full', committed ? 'bg-success' : 'bg-gold')} style={{ width: `${progress}%` }} />
            </div>
            {committed && <p className="mt-1 text-xs text-muted-foreground">Commitment met. The customer can cancel any time now.</p>}
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground">Next box due</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <Num className="text-sm">{date(sub.nextShipAt)}</Num>
              {live && days < 0 && <Pill tone="destructive">Overdue {Math.abs(days)}d</Pill>}
              {live && days === 0 && <Pill tone="warning">Today</Pill>}
              {live && days > 0 && days <= 3 && <Pill tone="warning">In {days}d</Pill>}
              {open && (
                <Button variant="ghost" size="xs" onClick={() => setDateOpen(true)} disabled={busy}>
                  <CalendarBlankIcon />
                  Change
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="border-t px-4 py-3">
        <p className="text-xs font-medium text-muted-foreground">Recent orders</p>
        {sub.orders.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">No orders yet.</p>
        ) : (
          <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5">
            {sub.orders.slice(0, 4).map((o) => (
              <li key={o.id} className="flex items-center gap-2 text-sm">
                <Link to={`/admin/orders/${o.id}`} className="font-mono tabular-nums hover:underline">
                  {o.number}
                </Link>
                <OrderStatusBadge status={o.status} />
              </li>
            ))}
            {sub.orders.length > 4 && <li className="text-xs text-muted-foreground">+{sub.orders.length - 4} more</li>}
          </ul>
        )}
      </div>

      {open ? (
        <footer className="flex flex-wrap items-center gap-2 border-t bg-surface/50 px-4 py-3">
          {live && (
            <Button size="sm" onClick={() => setConfirm('next')} disabled={busy}>
              <PlusIcon />
              Create next box order
            </Button>
          )}
          {live ? (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => patch({ status: 'PAUSED' }, 'Subscription paused').catch((e) => toast.error(errorMessage(e)))}>
              <PauseIcon />
              Pause
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => patch({ status: 'ACTIVE' }, 'Subscription resumed').catch((e) => toast.error(errorMessage(e)))}>
              <PlayIcon />
              Resume
            </Button>
          )}
          <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground hover:text-destructive" disabled={busy} onClick={() => setConfirm('cancel')}>
            <XCircleIcon />
            Cancel
          </Button>
        </footer>
      ) : (
        <footer className="border-t px-4 py-2.5 text-xs text-muted-foreground">
          {sub.status === 'CANCELLED' && sub.cancelledAt ? `Cancelled ${relative(sub.cancelledAt)}` : `Started ${date(sub.createdAt)}`}
        </footer>
      )}

      <ConfirmDialog
        open={confirm === 'next'}
        onOpenChange={(o) => !o && setConfirm(null)}
        destructive={false}
        title="Create next box order?"
        description={`This creates box ${sub.boxesShipped + 1} for ${sub.name} as a new order awaiting payment, using today's prices and the customer's saved address.`}
        confirmLabel="Create order"
        cancelLabel="Not now"
        onConfirm={createNext}
      >
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>Stock for the box is reserved straight away.</li>
          <li>
            The next due date moves one month later, to <Num className="text-foreground">{date(addMonth(sub.nextShipAt))}</Num>.
          </li>
          <li>Send the customer the payment link from the order page, then ship once it is paid.</li>
        </ul>
      </ConfirmDialog>

      <ConfirmDialog
        open={confirm === 'cancel'}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Cancel this subscription?"
        description={
          committed
            ? `${sub.name} will not get any more boxes. Orders already created are not affected.`
            : `${sub.name} has received ${sub.boxesShipped} of ${sub.commitMonths} committed boxes. Cancelling stops all future boxes. Orders already created are not affected.`
        }
        confirmLabel="Cancel subscription"
        onConfirm={() => patch({ status: 'CANCELLED' }, 'Subscription cancelled')}
      />

      <ShipDateDialog open={dateOpen} onOpenChange={setDateOpen} current={sub.nextShipAt} onSave={(d) => patch({ nextShipAt: d }, 'Next box date updated')} />
    </article>
  )
}

function addMonth(iso: string) {
  const d = new Date(iso)
  d.setMonth(d.getMonth() + 1)
  return d
}

function ShipDateDialog({
  open,
  onOpenChange,
  current,
  onSave,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  current: string
  onSave: (isoDate: string) => Promise<void>
}) {
  const [value, setValue] = useState(isoDay(current))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (saving) return
        if (o) {
          setValue(isoDay(current))
          setError(null)
        }
        onOpenChange(o)
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-semibold tracking-wide uppercase">Change next box date</DialogTitle>
          <DialogDescription>The date you plan to create and send the next box. Use this to delay or bring forward a delivery.</DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
              setError('Pick a date')
              return
            }
            setSaving(true)
            setError(null)
            try {
              // Midday local time so the date does not slip a day in any timezone.
              await onSave(new Date(`${value}T12:00:00`).toISOString())
              onOpenChange(false)
            } catch (err) {
              setError(errorMessage(err))
              toast.error(errorMessage(err))
            } finally {
              setSaving(false)
            }
          }}
        >
          <Field label="Next box due" htmlFor="next-ship" error={error}>
            <TextInput id="next-ship" type="date" value={value} onChange={(e) => setValue(e.target.value)} className="font-mono" />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || value === isoDay(current)}>
              {saving ? 'Saving...' : 'Save date'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
