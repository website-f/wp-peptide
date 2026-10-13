import { CertificateIcon, FlaskIcon, PlusIcon, StarIcon, WarningIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { EmptyState } from '@/components/brand/bits'
import { ProductImage } from '@/components/brand/ProductImage'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { api } from '@/lib/api'
import { money, num } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ErrorState, Num, PageHeader, Panel, Pill, ProductStatusBadge, RowsSkeleton, SearchInput, Segmented } from '../components/kit'
import { useAdminSettings } from '../lib/queries'
import type { AdminProduct, ProductStatus } from '../lib/types'

type StatusFilter = 'all' | ProductStatus

/** Used until settings load. The real level is Settings > Orders and stock. */
const DEFAULT_LOW_STOCK = 5

/** Stock health across sizes that are on sale. Inactive sizes cannot be bought, so they are ignored. */
function stockInfo(p: AdminProduct, lowAt: number) {
  const active = p.variants.filter((v) => v.active)
  const total = active.reduce((a, v) => a + v.stock, 0)
  const low = active.filter((v) => v.stock <= lowAt)
  const state: 'none' | 'out' | 'low' | 'ok' = active.length === 0 ? 'none' : total === 0 ? 'out' : low.length > 0 ? 'low' : 'ok'
  return { total, low, state }
}

function priceRange(p: AdminProduct) {
  const prices = p.variants.filter((v) => v.active).map((v) => v.priceCents)
  if (prices.length === 0) return null
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  return min === max ? money(min) : `${money(min)} - ${money(max)}`
}

