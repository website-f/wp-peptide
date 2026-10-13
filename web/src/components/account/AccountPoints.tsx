import { CoinsIcon, GiftIcon, HourglassMediumIcon, TrendUpIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { EmptyState } from '@/components/brand/bits'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { api } from '@/lib/api'
import { date, money, moneyExact, num } from '@/lib/format'
import { useFeatures, useSettings } from '@/lib/queries'
import { TIER_LABEL, type Tier } from '@/lib/types'
import { cn } from '@/lib/utils'
import { ErrorState } from './bits'

interface PointsData {
  balance: number
  tier: Tier
  tierExpiresAt: string | null
  lifetimeEarned: number
  txns: { id: string; delta: number; reason: string; createdAt: string; expiresAt: string | null }[]
}

const TIERS: Tier[] = ['MEMBER', 'INSIDER', 'VIP', 'FOUNDER']

export function AccountPoints() {
  const q = useQuery({ queryKey: ['account', 'points'], queryFn: () => api.get<PointsData>('/api/account/points') })
  const settings = useSettings()
  const features = useFeatures()
  const p = settings.data?.points

  if (q.isPending)
    return (
      <div className="grid gap-4" aria-busy aria-label="Loading points">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    )
  if (q.isError) return <ErrorState error={q.error} onRetry={() => void q.refetch()} title="Could not load your points" />

  const d = q.data
  // 100 points = RM1, so the balance in points is its value in cents.
  const valueCents = d.balance

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,360px)] lg:items-start">
      <div className="grid min-w-0 grid-cols-1 gap-6">
        <section className="overflow-hidden rounded-xl border bg-card" aria-label="Points balance">
          <div className="grid gap-px bg-border sm:grid-cols-3">
            <div className="bg-card p-5">
              <p className="text-xs text-muted-foreground uppercase">Balance</p>
              <p className="mt-1 font-mono text-3xl font-medium tabular-nums">{num(d.balance)}</p>
              <p className="text-xs text-muted-foreground">points</p>
            </div>
            <div className="bg-card p-5">
              <p className="text-xs text-muted-foreground uppercase">Worth at checkout</p>
              <p className="gold-text mt-1 font-mono text-3xl font-medium tabular-nums">{moneyExact(valueCents)}</p>
              <p className="text-xs text-muted-foreground">100 points = {money(100)}</p>
            </div>
            <div className="bg-card p-5">
              <p className="text-xs text-muted-foreground uppercase">Lifetime earned</p>
              <p className="mt-1 font-mono text-3xl font-medium tabular-nums">{num(d.lifetimeEarned)}</p>
              <p className="text-xs text-muted-foreground">points</p>
            </div>
          </div>
          {p && (
            <p className="border-t bg-surface/60 px-5 py-3 text-[13px] text-muted-foreground">
              Use points on up to {p.maxRedeemPct}% of an order at checkout. Points expire {p.expiryMonths} months after they are earned.
            </p>
          )}
        </section>

        <section aria-labelledby="ledger-title">
          <h3 id="ledger-title" className="display text-3xl">
            History
          </h3>
          {d.txns.length === 0 ? (
            <div className="mt-4">
              <EmptyState icon={<CoinsIcon />} title="No points yet" body="Points land on your account as soon as an order is paid." />
            </div>
          ) : (
            <ul className="mt-4 divide-y rounded-xl border bg-card">
              {d.txns.map((t) => {
                const plus = t.delta > 0
                return (
                  <li key={t.id} className="flex items-center gap-4 px-4 py-3.5 sm:px-5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{t.reason}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {date(t.createdAt)}
                        {t.expiresAt && plus && <> · expires {date(t.expiresAt)}</>}
                      </p>
                    </div>
                    <span className={cn('shrink-0 font-mono text-sm font-medium tabular-nums', plus ? 'text-success' : 'text-muted-foreground')}>
                      {plus ? '+' : '-'}
                      {num(Math.abs(t.delta))}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </section>
      </div>

      <aside className="rounded-xl border bg-surface/60 p-5 lg:sticky lg:top-24" aria-labelledby="earn-title">
        <h3 id="earn-title" className="display text-3xl">
          How to earn
        </h3>
        {settings.isPending ? (
          <Skeleton className="mt-4 h-48" />
        ) : settings.isError || !p ? (
          <p className="mt-3 text-sm text-muted-foreground">Earning rates could not be loaded right now.</p>
        ) : (
          <>
            {!features.membership ? (
              <p className="mt-3 flex items-baseline gap-2">
                <span className="display text-5xl text-gold-ink">{p.perDollar.MEMBER}</span>
                <span className="text-sm text-muted-foreground">points for every RM1 spent</span>
              </p>
            ) : (
              <>
            <p className="mt-2 text-sm text-muted-foreground">Points per {money(100)} spent, by membership tier.</p>
            <ul className="mt-4 grid gap-1.5">
              {TIERS.map((t) => {
                const mine = t === d.tier
                return (
                  <li
                    key={t}
                    className={cn('flex items-center justify-between rounded-md border px-3 py-2.5 text-sm', mine ? 'border-gold/40 bg-gold/10' : 'border-transparent bg-card')}
                  >
                    <span className={cn(mine && 'font-medium text-gold-ink')}>
                      {TIER_LABEL[t]}
                      {mine && <span className="ml-2 text-xs font-normal text-muted-foreground">your tier</span>}
                    </span>
                    <span className="font-mono tabular-nums">{p.perDollar[t]} pts</span>
                  </li>
                )
              })}
            </ul>
              </>
            )}
            <ul className="mt-5 grid gap-3 text-sm">
              <li className="flex gap-3">
                <GiftIcon className="mt-0.5 size-5 shrink-0 text-gold-ink" aria-hidden />
                <span>
                  <span className="font-mono tabular-nums">{num(p.bonusPoints)}</span> bonus points on any order over{' '}
                  <span className="font-mono tabular-nums">{money(p.bonusThresholdCents)}</span>.
                </span>
              </li>
              {features.membership && (
                <li className="flex gap-3">
                  <TrendUpIcon className="mt-0.5 size-5 shrink-0 text-gold-ink" aria-hidden />
                  <span>Higher tiers earn faster on every order.</span>
                </li>
              )}
              {features.membership && d.tierExpiresAt && (
                <li className="flex gap-3">
                  <HourglassMediumIcon className="mt-0.5 size-5 shrink-0 text-gold-ink" aria-hidden />
                  <span>
                    Your {TIER_LABEL[d.tier]} rate runs until {date(d.tierExpiresAt)}.
                  </span>
                </li>
              )}
            </ul>
            <Button asChild variant="outline" className="mt-5 h-11 w-full">
              {features.membership ? (
                <Link to="/membership">{d.tier === 'MEMBER' ? 'Compare memberships' : 'Manage membership'}</Link>
              ) : (
                <Link to="/points">How points work</Link>
              )}
            </Button>
          </>
        )}
      </aside>
    </div>
  )
}
