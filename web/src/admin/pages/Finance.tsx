import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ChartBarIcon, DownloadSimpleIcon, PackageIcon } from '@phosphor-icons/react'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from 'recharts'
import { EmptyState } from '@/components/brand/bits'
import { Button } from '@/components/ui/button'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/lib/api'
import { date, money, moneyExact, num } from '@/lib/format'
import { cn } from '@/lib/utils'
import { DefRow, ErrorState, InfoTip, Kpi, Num, PageHeader, Panel, Segmented, TextInput } from '../components/kit'
import type { FinanceData, OrderKind } from '../lib/types'
import { useAdminSettings, useLicensed } from '../lib/queries'
import { isoDay, kindLabel, paymentLabel } from '../lib/utils'

type Preset = 'month' | 'lastMonth' | '30' | '90' | 'year' | 'custom'

const PRESETS: { value: Preset; label: string }[] = [
  { value: 'month', label: 'This month' },
  { value: 'lastMonth', label: 'Last month' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 90 days' },
  { value: 'year', label: 'This year' },
  { value: 'custom', label: 'Custom' },
]

function presetRange(p: Exclude<Preset, 'custom'>): { from: string; to: string } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()
  const daysAgo = (n: number) => new Date(y, m, now.getDate() - n)
  switch (p) {
    case 'month':
      return { from: isoDay(new Date(y, m, 1)), to: isoDay(now) }
    case 'lastMonth':
      return { from: isoDay(new Date(y, m - 1, 1)), to: isoDay(new Date(y, m, 0)) }
    case '30':
      return { from: isoDay(daysAgo(29)), to: isoDay(now) }
    case '90':
      return { from: isoDay(daysAgo(89)), to: isoDay(now) }
    case 'year':
      return { from: isoDay(new Date(y, 0, 1)), to: isoDay(now) }
  }
}

/** "RM12.3k" style label for chart axes. Input is cents. */
function compactMoney(cents: number) {
  const v = cents / 100
  const body = new Intl.NumberFormat('en-MY', { notation: 'compact', maximumFractionDigits: 1 }).format(Math.abs(v))
  return `${v < 0 ? '-' : ''}RM${body}`
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function periodLabel(period: string, by: 'day' | 'month', long = false) {
  const [y, mo, d] = period.split('-').map(Number)
  if (by === 'month') return long ? `${MONTHS[mo - 1]} ${y}` : `${MONTHS[mo - 1]} ${String(y).slice(2)}`
  return long ? `${d} ${MONTHS[mo - 1]} ${y}` : `${d} ${MONTHS[mo - 1]}`
}

const chartConfig = {
  revenueCents: { label: 'Collected', color: 'var(--chart-1)' },
  profitCents: { label: 'Profit', color: 'var(--success)' },
  refundsCents: { label: 'Refunds', color: 'var(--destructive)' },
} satisfies ChartConfig

export default function Finance() {
  const [preset, setPreset] = useState<Preset>('month')
  const [custom, setCustom] = useState(() => presetRange('30'))

  const customError =
    preset === 'custom' && (!custom.from || !custom.to)
      ? 'Pick both dates'
      : preset === 'custom' && custom.from > custom.to
        ? 'The start date must be on or before the end date'
        : null
  const range = preset === 'custom' ? custom : presetRange(preset)

  const q = useQuery({
    queryKey: ['admin', 'finance', range.from, range.to],
    queryFn: () => api.get<FinanceData>('/api/admin/finance', { from: range.from, to: range.to }),
    placeholderData: keepPreviousData,
    enabled: !customError,
  })

  const exportHref = `/api/admin/finance/export.csv?from=${range.from}&to=${range.to}`

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finance"
        description="Sales, costs and profit for the period you pick. Orders count on the day they were paid; refunds count on the day they were refunded."
        actions={
          customError ? (
            <Button variant="outline" disabled>
              <DownloadSimpleIcon />
              Export CSV
            </Button>
          ) : (
            <Button asChild variant="outline">
              <a href={exportHref} target="_blank" rel="noreferrer" title="Downloads every order created in this date range, any status">
                <DownloadSimpleIcon />
                Export CSV
              </a>
            </Button>
          )
        }
      />

      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <Segmented value={preset} onChange={setPreset} options={PRESETS} />
          {preset === 'custom' ? (
            <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:flex">
              <label className="sr-only" htmlFor="fin-from">
                From
              </label>
              <TextInput
                id="fin-from"
                type="date"
                value={custom.from}
                max={custom.to || undefined}
                onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))}
                className="w-full min-w-0 font-mono sm:w-40"
              />
              <span className="text-sm text-muted-foreground">to</span>
              <label className="sr-only" htmlFor="fin-to">
                To
              </label>
              <TextInput
                id="fin-to"
                type="date"
                value={custom.to}
                min={custom.from || undefined}
                onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))}
                className="w-full min-w-0 font-mono sm:w-40"
              />
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              <Num>{date(range.from)}</Num> to <Num>{date(range.to)}</Num>
            </p>
          )}
        </div>
        {customError ? (
          <p className="text-xs text-destructive" role="alert">
            {customError}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Export CSV downloads every order created in this range, whatever its status, one row per order.</p>
        )}
      </div>

      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : !q.data ? (
        <FinanceSkeleton />
      ) : (
        <div className={cn('space-y-6 transition-opacity', q.isFetching && q.isPlaceholderData && 'opacity-60')}>
          <FinanceBody data={q.data} />
        </div>
      )}
    </div>
  )
}

