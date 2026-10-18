import { ArrowLeftIcon, CoinsIcon, FlaskIcon, ShieldCheckIcon, ShoppingBagIcon, TestTubeIcon, TruckIcon } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'
import { ProductImage } from '@/components/brand/ProductImage'
import { EmptyState, Purity } from '@/components/brand/bits'
import { QtyStepper } from '@/components/layout/CartDrawer'
import { ResearchDisclaimer } from '@/components/layout/SiteFooter'
import { CoaSheet, pct as purityText } from '@/components/product/CoaSheet'
import { CoaViewer } from '@/components/product/CoaViewer'
import { ProductCard, SizeChips } from '@/components/product/ProductCard'
import { Button } from '@/components/ui/button'
import { lotWord, viewerOrder } from '@/lib/coa'
import { useCart } from '@/lib/cart'
import { date, money, num } from '@/lib/format'
import { useMe, useProduct, useSettings } from '@/lib/queries'
import { cn } from '@/lib/utils'
import { useSeo } from '@/lib/seo'

export default function ProductPage() {
  const { slug } = useParams()
  const { data, isLoading, isError } = useProduct(slug)
  const { data: settings } = useSettings()
  const { data: me } = useMe()
  const add = useCart((s) => s.add)
  const inCart = useCart((s) => s.items)
  const product = data?.product
  const [variantId, setVariantId] = useState('')
  const [qty, setQty] = useState(1)
  const [shot, setShot] = useState(0)
  const [viewer, setViewer] = useState<number | null>(null)

  useEffect(() => {
    if (product) {
      setVariantId((product.variants.find((v) => v.inStock) ?? product.variants[0])?.id ?? '')
      setQty(1)
      setShot(0)
    }
  }, [product])

  useSeo(
    product
      ? {
          title: product.name,
          description: `${product.tagline ? `${product.tagline}. ` : ''}${product.name} research peptide with a certificate of analysis for its batch. For laboratory research use only.`.slice(0, 300),
          image: product.image ? `${product.image}-900.webp` : undefined,
          data: {
            '@context': 'https://schema.org',
            '@type': 'Product',
            name: product.name,
            description: product.tagline || undefined,
            image: product.image ? `${window.location.origin}${product.image}-900.webp` : undefined,
            brand: { '@type': 'Brand', name: 'KYVO Labs' },
            offers: {
              '@type': 'AggregateOffer',
              priceCurrency: 'MYR',
              lowPrice: (Math.min(...product.variants.map((x) => x.priceCents)) / 100).toFixed(2),
              highPrice: (Math.max(...product.variants.map((x) => x.priceCents)) / 100).toFixed(2),
              offerCount: product.variants.length,
              availability: product.variants.some((x) => x.inStock) ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
            },
          },
        }
      : { title: 'Product' },
  )
  const v = product?.variants.find((x) => x.id === variantId)
  // Quantity discounts follow Admin > Settings: on/off, ladder, and whether units count per compound or per order.
  const tiersOn = Boolean(settings?.tierPricing?.enabled && settings.tiers.length > 0)
  const byOrder = settings?.tierPricing?.countBy === 'order'
  const tiers = useMemo(() => [{ min: 1, pct: 0 }, ...(tiersOn ? (settings?.tiers ?? []) : [])], [settings, tiersOn])
  // Tier counts units of this compound across all sizes, including ones already in the cart.
  const alreadyInCart = product
    ? inCart.filter((i) => (byOrder || i.productId === product.id) && i.variantId !== variantId).reduce((a, i) => a + i.quantity, 0)
    : 0
  const unitsForTier = qty + alreadyInCart
  const pct = tiers.reduce((acc, t) => (unitsForTier >= t.min ? t.pct : acc), 0)
  const activeMin = tiers.reduce((a, t) => (qty >= t.min ? t.min : a), 1)
  const total = v ? Math.round((v.priceCents * qty * (100 - pct)) / 100) : 0
  // Paid tiers only change the rate while the membership program is switched on.
  const rateTier = settings?.features?.membership ? (me?.user?.tier ?? 'MEMBER') : 'MEMBER'
  const rate = settings?.points.perDollar[rateTier] ?? 2.5
  const points = Math.floor((total / 100) * rate)

  if (isLoading) return <ProductSkeleton />
  if (isError || !product) {
    return (
      <div className="container-x py-20">
        <EmptyState icon={<FlaskIcon />} title="Compound not found" body="It may have been renamed or retired." action={<Button asChild><Link to="/shop">Back to products</Link></Button>} />
      </div>
    )
  }

  const images = [product.image, ...product.gallery].filter(Boolean) as string[]
  const latest = product.coas[0]
  const { current, history } = viewerOrder(product.coas, product.name)
  // Viewer tabs: today's certificates first, then older batches.
  const viewerDocs = [...current, ...history]
  const specs = [
    ['CAS number', product.casNumber],
    ['Molecular formula', product.molecularFormula],
    ['Molecular weight', product.molecularWeight],
    ['Sequence', product.sequence],
    ['Form', 'Lyophilised powder, sealed glass vial'],
    ['Storage', product.storage],
  ].filter(([, val]) => val) as [string, string][]

  const addToCart = () => {
    if (!v) return
    add({ variantId: v.id, productId: product.id, slug: product.slug, name: product.name, variantLabel: v.label, image: product.image, unitPriceCents: v.priceCents }, qty)
    toast.success(`${qty} x ${product.name} ${v.label} added`)
  }

  return (
    <>
      <div className="container-x pt-6">
        <Link to="/shop" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4" /> All products
        </Link>
      </div>

      <section className="container-x grid gap-8 py-6 md:py-10 lg:grid-cols-[1.05fr_1fr] lg:gap-14">
        {/* Gallery */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <ProductImage src={images[shot]} alt={`${product.name} research vial`} priority sizes="(min-width: 1024px) 50vw, 100vw" className="aspect-square rounded-xl" />
          {images.length > 1 && (
            <div className="mt-3 flex gap-2">
              {images.map((img, i) => (
                <button key={img} onClick={() => setShot(i)} className={cn('overflow-hidden rounded-lg border-2', i === shot ? 'border-gold' : 'border-transparent opacity-70')} aria-label={`Image ${i + 1}`}>
                  <ProductImage src={img} alt="" sizes="72px" className="size-16" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Buy box */}
        <div>
          {product.category && (
            <Link to={`/shop?category=${product.category.slug}`} className="font-mono text-[11px] tracking-[0.18em] text-gold-ink uppercase hover:underline">
              {product.category.name}
            </Link>
          )}
          <h1 className="display mt-3 text-5xl sm:text-6xl">{product.name}</h1>
          <p className="mt-2 text-muted-foreground">{product.tagline}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Purity value={product.purity} />
            <span className="text-[13px] text-muted-foreground">HPLC verified{latest ? `, ${lotWord(latest).toLowerCase()} ${latest.lotNumber}` : ''}</span>
          </div>

          <p className="mt-6 font-mono text-3xl font-medium tabular-nums">{v ? money(v.priceCents) : ''}</p>

          <div className="mt-6">
            <p className="mb-2 text-sm font-medium">Size</p>
            <SizeChips variants={product.variants} value={variantId} onChange={setVariantId} className="[&_button]:h-10 [&_button]:px-3.5 [&_button]:text-[13px]" />
            {v?.lowStock && <p className="mt-2 text-[13px] text-warning">Only a few left in this lot.</p>}
          </div>

          <div className="mt-6">
            <p className="mb-2 text-sm font-medium">Quantity</p>
            {tiersOn && (
            <div className={cn('grid grid-cols-2 gap-2', tiers.length >= 4 ? 'sm:grid-cols-4' : 'sm:grid-cols-3')} role="radiogroup" aria-label="Quantity tier">
              {tiers.map((t) => {
                const active = t.min === activeMin
                const per = v ? Math.round((v.priceCents * (100 - t.pct)) / 100) : 0
                return (
                  <button
                    key={t.min}
                    role="radio"
                    aria-checked={active}
                    onClick={() => setQty(t.min)}
                    className={cn(
                      'rounded-lg border px-3 py-2.5 text-left transition-colors',
                      active ? 'border-gold bg-gold/10' : 'hover:border-foreground/25',
                    )}
                  >
                    <span className="block text-[13px] font-medium">{t.min === 1 ? '1 vial' : `${t.min}+ vials`}</span>
                    <span className={cn('block font-mono text-[12px]', t.pct ? 'text-gold-ink' : 'text-muted-foreground')}>
                      {t.pct ? `${t.pct}% off` : 'List price'}
                    </span>
                    <span className="block font-mono text-[11px] text-muted-foreground">{money(per)} each</span>
                  </button>
                )
              })}
            </div>
            )}
            <div className={cn('flex items-center gap-3', tiersOn && 'mt-3')}>
              <QtyStepper value={qty} onChange={(n) => setQty(Math.max(1, n))} size="md" />
              {tiersOn && alreadyInCart > 0 && (
                <span className="text-[13px] text-muted-foreground">
                  +{alreadyInCart} {byOrder ? 'other items' : 'other sizes'} already in cart count toward your discount
                </span>
              )}
            </div>
          </div>

          <div className="mt-6 flex items-center gap-2 rounded-lg bg-surface px-3.5 py-2.5 text-[13px]">
            <CoinsIcon className="size-4 shrink-0 text-gold-ink" />
            <span>
              Earn <strong className="font-mono">{num(points)}</strong> KYVO Points with this purchase{me?.user ? '' : ' when signed in'}.
            </span>
          </div>

          <Button size="lg" className="mt-4 h-14 w-full text-base" disabled={!v?.inStock} onClick={addToCart}>
            <ShoppingBagIcon className="size-5" />
            {v?.inStock ? (
              <>
                Add to cart <span className="ml-auto font-mono">{money(total)}</span>
              </>
            ) : (
              'Sold out'
            )}
          </Button>
          <p className="mt-3 text-[13px] text-muted-foreground">
            Orders paid before {settings?.shipping.cutoff ?? '2pm'} ship the same business day. Free shipping over {settings ? money(settings.shipping.freeThresholdCents) : 'RM800'}.
          </p>

          <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border">
            {[
              { icon: TestTubeIcon, k: 'Lab tested', d: 'Independent ISO 17025 lab' },
              { icon: ShieldCheckIcon, k: product.purity ? `${product.purity.toFixed(2)}%` : 'Verified', d: 'HPLC purity' },
              { icon: TruckIcon, k: 'Tracked', d: 'Same-day dispatch' },
              { icon: FlaskIcon, k: latest?.endotoxin ?? 'Pass', d: 'Endotoxin and sterility' },
            ].map((t) => (
              <div key={t.d} className="flex items-start gap-3 bg-background p-4">
                <t.icon className="mt-0.5 size-5 shrink-0 text-gold-ink" />
                <div>
                  <dt className="font-display text-lg leading-tight font-semibold uppercase">{t.k}</dt>
                  <dd className="text-[12px] text-muted-foreground">{t.d}</dd>
                </div>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Details */}
      <section className="border-t">
        <div className="container-x grid gap-12 py-14 md:py-20 lg:grid-cols-2 lg:gap-16">
          <div>
            <h2 className="display text-4xl">About {product.name}</h2>
            <div className="mt-5 space-y-4 text-[15px] leading-relaxed text-muted-foreground">
              {product.description.split(/\n{2,}/).map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
            {specs.length > 0 && (
              <>
                <h3 className="mt-10 font-display text-2xl font-semibold uppercase">Specifications</h3>
                <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
                  {specs.map(([k, val]) => (
                    <div key={k} className={cn(k === 'Sequence' || k === 'Storage' ? 'sm:col-span-2' : '')}>
                      <dt className="font-mono text-[10.5px] tracking-[0.16em] text-muted-foreground uppercase">{k}</dt>
                      <dd className="mt-1 font-mono text-[13px] break-words">{val}</dd>
                    </div>
                  ))}
                </dl>
              </>
            )}
          </div>

          <div id="coa" className="scroll-mt-24">
            <h2 className="display text-4xl">Certificate of analysis</h2>
            {latest ? (
              <>
                <div className="mt-5 grid gap-4">
                  {current.map((c, i) => (
                    <CoaSheet key={c.id} coa={c} productName={product.name} onView={() => setViewer(i)} />
                  ))}
                </div>
                {history.length > 0 && (
                  <div className="mt-8">
                    <h3 className="font-display text-2xl font-semibold uppercase">Lot history</h3>
                    <ul className="mt-3 divide-y rounded-xl border">
                      {history.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => setViewer(current.length + history.indexOf(c))}
                            className="grid w-full grid-cols-[1fr_auto_auto] items-center gap-4 px-4 py-3 text-left text-[13px] transition-colors hover:bg-muted/60"
                          >
                            <span className="truncate font-mono">
                              {c.documentTitle ? `${c.documentTitle}, ` : ''}
                              {c.lotNumber}
                            </span>
                            <span className="text-muted-foreground">{date(c.mfgDate ?? c.testedAt)}</span>
                            <span className="font-mono text-gold-ink">{purityText(c.purity)}%</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <CoaViewer docs={viewerDocs} productName={product.name} open={viewer !== null} initial={viewer ?? 0} onOpenChange={(o) => !o && setViewer(null)} />
              </>
            ) : (
              <p className="mt-5 text-muted-foreground">The certificate for the current lot is being finalised. Contact us for the latest results.</p>
            )}
          </div>
        </div>
      </section>

      {data.related.length > 0 && (
        <section className="border-t py-14 md:py-20">
          <div className="container-x">
            <h2 className="display text-4xl sm:text-5xl">Researchers also order</h2>
          </div>
          <div className="scrollbar-none mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-4 px-4 pb-2 sm:scroll-px-6 sm:px-6 lg:scroll-px-[max(2rem,calc((100vw-1320px)/2+2rem))] lg:px-[max(2rem,calc((100vw-1320px)/2+2rem))]">
            {data.related.map((p) => (
              <div key={p.id} className="w-[46vw] max-w-[260px] shrink-0 snap-start">
                <ProductCard product={p} />
              </div>
            ))}
          </div>
        </section>
      )}
      <ResearchDisclaimer />
    </>
  )
}

function ProductSkeleton() {
  return (
    <div className="container-x grid gap-8 py-12 lg:grid-cols-2 lg:gap-14">
      <div className="aspect-square animate-pulse rounded-xl bg-muted" />
      <div className="space-y-4">
        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
        <div className="h-14 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-5 w-1/2 animate-pulse rounded bg-muted" />
        <div className="h-9 w-28 animate-pulse rounded bg-muted" />
        <div className="grid grid-cols-4 gap-2 pt-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
        <div className="h-14 w-full animate-pulse rounded-md bg-muted" />
      </div>
    </div>
  )
}
