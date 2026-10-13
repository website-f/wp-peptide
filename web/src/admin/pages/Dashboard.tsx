import {
  ArrowRightIcon,
  ChatCircleTextIcon,
  CheckCircleIcon,
  ClockIcon,
  CurrencyCircleDollarIcon,
  HandshakeIcon,
  PackageIcon,
  ReceiptIcon,
  ShoppingCartIcon,
  TruckIcon,
  UserPlusIcon,
  WalletIcon,
  WarningIcon,
} from '@phosphor-icons/react'
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { toast } from 'sonner'
import { EmptyState } from '@/components/brand/bits'
import { ProductImage } from '@/components/brand/ProductImage'
import { Button } from '@/components/ui/button'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { api, errorMessage } from '@/lib/api'
import { currencySymbol, money, moneyExact, num, relative } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ErrorState, Kpi, Num, OrderStatusBadge, PageHeader, Panel, Pill, Segmented } from '../components/kit'
import type { DashboardData } from '../lib/types'
import { KIND_LABEL, useInvalidateAdmin } from '../lib/utils'

const RANGES = [
  { value: '7', label: '7 days' },
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
] as const
type Range = (typeof RANGES)[number]['value']

const chartConfig = { revenueCents: { label: 'Revenue', color: 'var(--chart-1)' } } satisfies ChartConfig

const shortDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

function axisMoney(cents: number) {
  const v = cents / 100
  if (Math.abs(v) >= 1000) return `${currencySymbol()}${Math.round(v / 1000)}k`
  return `${currencySymbol()}${Math.round(v)}`
}

export default function Dashboard() {
  const [days, setDays] = useState<Range>('30')
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin', 'dashboard', Number(days)],
    queryFn: () => api.get<DashboardData>('/api/admin/dashboard', { days }),
    placeholderData: keepPreviousData,
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Sales at a glance, plus everything that needs your attention today."
        actions={<Segmented value={days} onChange={setDays} options={RANGES.map((r) => ({ ...r }))} />}
      />

      {error && !data ? (
        <ErrorState error={error} onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <DashboardSkeleton />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <Kpi
              icon={<CurrencyCircleDollarIcon />}
              label="Revenue"
              value={money(data.kpis.revenueCents, { whole: true })}
              delta={data.kpis.revenueDelta}
              info={`Money collected from paid orders in the last ${days} days, including shipping. Compared with the ${days} days before.`}
            />
            <Kpi
              icon={<ReceiptIcon />}
              label="Paid orders"
              value={num(data.kpis.orders)}
              delta={data.kpis.ordersDelta}
              info="Orders that were paid in this period. Unpaid and cancelled orders are not counted."
            />
            <Kpi
              icon={<ShoppingCartIcon />}
              label="Average order"
              value={money(data.kpis.aovCents)}
              delta={data.kpis.aovDelta}
              info="Average order value: revenue divided by the number of paid orders."
            />
            <Kpi
              icon={<UserPlusIcon />}
              label="New customers"
              value={num(data.kpis.newCustomers)}
              delta={data.kpis.customersDelta}
              sub={`${num(data.kpis.totalCustomers)} total`}
              info="Customer accounts created in this period."
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <Panel
              className="lg:col-span-2"
              title="Revenue"
              description={`Daily paid revenue, last ${days} days`}
              action={
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/admin/finance">
                    Finance <ArrowRightIcon />
                  </Link>
                </Button>
              }
            >
              <RevenueChart series={data.series} />
            </Panel>
            <AttentionQueue data={data} />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <RecentOrders data={data} />
            <TopProducts data={data} days={days} />
          </div>

          <LowStock data={data} />
        </>
      )}
    </div>
  )
}

function RevenueChart({ series }: { series: DashboardData['series'] }) {
  const total = series.reduce((a, s) => a + s.revenueCents, 0)
  if (total === 0) {
    return <p className="grid h-72 place-items-center text-sm text-muted-foreground">No paid orders in this period yet.</p>
  }
  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-72 w-full">
      <AreaChart data={series} margin={{ left: 4, right: 8, top: 8 }}>
        <defs>
          <linearGradient id="dash-rev" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-revenueCents)" stopOpacity={0.35} />
            <stop offset="100%" stopColor="var(--color-revenueCents)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} tickFormatter={shortDay} />
        <YAxis tickLine={false} axisLine={false} width={52} tickFormatter={axisMoney} />
        <ChartTooltip
          cursor={{ strokeDasharray: '3 3' }}
          content={({ active, payload, label }) => {
            if (!active || !payload?.length) return null
            const row = payload[0].payload as DashboardData['series'][number]
            return (
              <div className="grid min-w-36 gap-1 rounded-md border bg-popover px-2.5 py-2 text-xs shadow-lg">
                <p className="font-medium">{shortDay(String(label))}</p>
                <p className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Revenue</span>
                  <Num>{money(row.revenueCents)}</Num>
                </p>
                <p className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Orders</span>
                  <Num>{row.orders}</Num>
                </p>
              </div>
            )
          }}
        />
        <Area dataKey="revenueCents" type="monotone" stroke="var(--color-revenueCents)" strokeWidth={2} fill="url(#dash-rev)" />
      </AreaChart>
    </ChartContainer>
  )
}

