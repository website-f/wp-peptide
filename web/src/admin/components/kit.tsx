// Shared building blocks for every admin page. Keep pages consistent by reaching for these first.
import {
  ArrowDownRightIcon,
  ArrowLeftIcon,
  ArrowUpRightIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CheckIcon,
  CopyIcon,
  InfoIcon,
  MagnifyingGlassIcon,
  WarningCircleIcon,
  XIcon,
} from '@phosphor-icons/react'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { currencySymbol, num } from '@/lib/format'
import { cn } from '@/lib/utils'
import { errorMessage } from '@/lib/api'
import {
  AFFILIATE_STATUS,
  COMMISSION_STATUS,
  ORDER_STATUS,
  PAYOUT_STATUS,
  PRODUCT_STATUS,
  SUBSCRIPTION_STATUS,
  TIER_LABEL,
  TIER_TONE,
  pctText,
  type Tone,
} from '../lib/utils'
import type { AffiliateStatus, CommissionStatus, OrderStatus, PayoutStatus, ProductStatus, SubscriptionStatus, Tier } from '../lib/types'

// ---------- Page scaffolding ----------

export function PageHeader({
  title,
  description,
  actions,
  back,
  meta,
}: {
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  back?: { to: string; label: string }
  meta?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        {back && (
          <Link
            to={back.to}
            className="mb-2 inline-flex items-center gap-1.5 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeftIcon className="size-3.5" />
            {back.label}
          </Link>
        )}
        <h1 className="font-display text-3xl leading-tight font-semibold tracking-wide uppercase">{title}</h1>
        {meta && <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">{meta}</div>}
        {description && <p className="mt-1 max-w-[72ch] text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/** Card container (14px radius). Title row is optional. */
export function Panel({
  title,
  description,
  action,
  info,
  children,
  className,
  bodyClassName,
  flush = false,
}: {
  title?: ReactNode
  description?: ReactNode
  action?: ReactNode
  info?: ReactNode
  children?: ReactNode
  className?: string
  bodyClassName?: string
  /** Remove body padding (for tables and lists that run edge to edge). */
  flush?: boolean
}) {
  return (
    <section className={cn('min-w-0 overflow-hidden rounded-xl border bg-card text-card-foreground', className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 border-b px-4 py-3">
          <div className="min-w-0">
            {title && (
              <h2 className="flex items-center gap-1.5 font-display text-lg leading-tight font-semibold tracking-wide uppercase">
                {title}
                {info && <InfoTip>{info}</InfoTip>}
              </h2>
            )}
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
        </header>
      )}
      <div className={cn(!flush && 'p-4', bodyClassName)}>{children}</div>
    </section>
  )
}

/** Small info icon with an explanation. Opens on hover (desktop) and on tap (mobile). */
export function InfoTip({ children, className }: { children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label="What does this mean?"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setOpen((o) => !o)
          }}
          className={cn(
            'inline-grid size-4 shrink-0 place-items-center rounded-full align-middle text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
            className,
          )}
        >
          <InfoIcon className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-72 text-left leading-snug font-normal tracking-normal normal-case">{children}</TooltipContent>
    </Tooltip>
  )
}

// ---------- Status chips ----------

const TONE: Record<Tone, string> = {
  warning: 'border-warning/35 bg-warning/12 text-[color-mix(in_oklch,var(--warning),var(--foreground)_30%)]',
  gold: 'border-gold/35 bg-gold/12 text-gold-ink',
  neutral: 'border-foreground/20 bg-foreground/[0.06] text-foreground',
  success: 'border-success/35 bg-success/12 text-[color-mix(in_oklch,var(--success),var(--foreground)_25%)]',
  muted: 'border-border bg-muted text-muted-foreground',
  destructive: 'border-destructive/35 bg-destructive/10 text-destructive',
}

const DOT: Record<Tone, string> = {
  warning: 'bg-warning',
  gold: 'bg-gold',
  neutral: 'bg-foreground/70',
  success: 'bg-success',
  muted: 'bg-muted-foreground/60',
  destructive: 'bg-destructive',
}

export function Pill({ tone = 'muted', children, className, dot = true }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1.5 rounded-md border px-1.5 text-[11px] leading-none font-medium whitespace-nowrap',
        TONE[tone],
        className,
      )}
    >
      {dot && <span className={cn('size-1.5 rounded-full', DOT[tone])} aria-hidden />}
      {children}
    </span>
  )
}

