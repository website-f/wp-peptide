import { FlaskIcon, MagnifyingGlassIcon, PackageIcon, SealCheckIcon } from '@phosphor-icons/react'
import { Link } from 'react-router'
import { WideImage } from '@/components/brand/ProductImage'
import { PageHeader } from '@/components/brand/bits'
import { CtaBand } from '@/components/home/Sections'
import { ResearchDisclaimer } from '@/components/layout/SiteFooter'
import { useSeo } from '@/lib/seo'

const STEPS = [
  { icon: FlaskIcon, k: 'Synthesis', d: 'Peptides are made by solid-phase synthesis with partners we audit, then lyophilised and sealed under inert gas.' },
  { icon: MagnifyingGlassIcon, k: 'Independent testing', d: 'A sample of every lot goes to an ISO/IEC 17025 lab for HPLC purity, LC-MS identity, content and safety screens.' },
  { icon: SealCheckIcon, k: 'Release', d: 'Only lots at 99% purity or higher, with every screen passed, are released. The certificate is published before sale.' },
  { icon: PackageIcon, k: 'Dispatch', d: 'Orders paid before the daily cutoff are packed the same day and handed to a tracked courier.' },
]

export default function About() {
  useSeo({ title: 'About us', description: 'Who KYVO Labs is, and how every batch is tested and documented with a certificate of analysis.' })
  return (
    <>
      <PageHeader title="About KYVO Labs" intro="Laboratory-grade peptides for researchers who need the material and the paperwork to hold up." />
      <section className="container-x">
        <WideImage slug="tesamorelin" alt="KYVO Tesamorelin research vial" className="aspect-[16/9] rounded-xl md:aspect-[21/9]" imgClassName="object-[50%_40%]" />
      </section>
      <section className="container-x grid gap-10 py-16 md:py-24 lg:grid-cols-2 lg:gap-16">
        <h2 className="display text-5xl sm:text-6xl">Excellence. Support. Fair pricing.</h2>
        <div className="space-y-5 text-muted-foreground md:text-lg">
          <p>
            KYVO started with a simple frustration: research compounds sold with a purity number and nothing to back it up. We publish the full test panel for
            every lot, so you can check the material before it goes near your bench.
          </p>
          <p>
            We serve universities, contract research organisations and independent labs. Our catalogue stays focused, which lets us keep stock fresh and
            prices fair, and our quantity tiers reward labs that order for a whole study at once.
          </p>
          <p>
            Everything we sell is for laboratory, in vitro research only. We do not provide dosing or usage advice, and we ask our partners not to either.
          </p>
        </div>
      </section>
      <section className="border-y bg-surface">
        <div className="container-x py-16 md:py-24">
          <h2 className="display text-4xl sm:text-5xl">From synthesis to your lab</h2>
          <ol className="mt-12 grid gap-px overflow-hidden rounded-xl border bg-border md:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <li key={s.k} className="bg-card p-6">
                <s.icon className="size-7 text-gold-ink" />
                <p className="mt-6 font-display text-2xl font-semibold uppercase">{s.k}</p>
                <p className="mt-2 text-sm text-muted-foreground">{s.d}</p>
              </li>
            ))}
          </ol>
          <Link to="/coa-library" className="mt-8 inline-block text-sm font-medium text-gold-ink hover:underline">
            See the published certificates
          </Link>
        </div>
      </section>
      <ResearchDisclaimer />
      <CtaBand />
    </>
  )
}
