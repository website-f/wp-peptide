import {
  ArrowCounterClockwiseIcon,
  CheckIcon,
  CoinsIcon,
  GlobeIcon,
  HandshakeIcon,
  PaperPlaneTiltIcon,
  ReceiptIcon,
  UserPlusIcon,
  WalletIcon,
  XIcon,
} from '@phosphor-icons/react'
import { keepPreviousData, useMutation, useQueries, useQuery, type UseQueryResult } from '@tanstack/react-query'
import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { EmptyState } from '@/components/brand/bits'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { api, errorMessage } from '@/lib/api'
import { date, money, num, relative } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  AffiliateStatusBadge,
  CommissionStatusBadge,
  ConfirmDialog,
  CopyButton,
  DefRow,
  ErrorState,
  Field,
  InfoTip,
  Num,
  NumberInput,
  OrderStatusBadge,
  PageHeader,
  Panel,
  PayoutStatusBadge,
  RowsSkeleton,
  SearchInput,
  Segmented,
  TextInput,
} from '../components/kit'
import { BankDetailsList, NoBankBadge, TransferTo, hasBank, parseDestination } from '../components/bank'
import type { AffiliateDetail, AffiliateRow, AffiliateStatus, BankDetails, Commission, CommissionStatus, Payout } from '../lib/types'
import { useInvalidateAdmin } from '../lib/utils'

const TH = 'text-xs font-medium text-muted-foreground'

// Partners are paid by bank transfer only. Older payouts may carry another method id; show it as is.
export const methodLabel = (m: string) => (m === 'BANK' ? 'Bank transfer' : m)

/** Website text as typed by the applicant, turned into a safe clickable URL. */
export function websiteHref(w: string) {
  return /^https?:\/\//i.test(w) ? w : `https://${w}`
}

// ---------------------------------------------------------------------------
// Commissions list (shared with the partner profile)
// ---------------------------------------------------------------------------

export const COMMISSION_HELP = (
  <span className="block space-y-1">
    <span className="block">
      <b>Pending</b>: the order is not delivered yet.
    </span>
    <span className="block">
      <b>Approved</b>: earned and owed to the partner.
    </span>
    <span className="block">
      <b>Paid</b>: already paid out.
    </span>
    <span className="block">
      <b>Void</b>: the order was cancelled or refunded, nothing is owed.
    </span>
  </span>
)

function useCommissionUpdate() {
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'PENDING' | 'APPROVED' | 'VOID' }) => api.post(`/api/admin/commissions/${id}`, { status }),
    onSuccess: (_d, v) => {
      toast.success(v.status === 'APPROVED' ? 'Commission approved' : v.status === 'VOID' ? 'Commission voided' : 'Commission restored to pending')
      invalidate()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
}

function LockedAction({ reason, children }: { reason: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex rounded-md">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-60">{reason}</TooltipContent>
    </Tooltip>
  )
}

function CommissionActions({
  c,
  busy,
  onApprove,
  onVoid,
  onRestore,
}: {
  c: Commission
  busy: boolean
  onApprove: () => void
  onVoid: () => void
  onRestore: () => void
}) {
  if (c.status === 'PAID') return <span className="text-xs text-muted-foreground">Paid out</span>
  if (c.payoutId)
    return (
      <LockedAction reason="Part of a payout request. Mark that payout paid or reject it before changing this commission.">
        <Button size="sm" variant="outline" disabled>
          In payout
        </Button>
      </LockedAction>
    )
  return (
    <div className="flex items-center justify-end gap-1.5">
      {c.status === 'PENDING' && (
        <Button size="sm" variant="outline" disabled={busy} onClick={onApprove}>
          <CheckIcon />
          Approve
        </Button>
      )}
      {(c.status === 'PENDING' || c.status === 'APPROVED') && (
        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={busy} onClick={onVoid}>
          <XIcon />
          Void
        </Button>
      )}
      {c.status === 'VOID' && (
        <Button size="sm" variant="outline" disabled={busy} onClick={onRestore}>
          <ArrowCounterClockwiseIcon />
          Restore to pending
        </Button>
      )}
    </div>
  )
}