export const OrderStatusBadge = ({ status, className }: { status: OrderStatus; className?: string }) => (
  <Pill tone={ORDER_STATUS[status].tone} className={className}>
    {ORDER_STATUS[status].label}
  </Pill>
)
export const AffiliateStatusBadge = ({ status }: { status: AffiliateStatus }) => (
  <Pill tone={AFFILIATE_STATUS[status].tone}>{AFFILIATE_STATUS[status].label}</Pill>
)
export const CommissionStatusBadge = ({ status }: { status: CommissionStatus }) => (
  <Pill tone={COMMISSION_STATUS[status].tone}>{COMMISSION_STATUS[status].label}</Pill>
)
export const PayoutStatusBadge = ({ status }: { status: PayoutStatus }) => <Pill tone={PAYOUT_STATUS[status].tone}>{PAYOUT_STATUS[status].label}</Pill>
export const ProductStatusBadge = ({ status }: { status: ProductStatus }) => (
  <Pill tone={PRODUCT_STATUS[status].tone}>{PRODUCT_STATUS[status].label}</Pill>
)
export const SubscriptionStatusBadge = ({ status }: { status: SubscriptionStatus }) => (
  <Pill tone={SUBSCRIPTION_STATUS[status].tone}>{SUBSCRIPTION_STATUS[status].label}</Pill>
)
export const TierBadge = ({ tier }: { tier: Tier }) => (
  <Pill tone={TIER_TONE[tier]} dot={false}>
    {TIER_LABEL[tier]}
  </Pill>
)

// ---------- Numbers ----------

/** Monospace tabular figure. Use for every amount, count, SKU and order number. */
export function Num({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('font-mono tabular-nums', className)}>{children}</span>
}

export function Delta({ value, className, invert = false }: { value: number; className?: string; invert?: boolean }) {
  const up = value > 0
  const flat = value === 0
  const good = invert ? !up : up
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 font-mono text-xs tabular-nums',
        flat ? 'text-muted-foreground' : good ? 'text-success' : 'text-destructive',
        className,
      )}
    >
      {!flat && (up ? <ArrowUpRightIcon className="size-3" weight="bold" /> : <ArrowDownRightIcon className="size-3" weight="bold" />)}
      {flat ? '0%' : pctText(value)}
    </span>
  )
}

export function Kpi({
  label,
  value,
  delta,
  sub,
  info,
  icon,
  className,
  emphasis = false,
}: {
  label: ReactNode
  value: ReactNode
  delta?: number
  sub?: ReactNode
  info?: ReactNode
  icon?: ReactNode
  className?: string
  emphasis?: boolean
}) {
  return (
    <div className={cn('min-w-0 rounded-xl border bg-card p-4', emphasis && 'border-gold/40 bg-gold/[0.04]', className)}>
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon && <span className="text-gold-ink [&_svg]:size-4">{icon}</span>}
        <span className="truncate">{label}</span>
        {info && <InfoTip>{info}</InfoTip>}
      </div>
      <div className="mt-2 truncate font-mono text-2xl font-medium tracking-tight tabular-nums">{value}</div>
      {(delta !== undefined || sub) && (
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
          {delta !== undefined && (
            <span className="inline-flex items-center gap-1">
              <Delta value={delta} /> <span>vs previous</span>
            </span>
          )}
          {sub && <span className="truncate">{sub}</span>}
        </div>
      )}
    </div>
  )
}

// ---------- Forms ----------

export function Field({
  label,
  htmlFor,
  hint,
  error,
  info,
  optional,
  children,
  className,
}: {
  label: ReactNode
  htmlFor?: string
  hint?: ReactNode
  error?: string | null
  info?: ReactNode
  optional?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <div className={cn('grid min-w-0 gap-1.5', className)}>
      <div className="flex items-center gap-1.5">
        <Label htmlFor={htmlFor} className="text-[13px] font-medium">
          {label}
        </Label>
        {optional && <span className="text-xs text-muted-foreground">(optional)</span>}
        {info && <InfoTip>{info}</InfoTip>}
      </div>
      {children}
      {error ? (
        <p className="flex items-start gap-1 text-xs text-destructive" role="alert">
          <WarningCircleIcon className="mt-px size-3.5 shrink-0" />
          {error}
        </p>
      ) : (
        hint && <p className="text-xs leading-snug text-muted-foreground">{hint}</p>
      )}
    </div>
  )
}

/** Standard admin input height (36px) so toolbars line up. */
export const CONTROL = 'h-9'

export function TextInput({ className, ...props }: React.ComponentProps<typeof Input>) {
  return <Input className={cn(CONTROL, className)} {...props} />
}

/** Amount in ringgit. Value is the raw text so typing "12." works; convert with toCents(). */
export function MoneyInput({
  value,
  onChange,
  className,
  ...props
}: Omit<React.ComponentProps<typeof Input>, 'onChange' | 'value'> & { value: string; onChange: (v: string) => void }) {
  return (
    <div className={cn('relative min-w-0', className)}>
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center font-mono text-xs text-muted-foreground">
        {currencySymbol()}
      </span>
      <Input
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ''))}
        className={cn(CONTROL, 'pl-10 font-mono tabular-nums')}
        {...props}
      />
    </div>
  )
}

/** Number input with an optional unit suffix ("%", "days", "pts"). */
export function NumberInput({
  value,
  onChange,
  suffix,
  className,
  step,
  ...props
}: Omit<React.ComponentProps<typeof Input>, 'onChange' | 'value' | 'type'> & {
  value: number | string
  onChange: (v: string) => void
  suffix?: string
}) {
  return (
    <div className={cn('relative min-w-0', className)}>
      <Input
        type="number"
        inputMode="decimal"
        value={value}
        step={step}
        onChange={(e) => onChange(e.target.value)}
        className={cn(CONTROL, 'font-mono tabular-nums', suffix && 'pr-12')}
        {...props}
      />
      {suffix && (
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">{suffix}</span>
      )}
    </div>
  )
}

