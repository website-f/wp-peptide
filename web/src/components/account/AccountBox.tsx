import { CalendarBlankIcon, CircleNotchIcon, CubeIcon } from '@phosphor-icons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { EmptyState } from '@/components/brand/bits'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { api, errorMessage } from '@/lib/api'
import { date, moneyExact, plural } from '@/lib/format'
import type { OrderStatus } from '@/lib/types'
import { FieldError } from './Field'
import { ErrorState, OrderStatusPill, StatusPill, type Tone } from './bits'

interface Sub {
  id: string
  status: 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'COMPLETED'
  items: { name: string; variantLabel: string; quantity: number; variantId: string }[]
  priceCents: number
  commitMonths: number
  boxesShipped: number
  nextShipAt: string
  createdAt: string
  orders: { number: string; status: OrderStatus; createdAt: string }[]
}

const SUB_TONE: Record<Sub['status'], [Tone, string]> = {
  ACTIVE: ['success', 'Active'],
  PAUSED: ['warning', 'Paused'],
  CANCELLED: ['muted', 'Cancelled'],
  COMPLETED: ['muted', 'Completed'],
}

export function AccountBox() {
  const q = useQuery({ queryKey: ['account', 'subscriptions'], queryFn: () => api.get<Sub[]>('/api/account/subscriptions') })

  if (q.isPending)
    return (
      <div className="grid gap-4" aria-busy aria-label="Loading boxes">
        <Skeleton className="h-64 rounded-xl" />
      </div>
    )
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} title="Could not load your boxes" />
  if (!q.data.length)
    return (
      <EmptyState
        icon={<CubeIcon />}
        title="No box yet"
        body="Pick your compounds once and get a fresh box every month at the box discount."
        action={
          <Button asChild className="h-11">
            <Link to="/build-a-box">Build a box</Link>
          </Button>
        }
      />
    )

  return (
    <ul className="grid grid-cols-1 gap-5">
      {q.data.map((s) => (
        <SubCard key={s.id} sub={s} />
      ))}
    </ul>
  )
}

function SubCard({ sub }: { sub: Sub }) {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cancel = useMutation({
    mutationFn: () => api.post(`/api/account/subscriptions/${sub.id}/cancel`),
    onSuccess: async () => {
      setOpen(false)
      setError(null)
      toast.success('Your box is cancelled. No further boxes will ship.')
      await qc.invalidateQueries({ queryKey: ['account', 'subscriptions'] })
    },
    onError: (e) => {
      setOpen(false)
      setError(errorMessage(e))
    },
  })
  const [tone, label] = SUB_TONE[sub.status]
  const live = sub.status === 'ACTIVE' || sub.status === 'PAUSED'
  const units = sub.items.reduce((a, i) => a + i.quantity, 0)

  return (
    <li className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-wrap items-center gap-3 border-b px-4 py-4 sm:px-6">
        <h3 className="display text-3xl">Monthly box</h3>
        <StatusPill tone={tone}>{label}</StatusPill>
        <p className="w-full text-xs text-muted-foreground sm:ml-auto sm:w-auto">Started {date(sub.createdAt)}</p>
      </div>

      <div className="grid grid-cols-1 gap-6 p-4 sm:p-6 md:grid-cols-[minmax(0,1fr)_260px]">
        <div>
          <p className="text-xs text-muted-foreground uppercase">In each box ({plural(units, 'vial')})</p>
          <ul className="mt-3 divide-y rounded-md border">
            {sub.items.map((it, i) => (
              <li key={`${it.variantId}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                <span className="min-w-0 truncate">
                  {it.name} <span className="text-muted-foreground">{it.variantLabel}</span>
                </span>
                <span className="shrink-0 font-mono tabular-nums text-muted-foreground">x{it.quantity}</span>
              </li>
            ))}
          </ul>
          {sub.orders.length > 0 && (
            <div className="mt-5">
              <p className="text-xs text-muted-foreground uppercase">Box orders</p>
              <ul className="mt-2 grid gap-1.5">
                {sub.orders.slice(0, 6).map((o) => (
                  <li key={o.number} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <Link to={`/order/${o.number}`} className="inline-flex min-h-11 items-center font-mono tabular-nums underline-offset-4 hover:text-gold-ink hover:underline">
                      {o.number}
                    </Link>
                    <span className="text-muted-foreground">{date(o.createdAt)}</span>
                    <OrderStatusPill status={o.status} />
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <dl className="grid content-start gap-4 rounded-md bg-surface/60 p-4">
          <div>
            <dt className="text-xs text-muted-foreground uppercase">Monthly price</dt>
            <dd className="mt-0.5 font-mono text-2xl font-medium tabular-nums">{moneyExact(sub.priceCents)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground uppercase">Commitment</dt>
            <dd className="mt-0.5 text-sm">
              <span className="font-mono tabular-nums">{sub.boxesShipped}</span> of <span className="font-mono tabular-nums">{sub.commitMonths}</span> boxes shipped
              {sub.boxesShipped < sub.commitMonths && live && (
                <span className="block text-xs text-muted-foreground">
                  {plural(sub.commitMonths - sub.boxesShipped, 'box', 'boxes')} left in your minimum term
                </span>
              )}
            </dd>
          </div>
          {live && (
            <div>
              <dt className="text-xs text-muted-foreground uppercase">Next box ships</dt>
              <dd className="mt-0.5 flex items-center gap-1.5 text-sm">
                <CalendarBlankIcon className="size-4 text-gold-ink" aria-hidden />
                {date(sub.nextShipAt)}
              </dd>
            </div>
          )}
          {live && (
            <div className="grid gap-2 border-t pt-4">
              <Button variant="outline" className="h-11" onClick={() => setOpen(true)} disabled={cancel.isPending}>
                {cancel.isPending && <CircleNotchIcon className="animate-spin" />}
                Cancel box
              </Button>
              {error && <FieldError>{error}</FieldError>}
            </div>
          )}
        </dl>
      </div>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this box?</AlertDialogTitle>
            <AlertDialogDescription>
              Boxes have a {sub.commitMonths}-month minimum. If you have reached it, no further boxes will ship and you will not be charged again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Keep my box</AlertDialogCancel>
            <Button variant="destructive" className="h-11" disabled={cancel.isPending} onClick={() => cancel.mutate()}>
              {cancel.isPending && <CircleNotchIcon className="animate-spin" />}
              Cancel box
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  )
}
