import {
  ArrowRightIcon,
  BankIcon,
  ChartLineUpIcon,
  CircleNotchIcon,
  CursorClickIcon,
  HandCoinsIcon,
  InfoIcon,
  LinkSimpleIcon,
  PercentIcon,
  ReceiptIcon,
  ShareNetworkIcon,
  ShoppingBagIcon,
  TicketIcon,
  WalletIcon,
} from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { toast } from 'sonner'
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
import { api, errorMessage } from '@/lib/api'
import { date, money, moneyExact, num } from '@/lib/format'
import { cn } from '@/lib/utils'
import { maskAccount } from './BankFields'
import { FieldError } from './Field'
import { BankCard, CommissionList, DailyChart, EarningsDonut, MonthlyChart, PayoutList, PayoutSettings, STAGES, TopProducts, stageOf, type Full, type StageKey } from './PartnerParts'
import { CopyButton, StatusPill } from './bits'

type Tab = 'overview' | 'commissions' | 'payouts' | 'bank'
const TABS: { key: Tab; label: string; icon: Icon }[] = [
  { key: 'overview', label: 'Overview', icon: ChartLineUpIcon },
  { key: 'commissions', label: 'Commissions', icon: ReceiptIcon },
  { key: 'payouts', label: 'Payouts', icon: WalletIcon },
  { key: 'bank', label: 'Bank details', icon: BankIcon },
]

