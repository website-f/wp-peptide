import {
  ArrowDownIcon,
  ArrowRightIcon,
  ChartLineUpIcon,
  CheckIcon,
  LinkSimpleIcon,
  ProhibitIcon,
  TicketIcon,
} from '@phosphor-icons/react'
import { motion, useReducedMotion } from 'motion/react'
import { useEffect } from 'react'
import { Link, useLocation } from 'react-router'
import { PartnerApply } from '@/components/account/PartnerApplyForm'
import { ErrorState } from '@/components/account/bits'
import { Eyebrow } from '@/components/brand/bits'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { money, moneyExact } from '@/lib/format'
import { useMe, useSettings } from '@/lib/queries'
import type { Settings } from '@/lib/types'

type Aff = Settings['affiliate']

/** Inline value that shows a skeleton while settings load. */
function V({ children, w = 'w-10' }: { children: React.ReactNode | undefined; w?: string }) {
  if (children === undefined || children === null) return <Skeleton className={`inline-block h-[0.8em] ${w} align-middle`} />
  return <>{children}</>
}

export default function Partners() {
  const settings = useSettings()
  const me = useMe()
  const location = useLocation()
  const a = settings.data?.affiliate
  const reduce = useReducedMotion()

  // Lazy route: the #apply target only exists after this chunk renders.
  useEffect(() => {
    if (!location.hash) return
    const el = document.getElementById(location.hash.slice(1))
    if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }))
  }, [location.hash, reduce])

  const isPartner = Boolean(me.data?.affiliate)
  const rise = reduce ? {} : { initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] as const } }

  return (
    <div className="overflow-x-clip">
      {/* Hero: split layout with a commission "statement" on the right. */}
      <section className="relative isolate">
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_80%_20%,color-mix(in_oklch,var(--gold)_14%,transparent),transparent_55%)]" />
        <div className="container-x grid gap-12 pt-12 pb-16 md:pt-20 md:pb-24 lg:grid-cols-[1.15fr_1fr] lg:items-center lg:gap-16">
          <motion.div {...rise}>
            <Eyebrow>KYVO partner program</Eyebrow>
            <h1 className="display mt-4 text-[3.4rem] sm:text-7xl lg:text-8xl">
              Earn{' '}
              <span className="gold-text">
                <V w="w-24">{a && `${a.defaultRate}%`}</V>
              </span>{' '}
              on every order you send us
            </h1>
            <p className="mt-6 max-w-[52ch] text-base text-muted-foreground md:text-lg">
              For creators, lab educators and publishers whose audience already buys research compounds. Share your link or code, we handle fulfilment and
              support, and your dashboard shows every click and commission as it happens.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              {isPartner ? (
                <Button asChild size="lg">
                  <Link to="/partners/dashboard">
                    Open your dashboard <ArrowRightIcon />
                  </Link>
                </Button>
              ) : (
                <Button asChild size="lg">
                  <a href="#apply">
                    Apply in two minutes <ArrowDownIcon />
                  </a>
                </Button>
              )}
              <Button asChild size="lg" variant="outline">
                <a href="#rules">Read the rules first</a>
              </Button>
            </div>
          </motion.div>

          <motion.div {...rise} transition={reduce ? undefined : { duration: 0.7, delay: 0.12, ease: [0.16, 1, 0.3, 1] }}>
            <Statement a={a} />
          </motion.div>
        </div>
      </section>

      <div className="container-x">
        <div className="gold-rule" />
      </div>

      {/* How it works: a numbered rail, not a card row. */}
      <section className="container-x py-16 md:py-24" aria-labelledby="how-title">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,360px)_1fr] lg:gap-16">
          <div>
            <h2 id="how-title" className="display text-4xl sm:text-5xl md:text-6xl">
              How it works
            </h2>
            <p className="mt-3 max-w-[40ch] text-muted-foreground">Three steps. No minimum audience size, no monthly quota.</p>
          </div>
          <ol className="relative grid gap-10 border-l border-gold/30 pl-8 md:gap-12 md:pl-12">
            {[
              {
                t: 'Apply',
                b: 'Tell us where you publish and how you plan to talk about KYVO. We review every application by hand and reply by email.',
              },
              {
                t: 'Share your link and code',
                b: (
                  <>
                    Once approved you get a personal link and a code. Shoppers who use your code get <V>{a && `${a.couponPct}%`}</V> off, and every order through either
                    one is credited to you.
                  </>
                ),
              },
              {
                t: 'Get paid',
                b: (
                  <>
                    Commission becomes available when the order is delivered. Request a bank transfer to your Malaysian account once you pass{' '}
                    <V w="w-14">{a && money(a.minPayoutCents, { whole: true })}</V>.
                  </>
                ),
              },
            ].map((s, i) => (
              <li key={s.t} className="relative">
                <span
                  aria-hidden
                  className="absolute top-1 -left-8 grid size-7 -translate-x-1/2 place-items-center rounded-full border border-gold/40 bg-background font-mono text-xs text-gold-ink md:-left-12"
                >
                  {i + 1}
                </span>
                <h3 className="display text-3xl md:text-4xl">{s.t}</h3>
                <p className="mt-2 max-w-[56ch] text-muted-foreground">{s.b}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* The numbers: a single ruled band of large figures. */}
      <section className="border-y bg-surface/60" aria-labelledby="numbers-title">
        <div className="container-x py-14 md:py-20">
          <h2 id="numbers-title" className="display text-4xl sm:text-5xl">
            The numbers
          </h2>
          {settings.isError ? (
            <div className="mt-8">
              <ErrorState error={settings.error} onRetry={() => void settings.refetch()} title="Could not load program terms" />
            </div>
          ) : (
            <dl className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border lg:grid-cols-4">
              <Figure label="Commission on each order" value={a && `${a.defaultRate}%`} note="Of the order value after discounts" />
              <Figure label="Attribution window" value={a && `${a.cookieDays}`} unit="days" note="From the shopper's last click" />
              <Figure label="Shopper discount" value={a && `${a.couponPct}%`} note="With your partner code" />
              <Figure label="Minimum payout" value={a && money(a.minPayoutCents, { whole: true })} note="Paid by bank transfer" />
            </dl>
          )}
        </div>
      </section>

      {/* What you get: asymmetric bento. */}
      <section className="container-x py-16 md:py-24" aria-labelledby="get-title">
        <h2 id="get-title" className="display max-w-2xl text-4xl sm:text-5xl md:text-6xl">
          What you get on day one
        </h2>
        <div className="mt-10 grid gap-4 lg:grid-cols-5 lg:grid-rows-2">
          <div className="relative overflow-hidden rounded-xl border bg-card p-6 sm:p-8 lg:col-span-3 lg:row-span-2">
            <ChartLineUpIcon className="size-7 text-gold-ink" aria-hidden />
            <h3 className="display mt-5 text-3xl md:text-4xl">A live dashboard</h3>
            <p className="mt-2 max-w-[48ch] text-muted-foreground">
              Clicks, orders, conversion and earnings for the last 30 days, every commission with its order status, and a one-tap payout request when your
              balance is ready.
            </p>
            <MiniBars />
          </div>
          <div className="rounded-xl border bg-card p-6 lg:col-span-2">
            <div className="flex items-center gap-3">
              <LinkSimpleIcon className="size-6 text-gold-ink" aria-hidden />
              <h3 className="font-display text-2xl font-semibold uppercase">Personal link</h3>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">Works on any page of the store, so you can link straight to the compound you are talking about.</p>
            <p className="mt-4 truncate rounded-md border bg-surface px-3 py-2.5 font-mono text-sm">
              {typeof window !== 'undefined' ? window.location.host : 'kyvolabs.com'}/?ref=<span className="text-gold-ink">yourname</span>
            </p>
          </div>
          <div className="rounded-xl border border-gold/25 bg-gold/5 p-6 lg:col-span-2">
            <div className="flex items-center gap-3">
              <TicketIcon className="size-6 text-gold-ink" aria-hidden />
              <h3 className="font-display text-2xl font-semibold uppercase">Your own code</h3>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              For podcasts, videos and anywhere a link does not survive. Shoppers save <V>{a && `${a.couponPct}%`}</V> and you are still credited.
            </p>
            <p className="mt-4 inline-flex rounded-md border border-dashed border-gold/50 px-3 py-2 font-mono text-sm tracking-widest text-gold-ink">YOURNAME</p>
          </div>
        </div>
      </section>

      {/* Rules */}
      <section id="rules" className="scroll-mt-24 border-t" aria-labelledby="rules-title">
        <div className="container-x grid gap-10 py-16 md:py-24 lg:grid-cols-[1fr_1.4fr] lg:gap-16">
          <div>
            <h2 id="rules-title" className="display text-4xl sm:text-5xl md:text-6xl">
              The rules
            </h2>
            <p className="mt-4 max-w-[46ch] text-muted-foreground">
              Everything we sell is for laboratory research. How you talk about it matters as much as how much you sell, and these rules are part of your partner
              agreement.
            </p>
            <p className="mt-4 text-sm text-muted-foreground">
              Full wording is in the partner section of our{' '}
              <Link to="/policies/terms" className="text-gold-ink underline underline-offset-2">
                terms
              </Link>
              .
            </p>
          </div>
          <ul className="grid gap-px overflow-hidden rounded-xl border bg-border">
            <Rule
              t="Research use only"
              b="Present products as research materials. No dosing advice, protocols, stacking guides or instructions for people or animals."
            />
            <Rule t="No health or treatment claims" b="Never say or imply a product treats, cures or prevents anything, or improves health, looks or performance. No before-and-after content." />
            <Rule t="Refunded and cancelled orders earn nothing" b="Commission is voided if an order is cancelled, refunded or charged back, including after it was marked available." />
            <Rule t="No self-referrals" b="Orders you, your household or your own accounts place through your link or code are not eligible." />
            <Rule t="No paid search on our brand" b="Do not bid on KYVO or KYVO Labs keywords, or run ads that look like they come from us." />
          </ul>
        </div>
      </section>

      {/* FAQ */}
      <section className="border-t bg-surface/40" aria-labelledby="faq-title">
        <div className="container-x grid gap-10 py-16 md:py-24 lg:grid-cols-[minmax(0,360px)_1fr] lg:gap-16">
          <div>
            <h2 id="faq-title" className="display text-4xl sm:text-5xl md:text-6xl">
              Questions
            </h2>
            {settings.data && (
              <p className="mt-3 text-muted-foreground">
                Something else? Email{' '}
                <a href={`mailto:${settings.data.supportEmail}`} className="text-gold-ink underline underline-offset-2">
                  {settings.data.supportEmail}
                </a>
                .
              </p>
            )}
          </div>
          <Faq a={a} />
        </div>
      </section>

      {/* Application */}
      <section id="apply" className="scroll-mt-20 border-t" aria-labelledby="apply-title">
        <div className="container-x grid gap-10 py-16 md:py-24 lg:grid-cols-[minmax(0,380px)_1fr] lg:gap-16">
          <div className="lg:sticky lg:top-24 lg:self-start">
            <h2 id="apply-title" className="display text-5xl sm:text-6xl md:text-7xl">
              Apply
            </h2>
            <p className="mt-4 text-muted-foreground">You get your link and code straight away. They start earning once we approve your account.</p>
            <ul className="mt-6 grid gap-3 text-sm">
              {['Free to join, no quotas', 'Reviewed by a person, not a bot', 'Change payout details any time'].map((x) => (
                <li key={x} className="flex items-center gap-2.5">
                  <CheckIcon weight="bold" className="size-4 shrink-0 text-gold-ink" aria-hidden />
                  {x}
                </li>
              ))}
            </ul>
          </div>
          <div className="min-w-0">
            <PartnerApply />
          </div>
        </div>
      </section>
    </div>
  )
}