export function SearchInput({
  value,
  onChange,
  placeholder = 'Search',
  className,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <div className={cn('relative min-w-0', className)}>
      <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className={cn(CONTROL, 'pr-8 pl-9 [&::-webkit-search-cancel-button]:hidden')}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <XIcon className="size-3.5" />
        </button>
      )}
    </div>
  )
}

// ---------- Lists and states ----------

export function Pager({
  page,
  pageSize,
  total,
  onPage,
  className,
}: {
  page: number
  pageSize: number
  total: number
  onPage: (p: number) => void
  className?: string
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  if (total === 0) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  return (
    <div className={cn('flex items-center justify-between gap-3 px-4 py-3 text-sm text-muted-foreground', className)}>
      <span>
        <Num>
          {num(from)}-{num(to)}
        </Num>{' '}
        of <Num>{num(total)}</Num>
      </span>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <CaretLeftIcon />
        </Button>
        <span className="px-2 font-mono text-xs tabular-nums">
          {page} / {pages}
        </span>
        <Button variant="outline" size="icon-sm" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <CaretRightIcon />
        </Button>
      </div>
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center">
      <WarningCircleIcon className="size-7 text-destructive" />
      <p className="mt-3 font-medium">This could not be loaded</p>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{errorMessage(error)}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  )
}

/** Table-shaped skeleton. */
export function RowsSkeleton({ rows = 6, cols = 5, className }: { rows?: number; cols?: number; className?: string }) {
  return (
    <div className={cn('divide-y', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3.5">
          <Skeleton className="size-9 shrink-0 rounded-md" />
          {Array.from({ length: cols - 1 }).map((__, j) => (
            <Skeleton key={j} className={cn('h-3.5', j === 0 ? 'w-40 flex-1' : 'hidden w-20 sm:block')} />
          ))}
        </div>
      ))}
    </div>
  )
}

export function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-xl" />
    </div>
  )
}

export function CopyButton({ text, label = 'Copy', className }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false)
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className={className}
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text)
          setDone(true)
          toast.success('Copied')
          setTimeout(() => setDone(false), 1500)
        } catch {
          toast.error('Could not copy. Select the text and copy it manually.')
        }
      }}
    >
      {done ? <CheckIcon className="text-success" /> : <CopyIcon />}
    </Button>
  )
}

/** Label / value rows used in detail cards. */
export function DefRow({ label, children, className, info }: { label: ReactNode; children: ReactNode; className?: string; info?: ReactNode }) {
  return (
    <div className={cn('flex items-start justify-between gap-4 py-1.5 text-sm', className)}>
      <dt className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
        {label}
        {info && <InfoTip>{info}</InfoTip>}
      </dt>
      <dd className="min-w-0 text-right break-words">{children}</dd>
    </div>
  )
}

// ---------- Confirm ----------

/**
 * Confirmation dialog for destructive or irreversible actions.
 * Stays open while `onConfirm` runs so the owner sees it worked or failed.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Keep it',
  destructive = true,
  onConfirm,
  disabled,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  onConfirm: () => Promise<unknown> | void
  disabled?: boolean
}) {
  const [pending, setPending] = useState(false)
  return (
    <AlertDialog open={open} onOpenChange={(o) => !pending && onOpenChange(o)}>
      <AlertDialogContent className="data-[size=default]:max-w-[calc(100%-2rem)] data-[size=default]:sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display text-xl font-semibold tracking-wide uppercase">{title}</AlertDialogTitle>
          {description && <AlertDialogDescription className="text-left">{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        {children && <div className="text-sm">{children}</div>}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            disabled={pending || disabled}
            onClick={async () => {
              setPending(true)
              try {
                await onConfirm()
                onOpenChange(false)
              } catch (e) {
                toast.error(errorMessage(e))
              } finally {
                setPending(false)
              }
            }}
          >
            {pending ? 'Working...' : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** Horizontal scroll container for wide tables. Never lets the page itself scroll sideways. */
export function TableWrap({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('w-full min-w-0 overflow-x-auto', className)}>{children}</div>
}

/** Segmented tabs that scroll sideways on phones instead of wrapping. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: ReactNode; count?: number }[]
  className?: string
}) {
  return (
    <div className={cn('scrollbar-none -mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0', className)}>
      <div role="tablist" className="inline-flex min-w-max items-center gap-1 rounded-md border bg-surface p-1">
        {options.map((o) => {
          const active = o.value === value
          return (
            <button
              key={o.value}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => onChange(o.value)}
              className={cn(
                'inline-flex h-7 items-center gap-1.5 rounded-[5px] px-2.5 text-[13px] font-medium whitespace-nowrap transition-colors',
                active ? 'bg-card text-foreground shadow-sm ring-1 ring-border' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {o.label}
              {o.count !== undefined && (
                <span className={cn('font-mono text-[11px] tabular-nums', active ? 'text-gold-ink' : 'text-muted-foreground/80')}>{num(o.count)}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