function AttentionQueue({ data }: { data: DashboardData }) {
  const q = data.queue
  const items: { to: string; icon: ReactNode; label: string; hint: string; count: number; extra?: string; urgent?: boolean }[] = [
    { to: '/admin/orders?status=OPEN', icon: <PackageIcon />, label: 'To fulfil', hint: 'Paid orders to pack and ship', count: q.toFulfil, urgent: true },
    {
      to: '/admin/orders?status=PENDING_PAYMENT',
      icon: <ClockIcon />,
      label: 'Awaiting payment',
      hint: 'Placed but not paid yet',
      count: q.awaitingPayment,
    },
    { to: '/admin/orders?status=SHIPPED', icon: <TruckIcon />, label: 'In transit', hint: 'Shipped, not yet delivered', count: q.inTransit },
    {
      to: '/admin/partners?tab=applications',
      icon: <HandshakeIcon />,
      label: 'Partner applications',
      hint: 'Waiting for your approval',
      count: q.partnerApplications,
      urgent: true,
    },
    {
      to: '/admin/partners?tab=payouts',
      icon: <WalletIcon />,
      label: 'Payout requests',
      hint: 'Partners asking to be paid',
      count: q.payoutRequests,
      extra: q.payoutRequests ? money(q.payoutRequestedCents) : undefined,
      urgent: true,
    },
    { to: '/admin/inbox', icon: <ChatCircleTextIcon />, label: 'Unread messages', hint: 'From the contact form', count: q.unreadMessages, urgent: true },
  ]
  const clear = items.every((i) => i.count === 0)
  return (
    <Panel title="Needs attention" flush>
      {clear ? (
        <div className="flex flex-col items-center px-6 py-12 text-center">
          <CheckCircleIcon className="size-8 text-success" weight="fill" />
          <p className="mt-2 font-medium">All caught up</p>
          <p className="text-sm text-muted-foreground">Nothing is waiting on you right now.</p>
        </div>
      ) : (
        <ul className="divide-y">
          {items.map((i) => (
            <li key={i.label}>
              <Link to={i.to} className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50">
                <span
                  className={cn(
                    'grid size-8 shrink-0 place-items-center rounded-md [&_svg]:size-4',
                    i.count > 0 && i.urgent ? 'bg-gold/12 text-gold-ink' : 'bg-muted text-muted-foreground',
                  )}
                >
                  {i.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{i.label}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {i.hint}
                    {i.extra && (
                      <>
                        : <Num className="text-foreground">{i.extra}</Num>
                      </>
                    )}
                  </span>
                </span>
                <Num className={cn('text-lg font-medium', i.count === 0 && 'text-muted-foreground/60')}>{i.count}</Num>
                <ArrowRightIcon className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function RecentOrders({ data }: { data: DashboardData }) {
  const navigate = useNavigate()
  return (
    <Panel
      className="lg:col-span-2"
      title="Recent orders"
      flush
      action={
        <Button variant="ghost" size="sm" asChild>
          <Link to="/admin/orders">
            All orders <ArrowRightIcon />
          </Link>
        </Button>
      }
    >
      {data.recentOrders.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">No orders yet.</p>
      ) : (
        <ul className="divide-y">
          {data.recentOrders.map((o) => (
            <li
              key={o.id}
              onClick={() => navigate(`/admin/orders/${o.id}`)}
              className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Link to={`/admin/orders/${o.id}`} className="font-mono text-sm font-medium tabular-nums hover:text-gold-ink" onClick={(e) => e.stopPropagation()}>
                    {o.number}
                  </Link>
                  <OrderStatusBadge status={o.status} />
                  {o.kind !== 'STANDARD' && <Pill dot={false}>{KIND_LABEL[o.kind]}</Pill>}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {o.name} · {relative(o.createdAt)}
                </p>
              </div>
              <Num className="text-sm font-medium">{moneyExact(o.totalCents)}</Num>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function TopProducts({ data, days }: { data: DashboardData; days: string }) {
  const max = Math.max(1, ...data.topProducts.map((p) => p.revenueCents))
  return (
    <Panel title="Top products" description={`By revenue, last ${days} days`} flush>
      {data.topProducts.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">No sales in this period.</p>
      ) : (
        <ul className="divide-y">
          {data.topProducts.map((p, i) => (
            <li key={p.id ?? i}>
              <Link to={p.id ? `/admin/products/${p.id}` : '/admin/products'} className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/50">
                <ProductImage src={p.image} alt="" sizes="40px" className="size-10 shrink-0 rounded-md" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-sm font-medium">{p.name ?? 'Removed product'}</span>
                    <Num className="text-sm">{money(p.revenueCents, { whole: true })}</Num>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-gold" style={{ width: `${(p.revenueCents / max) * 100}%` }} />
                    </div>
                    <Num className="w-14 text-right text-[11px] text-muted-foreground">{num(p.units)} units</Num>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function LowStock({ data }: { data: DashboardData }) {
  return (
    <Panel
      title="Low stock"
      description="Active sizes with 5 or fewer units left. Update the count after a restock."
      flush
      action={
        <Button variant="ghost" size="sm" asChild>
          <Link to="/admin/products">
            Products <ArrowRightIcon />
          </Link>
        </Button>
      }
    >
      {data.lowStock.length === 0 ? (
        <div className="p-4">
          <EmptyState icon={<PackageIcon />} title="Stock looks healthy" body="Every live product has more than 5 units of each size." />
        </div>
      ) : (
        <ul className="grid divide-y md:grid-cols-2 md:divide-y-0 md:[&>li]:border-b md:[&>li:nth-child(odd)]:border-r md:[&>li:last-child:nth-child(odd)]:border-r-0">
          {data.lowStock.map((v) => (
            <StockRow key={v.variantId} row={v} />
          ))}
        </ul>
      )}
    </Panel>
  )
}

function StockRow({ row }: { row: DashboardData['lowStock'][number] }) {
  const [value, setValue] = useState(String(row.stock))
  const invalidate = useInvalidateAdmin()
  const save = useMutation({
    mutationFn: (stock: number) => api.patch(`/api/admin/variants/${row.variantId}/stock`, { stock }),
    onSuccess: (_d, stock) => {
      toast.success(`${row.product.name} ${row.label}: stock set to ${stock}`)
      invalidate()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const n = Number(value)
  const valid = value !== '' && Number.isInteger(n) && n >= 0
  const changed = valid && n !== row.stock
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <ProductImage src={row.product.image} alt="" sizes="40px" className="size-10 shrink-0 rounded-md" />
      <div className="min-w-0 flex-1">
        <Link to={`/admin/products/${row.product.id}`} className="block truncate text-sm font-medium hover:text-gold-ink">
          {row.product.name}
        </Link>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span>{row.label}</span>
          {row.stock === 0 ? (
            <Pill tone="destructive">Sold out</Pill>
          ) : (
            <span className="inline-flex items-center gap-1 text-[color-mix(in_oklch,var(--warning),var(--foreground)_30%)]">
              <WarningIcon className="size-3" /> <Num>{row.stock}</Num> left
            </span>
          )}
        </p>
      </div>
      <form
        className="flex items-center gap-1.5"
        onSubmit={(e) => {
          e.preventDefault()
          if (changed) save.mutate(n)
        }}
      >
        <label className="sr-only" htmlFor={`stock-${row.variantId}`}>
          Stock for {row.product.name} {row.label}
        </label>
        <Input
          id={`stock-${row.variantId}`}
          type="number"
          min={0}
          inputMode="numeric"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-invalid={!valid}
          className="h-8 w-20 text-right font-mono tabular-nums"
        />
        <Button type="submit" size="sm" variant={changed ? 'default' : 'outline'} disabled={!changed || save.isPending}>
          {save.isPending ? 'Saving' : 'Save'}
        </Button>
      </form>
    </li>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-4">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="mt-3 h-7 w-28" />
            <Skeleton className="mt-2 h-3 w-24" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-80 rounded-xl lg:col-span-2" />
        <Skeleton className="h-80 rounded-xl" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Skeleton className="h-96 rounded-xl lg:col-span-2" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    </div>
  )
}
