import { FlaskIcon } from '@phosphor-icons/react'
import { cn } from '@/lib/utils'

/**
 * Product images are stored as a base path; renditions live at `${base}-{320|560|900}.{avif|webp}`.
 * AVIF first (smallest), WebP fallback. Square, so width/height reserve space and avoid CLS.
 */
const WIDTHS = [320, 560, 900]

export function ProductImage({
  src,
  alt,
  sizes = '(min-width: 1024px) 25vw, (min-width: 640px) 40vw, 80vw',
  priority = false,
  className,
  imgClassName,
}: {
  src: string | null | undefined
  alt: string
  sizes?: string
  priority?: boolean
  className?: string
  imgClassName?: string
}) {
  if (!src) {
    return (
      <div className={cn('grid aspect-square place-items-center bg-surface text-muted-foreground', className)}>
        <FlaskIcon className="size-10" weight="thin" aria-hidden />
        <span className="sr-only">{alt}</span>
      </div>
    )
  }
  const set = (ext: string) => WIDTHS.map((w) => `${src}-${w}.${ext} ${w}w`).join(', ')
  return (
    <picture className={cn('block overflow-hidden bg-[#0d0c0b]', className)}>
      <source type="image/avif" srcSet={set('avif')} sizes={sizes} />
      <source type="image/webp" srcSet={set('webp')} sizes={sizes} />
      <img
        src={`${src}-560.webp`}
        alt={alt}
        width={560}
        height={560}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={priority ? 'high' : 'auto'}
        className={cn('size-full object-cover', imgClassName)}
      />
    </picture>
  )
}

/** Wide 3:2 renditions (hero / feature panels) at /img/wide/{slug}-{960|1600}. */
export function WideImage({
  slug,
  alt,
  className,
  imgClassName,
  priority = false,
  sizes = '(min-width: 1024px) 60vw, 100vw',
}: {
  slug: string
  alt: string
  className?: string
  imgClassName?: string
  priority?: boolean
  sizes?: string
}) {
  const base = `/img/wide/${slug}`
  return (
    <picture className={cn('block overflow-hidden bg-[#0d0c0b]', className)}>
      <source type="image/avif" srcSet={`${base}-960.avif 960w, ${base}-1600.avif 1600w`} sizes={sizes} />
      <source type="image/webp" srcSet={`${base}-960.webp 960w, ${base}-1600.webp 1600w`} sizes={sizes} />
      <img
        src={`${base}-960.webp`}
        alt={alt}
        width={1600}
        height={1067}
        loading={priority ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={priority ? 'high' : 'auto'}
        className={cn('size-full object-cover', imgClassName)}
      />
    </picture>
  )
}