export function CommissionList({
  rows,
  showPartner = true,
  empty = 'No commissions here yet.',
}: {
  rows: Commission[]
  showPartner?: boolean
  empty?: string
}) {
  const navigate = useNavigate()
  const update = useCommissionUpdate()
  const [voidTarget, setVoidTarget] = useState<Commission | null>(null)
  const busyId = update.isPending ? update.variables?.id : undefined

  if (rows.length === 0) return <p className="px-4 py-10 text-center text-sm text-muted-foreground">{empty}</p>

  const actions = (c: Commission) => (
    <CommissionActions
      c={c}
      busy={busyId === c.id}
      onApprove={() => update.mutate({ id: c.id, status: 'APPROVED' })}
      onVoid={() => setVoidTarget(c)}
      onRestore={() => update.mutate({ id: c.id, status: 'PENDING' })}
    />
  )

  return (
    <>
      <ul className="divide-y md:hidden">
        {rows.map((c) => (
          <li key={c.id} className="space-y-2 px-4 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {c.order ? (
                  <Link to={`/admin/orders/${c.order.id}`} className="font-mono text-sm font-medium tabular-nums hover:underline">
                    {c.order.number}
                  </Link>
                ) : (
                  <span className="text-sm text-muted-foreground">Order</span>
                )}
                <p className="truncate text-xs text-muted-foreground">
                  {date(c.createdAt)}
                  {showPartner && c.affiliate && <> · {c.affiliate.user.name}</>}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <Num className="text-sm font-medium">{money(c.amountCents)}</Num>
                <p className="text-xs text-muted-foreground">
                  <Num>{c.rate}%</Num> of <Num>{money(c.baseCents)}</Num>
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <CommissionStatusBadge status={c.status} />
                {c.order && (
                  <Link to={`/admin/orders/${c.order.id}`} aria-label={`Open order ${c.order.number}`}>
                    <OrderStatusBadge status={c.order.status} />
                  </Link>
                )}
              </div>
              {actions(c)}
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className={cn(TH, 'pl-4')}>Date</TableHead>
              {showPartner && <TableHead className={TH}>Partner</TableHead>}
              <TableHead className={TH}>Order</TableHead>
              <TableHead className={TH}>Order status</TableHead>
              <TableHead className={cn(TH, 'text-right')}>
                <span className="inline-flex items-center gap-1">
                  Order value
                  <InfoTip>The order amount the commission is worked out from, after discounts and before shipping.</InfoTip>
                </span>
              </TableHead>
              <TableHead className={cn(TH, 'text-right')}>Rate</TableHead>
              <TableHead className={cn(TH, 'text-right')}>Commission</TableHead>
              <TableHead className={TH}>
                <span className="inline-flex items-center gap-1">
                  Status
                  <InfoTip>{COMMISSION_HELP}</InfoTip>
                </span>
              </TableHead>
              <TableHead className={cn(TH, 'pr-4 text-right')}>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="pl-4 whitespace-nowrap text-muted-foreground">{date(c.createdAt)}</TableCell>
                {showPartner && (
                  <TableCell className="max-w-48">
                    {c.affiliate ? (
                      <Link to={`/admin/partners/${c.affiliate.id}`} className="block truncate hover:underline">
                        {c.affiliate.user.name}
                      </Link>
                    ) : (
                      '-'
                    )}
                  </TableCell>
                )}
                <TableCell>
                  {c.order ? (
                    <Link to={`/admin/orders/${c.order.id}`} className="font-mono font-medium tabular-nums hover:underline">
                      {c.order.number}
                    </Link>
                  ) : (
                    '-'
                  )}
                </TableCell>
                <TableCell>
                  {c.order && (
                    <button type="button" onClick={() => navigate(`/admin/orders/${c.order!.id}`)} aria-label={`Open order ${c.order.number}`}>
                      <OrderStatusBadge status={c.order.status} />
                    </button>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <Num>{money(c.baseCents)}</Num>
                </TableCell>
                <TableCell className="text-right">
                  <Num>{c.rate}%</Num>
                </TableCell>
                <TableCell className="text-right">
                  <Num className={cn('font-medium', c.status === 'VOID' && 'text-muted-foreground line-through')}>{money(c.amountCents)}</Num>
                </TableCell>
                <TableCell>
                  <CommissionStatusBadge status={c.status} />
                </TableCell>
                <TableCell className="pr-4 text-right">{actions(c)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ConfirmDialog
        open={Boolean(voidTarget)}
        onOpenChange={(o) => !o && setVoidTarget(null)}
        title="Void this commission?"
        description={
          voidTarget
            ? `${voidTarget.affiliate ? voidTarget.affiliate.user.name : 'The partner'} will no longer be owed ${money(voidTarget.amountCents)} for order ${voidTarget.order?.number ?? ''}. Do this when an order was cancelled, refunded or was not a genuine referral. You can restore it later.`
            : undefined
        }
        confirmLabel="Void commission"
        onConfirm={() => (voidTarget ? update.mutateAsync({ id: voidTarget.id, status: 'VOID' }) : undefined)}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Payouts list (shared with the partner profile)
// ---------------------------------------------------------------------------

// Rejected payouts release their commissions, so their count is always 0 and not worth showing.
const commissionCount = (p: Payout) =>
  p._count && p.status !== 'REJECTED' ? `${num(p._count.commissions)} ${p._count.commissions === 1 ? 'commission' : 'commissions'}` : null

function MarkPaidDialog({ payout, currentBank, onOpenChange }: { payout: Payout | null; currentBank?: BankDetails; onOpenChange: (o: boolean) => void }) {
  const invalidate = useInvalidateAdmin()
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)

  const pay = useMutation({
    mutationFn: () => api.post(`/api/admin/payouts/${payout!.id}`, { status: 'PAID', reference: reference.trim(), note: note.trim() || undefined }),
    onSuccess: () => {
      toast.success(`Payout of ${money(payout!.amountCents)} marked as paid. The partner gets an email with the reference.`)
      invalidate()
      close()
    },
    onError: (e) => setError(errorMessage(e)),
  })

  const close = () => {
    setReference('')
    setNote('')
    setError(null)
    onOpenChange(false)
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (reference.trim().length < 3) return setError('Add the bank transfer reference so the partner can match the payment')
    setError(null)
    pay.mutate()
  }

  return (
    <Dialog open={Boolean(payout)} onOpenChange={(o) => !pay.isPending && (o ? onOpenChange(o) : close())}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-semibold tracking-wide uppercase">Mark payout as paid</DialogTitle>
          <DialogDescription>Make the bank transfer first, then record it here. The partner is emailed and sees the reference in their dashboard.</DialogDescription>
        </DialogHeader>
        {payout && (
          <form onSubmit={submit} noValidate className="space-y-4">
            {payout.affiliate && (
              <p className="text-sm">
                <span className="font-medium">{payout.affiliate.user.name}</span> <span className="break-all text-muted-foreground">{payout.affiliate.user.email}</span>
              </p>
            )}
            <TransferTo destination={payout.destination} current={payout.affiliate ?? currentBank} amountCents={payout.amountCents} />
            <Field label="Bank transfer reference" htmlFor="payout-ref" error={error} hint="The reference or transaction ID on your bank's transfer receipt.">
              <TextInput
                id="payout-ref"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                maxLength={120}
                autoFocus
                autoComplete="off"
                className="font-mono"
                placeholder="e.g. MBB240613123456"
                aria-invalid={Boolean(error) || undefined}
              />
            </Field>
            <Field label="Note for the partner" htmlFor="payout-note" optional>
              <Textarea id="payout-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className="min-h-20" />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={close} disabled={pay.isPending}>
                Cancel
              </Button>
              <Button type="submit" disabled={pay.isPending}>
                {pay.isPending ? 'Saving...' : 'Mark as paid'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}

function RejectPayoutDialog({ payout, onOpenChange }: { payout: Payout | null; onOpenChange: (o: boolean) => void }) {
  const invalidate = useInvalidateAdmin()
  const [note, setNote] = useState('')
  const count = payout?._count?.commissions
  return (
    <ConfirmDialog
      open={Boolean(payout)}
      onOpenChange={(o) => {
        if (!o) {
          setNote('')
          onOpenChange(false)
        }
      }}
      title="Reject this payout?"
      description={
        payout
          ? `No money is sent. The ${count !== undefined ? `${num(count)} ${count === 1 ? 'commission' : 'commissions'}` : 'commissions'} in this request (${money(payout.amountCents)}) go back to ${payout.affiliate ? `${payout.affiliate.user.name}'s` : "the partner's"} available balance, so a new payout can be requested later.`
          : undefined
      }
      confirmLabel="Reject payout"
      onConfirm={async () => {
        await api.post(`/api/admin/payouts/${payout!.id}`, { status: 'REJECTED', note: note.trim() || undefined })
        toast.success('Payout rejected. The amount is back in the available balance.')
        setNote('')
        invalidate()
      }}
    >
      <Field label="Reason for the partner" htmlFor="reject-note" optional>
        <Textarea
          id="reject-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={500}
          className="min-h-20"
          placeholder="e.g. The bank rejected the account number, please check it"
        />
      </Field>
    </ConfirmDialog>
  )
}

/** One open payout request: everything needed to make the transfer, then settle it. */
function RequestedPayoutCard({
  p,
  showPartner,
  currentBank,
  onPay,
  onReject,
}: {
  p: Payout
  showPartner: boolean
  currentBank?: BankDetails
  onPay: () => void
  onReject: () => void
}) {
  return (
    <article className="flex min-w-0 flex-col gap-3 rounded-xl border border-warning/35 bg-warning/[0.03] p-4" aria-label={`Payout request of ${money(p.amountCents)}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {showPartner && p.affiliate ? (
            <>
              <Link to={`/admin/partners/${p.affiliate.id}`} className="block truncate font-medium hover:underline">
                {p.affiliate.user.name}
              </Link>
              <a href={`mailto:${p.affiliate.user.email}`} className="block truncate text-xs text-muted-foreground hover:underline">
                {p.affiliate.user.email}
              </a>
            </>
          ) : (
            <p className="font-medium">Payout request</p>
          )}
          <p className="mt-0.5 text-xs text-muted-foreground">
            Requested {date(p.createdAt)} ({relative(p.createdAt)})
            {commissionCount(p) && <> · {commissionCount(p)}</>}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Num className="text-xl font-medium">{money(p.amountCents)}</Num>
          <PayoutStatusBadge status={p.status} />
        </div>
      </div>
      <TransferTo destination={p.destination} current={p.affiliate ?? currentBank} amountCents={p.amountCents} />
      <div className="mt-auto flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={onReject}>
          <XIcon />
          Reject
        </Button>
        <Button onClick={onPay}>
          <CheckIcon />
          Mark as paid
        </Button>
      </div>
    </article>
  )
}

function Destination({ p }: { p: Payout }) {
  const d = parseDestination(p.destination)
  if (!d) return <span className="text-sm break-all text-muted-foreground">{p.destination ?? methodLabel(p.method)}</span>
  return (
    <div className="min-w-0">
      <p className="truncate text-sm">{d.bankName}</p>
      <div className="flex min-w-0 items-center gap-0.5">
        <Num className="truncate text-xs text-muted-foreground">{d.bankAccountNumber}</Num>
        <CopyButton text={d.bankAccountNumber} label="Copy account number" className="size-6 shrink-0" />
      </div>
    </div>
  )
}

export function PayoutList({
  rows,
  showPartner = true,
  currentBank,
  empty = 'No payouts yet.',
}: {
  rows: Payout[]
  showPartner?: boolean
  /** The partner's current bank details, when the rows do not carry them (partner profile). */
  currentBank?: BankDetails
  empty?: string
}) {
  const [paying, setPaying] = useState<Payout | null>(null)
  const [rejecting, setRejecting] = useState<Payout | null>(null)

  if (rows.length === 0) return <p className="px-4 py-10 text-center text-sm text-muted-foreground">{empty}</p>

  const open = rows.filter((p) => p.status === 'REQUESTED')
  const settled = rows.filter((p) => p.status !== 'REQUESTED')
  const hasCount = settled.some((p) => p._count)

  return (
    <>
      {open.length > 0 && (
        <div className={cn('grid gap-3 p-3 sm:p-4', open.length > 1 && 'xl:grid-cols-2', settled.length > 0 && 'border-b')}>
          {open.map((p) => (
            <RequestedPayoutCard key={p.id} p={p} showPartner={showPartner} currentBank={currentBank} onPay={() => setPaying(p)} onReject={() => setRejecting(p)} />
          ))}
        </div>
      )}

      {settled.length > 0 && (
        <>
          {open.length > 0 && <p className="px-4 pt-3 text-xs font-medium tracking-[0.12em] text-muted-foreground uppercase">History</p>}
          <ul className="divide-y md:hidden">
            {settled.map((p) => (
              <li key={p.id} className="space-y-2 px-4 py-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    {showPartner && p.affiliate && (
                      <Link to={`/admin/partners/${p.affiliate.id}`} className="block truncate font-medium hover:underline">
                        {p.affiliate.user.name}
                      </Link>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Requested {date(p.createdAt)}
                      {commissionCount(p) && <> · {commissionCount(p)}</>}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Num className="text-sm font-medium">{money(p.amountCents)}</Num>
                    <PayoutStatusBadge status={p.status} />
                  </div>
                </div>
                <Destination p={p} />
                {(p.reference || p.paidAt) && (
                  <p className="text-xs text-muted-foreground">
                    {p.reference && (
                      <>
                        Ref <Num className="text-foreground">{p.reference}</Num>
                      </>
                    )}
                    {p.paidAt && <> · Paid {date(p.paidAt)}</>}
                  </p>
                )}
                {p.note && <p className="text-xs text-muted-foreground">Note: {p.note}</p>}
              </li>
            ))}
          </ul>

          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className={cn(TH, 'pl-4')}>Requested</TableHead>
                  {showPartner && <TableHead className={TH}>Partner</TableHead>}
                  <TableHead className={cn(TH, 'text-right')}>Amount</TableHead>
                  <TableHead className={TH}>Sent to</TableHead>
                  {hasCount && <TableHead className={cn(TH, 'text-right')}>Commissions</TableHead>}
                  <TableHead className={TH}>Status</TableHead>
                  <TableHead className={TH}>Reference</TableHead>
                  <TableHead className={cn(TH, 'pr-4')}>Paid on</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {settled.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="pl-4 whitespace-nowrap">
                      <span>{date(p.createdAt)}</span>
                      <p className="text-xs text-muted-foreground">{relative(p.createdAt)}</p>
                    </TableCell>
                    {showPartner && (
                      <TableCell className="max-w-48">
                        {p.affiliate ? (
                          <>
                            <Link to={`/admin/partners/${p.affiliate.id}`} className="block truncate font-medium hover:underline">
                              {p.affiliate.user.name}
                            </Link>
                            <p className="truncate text-xs text-muted-foreground">{p.affiliate.user.email}</p>
                          </>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                    )}
                    <TableCell className="text-right">
                      <Num className="font-medium">{money(p.amountCents)}</Num>
                    </TableCell>
                    <TableCell className="max-w-56">
                      <Destination p={p} />
                    </TableCell>
                    {hasCount && (
                      <TableCell className="text-right">
                        <Num>{p._count && p.status !== 'REJECTED' ? num(p._count.commissions) : '-'}</Num>
                      </TableCell>
                    )}
                    <TableCell>
                      <PayoutStatusBadge status={p.status} />
                      {p.note && (
                        <p className="mt-1 max-w-40 truncate text-xs text-muted-foreground" title={p.note}>
                          {p.note}
                        </p>
                      )}
                    </TableCell>
                    <TableCell>{p.reference ? <Num className="text-xs">{p.reference}</Num> : <span className="text-muted-foreground">-</span>}</TableCell>
                    <TableCell className="pr-4 whitespace-nowrap text-muted-foreground">{p.paidAt ? date(p.paidAt) : '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </>
      )}

      <MarkPaidDialog payout={paying} currentBank={currentBank} onOpenChange={(o) => !o && setPaying(null)} />
      <RejectPayoutDialog payout={rejecting} onOpenChange={(o) => !o && setRejecting(null)} />
    </>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type Tab = 'partners' | 'applications' | 'commissions' | 'payouts'
const TABS: Tab[] = ['partners', 'applications', 'commissions', 'payouts']

export default function Partners() {
  const [params, setParams] = useSearchParams()
  const tabParam = params.get('tab') as Tab | null
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : 'partners'

  const affiliates = useQuery({
    queryKey: ['admin', 'affiliates'],
    queryFn: () => api.get<AffiliateRow[]>('/api/admin/affiliates'),
  })
  const payouts = useQuery({
    queryKey: ['admin', 'payouts'],
    queryFn: () => api.get<Payout[]>('/api/admin/payouts'),
  })

  const all = affiliates.data ?? []
  const pending = all.filter((a) => a.status === 'PENDING')
  const partners = all.filter((a) => a.status !== 'PENDING')
  const requested = (payouts.data ?? []).filter((p) => p.status === 'REQUESTED')

  const setTab = (t: Tab) =>
    setParams((prev) => {
      const next = new URLSearchParams()
      if (t !== 'partners') next.set('tab', t)
      if (t === 'commissions' && prev.get('status')) next.set('status', prev.get('status')!)
      return next
    })

  return (
    <div>
      <PageHeader
        title="Partners"
        description="Creators who promote the store with their own link and coupon code. Review applications, check what each partner has earned and pay them out."
      />

      <Segmented
        className="mb-4"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'partners', label: 'Partners', count: affiliates.data ? partners.length : undefined },
          { value: 'applications', label: 'Applications', count: affiliates.data ? pending.length : undefined },
          { value: 'commissions', label: 'Commissions' },
          { value: 'payouts', label: 'Payouts', count: payouts.data ? requested.length : undefined },
        ]}
      />

      {tab === 'partners' && <PartnersTab query={affiliates} rows={partners} pendingCount={pending.length} onApplications={() => setTab('applications')} />}
      {tab === 'applications' && <ApplicationsTab query={affiliates} rows={pending} />}
      {tab === 'commissions' && <CommissionsTab />}
      {tab === 'payouts' && <PayoutsTab query={payouts} requestedCents={requested.reduce((a, p) => a + p.amountCents, 0)} requestedCount={requested.length} />}
    </div>
  )
}

// ---------- Partners tab ----------

type StatusFilter = 'ALL' | Exclude<AffiliateStatus, 'PENDING'>

function MoneyCell({ cents }: { cents: number }) {
  return <Num className={cents ? undefined : 'text-muted-foreground'}>{money(cents)}</Num>
}

function PartnersTab({
  query,
  rows,
  pendingCount,
  onApplications,
}: {
  query: UseQueryResult<AffiliateRow[]>
  rows: AffiliateRow[]
  pendingCount: number
  onApplications: () => void
}) {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('ALL')

  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />
  if (query.isPending)
    return (
      <Panel flush>
        <RowsSkeleton rows={6} cols={7} />
      </Panel>
    )

  const s = search.trim().toLowerCase()
  const shown = rows.filter(
    (a) =>
      (status === 'ALL' || a.status === status) &&
      (!s || [a.name, a.email, a.code, a.couponCode, a.handle].some((v) => v.toLowerCase().includes(s))),
  )
  const counts = (st: AffiliateStatus) => rows.filter((a) => a.status === st).length

  if (rows.length === 0)
    return (
      <EmptyState
        icon={<HandshakeIcon />}
        title="No partners yet"
        body={
          pendingCount > 0
            ? `${pendingCount} ${pendingCount === 1 ? 'application is' : 'applications are'} waiting for your review.`
            : 'When creators apply on the partner page, their applications show up under Applications.'
        }
        action={pendingCount > 0 ? <Button onClick={onApplications}>Review applications</Button> : undefined}
      />
    )

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Search name, email or code" className="sm:max-w-sm sm:flex-1" />
        <Segmented
          value={status}
          onChange={setStatus}
          options={[
            { value: 'ALL', label: 'All', count: rows.length },
            { value: 'APPROVED', label: 'Active', count: counts('APPROVED') },
            { value: 'SUSPENDED', label: 'Suspended', count: counts('SUSPENDED') },
            { value: 'REJECTED', label: 'Rejected', count: counts('REJECTED') },
          ]}
        />
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={<HandshakeIcon />}
          title="No matches"
          body="No partner matches this search or filter."
          action={
            <Button
              variant="outline"
              onClick={() => {
                setSearch('')
                setStatus('ALL')
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <Panel flush>
          <ul className="divide-y md:hidden">
            {shown.map((a) => (
              <li key={a.id}>
                <Link to={`/admin/partners/${a.id}`} className="block space-y-2 px-4 py-3.5 hover:bg-muted/40">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{a.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        <Num>{a.code}</Num> · <Num>{a.couponCode}</Num> · <Num>{a.commissionRate}%</Num>
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <AffiliateStatusBadge status={a.status} />
                      {!a.bankOnFile && <NoBankBadge />}
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="min-w-0">
                      <p className="text-muted-foreground">Available</p>
                      <Num className="text-sm">{money(a.approvedCents)}</Num>
                    </div>
                    <div className="min-w-0">
                      <p className="text-muted-foreground">In request</p>
                      <Num className={cn('text-sm', !a.requestedCents && 'text-muted-foreground')}>{money(a.requestedCents)}</Num>
                    </div>
                    <div className="min-w-0">
                      <p className="text-muted-foreground">Paid</p>
                      <Num className="text-sm">{money(a.paidCents)}</Num>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    <Num>{money(a.salesCents)}</Num> sales · <Num>{num(a.orders)}</Num> orders from <Num>{num(a.clicks)}</Num> clicks
                  </p>
                </Link>
              </li>
            ))}
          </ul>

          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className={cn(TH, 'pl-4')}>Partner</TableHead>
                  <TableHead className={TH}>Codes</TableHead>
                  <TableHead className={cn(TH, 'text-right')}>Rate</TableHead>
                  <TableHead className={cn(TH, 'text-right')}>
                    <span className="inline-flex items-center gap-1">
                      Orders / clicks
                      <InfoTip>Orders that came through the partner's link or coupon code, and how many times their link was clicked.</InfoTip>
                    </span>
                  </TableHead>
                  <TableHead className={cn(TH, 'text-right')}>
                    <span className="inline-flex items-center gap-1">
                      Sales
                      <InfoTip>Value of orders this partner referred, not counting cancelled or refunded ones.</InfoTip>
                    </span>
                  </TableHead>
                  <TableHead className={cn(TH, 'text-right')}>
                    <span className="inline-flex items-center gap-1">
                      Pending
                      <InfoTip>Commission on orders that are not delivered yet.</InfoTip>
                    </span>
                  </TableHead>
                  <TableHead className={cn(TH, 'text-right')}>
                    <span className="inline-flex items-center gap-1">
                      Available
                      <InfoTip>Earned, owed to the partner and not yet in a payout request. This is what a new payout would include.</InfoTip>
                    </span>
                  </TableHead>
                  <TableHead className={cn(TH, 'text-right')}>
                    <span className="inline-flex items-center gap-1">
                      In payout request
                      <InfoTip>Owed money inside a payout request that is waiting for you to make the bank transfer.</InfoTip>
                    </span>
                  </TableHead>
                  <TableHead className={cn(TH, 'text-right')}>
                    <span className="inline-flex items-center gap-1">
                      Paid
                      <InfoTip>Already paid out to the partner.</InfoTip>
                    </span>
                  </TableHead>
                  <TableHead className={cn(TH, 'pr-4 text-right')}>
                    <span className="inline-flex items-center gap-1">
                      Conv.
                      <InfoTip>Conversion: orders divided by link clicks.</InfoTip>
                    </span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map((a) => (
                  <TableRow key={a.id} className="cursor-pointer" onClick={() => navigate(`/admin/partners/${a.id}`)}>
                    <TableCell className="max-w-64 pl-4">
                      <div className="flex min-w-0 items-center gap-2">
                        <Link to={`/admin/partners/${a.id}`} onClick={(e) => e.stopPropagation()} className="truncate font-medium hover:underline">
                          {a.name}
                        </Link>
                        <AffiliateStatusBadge status={a.status} />
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{a.email}</p>
                      {!a.bankOnFile && (
                        <span className="mt-1 inline-flex">
                          <NoBankBadge />
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <p className="font-mono text-xs tabular-nums">?ref={a.code}</p>
                      <p className="font-mono text-xs text-muted-foreground tabular-nums">{a.couponCode}</p>
                    </TableCell>
                    <TableCell className="text-right">
                      <Num>{a.commissionRate}%</Num>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      <Num>
                        {num(a.orders)}
                        <span className="text-muted-foreground"> / {num(a.clicks)}</span>
                      </Num>
                    </TableCell>
                    <TableCell className="text-right">
                      <MoneyCell cents={a.salesCents} />
                    </TableCell>
                    <TableCell className="text-right">
                      <MoneyCell cents={a.pendingCents} />
                    </TableCell>
                    <TableCell className="text-right">
                      <MoneyCell cents={a.approvedCents} />
                    </TableCell>
                    <TableCell className="text-right">
                      <MoneyCell cents={a.requestedCents} />
                    </TableCell>
                    <TableCell className="text-right">
                      <MoneyCell cents={a.paidCents} />
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <Num className={a.clicks ? undefined : 'text-muted-foreground'}>{a.conversionPct.toFixed(1)}%</Num>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Panel>
      )}
    </div>
  )
}

// ---------- Applications tab ----------

function ApplicationsTab({ query, rows }: { query: UseQueryResult<AffiliateRow[]>; rows: AffiliateRow[] }) {
  const details = useQueries({
    queries: rows.map((r) => ({
      queryKey: ['admin', 'affiliate', r.id],
      queryFn: () => api.get<AffiliateDetail>(`/api/admin/affiliates/${r.id}`),
    })),
  })

  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />
  if (query.isPending)
    return (
      <div className="grid gap-4 xl:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} className="h-80 rounded-xl" />
        ))}
      </div>
    )
  if (rows.length === 0)
    return <EmptyState icon={<UserPlusIcon />} title="No applications waiting" body="New partner applications from the partner page will appear here for you to approve or reject." />

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {rows.map((r, i) => (
        <ApplicationCard key={r.id} row={r} detail={details[i]?.data} loading={details[i]?.isPending ?? true} />
      ))}
    </div>
  )
}

function ApplicationCard({ row, detail, loading }: { row: AffiliateRow; detail?: AffiliateDetail; loading: boolean }) {
  const invalidate = useInvalidateAdmin()
  const [rate, setRate] = useState(String(row.commissionRate))
  const [rejectOpen, setRejectOpen] = useState(false)
  const rateNum = Number(rate)
  const rateValid = rate !== '' && Number.isInteger(rateNum) && rateNum >= 0 && rateNum <= 60

  const approve = useMutation({
    mutationFn: () => api.patch(`/api/admin/affiliates/${row.id}`, { status: 'APPROVED', commissionRate: rateNum }),
    onSuccess: () => {
      toast.success(`${row.name} is now an active partner`)
      invalidate()
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  return (
    <Panel
      title={<span className="truncate">{row.name}</span>}
      description={`Applied ${relative(row.createdAt)}`}
      action={<AffiliateStatusBadge status={row.status} />}
      className="flex flex-col"
      bodyClassName="flex flex-1 flex-col gap-4"
    >
      <dl className="divide-y">
        <DefRow label="Email">
          <a href={`mailto:${row.email}`} className="break-all hover:underline">
            {row.email}
          </a>
        </DefRow>
        <DefRow label="Phone">{loading ? <Skeleton className="h-4 w-24" /> : detail?.user.phone ? <Num>{detail.user.phone}</Num> : <span className="text-muted-foreground">Not given</span>}</DefRow>
        <DefRow label="Main platform">{row.platform}</DefRow>
        <DefRow label="Handle">
          <span className="break-all">{row.handle}</span>
        </DefRow>
        {loading ? (
          <div className="space-y-2 py-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ) : (
          detail && (
            <>
              {detail.otherHandles && (
                <DefRow label="Other channels">
                  <span className="whitespace-pre-line">{detail.otherHandles}</span>
                </DefRow>
              )}
              {detail.website && (
                <DefRow label="Website">
                  <a href={websiteHref(detail.website)} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 break-all text-gold-ink hover:underline">
                    <GlobeIcon className="size-3.5 shrink-0" />
                    {detail.website}
                  </a>
                </DefRow>
              )}
            </>
          )
        )}
        <DefRow label="Applied on">{date(row.createdAt)}</DefRow>
        <DefRow label="Proposed codes" info="Generated from their handle. You can change them on the partner profile after approving.">
          <span className="font-mono text-xs tabular-nums">
            ?ref={row.code}
            <span className="block text-muted-foreground">Coupon {row.couponCode}</span>
          </span>
        </DefRow>
      </dl>

      <div>
        <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          Bank details for payouts
          <InfoTip>Partners are paid by bank transfer into this account. Check the account holder name matches the applicant.</InfoTip>
        </p>
        {loading ? (
          <Skeleton className="h-24 w-full rounded-md" />
        ) : detail ? (
          hasBank(detail) ? (
            <div className="rounded-md border bg-surface px-3 py-1">
              <BankDetailsList b={detail} />
            </div>
          ) : (
            <BankDetailsList b={detail} />
          )
        ) : null}
      </div>

      {!loading && detail && (
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">How they plan to promote</p>
          <p className="rounded-md border bg-surface px-3 py-2 text-sm whitespace-pre-line">{detail.promotionPlan || <span className="text-muted-foreground">Not given</span>}</p>
        </div>
      )}

      <div className="mt-auto flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-end">
        <Field label="Commission rate" htmlFor={`rate-${row.id}`} className="sm:w-36" error={rateValid ? null : '0 to 60'}>
          <NumberInput id={`rate-${row.id}`} value={rate} onChange={setRate} min={0} max={60} step={1} suffix="%" />
        </Field>
        <div className="flex flex-1 gap-2 sm:justify-end">
          <Button variant="outline" className="h-9 flex-1 text-destructive hover:text-destructive sm:flex-none" onClick={() => setRejectOpen(true)} disabled={approve.isPending}>
            <XIcon />
            Reject
          </Button>
          <Button className="h-9 flex-1 sm:flex-none" onClick={() => approve.mutate()} disabled={!rateValid || approve.isPending}>
            <CheckIcon />
            {approve.isPending ? 'Approving...' : 'Approve'}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title="Reject this application?"
        description={`${row.name} will not be able to earn commission. Their link and coupon code stay inactive. You can approve them later from their partner profile if you change your mind.`}
        confirmLabel="Reject application"
        onConfirm={async () => {
          await api.patch(`/api/admin/affiliates/${row.id}`, { status: 'REJECTED' })
          toast.success('Application rejected')
          invalidate()
        }}
      />
    </Panel>
  )
}

// ---------- Commissions tab ----------

type CommissionFilter = 'ALL' | CommissionStatus

function CommissionsTab() {
  const [params, setParams] = useSearchParams()
  const sp = params.get('status') as CommissionStatus | null
  const status: CommissionFilter = sp && ['PENDING', 'APPROVED', 'PAID', 'VOID'].includes(sp) ? sp : 'ALL'

  const query = useQuery({
    queryKey: ['admin', 'commissions', status],
    queryFn: () => api.get<Commission[]>('/api/admin/commissions', { status: status === 'ALL' ? undefined : status }),
    placeholderData: keepPreviousData,
  })

  const rows = query.data ?? []
  const total = rows.filter((c) => c.status !== 'VOID').reduce((a, c) => a + c.amountCents, 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <Segmented<CommissionFilter>
            value={status}
            onChange={(v) =>
              setParams((prev) => {
                const next = new URLSearchParams(prev)
                if (v === 'ALL') next.delete('status')
                else next.set('status', v)
                return next
              })
            }
            options={[
              { value: 'ALL', label: 'All' },
              { value: 'PENDING', label: 'Pending' },
              { value: 'APPROVED', label: 'Approved' },
              { value: 'PAID', label: 'Paid' },
              { value: 'VOID', label: 'Void' },
            ]}
          />
          <InfoTip>{COMMISSION_HELP}</InfoTip>
        </div>
        {query.data && rows.length > 0 && (
          <p className="text-sm text-muted-foreground">
            <Num>{num(rows.length)}</Num> {rows.length === 1 ? 'commission' : 'commissions'}
            {status !== 'VOID' && (
              <>
                , <Num className="text-foreground">{money(total)}</Num>
              </>
            )}
            {rows.length >= 300 && ' (latest 300)'}
          </p>
        )}
      </div>

      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : query.isPending ? (
        <Panel flush>
          <RowsSkeleton rows={8} cols={7} />
        </Panel>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<CoinsIcon />}
          title="No commissions"
          body={status === 'ALL' ? 'Commissions are created when someone orders through a partner link or coupon code.' : 'Nothing in this status right now.'}
        />
      ) : (
        <Panel flush className={query.isPlaceholderData ? 'opacity-70 transition-opacity' : undefined}>
          <CommissionList rows={rows} />
        </Panel>
      )}
    </div>
  )
}

// ---------- Payouts tab ----------

function PayoutsTab({
  query,
  requestedCents,
  requestedCount,
}: {
  query: UseQueryResult<Payout[]>
  requestedCents: number
  requestedCount: number
}) {
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />
  if (query.isPending)
    return (
      <Panel flush>
        <RowsSkeleton rows={6} cols={7} />
      </Panel>
    )
  const rows = query.data
  if (rows.length === 0)
    return (
      <EmptyState
        icon={<WalletIcon />}
        title="No payouts yet"
        body="Partners request a payout from their dashboard once their approved balance passes the minimum. You can also create one from a partner's profile."
      />
    )

  return (
    <div className="space-y-4">
      {requestedCount > 0 ? (
        <div className="flex items-start gap-3 rounded-xl border border-warning/35 bg-warning/[0.06] px-4 py-3 text-sm">
          <PaperPlaneTiltIcon className="mt-0.5 size-4 shrink-0 text-warning" />
          <p>
            <Num className="font-medium">{num(requestedCount)}</Num> {requestedCount === 1 ? 'payout is' : 'payouts are'} waiting, <Num className="font-medium">{money(requestedCents)}</Num> in
            total. Make each bank transfer to the account shown, then click Mark as paid and add the bank reference.
          </p>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <ReceiptIcon className="size-4" />
          All payout requests are settled.
        </p>
      )}
      <Panel flush>
        <PayoutList rows={rows} />
      </Panel>
    </div>
  )
}
