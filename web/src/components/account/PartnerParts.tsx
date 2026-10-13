import { BankIcon, CircleNotchIcon, ReceiptIcon, WalletIcon } from '@phosphor-icons/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState, type FormEvent } from 'react'
import { useReducedMotion } from 'motion/react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from 'recharts'
import { toast } from 'sonner'
import { EmptyState } from '@/components/brand/bits'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api, errorMessage } from '@/lib/api'
import { currencySymbol, date, money, moneyExact, num } from '@/lib/format'
import { STATUS_LABEL, type OrderKind, type OrderStatus } from '@/lib/types'
import { cn } from '@/lib/utils'
import { BankFields, maskAccount, validateBank, type BankErrors, type BankValue } from './BankFields'
import { Field, FormError, apiFieldErrors, cleanApiMessage } from './Field'
import { StatusPill, type Tone } from './bits'

export interface AffiliateDash {
  affiliate: {
    status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED'
    code: string
    couponCode: string
    commissionRate: number
    platform: string
    handle: string
    website: string | null
    payoutMethod: 'BANK'
    bankName: string | null
    bankAccountName: string | null
    bankAccountNumber: string | null
    createdAt: string
    approvedAt: string | null
  } | null
  terms?: { cookieDays: number; couponPct: number; minPayoutCents: number }
  stats?: {
    pendingCents: number
    availableCents: number
    requestedCents: number
    paidCents: number
    voidCents: number
    lifetimeCents: number
    salesCents: number
    orders: number
    counts: { pending: number; available: number; requested: number; paid: number; void: number }
    clicksTotal: number
    clicks30: number
    orders30: number
    earnings30Cents: number
    conversionPct: number
    conversion30Pct: number
    avgCommissionCents: number
    avgOrderCents: number
    earningsPerClickCents: number
  }
  series?: { date: string; clicks: number; orders: number; salesCents: number; earningsCents: number }[]
  monthly?: { month: string; orders: number; salesCents: number; earningsCents: number }[]
  topProducts?: { name: string; units: number; salesCents: number }[]
  commissions?: {
    id: string
    orderNumber: string
    orderDate: string
    orderStatus: OrderStatus
    orderKind: OrderKind
    items: number
    baseCents: number
    rate: number
    amountCents: number
    status: 'PENDING' | 'APPROVED' | 'PAID' | 'VOID'
    inPayout: boolean
    approvedAt: string | null
  }[]
  payouts?: {
    id: string
    amountCents: number
    method: string
    destination: string | null
    status: 'REQUESTED' | 'PAID' | 'REJECTED'
    reference: string | null
    note: string | null
    commissions: number
    createdAt: string
    paidAt: string | null
  }[]
}

export type Full = Required<AffiliateDash> & { affiliate: NonNullable<AffiliateDash['affiliate']> }
type Commission = Full['commissions'][number]
type Payout = Full['payouts'][number]

/* --------------------------------------------------- status vocabulary */

// One place defines what each commission state is called and how it looks,
// so the donut, filters, pills and help text always agree.
export const STAGES = [
  { key: 'pending', label: 'Pending', hint: 'Order paid, waiting for delivery', color: 'var(--chart-5)', tone: 'warning' as Tone },
  { key: 'available', label: 'Available', hint: 'Delivered, ready to withdraw', color: 'var(--chart-1)', tone: 'success' as Tone },
  { key: 'requested', label: 'In payout', hint: 'Requested, transfer on the way', color: 'var(--chart-3)', tone: 'gold' as Tone },
  { key: 'paid', label: 'Paid', hint: 'Transferred to your bank', color: 'var(--chart-2)', tone: 'muted' as Tone },
] as const
export type StageKey = (typeof STAGES)[number]['key'] | 'void'

export function stageOf(c: Commission): StageKey {
  if (c.status === 'VOID') return 'void'
  if (c.status === 'PAID') return 'paid'
  if (c.status === 'APPROVED') return c.inPayout ? 'requested' : 'available'
  return 'pending'
}

export function CommissionPill({ c }: { c: Commission }) {
  const st = stageOf(c)
  if (st === 'void') return <StatusPill tone="danger">Void</StatusPill>
  const s = STAGES.find((x) => x.key === st)!
  return <StatusPill tone={s.tone}>{s.label}</StatusPill>
}

const PAYOUT: Record<Payout['status'], [Tone, string]> = {
  REQUESTED: ['warning', 'Processing'],
  PAID: ['success', 'Paid'],
  REJECTED: ['danger', 'Rejected'],
}