function FinanceBody({ data }: { data: FinanceData }) {
  const licensed = useLicensed()
  const pointValue = useAdminSettings().data?.settings.points.valueCentsPer100
  const s = data.summary
  const discounts = s.tierDiscountCents + s.couponDiscountCents + s.pointsDiscountCents
  const keptNetSales = s.grossProfitCents + s.cogsCents
  const hasActivity = s.orders > 0 || s.refundsCents > 0

  return (
    <>
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        <Kpi
          label="Gross sales"
          value={money(s.grossSalesCents)}
          sub={`${num(s.orders)} paid ${s.orders === 1 ? 'order' : 'orders'}`}
          info="Full price of everything sold, before any discounts, shipping or tax."
        />
        <div className="min-w-0 rounded-xl border bg-card p-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <span className="truncate">Discounts</span>
            <InfoTip>Everything taken off the full price: automatic pricing (quantity discounts, bulk and Build a Box), coupon and partner codes, and points customers redeemed.</InfoTip>
          </div>
          <div className="mt-2 truncate font-mono text-2xl font-medium tracking-tight tabular-nums">{money(discounts)}</div>
          <dl className="mt-1.5 grid gap-0.5 text-xs text-muted-foreground">
            <SplitRow label="Volume" cents={s.tierDiscountCents} />
            <SplitRow label="Coupons" cents={s.couponDiscountCents} />
            <SplitRow label="Points" cents={s.pointsDiscountCents} />
          </dl>
        </div>
        <Kpi label="Net sales" value={money(s.netSalesCents)} info="Gross sales minus all discounts. What the products sold for, before shipping and tax." />
        <Kpi label="Shipping collected" value={money(s.shippingCents)} info="Shipping fees customers paid on these orders." />
        <Kpi
          label="Refunds"
          value={money(s.refundsCents)}
          info="Total of orders marked refunded during this period, including orders that were paid earlier."
        />
        <Kpi
          label="Net revenue"
          value={money(s.netRevenueCents)}
          info="Everything customers paid in this period (products, shipping and tax) minus refunds made in this period."
        />
        <Kpi
          label="COGS"
          value={money(s.cogsCents)}
          info="Cost of goods sold: what the products in these orders cost you, using the cost price on each size. Cancelled and refunded orders are left out."
        />
        <Kpi
          label="Gross profit"
          value={money(s.grossProfitCents)}
          info="Net sales minus COGS, counting only orders that were not cancelled or refunded. Shipping and tax are not included."
        />
        <Kpi
          label="Partner commissions"
          value={money(s.commissionsCents)}
          info="Commission earned by partners on orders in this period that were not cancelled or refunded, whether or not it has been paid out yet."
        />
        <Kpi
          label="Net profit"
          emphasis
          value={money(s.netProfitCents)}
          sub={
            <span>
              <Num className={marginTone(s.marginPct)}>{s.marginPct.toFixed(1)}%</Num> margin
            </span>
          }
          info="Gross profit minus partner commissions. Margin is net profit as a share of net sales on orders that were not cancelled or refunded."
        />
      </div>

      <Panel
        title="Over time"
        description={data.range.by === 'day' ? 'Per day' : 'Per month'}
        info="Collected is what customers paid on the day the order was paid. Profit is net sales minus cost and partner commission on orders that are still kept. Refunds show on the day they were made."
      >
        {hasActivity ? <FinanceChart data={data} /> : <EmptyState icon={<ChartBarIcon />} title="No sales yet" body="Nothing was paid or refunded in this period. Try a wider date range." />}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <ProfitAndLoss s={data.summary} keptNetSales={keptNetSales} />
        <div className="space-y-6">
          <Panel title="Liabilities" description="Money you still owe or have promised" flush>
            <dl className="divide-y px-4 py-1">
              <DefRow label="Commissions owed" info="Partner commissions not paid out yet (pending and approved), across all time. Pending ones become approved when the order is delivered.">
                <Num>{moneyExact(s.commissionsOwedCents)}</Num>
              </DefRow>
              <DefRow label="Points liability" info={`Points customers hold right now that they can redeem as discounts.${pointValue === undefined ? '' : ` 100 points are worth ${money(pointValue)} (set in Settings).`}`}>
                <Num>{moneyExact(s.pointsLiabilityCents)}</Num>
              </DefRow>
              <DefRow label="Payouts paid in period" info="Commission payouts you marked as paid during this period.">
                <Num>{moneyExact(s.payoutsPaidCents)}</Num>
              </DefRow>
            </dl>
            <div className="border-t px-4 py-2.5 text-xs">
              <Link to="/admin/partners" className="text-gold-ink hover:underline">
                Manage partner payouts
              </Link>
            </div>
          </Panel>
          <ShareList
            title="By order type"
            rows={data.byKind.map((r) => ({ ...r, label: kindLabel(r.key as OrderKind, licensed.membership) }))}
            info="Collected amount and order count by kind of order. Includes orders later cancelled or refunded."
          />
          <ShareList
            title="By payment method"
            rows={data.byPaymentMethod.map((r) => ({ ...r, label: paymentLabel(r.key) }))}
            info="How customers paid. Includes orders later cancelled or refunded."
          />
        </div>
      </div>

      <ProductTable rows={data.products} />
    </>
  )
}