export default function Products() {
  const lowAt = useAdminSettings().data?.settings.inventory.lowStockThreshold ?? DEFAULT_LOW_STOCK
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const status = (params.get('status') ?? 'all') as StatusFilter

  const setParam = (key: string, value: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (value && value !== 'all') next.set(key, value)
        else next.delete(key)
        return next
      },
      { replace: true },
    )

  const query = useQuery({
    queryKey: ['admin', 'products'],
    queryFn: () => api.get<AdminProduct[]>('/api/admin/products'),
  })
  const products = useMemo(() => query.data ?? [], [query.data])

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { all: products.length, ACTIVE: 0, DRAFT: 0, ARCHIVED: 0 }
    for (const p of products) c[p.status]++
    return c
  }, [products])

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase()
    return products.filter((p) => {
      if (status !== 'all' && p.status !== status) return false
      if (!term) return true
      return (
        p.name.toLowerCase().includes(term) ||
        p.slug.toLowerCase().includes(term) ||
        p.variants.some((v) => v.sku.toLowerCase().includes(term))
      )
    })
  }, [products, q, status])

  const attention = useMemo(() => products.filter((p) => p.status === 'ACTIVE' && ['low', 'out'].includes(stockInfo(p, lowAt).state)).length, [products, lowAt])

  const filtered = q.trim() !== '' || status !== 'all'
  const open = (id: string) => navigate(`/admin/products/${id}`)

  return (
    <div>
      <PageHeader
        title="Products"
        description="Everything in your store. Open a product to change prices, stock, photos and lab data."
        meta={
          attention > 0 ? (
            <Pill tone="warning">
              {attention} live {attention === 1 ? 'product needs' : 'products need'} restocking
            </Pill>
          ) : undefined
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/admin/coas">
                <CertificateIcon />
                COA library
              </Link>
            </Button>
            <Button asChild>
              <Link to="/admin/products/new">
                <PlusIcon weight="bold" />
                New product
              </Link>
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Segmented<StatusFilter>
          value={status}
          onChange={(v) => setParam('status', v)}
          options={[
            { value: 'all', label: 'All', count: counts.all },
            { value: 'ACTIVE', label: 'Live', count: counts.ACTIVE },
            { value: 'DRAFT', label: 'Draft', count: counts.DRAFT },
            { value: 'ARCHIVED', label: 'Archived', count: counts.ARCHIVED },
          ]}
        />
        <SearchInput value={q} onChange={(v) => setParam('q', v)} placeholder="Search name or SKU" className="w-full sm:w-72" />
      </div>

      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : query.isPending ? (
        <Panel flush>
          <RowsSkeleton rows={8} cols={7} />
        </Panel>
      ) : products.length === 0 ? (
        <EmptyState
          icon={<FlaskIcon />}
          title="No products yet"
          body="Add your first product with its sizes, prices and photos. You can keep it as a draft until it is ready."
          action={
            <Button asChild>
              <Link to="/admin/products/new">
                <PlusIcon weight="bold" />
                New product
              </Link>
            </Button>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<FlaskIcon />}
          title="Nothing matches"
          body={filtered ? 'No products match this search or filter.' : undefined}
          action={
            <Button variant="outline" onClick={() => setParams({}, { replace: true })}>
              Clear filters
            </Button>
          }
        />
      ) : (
        <>
          {/* Phones: stacked cards */}
          <div className="grid gap-2.5 md:hidden">
            {rows.map((p) => (
              <ProductCard key={p.id} p={p} lowAt={lowAt} />
            ))}
          </div>

          {/* Tablet and up: table */}
          <Panel flush className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="text-xs font-medium text-muted-foreground">Product</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Status</TableHead>
                  <TableHead className="hidden text-xs font-medium text-muted-foreground xl:table-cell">Category</TableHead>
                  <TableHead className="text-right text-xs font-medium text-muted-foreground">Price</TableHead>
                  <TableHead className="text-right text-xs font-medium text-muted-foreground">In stock</TableHead>
                  <TableHead className="hidden text-right text-xs font-medium text-muted-foreground lg:table-cell">Sold</TableHead>
                  <TableHead className="text-right text-xs font-medium text-muted-foreground">Revenue</TableHead>
                  <TableHead className="w-10 text-xs font-medium text-muted-foreground">
                    <span className="sr-only">Featured</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => {
                  const stock = stockInfo(p, lowAt)
                  const range = priceRange(p)
                  return (
                    <TableRow key={p.id} className="cursor-pointer" onClick={() => open(p.id)}>
                      <TableCell className="max-w-0 min-w-56 py-2.5">
                        <div className="flex min-w-0 items-center gap-3">
                          <ProductImage src={p.image} alt="" sizes="40px" className="size-10 shrink-0 rounded-md border [&_svg]:size-5" />
                          <div className="min-w-0">
                            <Link
                              to={`/admin/products/${p.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="block truncate font-medium hover:text-gold-ink focus-visible:underline"
                            >
                              {p.name}
                            </Link>
                            <p className="truncate text-xs text-muted-foreground">{p.tagline || p.slug}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <ProductStatusBadge status={p.status} />
                      </TableCell>
                      <TableCell className="hidden max-w-40 xl:table-cell">
                        <span className="block truncate text-muted-foreground">{p.category?.name ?? 'None'}</span>
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap">
                        {range ? <Num>{range}</Num> : <span className="text-muted-foreground">No sizes on sale</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        <StockCell p={p} stock={stock} />
                      </TableCell>
                      <TableCell className="hidden text-right lg:table-cell">
                        <Num>{num(p.unitsSold ?? 0)}</Num>
                      </TableCell>
                      <TableCell className="text-right">
                        <Num>{money(p.revenueCents ?? 0)}</Num>
                      </TableCell>
                      <TableCell>
                        <FeaturedStar featured={p.featured} />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </Panel>
          <p className="mt-3 text-xs text-muted-foreground">
            Sold and revenue count paid orders only. Low stock means a size on sale has {lowAt} or fewer left.
          </p>
        </>
      )}
    </div>
  )
}

function FeaturedStar({ featured }: { featured: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-grid size-6 place-items-center" aria-label={featured ? 'Featured on the home page' : 'Not featured'}>
          <StarIcon weight={featured ? 'fill' : 'regular'} className={cn('size-4', featured ? 'text-gold' : 'text-muted-foreground/40')} />
        </span>
      </TooltipTrigger>
      <TooltipContent>{featured ? 'Featured on the home page' : 'Not featured'}</TooltipContent>
    </Tooltip>
  )
}

function StockCell({ p, stock }: { p: AdminProduct; stock: ReturnType<typeof stockInfo> }) {
  if (stock.state === 'none') return <span className="text-xs text-muted-foreground">No sizes on sale</span>
  if (stock.state === 'out')
    return (
      <Pill tone="destructive" className="ml-auto">
        Out of stock
      </Pill>
    )
  return (
    <span className="inline-flex items-center justify-end gap-1.5">
      {stock.state === 'low' && (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex" aria-label="Low stock">
              <WarningIcon weight="fill" className="size-4 text-warning" />
            </span>
          </TooltipTrigger>
          <TooltipContent>
            Low stock: {stock.low.map((v) => `${v.label} (${v.stock} left)`).join(', ')}
          </TooltipContent>
        </Tooltip>
      )}
      <Num className={cn(stock.state === 'low' && 'text-warning')}>{num(stock.total)}</Num>
      <span className="sr-only">{p.variants.length > 1 ? 'units across sizes' : 'units'}</span>
    </span>
  )
}

function ProductCard({ p, lowAt }: { p: AdminProduct; lowAt: number }) {
  const stock = stockInfo(p, lowAt)
  const range = priceRange(p)
  return (
    <Link
      to={`/admin/products/${p.id}`}
      className="flex min-w-0 gap-3 rounded-xl border bg-card p-3 transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ProductImage src={p.image} alt="" sizes="64px" className="size-16 shrink-0 rounded-md border [&_svg]:size-6" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-medium">{p.name}</p>
            <p className="truncate text-xs text-muted-foreground">{p.category?.name || p.tagline || p.slug}</p>
          </div>
          {p.featured && <StarIcon weight="fill" className="mt-0.5 size-4 shrink-0 text-gold" aria-label="Featured" />}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <ProductStatusBadge status={p.status} />
          {stock.state === 'out' && <Pill tone="destructive">Out of stock</Pill>}
          {stock.state === 'low' && <Pill tone="warning">Low stock</Pill>}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span>
            <Num className="text-foreground">{range ?? 'No price'}</Num>
          </span>
          <span>
            <Num className="text-foreground">{num(stock.total)}</Num> in stock
          </span>
          <span>
            <Num className="text-foreground">{num(p.unitsSold ?? 0)}</Num> sold
          </span>
          <span>
            <Num className="text-foreground">{money(p.revenueCents ?? 0)}</Num> revenue
          </span>
        </div>
      </div>
    </Link>
  )
}