/* ------------------------------------------------------- earnings donut */

export function EarningsDonut({ stats }: { stats: Full['stats'] }) {
  const animate = !useReducedMotion()
  const amounts: Record<(typeof STAGES)[number]['key'], number> = {
    pending: stats.pendingCents,
    available: stats.availableCents,
    requested: stats.requestedCents,
    paid: stats.paidCents,
  }
  const data = STAGES.map((s) => ({ ...s, value: amounts[s.key], count: stats.counts[s.key] }))
  const empty = stats.lifetimeCents === 0
  return (
    <div className="grid items-center gap-6 rounded-xl border bg-card p-5 sm:grid-cols-[200px_1fr] sm:p-6">
      <div className="relative mx-auto size-[200px]">
        <ChartContainer config={{}} className="aspect-square size-[200px]" aria-label="Lifetime commission by stage">
          <PieChart>
            <Pie
              data={empty ? [{ value: 1 }] : data.filter((d) => d.value > 0)}
              dataKey="value"
              innerRadius={68}
              outerRadius={96}
              paddingAngle={empty ? 0 : 2}
              strokeWidth={0}
              isAnimationActive={animate}
            >
              {empty ? <Cell fill="var(--muted)" /> : data.filter((d) => d.value > 0).map((d) => <Cell key={d.key} fill={d.color} />)}
            </Pie>
          </PieChart>
        </ChartContainer>
        <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
          <p className="text-[11px] text-muted-foreground">Lifetime</p>
          <p className="font-mono text-xl font-semibold tabular-nums">{money(stats.lifetimeCents)}</p>
          <p className="text-[11px] text-muted-foreground">{plural(stats.orders, 'order')}</p>
        </div>
      </div>
      <ul className="grid gap-2.5">
        {data.map((d) => (
          <li key={d.key} className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
            <span className="size-3 rounded-[3px]" style={{ background: d.color }} aria-hidden />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{d.label}</span>
              <span className="block truncate text-xs text-muted-foreground">{d.hint}</span>
            </span>
            <span className="text-right">
              <span className="block font-mono text-sm font-medium tabular-nums">{moneyExact(d.value)}</span>
              <span className="block font-mono text-[11px] text-muted-foreground tabular-nums">{plural(d.count, 'order')}</span>
            </span>
          </li>
        ))}
        {stats.counts.void > 0 && (
          <li className="border-t pt-2.5 text-xs text-muted-foreground">
            {plural(stats.counts.void, 'order')} cancelled or refunded, {moneyExact(stats.voidCents)} voided.
          </li>
        )}
      </ul>
    </div>
  )
}

const plural = (n: number, one: string) => `${num(n)} ${n === 1 ? one : `${one}s`}`

/* --------------------------------------------------------------- charts */

