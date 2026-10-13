import { ArrowClockwiseIcon, CheckIcon, CopyIcon, WarningOctagonIcon } from '@phosphor-icons/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { errorMessage } from '@/lib/api'
import { useMe } from '@/lib/queries'
import type { Me, OrderStatus } from '@/lib/types'
import { STATUS_LABEL } from '@/lib/types'
import { cn } from '@/lib/utils'

export type Tone = 'gold' | 'success' | 'warning' | 'danger' | 'muted'

const TONE: Record<Tone, string> = {
  gold: 'border-gold/30 bg-gold/10 text-gold-ink',
  success: 'border-success/30 bg-success/10 text-success',
  warning: 'border-warning/35 bg-warning/10 text-warning',
  danger: 'border-destructive/30 bg-destructive/10 text-destructive',
  muted: 'border-border bg-muted text-muted-foreground',
}

export function StatusPill({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md border px-2 text-xs font-medium whitespace-nowrap', TONE[tone], className)}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {children}
    </span>
  )
}

const ORDER_TONE: Record<OrderStatus, Tone> = {
  PENDING_PAYMENT: 'warning',
  PAID: 'gold',
  PROCESSING: 'gold',
  SHIPPED: 'gold',
  DELIVERED: 'success',
  CANCELLED: 'muted',
  REFUNDED: 'muted',
}

export function OrderStatusPill({ status }: { status: OrderStatus }) {
  return <StatusPill tone={ORDER_TONE[status] ?? 'muted'}>{STATUS_LABEL[status] ?? status}</StatusPill>
}

/** Error block with retry for any failed query. */
export function ErrorState({ error, onRetry, title = 'Could not load this' }: { error: unknown; onRetry?: () => void; title?: string }) {
  return (
    <div role="alert" className="flex flex-col items-center rounded-xl border border-destructive/25 bg-destructive/5 px-6 py-12 text-center">
      <div className="mb-4 grid size-12 place-items-center rounded-full bg-destructive/10 text-destructive">
        <WarningOctagonIcon className="size-6" aria-hidden />
      </div>
      <p className="font-display text-2xl font-semibold uppercase">{title}</p>
      <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{errorMessage(error)}</p>
      {onRetry && (
        <Button variant="outline" className="mt-5 h-11" onClick={onRetry}>
          <ArrowClockwiseIcon /> Try again
        </Button>
      )}
    </div>
  )
}

/** Copy-to-clipboard with a visible confirmation that resets itself. */
export function useCopy() {
  const [copied, setCopied] = useState<string | null>(null)
  const t = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(t.current), [])
  const copy = async (value: string, label = 'Copied') => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      // Older browsers / insecure origins: fall back to a hidden textarea.
      const ta = document.createElement('textarea')
      ta.value = value
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      document.body.removeChild(ta)
      if (!ok) {
        toast.error('Copy failed. Select the text and copy it manually.')
        return
      }
    }
    setCopied(value)
    toast.success(label)
    clearTimeout(t.current)
    t.current = setTimeout(() => setCopied(null), 2000)
  }
  return { copied, copy }
}

export function CopyButton({ value, label, className, variant = 'outline' }: { value: string; label: string; className?: string; variant?: 'outline' | 'default' | 'secondary' }) {
  const { copied, copy } = useCopy()
  const done = copied === value
  return (
    <Button type="button" variant={variant} className={cn('h-11', className)} onClick={() => void copy(value, `${label} copied`)} aria-label={`Copy ${label.toLowerCase()}`}>
      {done ? <CheckIcon weight="bold" /> : <CopyIcon />}
      {done ? 'Copied' : 'Copy'}
    </Button>
  )
}

/** Only allow same-site relative redirects from ?next= / location state. */
export function safeNext(v: unknown): string | null {
  if (typeof v !== 'string') return null
  if (!v.startsWith('/') || v.startsWith('//') || v.startsWith('/\\')) return null
  if (v === '/login' || v === '/register') return null
  return v
}

/**
 * Gate for signed-in pages. Renders a skeleton while /me loads, redirects to /login?next=... when
 * signed out, and hands the user to children otherwise.
 */
export function RequireUser({ children, fallback }: { children: (me: Me & { user: NonNullable<Me['user']> }) => ReactNode; fallback?: ReactNode }) {
  const me = useMe()
  const location = useLocation()
  if (me.isPending) return <>{fallback ?? <PageSkeleton />}</>
  if (me.isError)
    return (
      <div className="container-x py-16">
        <ErrorState error={me.error} onRetry={() => void me.refetch()} title="Could not check your session" />
      </div>
    )
  if (!me.data.user) {
    const next = location.pathname + location.search
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />
  }
  return <>{children(me.data as Me & { user: NonNullable<Me['user']> })}</>
}

export function PageSkeleton() {
  return (
    <div className="container-x py-12 md:py-16" aria-busy aria-label="Loading">
      <Skeleton className="h-12 w-2/3 max-w-md" />
      <Skeleton className="mt-4 h-5 w-1/2 max-w-xs" />
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="mt-6 h-64 rounded-xl" />
    </div>
  )
}

export const firstName = (name: string) => name.trim().split(/\s+/)[0] || name
