import { FlaskIcon, MagnifyingGlassIcon, XIcon } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { EmptyState, PageHeader } from '@/components/brand/bits'
import { ResearchDisclaimer } from '@/components/layout/SiteFooter'
import { ProductCard, ProductCardSkeleton } from '@/components/product/ProductCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { tierSentence } from '@/lib/content'
import { useCategories, useProducts, useSettings } from '@/lib/queries'
import { cn } from '@/lib/utils'

const SORTS = [
  { v: 'featured', l: 'Featured' },
  { v: 'price-asc', l: 'Price, low to high' },
  { v: 'price-desc', l: 'Price, high to low' },
  { v: 'name', l: 'Name, A to Z' },
  { v: 'newest', l: 'Newest' },
]

export default function Shop() {
  const [params, setParams] = useSearchParams()
  const category = params.get('category') ?? ''
  const sort = params.get('sort') ?? 'featured'
  const [q, setQ] = useState(params.get('q') ?? '')
  const { data: settings } = useSettings()
  const cats = useCategories()

  // Debounce the search box into the URL so results are shareable.
  useEffect(() => {
    const t = setTimeout(() => {
      const next = new URLSearchParams(params)
      if (q.trim()) next.set('q', q.trim())
      else next.delete('q')
      if (next.toString() !== params.toString()) setParams(next, { replace: true })
    }, 250)
    return () => clearTimeout(t)
  }, [q]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params)
    if (v) next.set(k, v)
    else next.delete(k)
    setParams(next, { replace: true })
  }

  const products = useProducts({ q: params.get('q') ?? undefined, category: category || undefined, sort })

  return (
    <>
      <PageHeader
        title="Products"
        intro={`${tierSentence(settings) ?? ''} Every lot ships with its certificate.`.trim()}
      />

      <div className="sticky top-16 z-30 border-y bg-background/85 backdrop-blur-xl">
        <div className="container-x flex flex-col gap-3 py-3 md:flex-row md:items-center">
          <div className="relative md:w-72">
            <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <label htmlFor="shop-search" className="sr-only">
              Search compounds
            </label>
            <Input
              id="shop-search"
              type="search"
              inputMode="search"
              placeholder="Search, e.g. BPC or NAD"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="scrollbar-none -mx-4 flex flex-1 gap-1.5 overflow-x-auto px-4 md:mx-0 md:px-0" role="tablist" aria-label="Categories">
            {[{ slug: '', name: 'All' }, ...(cats.data ?? [])].map((c) => (
              <button
                key={c.slug}
                role="tab"
                aria-selected={category === c.slug}
                onClick={() => set('category', c.slug)}
                className={cn(
                  'h-9 shrink-0 rounded-md border px-3 text-[13px] whitespace-nowrap transition-colors',
                  category === c.slug ? 'border-gold bg-gold/12 text-gold-ink' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {c.name}
              </button>
            ))}
          </div>
          <Select value={sort} onValueChange={(v) => set('sort', v === 'featured' ? '' : v)}>
            <SelectTrigger className="w-full md:w-48" aria-label="Sort products">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORTS.map((s) => (
                <SelectItem key={s.v} value={s.v}>
                  {s.l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <section className="container-x py-10 md:py-14">
        {products.isError ? (
          <EmptyState icon={<FlaskIcon />} title="Could not load products" body="Check your connection and try again." action={<Button onClick={() => products.refetch()}>Retry</Button>} />
        ) : products.isLoading ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-6">
            {Array.from({ length: 8 }).map((_, i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        ) : products.data && products.data.length > 0 ? (
          <>
            <p className="mb-6 font-mono text-xs text-muted-foreground">{products.data.length} compounds</p>
            <div className={cn('grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-6', products.isFetching && 'opacity-70 transition-opacity')}>
              {products.data.map((p, i) => (
                <ProductCard key={p.id} product={p} index={i} priority={i < 4} />
              ))}
            </div>
          </>
        ) : (
          <EmptyState
            icon={<MagnifyingGlassIcon />}
            title="No matches"
            body="Try the compound's short name, like BPC or NAD."
            action={
              <Button
                variant="outline"
                onClick={() => {
                  setQ('')
                  setParams(new URLSearchParams(), { replace: true })
                }}
              >
                <XIcon /> Clear filters
              </Button>
            }
          />
        )}
      </section>
      <ResearchDisclaimer />
    </>
  )
}
