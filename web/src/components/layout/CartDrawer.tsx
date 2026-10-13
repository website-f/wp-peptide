import { MinusIcon, PlusIcon, ShoppingBagIcon, TagIcon, TrashIcon, TruckIcon, XIcon } from '@phosphor-icons/react'
import { Link, useNavigate } from 'react-router'
import { ProductImage } from '@/components/brand/ProductImage'
import { EmptyState } from '@/components/brand/bits'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { cartCount, useCart } from '@/lib/cart'
import { money, moneyExact } from '@/lib/format'
import { useCartQuote } from '@/lib/queries'

export function QtyStepper({ value, onChange, min = 1, max = 999, size = 'sm' }: { value: number; onChange: (v: number) => void; min?: number; max?: number; size?: 'sm' | 'md' }) {
  const h = size === 'sm' ? 'h-9' : 'h-11'
  return (
    <div className={`inline-flex ${h} items-center rounded-md border bg-background/60`}>
      <button
        type="button"
        className={`grid ${h} w-9 place-items-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40`}
        onClick={() => onChange(value - 1)}
        disabled={value <= min}
        aria-label="Decrease quantity"
      >
        <MinusIcon className="size-3.5" />
      </button>
      <span className="w-8 text-center font-mono text-sm tabular-nums" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        className={`grid ${h} w-9 place-items-center text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40`}
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        aria-label="Increase quantity"
      >
        <PlusIcon className="size-3.5" />
      </button>
    </div>
  )
}

export function CartDrawer() {
  const { items, open, setOpen, setQty, remove } = useCart()
  const quote = useCartQuote()
  const navigate = useNavigate()
  const q = quote.data
  const lineFor = (variantId: string) => q?.lines.find((l) => l.variantId === variantId)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md" showCloseButton={false}>
        <div className="flex h-16 shrink-0 items-center justify-between border-b px-5">
          <SheetTitle className="font-display text-2xl font-semibold tracking-wide uppercase">
            Cart {items.length > 0 && <span className="font-mono text-sm text-muted-foreground">({cartCount(items)})</span>}
          </SheetTitle>
          <Button variant="ghost" size="icon" className="-mr-2" onClick={() => setOpen(false)} aria-label="Close cart">
            <XIcon className="size-5" />
          </Button>
        </div>

        {items.length === 0 ? (
          <div className="p-5">
            <EmptyState
              icon={<ShoppingBagIcon />}
              title="Your cart is empty"
              body="Three of the same compound unlocks 30% off. Ten unlocks 40%."
              action={
                <Button onClick={() => setOpen(false)} asChild>
                  <Link to="/shop">Browse compounds</Link>
                </Button>
              }
            />
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto">
              {q && q.freeShippingRemainingCents > 0 && (
                <div className="flex items-center gap-2.5 border-b bg-surface px-5 py-3 text-[13px]">
                  <TruckIcon className="size-4 shrink-0 text-gold-ink" />
                  <span>
                    Add <strong className="font-mono">{money(q.freeShippingRemainingCents)}</strong> for free tracked shipping
                  </span>
                </div>
              )}
              {q?.hints.map((h) => (
                <div key={h.productId} className="flex items-center gap-2.5 border-b px-5 py-3 text-[13px]">
                  <TagIcon className="size-4 shrink-0 text-gold-ink" />
                  <span>
                    Add {h.addQty} more {h.name} to unlock <strong className="text-gold-ink">{h.pct}% off</strong>
                  </span>
                </div>
              ))}
              <ul className="divide-y">
                {items.map((it) => {
                  const line = lineFor(it.variantId)
                  return (
                    <li key={it.variantId} className="flex gap-4 px-5 py-4">
                      <Link to={`/shop/${it.slug}`} onClick={() => setOpen(false)} className="shrink-0">
                        <ProductImage src={it.image} alt={it.name} sizes="80px" className="size-20 rounded-lg" />
                      </Link>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <Link to={`/shop/${it.slug}`} onClick={() => setOpen(false)} className="block truncate font-display text-lg leading-tight font-semibold uppercase">
                              {it.name}
                            </Link>
                            <p className="text-[13px] text-muted-foreground">{it.variantLabel}</p>
                          </div>
                          <button onClick={() => remove(it.variantId)} className="p-1 text-muted-foreground hover:text-destructive" aria-label={`Remove ${it.name}`}>
                            <TrashIcon className="size-4" />
                          </button>
                        </div>
                        <div className="mt-auto flex items-end justify-between pt-2">
                          <QtyStepper value={it.quantity} onChange={(v) => setQty(it.variantId, v)} min={0} max={line?.stock ?? 999} />
                          <div className="text-right">
                            {line && line.discountPct > 0 && (
                              <p className="font-mono text-[11px] text-muted-foreground line-through">{money(line.lineListCents)}</p>
                            )}
                            <p className="font-mono text-sm font-medium">{money(line?.lineTotalCents ?? it.unitPriceCents * it.quantity)}</p>
                            {line && line.discountPct > 0 && <p className="text-[11px] font-medium text-gold-ink">{line.discountPct}% tier</p>}
                          </div>
                        </div>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>

            <div className="shrink-0 border-t bg-surface/60 px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              {quote.isError && <p className="mb-3 text-sm text-destructive">{(quote.error as Error).message}</p>}
              {q ? (
                <dl className="space-y-1.5 text-sm">
                  <Row label="Subtotal" value={moneyExact(q.subtotalCents)} />
                  {q.tierDiscountCents > 0 && <Row label="Quantity savings" value={`-${moneyExact(q.tierDiscountCents)}`} accent />}
                  {q.couponDiscountCents > 0 && <Row label={q.coupon?.label ?? 'Code'} value={`-${moneyExact(q.couponDiscountCents)}`} accent />}
                  <Row label="Shipping" value={q.shippingCents === 0 ? 'Free' : moneyExact(q.shippingCents)} />
                  <div className="flex items-baseline justify-between border-t pt-2.5">
                    <dt className="font-display text-lg font-semibold uppercase">Total</dt>
                    <dd className="font-mono text-lg font-semibold">{moneyExact(q.totalCents)}</dd>
                  </div>
                </dl>
              ) : (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-6 w-full" />
                </div>
              )}
              <Button
                size="lg"
                className="mt-4 w-full"
                disabled={!q || quote.isError}
                onClick={() => {
                  setOpen(false)
                  navigate('/checkout')
                }}
              >
                Checkout
              </Button>
              <p className="mt-2.5 text-center text-[11px] text-muted-foreground">Laboratory research use only. Not for human consumption.</p>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={accent ? 'font-mono text-gold-ink' : 'font-mono'}>{value}</dd>
    </div>
  )
}