const shortDay = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
const shortMonth = (m: string) => new Date(`${m}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'short' })
function axisMoney(cents: number) {
  const v = cents / 100
  if (Math.abs(v) >= 1000) return `${currencySymbol()}${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k`
  return `${currencySymbol()}${Math.round(v)}`
}

type Metric = 'earningsCents' | 'orders' | 'clicks'
const METRICS: { key: Metric; label: string; fmt: (v: number) => string }[] = [
  { key: 'earningsCents', label: 'Earnings', fmt: (v) => moneyExact(v) },
  { key: 'orders', label: 'Orders', fmt: (v) => num(v) },
  { key: 'clicks', label: 'Clicks', fmt: (v) => num(v) },
]

export function DailyChart({ series }: { series: Full['series'] }) {
  const [metric, setMetric] = useState<Metric>('earningsCents')
  const animate = !useReducedMotion()
  const totals = useMemo(
    () => ({
      earningsCents: series.reduce((a, d) => a + d.earningsCents, 0),
      orders: series.reduce((a, d) => a + d.orders, 0),
      clicks: series.reduce((a, d) => a + d.clicks, 0),
    }),
    [series],
  )
  const m = METRICS.find((x) => x.key === metric)!
  const config = { [metric]: { label: m.label, color: 'var(--chart-1)' } } satisfies ChartConfig
  return (
    <div className="rounded-xl border bg-card">
      <div className="flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <h3 className="display text-3xl">Last 30 days</h3>
        <div className="grid grid-cols-3 gap-1 rounded-md border p-1" role="tablist" aria-label="Chart metric">
          {METRICS.map((x) => (
            <button
              key={x.key}
              role="tab"
              aria-selected={metric === x.key}
              onClick={() => setMetric(x.key)}
              className={cn('rounded-[5px] px-3 py-1.5 text-left transition-colors', metric === x.key ? 'bg-gold/15 text-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              <span className="block text-[11px]">{x.label}</span>
              <span className="block font-mono text-sm font-medium tabular-nums">{x.key === 'earningsCents' ? money(totals[x.key]) : num(totals[x.key])}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="p-2 sm:p-4">
        {totals[metric] === 0 ? (
          <p className="grid h-60 place-items-center px-6 text-center text-sm text-muted-foreground">
            Nothing here in the last 30 days yet. Share your link and this fills in.
          </p>
        ) : (
          <ChartContainer config={config} className="aspect-auto h-60 w-full" aria-label={`Daily ${m.label.toLowerCase()}, last 30 days`}>
            <AreaChart data={series} margin={{ left: 0, right: 8, top: 8 }}>
              <defs>
                <linearGradient id="partner-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={28} tickFormatter={shortDay} />
              <YAxis tickLine={false} axisLine={false} width={metric === 'earningsCents' ? 56 : 32} allowDecimals={false} tickFormatter={metric === 'earningsCents' ? axisMoney : undefined} />
              <ChartTooltip
                cursor={{ stroke: 'var(--border)' }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  const row = payload[0].payload as Full['series'][number]
                  return (
                    <div className="grid min-w-40 gap-1 rounded-md border bg-popover px-2.5 py-2 text-xs shadow-lg">
                      <p className="font-medium">{shortDay(String(label))}</p>
                      <TipRow k="Earnings" v={moneyExact(row.earningsCents)} />
                      <TipRow k="Orders" v={num(row.orders)} />
                      <TipRow k="Sales" v={moneyExact(row.salesCents)} />
                      <TipRow k="Clicks" v={num(row.clicks)} />
                    </div>
                  )
                }}
              />
              <Area type="monotone" dataKey={metric} stroke="var(--chart-1)" strokeWidth={2.25} fill="url(#partner-fill)" isAnimationActive={animate} />
            </AreaChart>
          </ChartContainer>
        )}
      </div>
    </div>
  )
}

function TipRow({ k, v }: { k: string; v: string }) {
  return (
    <p className="flex justify-between gap-4">
      <span className="text-muted-foreground">{k}</span>
      <span className="font-mono tabular-nums">{v}</span>
    </p>
  )
}

export function MonthlyChart({ monthly }: { monthly: Full['monthly'] }) {
  const animate = !useReducedMotion()
  const total = monthly.reduce((a, m) => a + m.earningsCents, 0)
  const best = monthly.reduce((b, m) => (m.earningsCents > b.earningsCents ? m : b), monthly[0])
  return (
    <div className="rounded-xl border bg-card">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b p-4 sm:px-5">
        <h3 className="display text-3xl">12 months</h3>
        <div className="text-right">
          <p className="text-[11px] text-muted-foreground">Earned in 12 months</p>
          <p className="font-mono text-lg font-medium tabular-nums">{money(total)}</p>
        </div>
      </div>
      <div className="p-2 sm:p-4">
        {total === 0 ? (
          <p className="grid h-52 place-items-center text-sm text-muted-foreground">Your monthly earnings will chart here.</p>
        ) : (
          <ChartContainer config={{ earningsCents: { label: 'Earnings', color: 'var(--chart-1)' } }} className="aspect-auto h-52 w-full" aria-label="Monthly earnings, last 12 months">
            <BarChart data={monthly} margin={{ left: 0, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis dataKey="month" tickLine={false} axisLine={false} tickMargin={8} tickFormatter={shortMonth} interval="preserveStartEnd" minTickGap={8} />
              <YAxis tickLine={false} axisLine={false} width={56} tickFormatter={axisMoney} />
              <ChartTooltip
                cursor={{ fill: 'var(--muted)', opacity: 0.5 }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null
                  const row = payload[0].payload as Full['monthly'][number]
                  return (
                    <div className="grid min-w-40 gap-1 rounded-md border bg-popover px-2.5 py-2 text-xs shadow-lg">
                      <p className="font-medium">{new Date(`${row.month}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</p>
                      <TipRow k="Earnings" v={moneyExact(row.earningsCents)} />
                      <TipRow k="Orders" v={num(row.orders)} />
                      <TipRow k="Sales" v={moneyExact(row.salesCents)} />
                    </div>
                  )
                }}
              />
              <Bar dataKey="earningsCents" radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={animate}>
                {monthly.map((m) => (
                  <Cell key={m.month} fill={m.month === best.month ? 'var(--chart-1)' : 'color-mix(in oklch, var(--chart-1) 45%, transparent)'} />
                ))}
              </Bar>
            </BarChart>
          </ChartContainer>
        )}
        {total > 0 && (
          <p className="px-2 pt-2 text-xs text-muted-foreground">
            Best month: {new Date(`${best.month}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}, {money(best.earningsCents)} from {plural(best.orders, 'order')}.
          </p>
        )}
      </div>
    </div>
  )
}

export function TopProducts({ items }: { items: Full['topProducts'] }) {
  const max = Math.max(1, ...items.map((i) => i.salesCents))
  return (
    <div className="rounded-xl border bg-card p-5 sm:p-6">
      <h3 className="display text-3xl">What your audience buys</h3>
      {items.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Your top compounds appear after your first referred order.</p>
      ) : (
        <ol className="mt-4 grid gap-3.5">
          {items.map((p, i) => (
            <li key={p.name} className="grid gap-1.5">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate">
                  <span className="mr-2 font-mono text-xs text-muted-foreground">{i + 1}</span>
                  {p.name}
                </span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                  {num(p.units)} units, {money(p.salesCents)}
                </span>
              </div>
              {/* Share-of-best indicator (no background track). */}
              <span className="block h-1.5 rounded-full bg-gold/70" style={{ width: `${Math.max(4, (p.salesCents / max) * 100)}%` }} aria-hidden />
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

/* ---------------------------------------------------------- commissions */

export function CommissionList({ items }: { items: Commission[] }) {
  if (!items.length)
    return <EmptyState icon={<ReceiptIcon />} title="Nothing here" body="Orders placed through your link or code appear here the moment they are paid." />
  return (
    <>
      <ul className="divide-y rounded-xl border bg-card md:hidden">
        {items.map((c) => (
          <li key={c.id} className="grid gap-2 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-sm tabular-nums">{c.orderNumber}</span>
              <CommissionPill c={c} />
            </div>
            <div className="flex items-end justify-between gap-3 text-sm">
              <div className="text-muted-foreground">
                <p>{date(c.orderDate)}</p>
                <p>
                  {moneyExact(c.baseCents)} sale at {c.rate}%, order {STATUS_LABEL[c.orderStatus]?.toLowerCase()}
                </p>
              </div>
              <p className={cn('font-mono text-base font-medium tabular-nums', c.status === 'VOID' && 'text-muted-foreground line-through')}>{moneyExact(c.amountCents)}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pl-5">Order</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Order status</TableHead>
              <TableHead className="text-right">Sale</TableHead>
              <TableHead className="text-right">Rate</TableHead>
              <TableHead className="text-right">Commission</TableHead>
              <TableHead className="pr-5 text-right">Stage</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="pl-5 font-mono tabular-nums">{c.orderNumber}</TableCell>
                <TableCell className="text-muted-foreground">{date(c.orderDate)}</TableCell>
                <TableCell className="text-muted-foreground">{STATUS_LABEL[c.orderStatus] ?? c.orderStatus}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{moneyExact(c.baseCents)}</TableCell>
                <TableCell className="text-right font-mono tabular-nums">{c.rate}%</TableCell>
                <TableCell className={cn('text-right font-mono font-medium tabular-nums', c.status === 'VOID' && 'text-muted-foreground line-through')}>
                  {moneyExact(c.amountCents)}
                </TableCell>
                <TableCell className="pr-5 text-right">
                  <CommissionPill c={c} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  )
}

/* -------------------------------------------------------------- payouts */

export function PayoutList({ items }: { items: Payout[] }) {
  if (!items.length)
    return (
      <div className="rounded-xl border border-dashed px-5 py-10 text-center text-sm text-muted-foreground">
        <WalletIcon className="mx-auto mb-2 size-7 text-gold-ink" aria-hidden />
        No payouts yet. Requests you make show here with the bank they went to and the transfer reference.
      </div>
    )
  return (
    <ul className="grid gap-3">
      {items.map((p) => {
        const [tone, label] = PAYOUT[p.status]
        return (
          <li key={p.id} className="rounded-xl border bg-card p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-2xl font-medium tabular-nums">{moneyExact(p.amountCents)}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {plural(p.commissions, 'order')}, requested {date(p.createdAt)}
                </p>
              </div>
              <StatusPill tone={tone}>{label}</StatusPill>
            </div>
            <dl className="mt-4 grid gap-2 border-t pt-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">Bank transfer to</dt>
                <dd className="font-mono text-[13px] break-words">{p.destination ?? 'Bank on file'}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">{p.status === 'PAID' ? 'Paid on' : p.status === 'REJECTED' ? 'Outcome' : 'Status'}</dt>
                <dd className="text-[13px]">
                  {p.status === 'PAID' ? date(p.paidAt) : p.status === 'REJECTED' ? 'Not paid, the commission returned to your balance' : 'Transfer being prepared'}
                </dd>
              </div>
              {p.reference && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted-foreground">Transfer reference</dt>
                  <dd className="font-mono text-[13px]">{p.reference}</dd>
                </div>
              )}
              {p.note && (
                <div className="sm:col-span-2">
                  <dt className="text-xs text-muted-foreground">Note from KYVO</dt>
                  <dd className="text-[13px]">{p.note}</dd>
                </div>
              )}
            </dl>
          </li>
        )
      })}
    </ul>
  )
}

/* -------------------------------------------------------- bank settings */

export function BankCard({ a }: { a: Full['affiliate'] }) {
  if (!a.bankName || !a.bankAccountNumber)
    return (
      <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
        <p className="font-medium text-warning">No bank details yet</p>
        <p className="mt-1 text-muted-foreground">Add them in the Bank details tab so we can pay your commission.</p>
      </div>
    )
  return (
    <div className="rounded-xl border bg-surface/60 p-4">
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <BankIcon className="size-4 text-gold-ink" aria-hidden /> Payouts go to
      </p>
      <p className="mt-1.5 font-medium">{a.bankName}</p>
      <p className="font-mono text-sm tabular-nums">{maskAccount(a.bankAccountNumber)}</p>
      <p className="text-xs text-muted-foreground">{a.bankAccountName}</p>
    </div>
  )
}

export function PayoutSettings({ affiliate }: { affiliate: Full['affiliate'] }) {
  const qc = useQueryClient()
  const initial: BankValue = {
    bankName: affiliate.bankName ?? '',
    bankAccountName: affiliate.bankAccountName ?? '',
    bankAccountNumber: affiliate.bankAccountNumber ?? '',
  }
  const [bank, setBank] = useState<BankValue>(initial)
  const [website, setWebsite] = useState(affiliate.website ?? '')
  const [errors, setErrors] = useState<BankErrors & { website?: string }>({})
  const save = useMutation({
    mutationFn: () =>
      api.patch('/api/affiliate/me', {
        bankName: bank.bankName.trim(),
        bankAccountName: bank.bankAccountName.trim(),
        bankAccountNumber: bank.bankAccountNumber.replace(/[\s-]/g, ''),
        website: website.trim(),
      }),
    onSuccess: async () => {
      toast.success('Bank details saved. We emailed you a confirmation.')
      await qc.invalidateQueries({ queryKey: ['affiliate', 'me'] })
    },
    onError: (e) => setErrors(apiFieldErrors(e)),
  })
  const dirty =
    bank.bankName !== initial.bankName ||
    bank.bankAccountName !== initial.bankAccountName ||
    bank.bankAccountNumber.replace(/[\s-]/g, '') !== initial.bankAccountNumber ||
    website.trim() !== (affiliate.website ?? '')
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const errs = validateBank(bank)
    setErrors(errs)
    if (Object.keys(errs).length) return
    save.mutate()
  }
  const generic = save.isError && !Object.keys(errors).length ? cleanApiMessage(errorMessage(save.error)) : null

  return (
    <form onSubmit={submit} noValidate className="grid gap-6 rounded-xl border bg-card p-5 sm:p-6">
      <div>
        <h3 className="display text-3xl">Bank details for payouts</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Changes apply to your next payout request. A request already being processed keeps the details it was made with.
        </p>
      </div>
      <BankFields idPrefix="ps" value={bank} onChange={setBank} errors={errors} />
      <Field id="ps-website" label="Website" optional error={errors.website}>
        <Input type="url" inputMode="url" autoCapitalize="none" spellCheck={false} placeholder="https://" value={website} onChange={(e) => setWebsite(e.target.value)} />
      </Field>
      <FormError message={generic} />
      <Button type="submit" className="h-11 w-full sm:w-auto sm:justify-self-start" disabled={!dirty || save.isPending}>
        {save.isPending && <CircleNotchIcon className="animate-spin" />}
        Save bank details
      </Button>
    </form>
  )
}
