import {
  ArrowRightIcon,
  CoinsIcon,
  EnvelopeSimpleIcon,
  HandshakeIcon,
  MinusIcon,
  PackageIcon,
  PencilSimpleIcon,
  PhoneIcon,
  PlusIcon,
  ReceiptIcon,
  ShieldCheckIcon,
} from '@phosphor-icons/react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api, errorMessage } from '@/lib/api'
import { currencySymbol, date, money, num, relative } from '@/lib/format'
import { useFeatures, useMe, useSettings } from '@/lib/queries'
import { cn } from '@/lib/utils'
import {
  AffiliateStatusBadge,
  ConfirmDialog,
  ErrorState,
  Field,
  Kpi,
  Num,
  NumberInput,
  OrderStatusBadge,
  PageHeader,
  PageSkeleton,
  Panel,
  Pill,
  Segmented,
  SubscriptionStatusBadge,
  TextInput,
  TierBadge,
} from '../components/kit'
import type { CustomerDetail as Customer, Tier } from '../lib/types'
import { KIND_LABEL, TIER_LABEL, isoDay, useInvalidateAdmin } from '../lib/utils'

const TIERS: Tier[] = ['MEMBER', 'INSIDER', 'VIP', 'FOUNDER']
const TH = 'text-xs font-medium text-muted-foreground'

export default function CustomerDetail() {
  const { id = '' } = useParams()
  const query = useQuery({
    queryKey: ['admin', 'customer', id],
    queryFn: () => api.get<Customer>(`/api/admin/customers/${id}`),
    enabled: Boolean(id),
  })

  if (query.isError)
    return (
      <div>
        <PageHeader title="Customer" back={{ to: '/admin/customers', label: 'Customers' }} />
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      </div>
    )
  if (query.isPending) return <PageSkeleton />
  return <CustomerView c={query.data} />
}

