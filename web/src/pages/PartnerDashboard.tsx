import { ArrowRightIcon, HandshakeIcon, HourglassMediumIcon, WarningIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { Approved } from '@/components/account/PartnerApproved'
import { type AffiliateDash, type Full } from '@/components/account/PartnerParts'
import { ErrorState, PageSkeleton, RequireUser, StatusPill, firstName } from '@/components/account/bits'
import { EmptyState } from '@/components/brand/bits'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { date } from '@/lib/format'
import { useSettings } from '@/lib/queries'
import type { Me } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useSeo } from '@/lib/seo'

export default function PartnerDashboard() {
  useSeo({ title: 'Partner dashboard', noindex: true })
  return <RequireUser>{(me) => <Dashboard me={me} />}</RequireUser>
}

function Dashboard({ me }: { me: Me & { user: NonNullable<Me['user']> } }) {
  const q = useQuery({ queryKey: ['affiliate', 'me', me.user.id], queryFn: () => api.get<AffiliateDash>('/api/affiliate/me') })

  if (q.isPending) return <PageSkeleton />
  if (q.isError)
    return (
      <div className="container-x py-16">
        <ErrorState error={q.error} onRetry={() => void q.refetch()} title="Could not load your partner dashboard" />
      </div>
    )

  const d = q.data
  if (!d.affiliate)
    return (
      <div className="container-x py-16 md:py-24">
        <EmptyState
          icon={<HandshakeIcon />}
          title="You are not a partner yet"
          body="Apply in a couple of minutes to get your own link, a shopper discount code and this dashboard."
          action={
            <Button asChild size="lg">
              <Link to="/partners#apply">
                Apply to the partner program <ArrowRightIcon />
              </Link>
            </Button>
          }
        />
      </div>
    )

  if (d.affiliate.status !== 'APPROVED') return <NotActive d={d as Full} name={me.user.name} />
  return <Approved d={d as Full} name={me.user.name} />
}

/* --------------------------------------------------------- not approved */

function NotActive({ d, name }: { d: Full; name: string }) {
  const settings = useSettings()
  const support = settings.data?.supportEmail
  const a = d.affiliate
  const pending = a.status === 'PENDING'
  const copy = {
    PENDING: {
      title: 'Application under review',
      body: `Thanks, ${firstName(name)}. A person on our team reads every application and checks your channels against our research-use rules. We email you as soon as there is a decision, and this page switches to your live dashboard the moment you are approved.`,
    },
    REJECTED: {
      title: 'Application not approved',
      body: 'We could not approve this application. This usually means the channel content or audience does not fit research-use products, or the promotion plan conflicts with our rules on dosing advice and health claims. If something has changed, email us and we will take another look.',
    },
    SUSPENDED: {
      title: 'Partner account paused',
      body: 'Your partner account is paused, so your link and code are not crediting new orders and payouts are on hold. This happens when content breaks the partner rules or we need to verify something. Email us and we will explain what is needed to reinstate it.',
    },
  }[a.status as 'PENDING' | 'REJECTED' | 'SUSPENDED']

  return (
    <div className="container-x py-12 md:py-20">
      <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-[1.4fr_1fr]">
        <section className={cn('rounded-xl border p-6 sm:p-8', pending ? 'border-gold/30 bg-gold/5' : 'border-destructive/25 bg-destructive/5')}>
          <div className={cn('grid size-12 place-items-center rounded-full', pending ? 'bg-gold/15 text-gold-ink' : 'bg-destructive/10 text-destructive')}>
            {pending ? <HourglassMediumIcon className="size-6" weight="fill" aria-hidden /> : <WarningIcon className="size-6" weight="fill" aria-hidden />}
          </div>
          <h1 className="display mt-5 text-4xl sm:text-5xl">{copy.title}</h1>
          <p className="mt-3 text-muted-foreground">{copy.body}</p>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
            {support ? (
              <Button asChild variant={pending ? 'outline' : 'default'} className="h-11">
                <a href={`mailto:${support}?subject=${encodeURIComponent(`Partner account: ${a.code}`)}`}>Email {support}</a>
              </Button>
            ) : (
              <Button asChild variant="outline" className="h-11">
                <Link to="/contact">Contact support</Link>
              </Button>
            )}
            <Button asChild variant="ghost" className="h-11">
              <Link to="/partners#rules">Partner rules</Link>
            </Button>
          </div>
        </section>
        <aside className="rounded-xl border bg-card p-6">
          <p className="text-xs text-muted-foreground uppercase">Your application</p>
          <dl className="mt-4 grid gap-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Status</dt>
              <dd>
                <StatusPill tone={pending ? 'warning' : 'danger'}>{pending ? 'In review' : a.status === 'REJECTED' ? 'Not approved' : 'Paused'}</StatusPill>
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Applied</dt>
              <dd>{date(a.createdAt)}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Platform</dt>
              <dd>{a.platform}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="shrink-0 text-muted-foreground">Handle</dt>
              <dd className="min-w-0 truncate">{a.handle}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Reserved code</dt>
              <dd className="font-mono">{a.couponCode}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </div>
  )
}