function SplitRow({ label, cents }: { label: string; cents: number }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt>{label}</dt>
      <dd>
        <Num>{money(cents)}</Num>
      </dd>
    </div>
  )
}

function marginTone(pct: number) {
  if (pct < 0) return 'text-destructive'
  if (pct < 20) return 'text-warning'
  if (pct >= 40) return 'text-success'
  return 'text-foreground'
}

function FinanceChart({ data }: { data: FinanceData }) {
  const by = data.range.by
  return (
    <ChartContainer config={chartConfig} className="aspect-auto h-72 w-full">
      <ComposedChart data={data.series} margin={{ left: 4, right: 8, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="period"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          tickFormatter={(v: string) => periodLabel(v, by)}
        />
        <YAxis tickLine={false} axisLine={false} width={64} tickFormatter={(v: number) => compactMoney(v)} />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const p = payload?.[0]?.payload as FinanceData['series'][number] | undefined
                return p ? `${periodLabel(p.period, by, true)} · ${num(p.orders)} ${p.orders === 1 ? 'order' : 'orders'}` : ''
              }}
              formatter={(value, name, item) => (
                <div className="flex w-full items-center gap-2">
                  <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: item.color }} />
                  <span className="text-muted-foreground">{chartConfig[name as keyof typeof chartConfig]?.label ?? name}</span>
                  <span className="ml-auto pl-3 font-mono font-medium text-foreground tabular-nums">{moneyExact(Number(value))}</span>
                </div>
              )}
            />
          }
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="revenueCents" fill="var(--color-revenueCents)" radius={[3, 3, 0, 0]} maxBarSize={28} />
        <Bar dataKey="refundsCents" fill="var(--color-refundsCents)" radius={[3, 3, 0, 0]} maxBarSize={28} />
        <Line dataKey="profitCents" type="monotone" stroke="var(--color-profitCents)" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ChartContainer>
  )
}

type PlRow =
  | { kind: 'line'; label: string; cents: number; sign?: '-' | '+'; info?: string }
  | { kind: 'total'; label: string; cents: number; info?: string; extra?: ReactNode }

