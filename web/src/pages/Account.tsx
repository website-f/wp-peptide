import { ArrowUpRightIcon, CoinsIcon, CrownSimpleIcon, CubeIcon, GaugeIcon, HandshakeIcon, PackageIcon, UserIcon } from '@phosphor-icons/react'
import type { Icon } from '@phosphor-icons/react'
import { Link, NavLink, Navigate, useParams } from 'react-router'
import { AccountBox } from '@/components/account/AccountBox'
import { AccountOrders } from '@/components/account/AccountOrders'
import { AccountPoints } from '@/components/account/AccountPoints'
import { AccountProfile } from '@/components/account/AccountProfile'
import { RequireUser, firstName } from '@/components/account/bits'
import { date, moneyExact, num, pointsCents } from '@/lib/format'
import { useFeatures, useSettings } from '@/lib/queries'
import { TIER_LABEL, type Me } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useSeo } from '@/lib/seo'

type TabKey = 'orders' | 'points' | 'box' | 'profile'

const TABS: { key: TabKey; label: string; to: string; icon: Icon }[] = [
  { key: 'orders', label: 'Orders', to: '/account', icon: PackageIcon },
  { key: 'points', label: 'Points', to: '/account/points', icon: CoinsIcon },
  { key: 'box', label: 'My box', to: '/account/box', icon: CubeIcon },
  { key: 'profile', label: 'Profile', to: '/account/profile', icon: UserIcon },
]

export default function Account() {
  useSeo({ title: 'Your account', noindex: true })
  const { tab } = useParams()
  const key = (tab ?? 'orders') as TabKey
  if (!TABS.some((t) => t.key === key)) return <Navigate to="/account" replace />
  return <RequireUser>{(me) => <AccountView me={me} tab={key} />}</RequireUser>
}

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

function AccountView({ me, tab }: { me: Me & { user: NonNullable<Me['user']> }; tab: TabKey }) {
  const u = me.user
  const features = useFeatures()
  const { data: settings } = useSettings()
  const isAdmin = u.role === 'ADMIN'

  return (
    <div className="pb-20">
      <header className="container-x grid gap-6 pt-10 pb-8 md:pt-14 lg:grid-cols-[1fr_auto] lg:items-end">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{greeting()},</p>
          <h1 className="display mt-1 text-5xl break-words sm:text-6xl md:text-7xl">{firstName(u.name)}</h1>
          <div className="mt-4 flex flex-wrap gap-2">
            {isAdmin && (
              <QuickLink to="/admin" icon={GaugeIcon}>
                Admin panel
              </QuickLink>
            )}
            {me.affiliate && (
              <QuickLink to="/partners/dashboard" icon={HandshakeIcon}>
                Partner dashboard
              </QuickLink>
            )}
          </div>
        </div>

        {/* Member card: tier + points, echoing the gold vial label. */}
        <div className="relative w-full overflow-hidden rounded-xl border border-gold/25 bg-card p-5 lg:w-[380px]">
          <div aria-hidden className="absolute inset-x-0 top-0 gold-rule" />
          <div className="flex items-start justify-between gap-4">
            {features.membership ? (
              <div>
                <p className="text-xs text-muted-foreground uppercase">Membership</p>
                <p className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-gold/30 bg-gold/10 px-2 py-1 font-display text-lg font-semibold tracking-wide text-gold-ink uppercase">
                  <CrownSimpleIcon weight="fill" className="size-4" aria-hidden />
                  {TIER_LABEL[u.tier]}
                </p>
                {u.tierExpiresAt && <p className="mt-1.5 text-xs text-muted-foreground">Active until {date(u.tierExpiresAt)}</p>}
              </div>
            ) : (
              <div>
                <p className="text-xs text-muted-foreground uppercase">Rewards</p>
                <p className="mt-1 font-display text-lg font-semibold tracking-wide text-gold-ink uppercase">KYVO Points</p>
              </div>
            )}
            <div className="text-right">
              <p className="text-xs text-muted-foreground uppercase">Points</p>
              <p className="mt-1 font-mono text-2xl font-medium tabular-nums">{num(u.pointsBalance)}</p>
              <p className="font-mono text-xs text-muted-foreground tabular-nums">= {moneyExact(pointsCents(u.pointsBalance, settings?.points.valueCentsPer100))}</p>
            </div>
          </div>
          <Link
            to={features.membership ? '/membership' : '/points'}
            className="mt-4 flex min-h-11 items-center justify-between rounded-md border px-3 text-sm font-medium transition-colors hover:border-gold/40 hover:bg-gold/5"
          >
            {!features.membership
              ? 'How points work'
              : u.tier === 'MEMBER'
                ? 'Upgrade to earn more points'
                : u.tier === 'FOUNDER'
                  ? 'View membership benefits'
                  : 'Upgrade membership'}
            <ArrowUpRightIcon className="size-4 text-gold-ink" aria-hidden />
          </Link>
        </div>
      </header>

      <div className="sticky top-16 z-30 border-y bg-background/85 backdrop-blur-xl">
        <nav aria-label="Account sections" className="container-x">
          <ul className="scrollbar-none -mx-4 flex gap-1.5 overflow-x-auto px-4 py-2.5 sm:mx-0 sm:px-0">
            {TABS.map((t) => (
              <li key={t.key} className="shrink-0">
                <NavLink
                  to={t.to}
                  end
                  className={cn(
                    'inline-flex h-11 items-center gap-2 rounded-md px-4 text-sm font-medium whitespace-nowrap transition-colors',
                    tab === t.key ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                  aria-current={tab === t.key ? 'page' : undefined}
                >
                  <t.icon className="size-4" weight={tab === t.key ? 'fill' : 'regular'} aria-hidden />
                  {t.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>

      <section className="container-x pt-8" aria-label={TABS.find((t) => t.key === tab)?.label}>
        {tab === 'orders' && <AccountOrders />}
        {tab === 'points' && <AccountPoints />}
        {tab === 'box' && <AccountBox />}
        {tab === 'profile' && <AccountProfile key={u.id} user={u} />}
      </section>
    </div>
  )
}

function QuickLink({ to, icon: I, children }: { to: string; icon: Icon; children: string }) {
  return (
    <Link to={to} className="inline-flex h-11 items-center gap-2 rounded-md border px-3.5 text-sm font-medium transition-colors hover:border-gold/40 hover:text-gold-ink">
      <I className="size-4 text-gold-ink" aria-hidden />
      {children}
    </Link>
  )
}