function Statement({ a }: { a: Aff | undefined }) {
  const example = 50000
  return (
    <div className="relative mx-auto w-full max-w-md lg:max-w-none">
      <div aria-hidden className="absolute -inset-4 -z-10 rounded-3xl bg-gold/5 blur-2xl" />
      <div className="overflow-hidden rounded-xl border border-gold/25 bg-card shadow-[0_40px_90px_-50px_color-mix(in_oklch,var(--gold)_45%,transparent)]">
        <div className="gold-rule" />
        <div className="flex items-center justify-between border-b px-5 py-4">
          <p className="font-display text-lg font-semibold tracking-wide uppercase">Commission statement</p>
          <span className="rounded-md bg-gold/10 px-2 py-0.5 font-mono text-[11px] text-gold-ink">EXAMPLE</span>
        </div>
        <dl className="divide-y text-sm">
          <Row k="Referral link">
            <span className="font-mono">/?ref=yourname</span>
          </Row>
          <Row k="Shopper code">
            <span className="font-mono">YOURNAME</span>
            <span className="ml-2 font-mono text-gold-ink">
              <V>{a && `-${a.couponPct}%`}</V>
            </span>
          </Row>
          <Row k="Order value">
            <span className="font-mono tabular-nums">{moneyExact(example)}</span>
          </Row>
          <Row k={<>Your commission ({a ? `${a.defaultRate}%` : '...'})</>}>
            <span className="font-mono text-lg font-medium text-gold-ink tabular-nums">
              <V w="w-20">{a && moneyExact(Math.round((example * a.defaultRate) / 100))}</V>
            </span>
          </Row>
          <Row k="Counts if they buy within">
            <span className="font-mono tabular-nums">
              <V>{a && `${a.cookieDays} days`}</V>
            </span>
          </Row>
        </dl>
        <p className="border-t bg-surface/60 px-5 py-3 text-xs text-muted-foreground">Illustration only. Commission is calculated on the order value after discounts, excluding shipping.</p>
      </div>
    </div>
  )
}

