import { ArrowRightIcon, CreditCardIcon, PackageIcon, TruckIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { ProductImage } from '@/components/brand/ProductImage'
import { EmptyState } from '@/components/brand/bits'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { date, moneyExact, plural } from '@/lib/format'
import type { OrderKind, OrderStatus } from '@/lib/types'
import { ErrorState, OrderStatusPill } from './bits'

export interface AccountOrder {
  number: string
  kind: OrderKind
  status: OrderStatus
  totalCents: number
  createdAt: string
  trackingNumber: string | null
  carrier: string | null
  items: { name: string; variantLabel: string; quantity: number; image: string | null }[]
}

const KIND_LABEL: Partial<Record<OrderKind, string>> = { BOX: 'Build a Box', WHOLESALE: 'Bulk order', MEMBERSHIP: 'Membership' }

export function useAccountOrders() {
  return useQuery({ queryKey: ['account', 'orders'], queryFn: () => api.get<AccountOrder[]>('/api/account/orders') })
}

function summary(items: AccountOrder['items']) {
  if (!items.length) return 'No items'
  const [first, ...rest] = items
  const head = `${first.name} ${first.variantLabel} x${first.quantity}`
  return rest.length ? `${head}, plus ${plural(rest.length, 'more item')}` : head
}

export function AccountOrders() {
  const q = useAccountOrders()

  if (q.isPending)
    return (
      <div className="grid gap-3" aria-busy aria-label="Loading orders">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-40 rounded-xl sm:h-28" />
        ))}
      </div>
    )
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} title="Could not load your orders" />
  if (!q.data.length)
    return (
      <EmptyState
        icon={<PackageIcon />}
        title="No orders yet"
        body="When you place an order it shows up here with live status and tracking."
        action={
          <Button asChild className="h-11">
            <Link to="/shop">Browse compounds</Link>
          </Button>
        }
      />
    )

  return (
    <div>
      <p className="mb-4 text-sm text-muted-foreground">{plural(q.data.length, 'order')}, newest first.</p>
      <ul className="grid grid-cols-1 gap-3">
        {q.data.map((o) => {
          const unpaid = o.status === 'PENDING_PAYMENT'
          const units = o.items.reduce((a, i) => a + i.quantity, 0)
          return (
            <li key={o.number} className="rounded-xl border bg-card p-4 transition-colors hover:border-gold/30 sm:p-5">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <Link to={`/order/${o.number}`} className="font-mono text-base font-medium tabular-nums underline-offset-4 hover:text-gold-ink hover:underline">
                  {o.number}
                </Link>
                <span className="text-sm text-muted-foreground">{date(o.createdAt)}</span>
                {KIND_LABEL[o.kind] && <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">{KIND_LABEL[o.kind]}</span>}
                <span className="ml-auto">
                  <OrderStatusPill status={o.status} />
                </span>
              </div>

              <div className="mt-4 flex items-center gap-3">
                <div className="flex shrink-0 -space-x-3">
                  {o.items.slice(0, 3).map((it, i) => (
                    <ProductImage key={i} src={it.image} alt="" sizes="48px" className="size-12 rounded-md border-2 border-card" />
                  ))}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm">{summary(o.items)}</p>
                  <p className="text-xs text-muted-foreground">{plural(units, 'unit')}</p>
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center">
                <div className="flex items-baseline gap-2">
                  <span className="text-xs text-muted-foreground uppercase">Total</span>
                  <span className="font-mono text-lg font-medium tabular-nums">{moneyExact(o.totalCents)}</span>
                </div>
                {o.trackingNumber && (
                  <p className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground sm:ml-4">
                    <TruckIcon className="size-4 shrink-0 text-gold-ink" aria-hidden />
                    <span className="truncate">
                      {o.carrier ? `${o.carrier}: ` : 'Tracking: '}
                      <span className="font-mono text-foreground tabular-nums select-all">{o.trackingNumber}</span>
                    </span>
                  </p>
                )}
                <div className="sm:ml-auto">
                  {unpaid ? (
                    <Button asChild className="h-11 w-full sm:w-auto">
                      <Link to={`/order/${o.number}`}>
                        <CreditCardIcon /> Pay now
                      </Link>
                    </Button>
                  ) : (
                    <Button asChild variant="outline" className="h-11 w-full sm:w-auto">
                      <Link to={`/order/${o.number}`}>
                        View order <ArrowRightIcon />
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
