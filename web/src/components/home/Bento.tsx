import { ArrowRightIcon, CheckIcon, EnvelopeSimpleIcon, PackageIcon, TruckIcon, CreditCardIcon, HouseLineIcon } from '@phosphor-icons/react'
import { motion, useReducedMotion } from 'motion/react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { ProductImage } from '@/components/brand/ProductImage'
import { CoaSheet } from '@/components/product/CoaSheet'
import { money } from '@/lib/format'
import type { Coa, Settings } from '@/lib/types'
import { cn } from '@/lib/utils'

function Cell({ className, children, i }: { className?: string; children: ReactNode; i: number }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.7, delay: i * 0.07, ease: [0.16, 1, 0.3, 1] }}
      className={cn('relative overflow-hidden rounded-xl border bg-card p-6 sm:p-8', className)}
    >
      {children}
    </motion.div>
  )
}

function CellTitle({ children }: { children: ReactNode }) {
  return <h3 className="display text-3xl sm:text-4xl">{children}</h3>
}

function MoreLink({ to, children }: { to: string; children: ReactNode }) {
  const external = to.startsWith('#')
  const cls = 'group mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-gold-ink'
  const inner = (
    <>
      {children}
      <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
    </>
  )
  return external ? (
    <a href={to} className={cls}>
      {inner}
    </a>
  ) : (
    <Link to={to} className={cls}>
      {inner}
    </Link>
  )
}

export function Bento({ coa, coaProduct, settings, boxImages }: { coa?: Coa; coaProduct?: string; settings?: Settings; boxImages: { image: string | null; name: string }[] }) {
  const steps = [
    { icon: CreditCardIcon, label: 'Paid', note: `before ${settings?.shipping.cutoff ?? '2pm'}` },
    { icon: PackageIcon, label: 'Packed', note: 'same day' },
    { icon: TruckIcon, label: 'With courier', note: 'tracking emailed' },
    { icon: HouseLineIcon, label: 'Delivered', note: 'signed for' },
  ]
  return (
    <div className="grid gap-4 lg:grid-cols-12 lg:grid-rows-[auto_auto_auto]">
      {/* Transparency: tall left cell with a real rendered certificate */}
      <Cell i={0} className="flex flex-col bg-[radial-gradient(120%_80%_at_100%_0%,color-mix(in_oklch,var(--gold)_14%,transparent),transparent_60%)] lg:col-span-7 lg:row-span-2">
        <CellTitle>A certificate for every lot.</CellTitle>
        <p className="mt-3 max-w-[52ch] text-muted-foreground">
          Each lot is tested by an independent laboratory before it ships. The full panel sits on the product page and in the COA library.
        </p>
        <MoreLink to="/coa-library">Open the COA library</MoreLink>
        <div className="mt-8 flex flex-1 items-end justify-center lg:justify-end">
          {coa ? (
            <CoaSheet coa={coa} productName={coaProduct ?? ''} compact className="w-full max-w-md rotate-[-1.2deg] lg:translate-x-4 lg:translate-y-2" />
          ) : (
            <div className="h-72 w-full max-w-md animate-pulse rounded-xl bg-muted" />
          )}
        </div>
      </Cell>

      {/* Support */}
      <Cell i={1} className="lg:col-span-5">
        <CellTitle>A person answers.</CellTitle>
        <p className="mt-3 text-muted-foreground">One support inbox, read by the team that packs your order.</p>
        <div className="mt-6 grid gap-2.5 text-[13.5px]">
          <p className="max-w-[85%] justify-self-end rounded-xl rounded-br-sm bg-secondary px-3.5 py-2.5">Where do I find the certificate for my lot?</p>
          <p className="max-w-[88%] rounded-xl rounded-bl-sm border border-gold/25 bg-gold/10 px-3.5 py-2.5">
            The lot number is printed on your vial. Search it in the COA library and the full certificate opens.
          </p>
        </div>
        {settings && (
          <a href={`mailto:${settings.supportEmail}`} className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-gold-ink hover:underline">
            <EnvelopeSimpleIcon className="size-4" /> {settings.supportEmail}
          </a>
        )}
      </Cell>

      {/* Research use only */}
      <Cell i={2} className="lg:col-span-5">
        <CellTitle>Answers before you order.</CellTitle>
        <dl className="mt-5 grid gap-3 text-sm">
          {[
            ['How do the quantity tiers work?', `3 vials save ${settings?.tiers[0]?.pct ?? 30}%, 10 save ${settings?.tiers.at(-1)?.pct ?? 40}%.`],
            ['Do you provide certificates?', 'Yes, for every lot.'],
            ['Are your products for human use?', 'No. Laboratory research only.'],
          ].map(([q, a]) => (
            <div key={q} className="border-l-2 border-gold/40 pl-3">
              <dt className="font-medium">{q}</dt>
              <dd className="text-muted-foreground">{a}</dd>
            </div>
          ))}
        </dl>
        <MoreLink to="#faq">Read the answers</MoreLink>
      </Cell>

      {/* Fulfilment timeline */}
      <Cell i={3} className="bg-surface lg:col-span-6">
        <CellTitle>Tracked, door to door.</CellTitle>
        <p className="mt-3 text-muted-foreground">
          Same-day dispatch, tracked courier nationwide, free over {settings ? money(settings.shipping.freeThresholdCents) : 'RM800'}.
        </p>
        <ol className="mt-7 grid grid-cols-4 gap-2">
          {steps.map((s, idx) => (
            <li key={s.label} className="relative flex flex-col items-center text-center">
              {idx < steps.length - 1 && <span className="absolute top-5 left-[calc(50%+22px)] h-px w-[calc(100%-44px)] bg-gold/40" aria-hidden />}
              <span className={cn('grid size-10 place-items-center rounded-full border', idx < 3 ? 'border-gold/50 bg-gold/15 text-gold-ink' : 'border-border text-muted-foreground')}>
                {idx < 3 ? <CheckIcon weight="bold" className="size-4" /> : <s.icon className="size-4" />}
              </span>
              <span className="mt-2 text-[12.5px] font-medium">{s.label}</span>
              <span className="text-[11px] text-muted-foreground">{s.note}</span>
            </li>
          ))}
        </ol>
        <MoreLink to="/policies/shipping">How shipping works</MoreLink>
      </Cell>

      {/* Build a box */}
      <Cell i={4} className="grid gap-6 sm:grid-cols-[1fr_auto] lg:col-span-6">
        <div>
          <CellTitle>Build your box.</CellTitle>
          <p className="mt-3 text-muted-foreground">
            Any {settings?.box.slots ?? 4} compounds, delivered monthly at {settings?.box.pct ?? 40}% off. Bacteriostatic water and shipping included.
          </p>
          <MoreLink to="/build-a-box">Build a box</MoreLink>
        </div>
        <div className="grid grid-cols-4 gap-2 self-center sm:w-48 sm:grid-cols-2">
          {boxImages.slice(0, 4).map((b) => (
            <ProductImage key={b.name} src={b.image} alt={b.name} sizes="96px" className="aspect-square rounded-lg" />
          ))}
        </div>
      </Cell>
    </div>
  )
}