function ProfitAndLoss({ s, keptNetSales }: { s: FinanceData['summary']; keptNetSales: number }) {
  const sales: PlRow[] = [
    { kind: 'line', label: 'Gross sales', cents: s.grossSalesCents, info: 'Full list price of the products sold.' },
    { kind: 'line', label: 'Volume discounts', sign: '-', cents: s.tierDiscountCents, info: 'Quantity discounts, bulk order and Build a Box pricing.' },
    { kind: 'line', label: 'Coupon and partner code discounts', sign: '-', cents: s.couponDiscountCents },
    { kind: 'line', label: 'Points redeemed', sign: '-', cents: s.pointsDiscountCents },
    { kind: 'total', label: 'Net sales', cents: s.netSalesCents },
    { kind: 'line', label: 'Shipping collected', sign: '+', cents: s.shippingCents },
    { kind: 'line', label: 'Tax', sign: '+', cents: s.taxCents },
    { kind: 'total', label: 'Collected', cents: s.collectedCents, info: 'The total customers paid on these orders.' },
    { kind: 'line', label: 'Refunds', sign: '-', cents: s.refundsCents, info: 'Refunds made in this period, even for orders paid earlier.' },
    { kind: 'total', label: 'Net revenue', cents: s.netRevenueCents },
  ]
  const profit: PlRow[] = [
    {
      kind: 'line',
      label: 'Net sales of kept orders',
      cents: keptNetSales,
      info: 'Net sales from orders paid in this period that were not cancelled or refunded.',
    },
    { kind: 'line', label: 'Cost of goods sold', sign: '-', cents: s.cogsCents, info: 'What the products cost you, using the cost price on each size.' },
    { kind: 'total', label: 'Gross profit', cents: s.grossProfitCents },
    { kind: 'line', label: 'Partner commissions', sign: '-', cents: s.commissionsCents },
    {
      kind: 'total',
      label: 'Net profit',
      cents: s.netProfitCents,
      extra: <Num className={cn('hidden text-xs sm:inline', marginTone(s.marginPct))}>{s.marginPct.toFixed(1)}% margin</Num>,
    },
  ]
  const excluded = s.netSalesCents - keptNetSales

  return (
    <Panel title="Profit and loss" description="How the numbers above add up" flush>
      <PlSection heading="Sales" note="All orders paid in this period, including ones later cancelled or refunded." rows={sales} />
      <PlSection
        heading="Profit"
        note={
          excluded > 0
            ? `Only orders that are still kept. ${money(excluded)} of net sales from cancelled or refunded orders is left out. Shipping and tax are not counted as profit.`
            : 'Only orders that are still kept (not cancelled or refunded). Shipping and tax are not counted as profit.'
        }
        rows={profit}
        className="border-t"
      />
    </Panel>
  )
}

function PlSection({ heading, note, rows, className }: { heading: string; note: string; rows: PlRow[]; className?: string }) {
  return (
    <div className={cn('px-4 py-3', className)}>
      <p className="font-display text-sm font-semibold tracking-wide uppercase">{heading}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>
      <div className="mt-2">
        {rows.map((r) =>
          r.kind === 'total' ? (
            <div key={r.label} className="flex items-center justify-between gap-3 border-t py-2 text-sm font-medium">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="w-11 shrink-0 text-xs font-normal text-muted-foreground">equals</span>
                {r.label}
                {r.info && <InfoTip>{r.info}</InfoTip>}
              </span>
              <span className="flex shrink-0 items-center gap-2">
                {r.extra}
                <Num>{moneyExact(r.cents)}</Num>
              </span>
            </div>
          ) : (
            <div key={r.label} className="flex items-center justify-between gap-3 py-1.5 text-sm">
              <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                <span className="w-11 shrink-0 text-xs">{r.sign === '-' ? 'less' : r.sign === '+' ? 'plus' : ''}</span>
                <span className={cn('min-w-0', !r.sign && 'text-foreground')}>{r.label}</span>
                {r.info && <InfoTip>{r.info}</InfoTip>}
              </span>
              <Num className={cn('shrink-0', r.sign === '-' && r.cents > 0 && 'text-muted-foreground')}>
                {r.sign === '-' && r.cents > 0 ? `-${moneyExact(r.cents)}` : moneyExact(r.cents)}
              </Num>
            </div>
          ),
        )}
      </div>
    </div>
  )
}