export function Approved({ d, name }: { d: Full; name: string }) {
  const [params, setParams] = useSearchParams()
  const tab = (TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'overview') as Tab
  const go = (t: Tab) => setParams(t === 'overview' ? {} : { tab: t }, { replace: true })
  const a = d.affiliate
  const noBank = !a.bankName || !a.bankAccountNumber

  return (
    <div className="pb-20">
      <header className="container-x flex flex-col gap-6 pt-10 pb-6 md:flex-row md:items-end md:justify-between md:pt-14">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">Partner dashboard</p>
          <h1 className="display mt-1 text-5xl break-words sm:text-6xl">{name}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <StatusPill tone="success">Approved</StatusPill>
            <span>
              {a.platform}, {a.handle}
            </span>
            {a.approvedAt && <span>Partner since {date(a.approvedAt)}</span>}
          </div>
        </div>
        <div className="flex items-baseline gap-2 rounded-xl border border-gold/30 bg-gold/5 px-5 py-4">
          <span className="gold-text font-display text-6xl leading-none font-semibold tabular-nums">{a.commissionRate}%</span>
          <span className="text-sm text-muted-foreground">
            commission
            <br />
            on every order
          </span>
        </div>
      </header>

      {noBank && (
        <div className="container-x mb-4">
          <button
            onClick={() => go('bank')}
            className="flex w-full items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-left text-sm"
          >
            <span>
              <span className="font-medium text-warning">Add your bank details</span>
              <span className="text-muted-foreground"> so we can transfer your commission.</span>
            </span>
            <ArrowRightIcon className="size-4 shrink-0 text-warning" />
          </button>
        </div>
      )}

      <div className="sticky top-16 z-30 border-y bg-background/85 backdrop-blur-xl">
        <nav className="container-x" aria-label="Partner sections">
          <ul className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 py-2.5 sm:mx-0 sm:px-0" role="tablist">
            {TABS.map((t) => (
              <li key={t.key} className="shrink-0">
                <button
                  role="tab"
                  aria-selected={tab === t.key}
                  onClick={() => go(t.key)}
                  className={cn(
                    'inline-flex h-11 items-center gap-2 rounded-md px-4 text-sm font-medium whitespace-nowrap transition-colors',
                    tab === t.key ? 'bg-gold/15 text-foreground' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <t.icon className={cn('size-4', tab === t.key && 'text-gold-ink')} />
                  {t.label}
                  {t.key === 'bank' && noBank && <span className="size-2 rounded-full bg-warning" aria-label="needs attention" />}
                </button>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <div className="container-x mt-8">
        {tab === 'overview' && <Overview d={d} go={go} />}
        {tab === 'commissions' && <Commissions d={d} />}
        {tab === 'payouts' && <Payouts d={d} go={go} />}
        {tab === 'bank' && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
            <PayoutSettings key={`${a.bankName}-${a.bankAccountNumber}-${a.website}`} affiliate={a} />
            <aside className="grid gap-4">
              <BankCard a={a} />
              <div className="rounded-xl border bg-surface/60 p-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">How payouts are sent</p>
                <p className="mt-1.5">
                  We transfer by IBG or DuitNow to the account above, usually within 3 business days of your request, and add the bank reference to the
                  Payouts tab.
                </p>
              </div>
            </aside>
          </div>
        )}
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- overview */

function Overview({ d, go }: { d: Full; go: (t: Tab) => void }) {
  const a = d.affiliate
  const s = d.stats
  const t = d.terms
  const link = `${window.location.origin}/?ref=${a.code}`
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
  const share = async () => {
    try {
      await navigator.share({ title: 'KYVO Labs', text: `Research compounds with published COAs. Use code ${a.couponCode} for ${t.couponPct}% off.`, url: link })
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') toast.error('Sharing is not available here. Copy the link instead.')
    }
  }

  const kpis: { icon: Icon; label: string; value: string; sub: string }[] = [
    { icon: CursorClickIcon, label: 'Clicks', value: num(s.clicksTotal), sub: `${num(s.clicks30)} in the last 30 days` },
    { icon: ShoppingBagIcon, label: 'Orders referred', value: num(s.orders), sub: `${num(s.orders30)} in the last 30 days` },
    { icon: PercentIcon, label: 'Conversion', value: `${s.conversionPct.toFixed(1)}%`, sub: `${s.conversion30Pct.toFixed(1)}% in the last 30 days` },
    { icon: ChartLineUpIcon, label: 'Sales generated', value: money(s.salesCents), sub: 'After discounts, before shipping' },
    { icon: ReceiptIcon, label: 'Average order', value: money(s.avgOrderCents), sub: 'Per referred order' },
    { icon: HandCoinsIcon, label: 'Average commission', value: money(s.avgCommissionCents), sub: 'Per referred order' },
    { icon: LinkSimpleIcon, label: 'Earned per click', value: moneyExact(s.earningsPerClickCents), sub: 'Lifetime commission / clicks' },
    { icon: WalletIcon, label: 'Last 30 days', value: money(s.earnings30Cents), sub: 'Commission earned' },
  ]

  return (
    <div className="grid gap-6">
      {/* Money first: what you can withdraw, and where the rest is. */}
      <section className="grid gap-4 lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)]" aria-label="Earnings">
        <PayoutBox d={d} go={go} />
        <EarningsDonut stats={s} />
      </section>

      <section aria-label="Performance">
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border lg:grid-cols-4">
          {kpis.map((k) => (
            <div key={k.label} className="flex min-w-0 flex-col bg-card p-4 sm:p-5">
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <k.icon className="size-3.5 text-gold-ink" aria-hidden /> {k.label}
              </dt>
              <dd className="mt-1.5 truncate font-mono text-xl font-medium tabular-nums sm:text-2xl">{k.value}</dd>
              <dd className="mt-0.5 truncate text-[11px] text-muted-foreground">{k.sub}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <DailyChart series={d.series} />
        <MonthlyChart monthly={d.monthly} />
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]" aria-label="Your link and code">
        <div className="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-[1.4fr_1fr]">
          <div className="bg-card p-5">
            <p className="flex items-center gap-2 text-sm font-medium">
              <LinkSimpleIcon className="size-4 text-gold-ink" aria-hidden /> Referral link
            </p>
            <p className="mt-3 rounded-md border bg-surface px-3 py-3 font-mono text-sm break-all select-all">{link}</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <CopyButton value={link} label="Link" variant="default" className="sm:w-auto" />
              {canShare && (
                <Button variant="outline" className="h-11" onClick={() => void share()}>
                  <ShareNetworkIcon /> Share
                </Button>
              )}
            </div>
            <p className="mt-3 text-[13px] text-muted-foreground">
              Add <span className="font-mono">?ref={a.code}</span> to any page link. Orders within {t.cookieDays} days of a click are credited to you.
            </p>
          </div>
          <div className="bg-card p-5">
            <p className="flex items-center gap-2 text-sm font-medium">
              <TicketIcon className="size-4 text-gold-ink" aria-hidden /> Shopper code
            </p>
            <p className="mt-3 rounded-md border border-dashed border-gold/50 bg-gold/5 px-3 py-2.5 text-center font-mono text-2xl tracking-[0.18em] text-gold-ink select-all">
              {a.couponCode}
            </p>
            <CopyButton value={a.couponCode} label="Code" className="mt-3 w-full" />
            <p className="mt-3 text-[13px] text-muted-foreground">Gives shoppers {t.couponPct}% off and credits the order to you, link or no link.</p>
          </div>
        </div>
        <TopProducts items={d.topProducts} />
      </section>

      <aside className="rounded-xl border bg-surface/60 p-5 sm:p-6" aria-labelledby="lifecycle-title">
        <p id="lifecycle-title" className="flex items-center gap-2 font-medium">
          <InfoIcon className="size-5 text-gold-ink" aria-hidden /> How commission moves
        </p>
        <ol className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          {STAGES.map((st, i) => (
            <li key={st.key} className="flex gap-3">
              <span className="grid size-6 shrink-0 place-items-center rounded-full border font-mono text-[11px]" style={{ borderColor: st.color, color: st.color }} aria-hidden>
                {i + 1}
              </span>
              <div>
                <p className="font-medium">{st.label}</p>
                <p className="mt-0.5 text-muted-foreground">
                  {
                    {
                      pending: 'Created when a referred order is paid. Waits here until it is delivered.',
                      available: 'Delivered orders. Cancelled or refunded orders are voided instead.',
                      requested: `You asked for a payout (from ${money(t.minPayoutCents, { whole: true })}). We prepare the bank transfer.`,
                      paid: 'Transferred to your bank. The reference shows in the Payouts tab.',
                    }[st.key]
                  }
                </p>
              </div>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  )
}

/* ---------------------------------------------------------- payout box */

function PayoutBox({ d, go }: { d: Full; go: (t: Tab) => void }) {
  const qc = useQueryClient()
  const s = d.stats
  const a = d.affiliate
  const min = d.terms.minPayoutCents
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const req = useMutation({
    mutationFn: () => api.post<{ id: string; amountCents: number }>('/api/affiliate/payouts'),
    onSuccess: async (r) => {
      setOpen(false)
      setError(null)
      toast.success(`Payout of ${moneyExact(r.amountCents)} requested`)
      await qc.invalidateQueries({ queryKey: ['affiliate', 'me'] })
    },
    onError: (e) => {
      setOpen(false)
      setError(errorMessage(e))
    },
  })
  const inFlight = s.requestedCents > 0
  const noBank = !a.bankName || !a.bankAccountNumber
  const enough = s.availableCents >= min
  const ready = enough && !inFlight && !noBank

  return (
    <div className={cn('flex flex-col rounded-xl border p-5 sm:p-6', ready ? 'border-gold/40 bg-gold/5' : 'bg-card')}>
      <p className="text-xs text-muted-foreground">Available to withdraw</p>
      <p className={cn('mt-1.5 font-mono text-4xl font-medium tabular-nums', ready && 'text-gold-ink')}>{moneyExact(s.availableCents)}</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {num(s.counts.available)} delivered {s.counts.available === 1 ? 'order' : 'orders'}, plus {moneyExact(s.pendingCents)} pending delivery
      </p>
      <Button className="mt-5 h-11 w-full" variant={ready ? 'default' : 'outline'} disabled={!ready || req.isPending} onClick={() => setOpen(true)}>
        {req.isPending && <CircleNotchIcon className="animate-spin" />}
        Request payout
      </Button>
      <p className="mt-2.5 text-[13px] text-muted-foreground">
        {noBank ? (
          <button className="text-warning underline underline-offset-2" onClick={() => go('bank')}>
            Add your bank details first
          </button>
        ) : inFlight ? (
          <>
            {moneyExact(s.requestedCents)} is being transferred. You can request again once it is paid.{' '}
            <button className="text-gold-ink underline underline-offset-2" onClick={() => go('payouts')}>
              View payout
            </button>
          </>
        ) : enough ? (
          `Sent by bank transfer to ${a.bankName} ${maskAccount(a.bankAccountNumber)}.`
        ) : (
          `${money(min - s.availableCents)} more in available commission unlocks a payout (minimum ${money(min, { whole: true })}).`
        )}
      </p>
      <dl className="mt-auto grid grid-cols-2 gap-3 border-t pt-4 text-sm">
        <div>
          <dt className="text-xs text-muted-foreground">Paid to you</dt>
          <dd className="font-mono tabular-nums">{moneyExact(s.paidCents)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Lifetime earned</dt>
          <dd className="font-mono tabular-nums">{moneyExact(s.lifetimeCents)}</dd>
        </div>
      </dl>
      {error && (
        <div className="mt-2">
          <FieldError>{error}</FieldError>
        </div>
      )}

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Request {moneyExact(s.availableCents)}?</AlertDialogTitle>
            <AlertDialogDescription>
              We will transfer your full available balance to {a.bankName}, account {a.bankAccountNumber}, {a.bankAccountName}. If these details are wrong,
              update them in the Bank details tab first.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-11">Not yet</AlertDialogCancel>
            <Button className="h-11" disabled={req.isPending} onClick={() => req.mutate()}>
              {req.isPending && <CircleNotchIcon className="animate-spin" />}
              Request payout
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/* ---------------------------------------------------------- commissions */

function Commissions({ d }: { d: Full }) {
  const [filter, setFilter] = useState<StageKey | 'all'>('all')
  const counts = { all: d.commissions.length } as Record<StageKey | 'all', number>
  for (const c of d.commissions) counts[stageOf(c)] = (counts[stageOf(c)] ?? 0) + 1
  const chips: { key: StageKey | 'all'; label: string }[] = [
    { key: 'all', label: 'All' },
    ...STAGES.map((s) => ({ key: s.key as StageKey, label: s.label })),
    { key: 'void', label: 'Void' },
  ]
  const rows = filter === 'all' ? d.commissions : d.commissions.filter((c) => stageOf(c) === filter)
  const total = rows.filter((c) => c.status !== 'VOID').reduce((a, c) => a + c.amountCents, 0)
  return (
    <div className="grid gap-4">
      <div className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0" role="tablist" aria-label="Filter commissions">
        {chips.map((c) => (
          <button
            key={c.key}
            role="tab"
            aria-selected={filter === c.key}
            onClick={() => setFilter(c.key)}
            className={cn(
              'inline-flex h-9 shrink-0 items-center gap-2 rounded-md border px-3 text-[13px] transition-colors',
              filter === c.key ? 'border-gold bg-gold/12 text-gold-ink' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {c.label}
            <span className="font-mono text-[11px] tabular-nums opacity-80">{counts[c.key] ?? 0}</span>
          </button>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        {num(rows.length)} {rows.length === 1 ? 'order' : 'orders'}
        {filter !== 'void' && rows.length > 0 && <>, {moneyExact(total)} in commission</>}
      </p>
      <CommissionList items={rows} />
    </div>
  )
}

/* -------------------------------------------------------------- payouts */

function Payouts({ d, go }: { d: Full; go: (t: Tab) => void }) {
  const paid = d.payouts.filter((p) => p.status === 'PAID')
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      <PayoutList items={d.payouts} />
      <aside className="grid gap-4">
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border">
          <div className="bg-card p-4">
            <dt className="text-xs text-muted-foreground">Total paid</dt>
            <dd className="mt-1 font-mono text-xl font-medium tabular-nums">{money(d.stats.paidCents)}</dd>
          </div>
          <div className="bg-card p-4">
            <dt className="text-xs text-muted-foreground">Payouts</dt>
            <dd className="mt-1 font-mono text-xl font-medium tabular-nums">{num(paid.length)}</dd>
          </div>
        </dl>
        <BankCard a={d.affiliate} />
        <Button variant="outline" className="h-11" onClick={() => go('bank')}>
          <BankIcon /> Update bank details
        </Button>
      </aside>
    </div>
  )
}