function CustomerView({ c }: { c: Customer }) {
  const [editOpen, setEditOpen] = useState(false)
  const { membership } = useFeatures()
  const avgCents = c.stats.orders > 0 ? Math.round(c.stats.spentCents / c.stats.orders) : 0

  return (
    <div>
      <PageHeader
        back={{ to: '/admin/customers', label: 'Customers' }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 break-words">{c.name}</span>
            {membership && <TierBadge tier={c.tier} />}
            {c.role === 'ADMIN' && (
              <Pill tone="gold" dot={false} className="gap-1">
                <ShieldCheckIcon className="size-3" weight="fill" />
                Admin
              </Pill>
            )}
          </span>
        }
        meta={
          <>
            <a href={`mailto:${c.email}`} className="inline-flex min-w-0 items-center gap-1 hover:text-foreground hover:underline">
              <EnvelopeSimpleIcon className="size-3.5 shrink-0" />
              <span className="truncate">{c.email}</span>
            </a>
            {c.phone && (
              <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1 hover:text-foreground hover:underline">
                <PhoneIcon className="size-3.5" />
                <Num>{c.phone}</Num>
              </a>
            )}
            <span>Joined {date(c.createdAt)}</span>
            <span>{c.lastLoginAt ? `Last signed in ${relative(c.lastLoginAt)}` : 'Has not signed in yet'}</span>
          </>
        }
        actions={
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <PencilSimpleIcon />
            Edit details
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Paid orders" value={num(c.stats.orders)} info="Paid orders that were not cancelled or refunded. Unpaid orders are listed below but not counted here." icon={<ReceiptIcon />} />
        <Kpi label="Total spent" value={money(c.stats.spentCents, { whole: true })} info="Total of all paid orders, not counting cancelled or refunded ones." emphasis />
        <Kpi label="Points balance" value={num(c.pointsBalance)} sub="points" icon={<CoinsIcon />} />
        <Kpi label="Average order" value={c.stats.orders ? money(avgCents, { whole: true }) : '-'} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <OrdersPanel c={c} />
          <PointsLedger c={c} />
          {c.subscriptions.length > 0 && <SubscriptionsPanel c={c} />}
        </div>
        <div className="min-w-0 space-y-6">
          {c.affiliate && <PartnerCard affiliate={c.affiliate} />}
          {membership ? <MembershipCard c={c} /> : <MembershipOffCard c={c} />}
          <PointsAdjustCard c={c} />
          <AdminAccessCard c={c} />
        </div>
      </div>

      <EditDetailsDialog c={c} open={editOpen} onOpenChange={setEditOpen} />
    </div>
  )
}

// ---------- Lists ----------

function OrdersPanel({ c }: { c: Customer }) {
  const navigate = useNavigate()
  return (
    <Panel
      title="Orders"
      description={c.orders.length >= 50 ? 'Latest 50 orders' : `${c.orders.length} ${c.orders.length === 1 ? 'order' : 'orders'}, including unpaid and cancelled`}
      flush
    >
      {c.orders.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">No orders yet.</p>
      ) : (
        <>
          <ul className="divide-y md:hidden">
            {c.orders.map((o) => (
              <li key={o.id}>
                <Link to={`/admin/orders/${o.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40">
                  <div className="min-w-0">
                    <Num className="text-sm font-medium">{o.number}</Num>
                    <p className="text-xs text-muted-foreground">
                      {date(o.createdAt)} · {KIND_LABEL[o.kind]}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Num className="text-sm">{money(o.totalCents)}</Num>
                    <OrderStatusBadge status={o.status} />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className={cn(TH, 'pl-4')}>Order</TableHead>
                  <TableHead className={TH}>Date</TableHead>
                  <TableHead className={TH}>Type</TableHead>
                  <TableHead className={TH}>Status</TableHead>
                  <TableHead className={cn(TH, 'pr-4 text-right')}>Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {c.orders.map((o) => (
                  <TableRow key={o.id} className="cursor-pointer" onClick={() => navigate(`/admin/orders/${o.id}`)}>
                    <TableCell className="pl-4">
                      <Link to={`/admin/orders/${o.id}`} onClick={(e) => e.stopPropagation()} className="font-mono font-medium tabular-nums hover:underline">
                        {o.number}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{date(o.createdAt)}</TableCell>
                    <TableCell className="text-muted-foreground">{KIND_LABEL[o.kind]}</TableCell>
                    <TableCell>
                      <OrderStatusBadge status={o.status} />
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <Num>{money(o.totalCents)}</Num>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </Panel>
  )
}

function PointsLedger({ c }: { c: Customer }) {
  return (
    <Panel
      title="Points history"
      info="Points are earned on paid orders and spent at checkout. Each earning has its own expiry date."
      description={c.pointsTxns.length >= 50 ? 'Latest 50 entries' : undefined}
      flush
    >
      {c.pointsTxns.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">No points activity yet.</p>
      ) : (
        <ul className="divide-y">
          {c.pointsTxns.map((t) => {
            const expired = t.expiresAt && new Date(t.expiresAt) < new Date()
            return (
              <li key={t.id} className="flex items-start justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-sm break-words">{t.reason}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {date(t.createdAt)}
                    {t.expiresAt && t.delta > 0 && <> · {expired ? 'Expired' : 'Expires'} {date(t.expiresAt)}</>}
                  </p>
                </div>
                <Num className={cn('shrink-0 text-sm font-medium', t.delta > 0 ? 'text-success' : 'text-destructive')}>
                  {t.delta > 0 ? '+' : ''}
                  {num(t.delta)}
                </Num>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}

function SubscriptionsPanel({ c }: { c: Customer }) {
  return (
    <Panel
      title="Subscriptions"
      action={
        <Button asChild variant="ghost" size="sm">
          <Link to="/admin/subscriptions">
            All subscriptions
            <ArrowRightIcon />
          </Link>
        </Button>
      }
      flush
    >
      <ul className="divide-y">
        {c.subscriptions.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <PackageIcon className="size-5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <SubscriptionStatusBadge status={s.status} />
                  <span className="text-sm">
                    <Num>{num(s.boxesShipped)}</Num> {s.boxesShipped === 1 ? 'box' : 'boxes'} shipped
                  </span>
                </div>
                {s.status === 'ACTIVE' && <p className="mt-0.5 text-xs text-muted-foreground">Next box ships {date(s.nextShipAt)}</p>}
              </div>
            </div>
            <span className="text-sm">
              <Num>{money(s.priceCents)}</Num>
              <span className="text-muted-foreground"> / box</span>
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

// ---------- Side cards ----------

function PartnerCard({ affiliate }: { affiliate: NonNullable<Customer['affiliate']> }) {
  return (
    <Panel>
      <div className="flex items-start gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-md bg-gold/10 text-gold-ink">
          <HandshakeIcon className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">Partner account</p>
            <AffiliateStatusBadge status={affiliate.status} />
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Link code <Num className="text-foreground">{affiliate.code}</Num>
          </p>
          <Button asChild variant="outline" size="sm" className="mt-3">
            <Link to={`/admin/partners/${affiliate.id}`}>
              Open partner profile
              <ArrowRightIcon />
            </Link>
          </Button>
        </div>
      </div>
    </Panel>
  )
}

function useSaveCustomer(id: string) {
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch(`/api/admin/customers/${id}`, body),
    onSuccess: () => invalidate(),
  })
}

function MembershipCard({ c }: { c: Customer }) {
  const settings = useSettings()
  const save = useSaveCustomer(c.id)
  const [tier, setTier] = useState<Tier>(c.tier)
  const [expires, setExpires] = useState(isoDay(c.tierExpiresAt))
  const [noExpiry, setNoExpiry] = useState(!c.tierExpiresAt)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setTier(c.tier)
    setExpires(isoDay(c.tierExpiresAt))
    setNoExpiry(!c.tierExpiresAt)
  }, [c.tier, c.tierExpiresAt])

  const rates = settings.data?.points.perDollar
  const isMember = tier === 'MEMBER'
  const nextExpiry = isMember || noExpiry ? null : expires
  const dirty = tier !== c.tier || (nextExpiry ?? '') !== isoDay(c.tierExpiresAt)
  const missingDate = !isMember && !noExpiry && !expires

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (missingDate) return setError('Pick an end date or tick "No end date"')
    setError(null)
    // End of the chosen day in local time so the membership lasts the whole day.
    const tierExpiresAt = nextExpiry ? new Date(`${nextExpiry}T23:59:59`).toISOString() : null
    save.mutate(
      { tier, tierExpiresAt },
      {
        onSuccess: () => toast.success(`${c.name} is now ${TIER_LABEL[tier]}`),
        onError: (err) => {
          setError(errorMessage(err))
          toast.error(errorMessage(err))
        },
      },
    )
  }

  return (
    <Panel
      title="Membership"
      info="Higher tiers earn more points on every order. Paid memberships bought in the store set the end date automatically. When it passes, the customer goes back to Member."
    >
      <form onSubmit={submit} className="space-y-4">
        <Field label="Tier" htmlFor="tier" hint={rates ? `Earns ${rates[tier]} points per ${currencySymbol()}1 spent.` : undefined}>
          <Select value={tier} onValueChange={(v) => setTier(v as Tier)}>
            <SelectTrigger id="tier" className="w-full data-[size=default]:h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIERS.map((t) => (
                <SelectItem key={t} value={t}>
                  {TIER_LABEL[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        {!isMember && (
          <Field
            label="Ends on"
            htmlFor="tier-expiry"
            error={error}
            hint={noExpiry ? 'This tier stays until you change it.' : 'On this date the customer goes back to Member.'}
          >
            <TextInput
              id="tier-expiry"
              type="date"
              value={noExpiry ? '' : expires}
              min={isoDay(new Date())}
              disabled={noExpiry}
              onChange={(e) => setExpires(e.target.value)}
              className="font-mono tabular-nums"
            />
            <label className="mt-1 flex items-center gap-2 text-sm">
              <Checkbox checked={noExpiry} onCheckedChange={(v) => setNoExpiry(v === true)} />
              No end date
            </label>
          </Field>
        )}
        {isMember && error && <p className="text-xs text-destructive">{error}</p>}

        <Button type="submit" className="w-full" disabled={!dirty || save.isPending}>
          {save.isPending ? 'Saving...' : 'Save membership'}
        </Button>
      </form>
    </Panel>
  )
}

/** Shown instead of tier editing while the membership program is switched off. */
function MembershipOffCard({ c }: { c: Customer }) {
  return (
    <Panel title="Membership">
      <p className="text-sm text-muted-foreground">
        The membership program is off, so tiers have no effect on prices or points and cannot be changed here.
      </p>
      {c.tier !== 'MEMBER' && (
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm">
          Saved tier <TierBadge tier={c.tier} /> <span className="text-muted-foreground">(inactive while the program is off)</span>
        </p>
      )}
      <Button asChild variant="outline" size="sm" className="mt-3">
        <Link to="/admin/settings#programs">
          Program settings
          <ArrowRightIcon />
        </Link>
      </Button>
    </Panel>
  )
}

function PointsAdjustCard({ c }: { c: Customer }) {
  const invalidate = useInvalidateAdmin()
  const [mode, setMode] = useState<'add' | 'remove'>('add')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)

  const n = Math.floor(Number(amount))
  const valid = Number.isFinite(n) && n > 0
  const delta = valid ? (mode === 'add' ? n : -n) : 0
  const after = c.pointsBalance + delta
  const tooMuch = after < 0

  const adjust = useMutation({
    mutationFn: () => api.post(`/api/admin/customers/${c.id}/points`, { delta, reason: reason.trim() }),
    onSuccess: () => {
      toast.success(`${mode === 'add' ? 'Added' : 'Removed'} ${num(Math.abs(delta))} points`)
      setAmount('')
      setReason('')
      setError(null)
      invalidate()
    },
    onError: (e) => {
      setError(errorMessage(e))
      toast.error(errorMessage(e))
    },
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!valid) return setError('Enter how many points')
    if (tooMuch) return setError(`They only have ${num(c.pointsBalance)} points`)
    if (reason.trim().length < 2) return setError('Add a short reason so you can find this later')
    setError(null)
    adjust.mutate()
  }

  return (
    <Panel title="Adjust points" description="For goodwill gestures, corrections or manual rewards. The customer sees the reason in their points history.">
      <form onSubmit={submit} className="space-y-4">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'add', label: <><PlusIcon className="size-3.5" /> Add</> },
            { value: 'remove', label: <><MinusIcon className="size-3.5" /> Remove</> },
          ]}
        />
        <Field label="Points" htmlFor="pts-amount">
          <NumberInput id="pts-amount" value={amount} onChange={setAmount} min={1} step={1} suffix="pts" placeholder="0" />
        </Field>
        <Field label="Reason" htmlFor="pts-reason">
          <TextInput id="pts-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="e.g. Sorry for the late delivery" />
        </Field>

        <div className="flex items-center justify-between rounded-md border bg-surface px-3 py-2 text-sm">
          <span className="text-muted-foreground">New balance</span>
          <span className="font-mono tabular-nums">
            <span className="text-muted-foreground">{num(c.pointsBalance)}</span>
            {valid && (
              <>
                <span className={cn('mx-1.5', mode === 'add' ? 'text-success' : 'text-destructive')}>
                  {mode === 'add' ? '+' : '-'}
                  {num(n)}
                </span>
                <span className="text-muted-foreground">= </span>
                <span className={cn('font-medium', tooMuch && 'text-destructive')}>{num(after)}</span>
              </>
            )}
          </span>
        </div>
        {error && (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        )}

        <Button type="submit" variant={mode === 'remove' ? 'outline' : 'default'} className="w-full" disabled={adjust.isPending || !valid || tooMuch}>
          {adjust.isPending ? 'Saving...' : mode === 'add' ? `Add ${valid ? num(n) : ''} points` : `Remove ${valid ? num(n) : ''} points`}
        </Button>
      </form>
    </Panel>
  )
}

function AdminAccessCard({ c }: { c: Customer }) {
  const me = useMe()
  const save = useSaveCustomer(c.id)
  const [confirm, setConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isAdmin = c.role === 'ADMIN'
  const isSelf = me.data?.user?.id === c.id

  const setRole = (role: 'ADMIN' | 'CUSTOMER') =>
    save.mutateAsync({ role }).then(
      () => {
        setError(null)
        toast.success(role === 'ADMIN' ? `${c.name} now has admin access` : `Admin access removed for ${c.name}`)
      },
      (e) => {
        setError(errorMessage(e))
        throw e
      },
    )

  return (
    <Panel title="Admin access">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <label htmlFor="admin-switch" className="text-sm font-medium">
            Can manage the store
          </label>
          <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
            {isSelf ? 'This is your own account. Ask another admin to remove your access.' : 'Admins can open this panel, see every order and customer, and change store settings.'}
          </p>
        </div>
        <Switch
          id="admin-switch"
          checked={isAdmin}
          disabled={save.isPending || (isSelf && isAdmin)}
          onCheckedChange={(on) => {
            if (on) setConfirm(true)
            else setRole('CUSTOMER').catch((e) => toast.error(errorMessage(e)))
          }}
        />
      </div>
      {error && (
        <p className="mt-3 text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Give admin access?"
        description={`${c.name} will be able to see all orders, customers and finances, and change anything in the store. Only do this for people you trust.`}
        confirmLabel="Give admin access"
        cancelLabel="Cancel"
        onConfirm={() => setRole('ADMIN')}
      />
    </Panel>
  )
}

function EditDetailsDialog({ c, open, onOpenChange }: { c: Customer; open: boolean; onOpenChange: (o: boolean) => void }) {
  const save = useSaveCustomer(c.id)
  const [name, setName] = useState(c.name)
  const [phone, setPhone] = useState(c.phone ?? '')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setName(c.name)
      setPhone(c.phone ?? '')
      setError(null)
    }
  }, [open, c.name, c.phone])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return setError('Name cannot be empty')
    save.mutate(
      { name: name.trim(), phone: phone.trim() || null },
      {
        onSuccess: () => {
          toast.success('Details saved')
          onOpenChange(false)
        },
        onError: (err) => {
          setError(errorMessage(err))
          toast.error(errorMessage(err))
        },
      },
    )
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !save.isPending && onOpenChange(o)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-semibold tracking-wide uppercase">Edit details</DialogTitle>
          <DialogDescription>The email address is the customer's login and cannot be changed here.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <Field label="Name" htmlFor="cust-name">
            <TextInput id="cust-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus />
          </Field>
          <Field label="Phone" htmlFor="cust-phone" optional error={error}>
            <TextInput id="cust-phone" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} inputMode="tel" className="font-mono tabular-nums" />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
