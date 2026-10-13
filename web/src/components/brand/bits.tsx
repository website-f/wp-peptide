import { SealCheckIcon } from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** HPLC purity chip used on cards, PDP and the COA library. */
export function Purity({ value, className }: { value: number | null | undefined; className?: string }) {
  if (value === null || value === undefined) return null
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md border border-gold/30 bg-gold/10 px-1.5 py-0.5 font-mono text-[11px] font-medium text-gold-ink tabular-nums',
        className,
      )}
    >
      <SealCheckIcon weight="fill" className="size-3" aria-hidden />
      {value.toFixed(2)}%
    </span>
  )
}

/** Page title block for inner pages. */
export function PageHeader({ title, intro, children, className }: { title: ReactNode; intro?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <header className={cn('container-x pt-10 pb-8 md:pt-16 md:pb-12', className)}>
      <h1 className="display text-5xl sm:text-6xl md:text-7xl">{title}</h1>
      {intro && <p className="mt-4 max-w-[60ch] text-base text-muted-foreground md:text-lg">{intro}</p>}
      {children}
    </header>
  )
}

/** Section headline: no eyebrow by default (eyebrows are rationed). */
export function SectionTitle({ children, sub, className, align = 'left' }: { children: ReactNode; sub?: ReactNode; className?: string; align?: 'left' | 'center' }) {
  return (
    <div className={cn(align === 'center' && 'mx-auto text-center', className)}>
      <h2 className="display text-4xl sm:text-5xl md:text-6xl">{children}</h2>
      {sub && <p className={cn('mt-3 max-w-[58ch] text-muted-foreground md:text-lg', align === 'center' && 'mx-auto')}>{sub}</p>}
    </div>
  )
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn('font-mono text-[11px] tracking-[0.2em] text-gold-ink uppercase', className)}>{children}</p>
}

export function EmptyState({ icon, title, body, action }: { icon: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed px-6 py-14 text-center">
      <div className="mb-4 grid size-12 place-items-center rounded-full bg-gold/10 text-gold-ink [&_svg]:size-6">{icon}</div>
      <p className="font-display text-2xl font-semibold uppercase">{title}</p>
      {body && <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
