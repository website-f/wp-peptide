import { ArrowRightIcon } from '@phosphor-icons/react'
import { Link } from 'react-router'
import { SectionTitle } from '@/components/brand/bits'
import { Bento } from '@/components/home/Bento'
import { Hero } from '@/components/home/Hero'
import { AboutBlock, CoaRail, CtaBand, FaqSection, Programs, TierStairs } from '@/components/home/Sections'
import { ResearchDisclaimer } from '@/components/layout/SiteFooter'
import { ProductCard, ProductCardSkeleton } from '@/components/product/ProductCard'
import { useCoas, usePrograms, useProducts, useSettings } from '@/lib/queries'

export default function Home() {
  const { data: settings } = useSettings()
  const programs = usePrograms()
  const all = useProducts()
  const coas = useCoas()
  const products = all.data ?? []
  const popular = products.filter((p) => p.featured).slice(0, 8)
  const showcase = coas.data?.[0]
  const boxImages = products.filter((p) => p.boxEligible).slice(2, 6)

  return (
    <>
      <Hero compounds={all.data ? products.length : null} />

      <section className="container-x py-20 md:py-28">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SectionTitle>Popular compounds</SectionTitle>
          <Link to="/shop" className="inline-flex items-center gap-1.5 text-sm font-medium text-gold-ink hover:underline">
            View the full catalogue <ArrowRightIcon className="size-4" />
          </Link>
        </div>
        <div className="mt-10 grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-6">
          {all.isLoading
            ? Array.from({ length: 8 }).map((_, i) => <ProductCardSkeleton key={i} />)
            : popular.map((p, i) => <ProductCard key={p.id} product={p} index={i} />)}
        </div>
        {all.isError && <p className="mt-6 text-sm text-destructive">We could not load products. Refresh to try again.</p>}
      </section>

      <section className="container-x pb-20 md:pb-28">
        <Bento coa={showcase} coaProduct={showcase?.product?.name} settings={settings} boxImages={boxImages} />
      </section>

      <AboutBlock compounds={products.length || 13} sizes={products.reduce((a, p) => a + p.variants.length, 0) || 26} />
      {programs.tiers && <TierStairs settings={settings} />}
      <Programs settings={settings} />
      {coas.data && coas.data.length > 0 && <CoaRail coas={dedupeByProduct(coas.data).slice(0, 12)} />}
      <FaqSection settings={settings} />
      <ResearchDisclaimer />
      <CtaBand />
    </>
  )
}

function dedupeByProduct<T extends { product?: { slug: string } }>(rows: T[]) {
  const seen = new Set<string>()
  return rows.filter((r) => {
    const k = r.product?.slug ?? ''
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}
