import { PlusIcon } from '@phosphor-icons/react'
import { motion, useReducedMotion } from 'motion/react'
import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { ProductImage } from '@/components/brand/ProductImage'
import { Purity } from '@/components/brand/bits'
import { Button } from '@/components/ui/button'
import { useCart } from '@/lib/cart'
import { money } from '@/lib/format'
import type { ProductCard as P } from '@/lib/types'
import { cn } from '@/lib/utils'

export function SizeChips({
  variants,
  value,
  onChange,
  className,
}: {
  variants: P['variants']
  value: string
  onChange: (id: string) => void
  className?: string
}) {
  if (variants.length <= 1) {
    return <p className={cn('font-mono text-[12px] text-muted-foreground', className)}>{variants[0]?.label}</p>
  }
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)} role="radiogroup" aria-label="Size">
      {variants.map((v) => (
        <button
          key={v.id}
          type="button"
          role="radio"
          aria-checked={value === v.id}
          disabled={!v.inStock}
          onClick={() => onChange(v.id)}
          className={cn(
            'h-7 rounded-md border px-2 font-mono text-[11px] transition-colors disabled:cursor-not-allowed disabled:line-through disabled:opacity-40',
            value === v.id ? 'border-gold bg-gold/12 text-gold-ink' : 'text-muted-foreground hover:border-foreground/30 hover:text-foreground',
          )}
        >
          {v.label}
        </button>
      ))}
    </div>
  )
}

export function ProductCard({ product, index = 0, priority = false }: { product: P; index?: number; priority?: boolean }) {
  const firstAvailable = product.variants.find((v) => v.inStock) ?? product.variants[0]
  const [variantId, setVariantId] = useState(firstAvailable?.id ?? '')
  const add = useCart((s) => s.add)
  const reduce = useReducedMotion()
  const v = product.variants.find((x) => x.id === variantId) ?? firstAvailable
  const soldOut = !product.inStock || !v?.inStock

  return (
    <motion.article
      initial={reduce ? false : { opacity: 0, y: 18 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.55, delay: Math.min(index, 7) * 0.05, ease: [0.16, 1, 0.3, 1] }}
      className="group flex flex-col"
    >
      <Link to={`/shop/${product.slug}`} className="relative block overflow-hidden rounded-xl" aria-label={product.name}>
        <ProductImage
          src={product.image}
          alt={`${product.name} research vial`}
          priority={priority}
          className="aspect-square"
          imgClassName="transition-transform duration-700 ease-out-expo group-hover:scale-[1.04]"
        />
        <div className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-white/5 ring-inset" />
      </Link>
      <div className="flex flex-1 flex-col pt-3.5">
        <div className="flex items-center justify-between gap-2">
          <Purity value={product.purity} />
          <Link to={`/shop/${product.slug}#coa`} className="font-mono text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
            View COA
          </Link>
        </div>
        <h3 className="mt-2 font-display text-[22px] leading-none font-semibold tracking-[0.01em] uppercase sm:text-2xl">
          <Link to={`/shop/${product.slug}`} className="hover:text-gold-ink">
            {product.name}
          </Link>
        </h3>
        <p className="mt-1 line-clamp-1 text-[13px] text-muted-foreground">{product.tagline}</p>
        <SizeChips variants={product.variants} value={v?.id ?? ''} onChange={setVariantId} className="mt-3" />
        <div className="mt-auto flex items-center justify-between gap-2 pt-4">
          <p className="font-mono text-base font-medium tabular-nums">{v ? money(v.priceCents) : ''}</p>
          <Button
            size="sm"
            variant={soldOut ? 'outline' : 'default'}
            disabled={soldOut}
            onClick={() => {
              if (!v) return
              add({
                variantId: v.id,
                productId: product.id,
                slug: product.slug,
                name: product.name,
                variantLabel: v.label,
                image: product.image,
                unitPriceCents: v.priceCents,
              })
              toast.success(`${product.name} ${v.label} added`)
            }}
            aria-label={soldOut ? 'Sold out' : `Add ${product.name} ${v?.label ?? ''} to cart`}
          >
            {soldOut ? (
              'Sold out'
            ) : (
              <>
                <PlusIcon weight="bold" /> Add
              </>
            )}
          </Button>
        </div>
      </div>
    </motion.article>
  )
}

export function ProductCardSkeleton() {
  return (
    <div>
      <div className="aspect-square animate-pulse rounded-xl bg-muted" />
      <div className="mt-4 h-4 w-16 animate-pulse rounded bg-muted" />
      <div className="mt-2 h-6 w-3/4 animate-pulse rounded bg-muted" />
      <div className="mt-2 h-4 w-1/2 animate-pulse rounded bg-muted" />
      <div className="mt-5 flex justify-between">
        <div className="h-5 w-16 animate-pulse rounded bg-muted" />
        <div className="h-8 w-16 animate-pulse rounded-md bg-muted" />
      </div>
    </div>
  )
}
