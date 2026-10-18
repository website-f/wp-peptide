import { CheckIcon, CrownSimpleIcon, LockSimpleIcon, SpinnerIcon } from '@phosphor-icons/react'
import { useMutation } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router'
import { toast } from 'sonner'
import { PageHeader } from '@/components/brand/bits'
import { PaymentChoice } from '@/components/checkout/Fields'
import { FaqSection } from '@/components/home/Sections'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { api, errorMessage } from '@/lib/api'
import { date, money } from '@/lib/format'
import { useFeatures, useMe, useSettings } from '@/lib/queries'
import { TIER_LABEL, type PlaceOrderResult, type Tier } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useSeo } from '@/lib/seo'

type Paid = Exclude<Tier, 'MEMBER'>
const ORDER: Tier[] = ['MEMBER', 'INSIDER', 'VIP', 'FOUNDER']

export default function Membership() {
  useSeo({ title: 'Membership' })
  const features = useFeatures()
  // While the program is switched off in Admin > Settings, the page is not reachable.
  if (features.loaded && !features.membership) return <Navigate to="/points" replace />
  return <MembershipPage />
}

function MembershipPage() {
  const { data: s } = useSettings()
  const { data: me } = useMe()
  const location = useLocation()
  const [billing, setBilling] = useState<'monthly' | 'yearly'>('monthly')
  const [joining, setJoining] = useState<Paid | null>(null)
  const current = me?.user?.tier ?? null
  const rate = (t: Tier) => s?.points.perDollar[t] ?? 0

  const perks: Record<Tier, string[]> = {
    MEMBER: ['Points on every order', `${s?.points.bonusPoints ?? 500} bonus points over ${s ? money(s.points.bonusThresholdCents) : 'RM800'}`, `Redeem up to ${s?.points.maxRedeemPct ?? 50}% of an order`],
    INSIDER: ['Everything in Member', 'Free shipping on every order', `${Math.round((rate('INSIDER') / rate('MEMBER') - 1) * 100) || 40}% more points than Member`],
    VIP: ['Everything in Insider', 'Early access to new compounds', 'Double the Member points rate'],
    FOUNDER: ['Everything in VIP', 'Priority fulfilment', `${(s?.points.founderYearlyBonus ?? 35000).toLocaleString()} welcome points on yearly billing`],
  }

  return (
    <>
      <PageHeader title="Every order pays you back." intro="Free to join, up to 10% back in points, cancel any time." />
      <section className="container-x pb-6">
        <div className="inline-flex rounded-md border p-1" role="radiogroup" aria-label="Billing period">
          {(['monthly', 'yearly'] as const).map((b) => (
            <button
              key={b}
              role="radio"
              aria-checked={billing === b}
              onClick={() => setBilling(b)}
              className={cn('h-9 rounded-[5px] px-4 text-sm font-medium capitalize transition-colors', billing === b ? 'bg-gold text-primary-foreground' : 'text-muted-foreground')}
            >
              {b}
              {b === 'yearly' && <span className="ml-1.5 text-[11px] opacity-80">2 months free</span>}
            </button>
          ))}
        </div>
      </section>

      <section className="container-x grid gap-4 pb-20 md:grid-cols-2 xl:grid-cols-4">
        {ORDER.map((t) => {
          const price = t === 'MEMBER' ? 0 : billing === 'yearly' ? s?.membership?.[t].yearlyCents : s?.membership?.[t].monthlyCents
          const isCurrent = current === t
          const popular = t === 'INSIDER'
          return (
            <div key={t} className={cn('relative flex flex-col rounded-xl border bg-card p-6', popular && 'border-gold/60 shadow-[0_0_0_1px_var(--gold)]', t === 'FOUNDER' && 'bg-[linear-gradient(160deg,color-mix(in_oklch,var(--gold)_16%,var(--card)),var(--card)_55%)]')}>
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-2 font-display text-2xl font-semibold uppercase">
                  {t === 'FOUNDER' && <CrownSimpleIcon weight="fill" className="size-5 text-gold-ink" />}
                  {TIER_LABEL[t]}
                </p>
                {popular && <span className="rounded-md bg-gold px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">Most popular</span>}
              </div>
              <p className="mt-6 flex items-baseline gap-1.5">
                <span className="display text-6xl">{rate(t)}x</span>
                <span className="text-sm text-muted-foreground">points per RM1</span>
              </p>
              <p className="mt-1 font-mono text-sm text-gold-ink">{rate(t)}% back</p>
              <p className="mt-5 font-mono text-lg">
                {t === 'MEMBER' ? 'Free' : price !== undefined ? money(price) : ''}
                {t !== 'MEMBER' && <span className="text-sm text-muted-foreground"> / {billing === 'yearly' ? 'year' : 'month'}</span>}
              </p>
              <ul className="mt-5 grid gap-2.5 text-sm">
                {perks[t].map((p) => (
                  <li key={p} className="flex gap-2">
                    <CheckIcon weight="bold" className="mt-0.5 size-4 shrink-0 text-gold-ink" /> {p}
                  </li>
                ))}
              </ul>
              <div className="mt-auto pt-6">
                {isCurrent ? (
                  <p className="rounded-md border px-3 py-2.5 text-center text-sm text-muted-foreground">
                    Your plan{me?.user?.tierExpiresAt ? `, renews ${date(me.user.tierExpiresAt)}` : ''}
                  </p>
                ) : t === 'MEMBER' ? (
                  me?.user ? (
                    <p className="rounded-md border px-3 py-2.5 text-center text-sm text-muted-foreground">Included with your account</p>
                  ) : (
                    <Button asChild variant="outline" className="w-full">
                      <Link to="/register" state={{ from: location.pathname }}>
                        Create free account
                      </Link>
                    </Button>
                  )
                ) : me?.user ? (
                  <Button className="w-full" variant={popular || t === 'FOUNDER' ? 'default' : 'outline'} onClick={() => setJoining(t)}>
                    Join {TIER_LABEL[t]}
                  </Button>
                ) : (
                  <Button asChild className="w-full" variant={popular ? 'default' : 'outline'}>
                    <Link to="/login" state={{ from: location.pathname }}>
                      Sign in to join
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          )
        })}
      </section>

      <section className="border-y bg-surface">
        <div className="container-x grid gap-8 py-16 md:grid-cols-3">
          {[
            ['How points work', `Points are calculated after discounts and before shipping. 100 points = ${money(s?.points.valueCentsPer100 ?? 100)} off your next order.`],
            ['Points expire', `Points stay valid for ${s?.points.expiryMonths ?? 12} months from the day they post. Cancel your plan and you keep them.`],
            ['Billing', 'Plans are paid through ToyyibPay by FPX or card. Each period is a separate payment, so nothing renews without you.'],
          ].map(([k, v]) => (
            <div key={k}>
              <h2 className="font-display text-2xl font-semibold uppercase">{k}</h2>
              <p className="mt-2 text-muted-foreground">{v}</p>
            </div>
          ))}
        </div>
      </section>
      <FaqSection settings={s} />

      <JoinDialog tier={joining} billing={billing} onClose={() => setJoining(null)} />
    </>
  )
}

function JoinDialog({ tier, billing, onClose }: { tier: Paid | null; billing: 'monthly' | 'yearly'; onClose: () => void }) {
  const { data: s } = useSettings()
  const [method, setMethod] = useState('')
  useEffect(() => {
    if (!method && s?.paymentMethods[0]) setMethod(s.paymentMethods[0].id)
  }, [s, method])
  const join = useMutation({
    mutationFn: () => api.post<PlaceOrderResult>('/api/membership', { tier, billing, paymentMethod: method }),
    onSuccess: (r) => {
      if (r.paymentUrl) return window.location.assign(r.paymentUrl)
      window.location.assign(`/order/${r.number}?key=${r.accessKey}`)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  if (!tier) return null
  const price = billing === 'yearly' ? s?.membership?.[tier].yearlyCents : s?.membership?.[tier].monthlyCents
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[calc(100%-2rem)] sm:max-w-md">
        <DialogTitle className="font-display text-3xl font-semibold uppercase">Join {TIER_LABEL[tier]}</DialogTitle>
        <DialogDescription>
          {money(price ?? 0)} billed {billing}. Your new points rate starts as soon as payment clears.
        </DialogDescription>
        <PaymentChoice methods={s?.paymentMethods ?? []} value={method} onChange={setMethod} />
        <Button size="lg" onClick={() => join.mutate()} disabled={join.isPending || !method}>
          {join.isPending ? <SpinnerIcon className="animate-spin" /> : <LockSimpleIcon />} Pay {money(price ?? 0)}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