function Row({ k, children }: { k: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-3.5">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  )
}

function Figure({ label, value, unit, note }: { label: string; value: string | undefined; unit?: string; note: string }) {
  return (
    <div className="flex flex-col bg-card p-5 sm:p-7">
      <dt className="order-2 mt-2 text-sm font-medium">{label}</dt>
      <dd className="order-1 font-display text-5xl leading-none font-semibold tabular-nums sm:text-6xl lg:text-7xl">
        {value === undefined ? <Skeleton className="h-12 w-24" /> : value}
        {unit && value !== undefined && <span className="ml-1.5 text-xl text-muted-foreground sm:text-2xl">{unit}</span>}
      </dd>
      <dd className="order-3 mt-1 text-xs text-muted-foreground">{note}</dd>
    </div>
  )
}

function Rule({ t, b }: { t: string; b: string }) {
  return (
    <li className="flex gap-4 bg-card p-5 sm:p-6">
      <ProhibitIcon className="mt-0.5 size-5 shrink-0 text-gold-ink" aria-hidden />
      <div>
        <p className="font-medium">{t}</p>
        <p className="mt-1 text-sm text-muted-foreground">{b}</p>
      </div>
    </li>
  )
}

/** Decorative bars for the dashboard tile. */
function MiniBars() {
  const h = [28, 40, 22, 55, 38, 62, 48, 70, 44, 82, 58, 90, 66, 76]
  return (
    <div aria-hidden className="mt-8 flex h-28 items-end gap-1.5 border-b border-gold/20 sm:h-36">
      {h.map((v, i) => (
        <div key={i} className="flex-1 rounded-t-sm bg-gradient-to-t from-gold/15 to-gold/50" style={{ height: `${v}%` }} />
      ))}
    </div>
  )
}

function Faq({ a }: { a: Aff | undefined }) {
  const rate = a ? `${a.defaultRate}%` : 'your commission rate'
  const days = a ? `${a.cookieDays} days` : 'the attribution window'
  const pct = a ? `${a.couponPct}%` : 'a discount'
  const min = a ? money(a.minPayoutCents, { whole: true }) : 'the minimum'
  const items = [
    {
      q: 'Who can apply?',
      a: 'Anyone 21 or older who publishes research, lab or science content, from short video and podcasts to newsletters and blogs. There is no follower minimum. We look for audiences that fit research-use products and content that follows our rules.',
    },
    {
      q: 'How is an order credited to me?',
      a: `When someone opens your link, we remember it for ${days} on that device. If they order within that time, the order is yours. If they use your code at checkout, the order is yours regardless of how they arrived. The last partner link clicked wins.`,
    },
    {
      q: 'What does the shopper get?',
      a: `Your code takes ${pct} off standard orders, on top of any quantity pricing. One code per order. Bulk and Build a Box orders already carry their own pricing, so there your code credits you without adding a further discount.`,
    },
    {
      q: 'When can I withdraw my commission?',
      a: `Each commission starts as pending and becomes available once the order is delivered. When your available balance reaches ${min}, request a payout from your dashboard. We pay by bank transfer (IBG or DuitNow) to the Malaysian account you add when you apply.`,
    },
    {
      q: 'What rate do I earn?',
      a: `New partners start at ${rate} of the order value after discounts. Shipping and tax are excluded. Partners who consistently send high-quality traffic can be moved to a higher rate.`,
    },
    {
      q: 'What can I say about the products?',
      a: 'You can talk about purity, third-party testing, certificates of analysis, sourcing and how we pack and ship. You cannot give dosing advice or suggest any product is for human or animal use, or that it treats or improves any condition.',
    },
    {
      q: 'Can I use my own link to buy?',
      a: 'No. Self-referrals and orders from your own household are not eligible for commission. Members get their own discounts and points instead.',
    },
  ]
  return (
    <Accordion type="single" collapsible className="rounded-xl border bg-card px-5 sm:px-6">
      {items.map((it) => (
        <AccordionItem key={it.q} value={it.q}>
          <AccordionTrigger className="min-h-14 items-center py-4 font-display text-xl font-semibold tracking-wide uppercase hover:no-underline">
            {it.q}
          </AccordionTrigger>
          <AccordionContent className="max-w-[64ch] pb-5 text-[15px] leading-relaxed text-muted-foreground">{it.a}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  )
}
