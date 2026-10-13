import { ArrowRightIcon, CaretLeftIcon, CaretRightIcon, CoinsIcon, CrownSimpleIcon, PackageIcon, StackIcon } from '@phosphor-icons/react'
import { motion, useReducedMotion } from 'motion/react'
import { useRef } from 'react'
import { Link } from 'react-router'
import { WideImage } from '@/components/brand/ProductImage'
import { Eyebrow, SectionTitle } from '@/components/brand/bits'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { faqs } from '@/lib/content'
import { date, money } from '@/lib/format'
import type { Coa, Settings } from '@/lib/types'
import { cn } from '@/lib/utils'

const ease = [0.16, 1, 0.3, 1] as const

export function AboutBlock({ compounds, sizes }: { compounds: number; sizes: number }) {
  const stats = [
    ['Catalogue', `${compounds} compounds, ${sizes} sizes`],
    ['Testing', 'ISO/IEC 17025 labs'],
    ['Shipping', 'Tracked, nationwide'],
    ['Use', 'Laboratory research only'],
  ]
  return (
    <section className="container-x grid items-center gap-10 py-20 md:py-28 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
      <div className="relative">
        <WideImage slug="bpc-157-tb-500" alt="KYVO BPC-157 and TB-500 blend vial" className="aspect-[4/3] rounded-xl lg:aspect-[5/4]" imgClassName="object-[50%_40%]" />
        <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-white/5 ring-inset" />
      </div>
      <div>
        <Eyebrow>About us</Eyebrow>
        <h2 className="display mt-4 text-5xl sm:text-6xl">Excellence. Support. Fair pricing.</h2>
        <p className="mt-5 max-w-[56ch] text-muted-foreground md:text-lg">
          KYVO Labs supplies laboratory-grade peptides to universities, contract labs and independent researchers. We work with a small number of
          synthesis partners, test every lot independently, and publish the results in full.
        </p>
        <p className="mt-4 max-w-[56ch] text-muted-foreground">
          Who we serve: research teams who need reproducible material and paperwork that stands up to review.
        </p>
        <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border">
          {stats.map(([k, v]) => (
            <div key={k} className="bg-background p-4 sm:p-5">
              <dt className="font-mono text-[10.5px] tracking-[0.18em] text-muted-foreground uppercase">{k}</dt>
              <dd className="mt-1.5 font-display text-xl leading-tight font-semibold uppercase sm:text-2xl">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}

/** Quantity tiers drawn as a rising staircase: the discount literally steps up. */
export function TierStairs({ settings }: { settings?: Settings }) {
  const reduce = useReducedMotion()
  const tiers = [{ min: 1, pct: 0 }, ...(settings?.tiers ?? [])]
  const top = tiers.at(-1)
  return (
    <section className="border-y bg-surface">
      <div className="container-x py-20 md:py-28">
        <SectionTitle sub={`Three vials is ${tiers[1]?.pct ?? 30}% off. ${top?.min ?? 10} is ${top?.pct ?? 40}%.`}>Buy more, pay less.</SectionTitle>
        <div className="mt-12 grid grid-cols-2 items-end gap-3 sm:grid-cols-4">
          {tiers.map((t, i) => (
            <motion.div
              key={t.min}
              initial={reduce ? false : { opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.7, delay: i * 0.1, ease }}
              className="flex min-h-[150px] flex-col justify-between gap-6 rounded-xl border bg-card p-5 sm:min-h-[var(--stair)]"
              style={{ ["--stair" as string]: `${150 + i * 46}px` }}
            >
              <p className="font-mono text-xs text-muted-foreground">{t.min === 1 ? '1 vial' : `${t.min}+ vials`}</p>
              <p className={t.pct ? 'display text-6xl text-gold-ink sm:text-7xl' : 'display text-4xl text-muted-foreground'}>{t.pct ? `${t.pct}%` : 'List'}</p>
              <p className="text-[13px] text-muted-foreground">{t.pct ? 'off every vial' : 'standard price'}</p>
            </motion.div>
          ))}
        </div>
        <p className="mt-6 text-sm text-muted-foreground">Same compound, any mix of sizes. Applied automatically in your cart.</p>
      </div>
    </section>
  )
}

/** " Shipping and X included." from the Build a Box settings, or nothing. */
function boxPerks(s?: Settings) {
  const perks = [s?.box.freeShipping ? 'Shipping' : '', s?.box.includedItem?.trim().toLowerCase() ?? ''].filter(Boolean)
  return perks.length ? ` ${perks.join(' and ')} included.` : ''
}

export function Programs({ settings }: { settings?: Settings }) {
  const membershipOn = settings?.features?.membership ?? false
  const p = settings?.points
  const w = settings?.wholesale ?? []
  const all = [
    {
      icon: CoinsIcon,
      to: '/points',
      name: 'KYVO Points',
      big: `${p?.perDollar.MEMBER ?? 2.5}x`,
      unit: 'points per RM1',
      body: `100 points = ${money(p?.valueCentsPer100 ?? 100)} off. Orders over ${p ? money(p.bonusThresholdCents) : 'RM800'} earn ${p?.bonusPoints ?? 500} bonus points.`,
    },
    {
      icon: CrownSimpleIcon,
      to: '/membership',
      name: 'Membership',
      big: `${p?.perDollar.FOUNDER ?? 10}x`,
      unit: 'points as a Founder',
      body: 'Insider, VIP and Founder tiers add free shipping, early access and priority fulfilment.',
    },
    {
      icon: PackageIcon,
      to: '/build-a-box',
      name: 'Build a Box',
      big: `${settings?.box.pct ?? 40}%`,
      unit: 'off, every month',
      body: `${settings?.box.slots ?? 4} compounds a month for ${settings?.box.commitMonths ?? 3} months minimum.${boxPerks(settings)}`,
    },
    {
      icon: StackIcon,
      to: '/bulk',
      name: 'Bulk orders',
      big: `${w[0]?.pct ?? 40}-${w.at(-1)?.pct ?? 55}%`,
      unit: 'off wholesale',
      body: w.map((x) => `${x.min} units ${x.pct}%`).join(', ') + '. Priced per product.',
    },
  ]
  const off = new Set([
    ...(membershipOn ? [] : ['/membership']),
    ...(settings?.box?.enabled === false ? ['/build-a-box'] : []),
    ...(settings?.bulk?.enabled === false ? ['/bulk'] : []),
  ])
  const items = all.filter((it) => !off.has(it.to))
  const word = ['Zero', 'One', 'Two', 'Three', 'Four'][items.length] ?? String(items.length)
  return (
    <section className="container-x py-20 md:py-28">
      <SectionTitle>{items.length === 1 ? 'One way to save.' : `${word} ways to save.`}</SectionTitle>
      {/* 4 programs sit in a 2x2 grid; 3 sit in one row so no cell is left empty. */}
      <div className={cn('mt-12 grid gap-px overflow-hidden rounded-xl border bg-border', items.length === 4 || items.length === 2 ? 'sm:grid-cols-2' : items.length === 3 ? 'lg:grid-cols-3' : '')}>
        {items.map((it) => (
          <Link key={it.name} to={it.to} className="group flex flex-col bg-background p-6 transition-colors hover:bg-card sm:p-8">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 font-display text-xl font-semibold tracking-wide uppercase">
                <it.icon className="size-5 text-gold-ink" /> {it.name}
              </span>
              <ArrowRightIcon className="size-5 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-gold-ink" />
            </div>
            <p className="mt-8 flex items-baseline gap-3">
              <span className="display text-6xl sm:text-7xl">{it.big}</span>
              <span className="text-sm text-muted-foreground">{it.unit}</span>
            </p>
            <p className="mt-3 max-w-[44ch] text-sm text-muted-foreground">{it.body}</p>
          </Link>
        ))}
      </div>
    </section>
  )
}

export function CoaRail({ coas }: { coas: Coa[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const scroll = (dir: 1 | -1) => ref.current?.scrollBy({ left: dir * Math.min(ref.current.clientWidth * 0.8, 640), behavior: 'smooth' })
  return (
    <section className="border-y bg-surface py-20 md:py-28">
      <div className="container-x flex items-end justify-between gap-6">
        <SectionTitle sub="Recent lots and their results. Search any lot number in the library.">Every lot, on the record.</SectionTitle>
        <div className="hidden shrink-0 gap-2 sm:flex">
          <Button variant="outline" size="icon" onClick={() => scroll(-1)} aria-label="Previous certificates">
            <CaretLeftIcon />
          </Button>
          <Button variant="outline" size="icon" onClick={() => scroll(1)} aria-label="Next certificates">
            <CaretRightIcon />
          </Button>
        </div>
      </div>
      <div
        ref={ref}
        className="scrollbar-none mt-10 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-4 px-4 pb-2 sm:scroll-px-6 sm:px-6 lg:scroll-px-[max(2rem,calc((100vw-1320px)/2+2rem))] lg:px-[max(2rem,calc((100vw-1320px)/2+2rem))]"
      >
        {coas.map((c) => (
          <Link
            key={c.id}
            to={`/coa-library?q=${encodeURIComponent(c.lotNumber)}`}
            className="group w-[78vw] max-w-[300px] shrink-0 snap-start rounded-xl border bg-card p-5 transition-colors hover:border-gold/40"
          >
            <p className="font-display text-xl font-semibold uppercase group-hover:text-gold-ink">{c.product?.name}</p>
            <p className="font-mono text-xs text-muted-foreground">Lot {c.lotNumber}</p>
            <p className="mt-6 font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">HPLC purity</p>
            <p className="display mt-1 text-4xl">{c.purity.toFixed(2)}%</p>
            <p className="mt-4 border-t pt-3 text-[12px] text-muted-foreground">
              Tested {date(c.testedAt)}, {c.assays} assays
            </p>
          </Link>
        ))}
      </div>
      <div className="container-x mt-8">
        <Button variant="outline" asChild>
          <Link to="/coa-library">Open the COA library</Link>
        </Button>
      </div>
    </section>
  )
}

export function FaqSection({ settings, limit = 5 }: { settings?: Settings; limit?: number }) {
  const list = faqs(settings).slice(0, limit)
  return (
    <section id="faq" className="container-x grid scroll-mt-24 gap-10 py-20 md:py-28 lg:grid-cols-[0.8fr_1.2fr]">
      <div>
        <SectionTitle>Before you order.</SectionTitle>
        <Link to="/faq" className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-gold-ink hover:underline">
          All questions <ArrowRightIcon className="size-4" />
        </Link>
      </div>
      <Accordion type="single" collapsible className="border-t">
        {list.map((f) => (
          <AccordionItem key={f.q} value={f.q}>
            <AccordionTrigger className="py-5 text-left text-base font-medium hover:no-underline">{f.q}</AccordionTrigger>
            <AccordionContent className="pb-5 text-[15px] leading-relaxed text-muted-foreground">{f.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  )
}

export function CtaBand() {
  return (
    <section className="relative isolate overflow-hidden">
      <WideImage slug="ghk-cu" alt="" className="absolute inset-0 -z-10 size-full" imgClassName="object-[50%_40%]" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-r from-[#0d0c0b] via-[#0d0c0b]/85 to-[#0d0c0b]/30" />
      <div className="container-x py-24 text-[#f3efe6] md:py-32">
        <h2 className="display max-w-xl text-5xl sm:text-6xl md:text-7xl">Advance your research.</h2>
        <p className="mt-4 max-w-md text-[#f3efe6]/75 md:text-lg">Verified, high-purity peptides with the paperwork to match.</p>
        <Button size="lg" className="mt-8" asChild>
          <Link to="/shop">
            Shop compounds <ArrowRightIcon weight="bold" data-icon="inline-end" />
          </Link>
        </Button>
      </div>
    </section>
  )
}
