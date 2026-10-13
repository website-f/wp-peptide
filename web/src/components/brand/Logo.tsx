import { SparkleIcon } from '@phosphor-icons/react'
import { Link } from 'react-router'
import { cn } from '@/lib/utils'

/** KYVO wordmark: Cinzel caps in brushed gold, matching the vial label. */
export function Logo({ className, compact = false, to = '/' }: { className?: string; compact?: boolean; to?: string | null }) {
  const mark = (
    <span className={cn('inline-flex items-center gap-2 select-none', className)} aria-label="KYVO">
      <span className="gold-text font-wordmark text-[22px] leading-none font-semibold tracking-[0.14em]">KYVO</span>
      {!compact && (
        <span className="hidden items-center gap-1.5 sm:inline-flex" aria-hidden>
          <SparkleIcon weight="fill" className="size-2.5 text-gold" />
          <span className="font-display text-[11px] font-medium tracking-[0.28em] text-muted-foreground uppercase">Labs</span>
        </span>
      )}
    </span>
  )
  if (to === null) return mark
  return (
    <Link to={to} className="rounded-md focus-visible:ring-2 focus-visible:ring-ring">
      {mark}
    </Link>
  )
}
