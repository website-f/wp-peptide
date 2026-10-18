import { ArrowRightIcon, CoinsIcon } from '@phosphor-icons/react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/brand/bits'
import { Button } from '@/components/ui/button'
import { money, num, pointsCents } from '@/lib/format'
import { useFeatures, useMe, useSettings } from '@/lib/queries'
import { TIER_LABEL, type Tier } from '@/lib/types'
import { useSeo } from '@/lib/seo'

export default function Points() {
  useSeo({ title: 'Points', description: 'Earn points on every KYVO order and use them as a discount on the next one.' })
  const { data: s } = useSettings()
  const { data: me } = useMe()
  const features = useFeatures()
  const tiers: Tier[] = features.membership ? ['MEMBER', 'INSIDER', 'VIP', 'FOUNDER'] : ['MEMBER']
  const p = s?.points
  // Worked example: a typical monthly order of RM500.
  const order = 50000
  const earn = (t: Tier) => Math.floor((order / 100) * (p?.perDollar[t] ?? 0))

  return (
    <>
      <PageHeader title="Points that pay for your next order." intro={`Earn on every order, redeem at checkout. 100 points = ${money(p?.valueCentsPer100 ?? 100)}.`}>
        {me?.user && (
          <p className="mt-6 inline-flex items-center gap-2 rounded-md border border-gold/30 bg-gold/10 px-3.5 py-2 text-sm">
            <CoinsIcon className="size-4 text-gold-ink" /> You have <strong className="font-mono">{num(me.user.pointsBalance)}</strong> points, worth{' '}
            {money(pointsCents(me.user.pointsBalance, p?.valueCentsPer100))}.
          </p>
        )}
      </PageHeader>

      <section className="container-x grid gap-10 pb-20 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
        <div className="rounded-xl border bg-card p-6 sm:p-8">
          <p className="font-display text-2xl font-semibold uppercase">A {money(order)} order earns</p>
          <ul className="mt-6 grid gap-3">
            {tiers.map((t) => (
              <li key={t} className="flex items-baseline justify-between gap-4 border-b pb-3 last:border-0">
                <span className="font-medium">{features.membership ? TIER_LABEL[t] : 'Every account'}</span>
                <span className="text-right">
                  <span className="font-mono text-lg">{num(earn(t))} pts</span>
                  <span className="block font-mono text-[12px] text-gold-ink">{money(pointsCents(earn(t), p?.valueCentsPer100))} back</span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[13px] text-muted-foreground">
            Orders over {p ? money(p.bonusThresholdCents) : 'RM800'} also earn a flat {p?.bonusPoints ?? 500} bonus points.
          </p>
        </div>

        <div>
          <h2 className="display text-4xl sm:text-5xl">How it works</h2>
          <dl className="mt-8 grid gap-6">
            {[
              [
                'Earn',
                features.membership
                  ? `${p?.perDollar.MEMBER ?? 2.5} points per RM1 as a free member, up to ${p?.perDollar.FOUNDER ?? 10} as a Founder. Points are counted after discounts, before shipping.`
                  : `${p?.perDollar.MEMBER ?? 2.5} points for every RM1 you spend. Points are counted after discounts, before shipping.`,
              ],
              ['Post', 'Points land in your account the moment your payment clears.'],
              ['Redeem', `Switch points on at checkout. They can cover up to ${p?.maxRedeemPct ?? 50}% of an order.`],
              ['Keep', `Points stay valid for ${p?.expiryMonths ?? 12} months from the day they post.`],
            ].map(([k, v]) => (
              <div key={k} className="grid grid-cols-[88px_1fr] gap-4">
                <dt className="font-display text-2xl font-semibold text-gold-ink uppercase">{k}</dt>
                <dd className="text-muted-foreground">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-10 flex flex-wrap gap-3">
            <Button asChild size="lg">
              {features.membership ? (
                <Link to="/membership">
                  Earn up to 4x the points <ArrowRightIcon weight="bold" data-icon="inline-end" />
                </Link>
              ) : (
                <Link to="/shop">
                  Shop compounds <ArrowRightIcon weight="bold" data-icon="inline-end" />
                </Link>
              )}
            </Button>
            {!me?.user && (
              <Button asChild size="lg" variant="outline">
                <Link to="/register">Create free account</Link>
              </Button>
            )}
          </div>
        </div>
      </section>
    </>
  )
}