function ShareList({ title, rows, info }: { title: string; rows: { key: string; label: string; orders: number; revenueCents: number }[]; info: string }) {
  const total = rows.reduce((a, r) => a + r.revenueCents, 0)
  return (
    <Panel title={title} info={info}>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No paid orders in this period.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const share = total > 0 ? (r.revenueCents / total) * 100 : 0
            return (
              <li key={r.key} className="min-w-0">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">{r.label}</span>
                  <span className="shrink-0 text-right">
                    <Num>{money(r.revenueCents)}</Num>
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-gold" style={{ width: `${Math.max(share, share > 0 ? 2 : 0)}%` }} />
                  </div>
                  <Num className="w-12 shrink-0 text-right text-xs text-muted-foreground">{share.toFixed(0)}%</Num>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  <Num>{num(r.orders)}</Num> {r.orders === 1 ? 'order' : 'orders'}
                </p>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

function ProductTable({ rows }: { rows: FinanceData['products'] }) {
  const [all, setAll] = useState(false)
  const shown = useMemo(() => (all ? rows : rows.slice(0, 10)), [rows, all])
  return (
    <Panel
      title="Product profitability"
      info="Revenue here is the product price after volume discounts, before coupons and points. Only orders that are paid and not cancelled or refunded are counted. Cost uses the cost price saved on each size at the time of the order."
      description="Which products make you the most money"
      flush
    >
      {rows.length === 0 ? (
        <div className="p-4">
          <EmptyState icon={<PackageIcon />} title="No products sold" body="Product profit shows up here once orders are paid in this period." />
        </div>
      ) : (
        <>
          <div className="divide-y md:hidden">
            {shown.map((p) => {
              const profit = p.revenueCents - p.costCents
              return (
                <div key={p.productId} className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <Link to={`/admin/products/${p.productId}`} className="min-w-0 truncate font-medium hover:underline">
                      {p.name}
                    </Link>
                    <Num className={cn('shrink-0 text-sm', marginTone(p.marginPct))}>{p.marginPct.toFixed(1)}%</Num>
                  </div>
                  <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                    <span>
                      Units <Num className="text-foreground">{num(p.units)}</Num>
                    </span>
                    <span className="text-right">
                      Revenue <Num className="text-foreground">{money(p.revenueCents)}</Num>
                    </span>
                    <span>
                      Cost <Num className="text-foreground">{money(p.costCents)}</Num>
                    </span>
                    <span className="text-right">
                      Profit <Num className="text-foreground">{money(profit)}</Num>
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4 text-xs font-medium text-muted-foreground">Product</TableHead>
                  <TableHead className="text-right text-xs font-medium text-muted-foreground">Units</TableHead>
                  <TableHead className="text-right text-xs font-medium text-muted-foreground">Revenue</TableHead>
                  <TableHead className="text-right text-xs font-medium text-muted-foreground">Cost</TableHead>
                  <TableHead className="text-right text-xs font-medium text-muted-foreground">Profit</TableHead>
                  <TableHead className="pr-4 text-right text-xs font-medium text-muted-foreground">Margin</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((p) => (
                  <TableRow key={p.productId}>
                    <TableCell className="max-w-72 pl-4">
                      <Link to={`/admin/products/${p.productId}`} className="block truncate font-medium hover:underline">
                        {p.name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right">
                      <Num>{num(p.units)}</Num>
                    </TableCell>
                    <TableCell className="text-right">
                      <Num>{moneyExact(p.revenueCents)}</Num>
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      <Num>{moneyExact(p.costCents)}</Num>
                    </TableCell>
                    <TableCell className="text-right">
                      <Num>{moneyExact(p.revenueCents - p.costCents)}</Num>
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <MarginCell pct={p.marginPct} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {rows.length > 10 && (
            <div className="border-t px-4 py-2.5">
              <Button variant="ghost" size="sm" onClick={() => setAll((a) => !a)}>
                {all ? 'Show top 10' : `Show all ${rows.length} products`}
              </Button>
            </div>
          )}
        </>
      )}
    </Panel>
  )
}

function MarginCell({ pct }: { pct: number }) {
  const w = Math.max(0, Math.min(100, pct))
  return (
    <span className="inline-flex items-center justify-end gap-2">
      <span className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-muted lg:block">
        <span
          className={cn('block h-full rounded-full', pct < 0 ? 'bg-destructive' : pct < 20 ? 'bg-warning' : pct >= 40 ? 'bg-success' : 'bg-foreground/50')}
          style={{ width: `${w}%` }}
        />
      </span>
      <Num className={cn('w-14', marginTone(pct))}>{pct.toFixed(1)}%</Num>
    </span>
  )
}

function FinanceSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} className="h-[104px] rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-xl" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Skeleton className="h-[560px] rounded-xl" />
        <div className="space-y-6">
          <Skeleton className="h-44 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </div>
    </div>
  )
}
