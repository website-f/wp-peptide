import { ArrowCounterClockwiseIcon, ArrowSquareOutIcon, CheckIcon, GlobeIcon, HandCoinsIcon, InfoIcon, PauseIcon, UserIcon, XIcon } from '@phosphor-icons/react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { api, errorMessage } from '@/lib/api'
import { date, money, num } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  AffiliateStatusBadge,
  ConfirmDialog,
  CopyButton,
  DefRow,
  ErrorState,
  Field,
  Kpi,
  Num,
  NumberInput,
  PageHeader,
  PageSkeleton,
  Panel,
  TextInput,
} from '../components/kit'
import { BankDetailsList, EditBankButton, EditBankDialog, NoBankBadge, TransferTo, bankLineOf, hasBank } from '../components/bank'
import type { AffiliateDetail, AffiliateStatus } from '../lib/types'
import { AFFILIATE_STATUS, useInvalidateAdmin } from '../lib/utils'
import { COMMISSION_HELP, CommissionList, PayoutList, websiteHref } from './Partners'

export default function PartnerDetail() {
  const { id = '' } = useParams()
  const query = useQuery({
    queryKey: ['admin', 'affiliate', id],
    queryFn: () => api.get<AffiliateDetail>(`/api/admin/affiliates/${id}`),
    enabled: Boolean(id),
  })

  if (query.isError)
    return (
      <div>
        <PageHeader title="Partner" back={{ to: '/admin/partners', label: 'Partners' }} />
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      </div>
    )
  if (query.isPending) return <PageSkeleton />
  return <PartnerView a={query.data} />
}

function useSavePartner(id: string) {
  const invalidate = useInvalidateAdmin()
  return useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch(`/api/admin/affiliates/${id}`, body),
    onSuccess: () => invalidate(),
  })
}

function PartnerView({ a }: { a: AffiliateDetail }) {
  const invalidate = useInvalidateAdmin()
  const [payoutOpen, setPayoutOpen] = useState(false)
  const [bankOpen, setBankOpen] = useState(false)
  const b = a.balances
  const conversion = a.clicks > 0 ? Math.round((b.orders / a.clicks) * 1000) / 10 : 0
  const openPayout = a.payouts.some((p) => p.status === 'REQUESTED')
  const bankOk = hasBank(a)
  // Why a payout cannot be created right now, in plain words. Null means it can.
  const payoutBlocked = !bankOk
    ? 'Add bank details first. Payouts are bank transfers, so there is nowhere to send the money yet.'
    : openPayout
      ? 'A payout request is already open. Mark it paid or reject it first.'
      : b.availableCents <= 0
        ? 'Nothing available to pay yet. Commission becomes available once its order is delivered.'
        : null

  const createButton = (small = false) => {
    const btn = (
      <Button size={small ? 'sm' : 'default'} variant={small ? 'outline' : 'default'} onClick={() => setPayoutOpen(true)} disabled={Boolean(payoutBlocked)}>
        <HandCoinsIcon />
        Create payout
      </Button>
    )
    if (!payoutBlocked) return btn
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span tabIndex={0} className="inline-flex rounded-md" aria-label={`Create payout is unavailable. ${payoutBlocked}`}>
            {btn}
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-64">{payoutBlocked}</TooltipContent>
      </Tooltip>
    )
  }

  return (
    <div>
      <PageHeader
        back={{ to: '/admin/partners', label: 'Partners' }}
        title={
          <span className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 break-words">{a.user.name}</span>
            <AffiliateStatusBadge status={a.status} />
            {!bankOk && <NoBankBadge />}
          </span>
        }
        meta={
          <>
            <span>
              {a.platform} <span className="text-foreground">{a.handle}</span>
            </span>
            <a href={`mailto:${a.user.email}`} className="min-w-0 truncate hover:text-foreground hover:underline">
              {a.user.email}
            </a>
            <span>Applied {date(a.createdAt)}</span>
            {a.approvedAt && <span>Approved {date(a.approvedAt)}</span>}
          </>
        }
        actions={
          <>
            <Button asChild variant="outline">
              <Link to={`/admin/customers/${a.userId}`}>
                <UserIcon />
                Customer profile
              </Link>
            </Button>
            {createButton()}
          </>
        }
      />

      {payoutBlocked && (
        <p className="-mt-3 mb-4 flex items-start gap-1.5 text-xs text-muted-foreground" data-testid="payout-blocked">
          <InfoIcon className="mt-px size-3.5 shrink-0" />
          {payoutBlocked}
        </p>
      )}

      <section aria-label="Balances" className="mb-6 space-y-3">
        <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-5">
          <Kpi
            label="Pending"
            value={money(b.pendingCents)}
            sub={`${num(b.counts.pending)} not delivered yet`}
            info="Commission on orders that are not delivered yet. It becomes available once the order is delivered."
          />
          <Kpi label="Available" value={money(b.availableCents)} sub="Ready to pay out" info="Earned, owed and not yet in a payout request. This is what a new payout would include." emphasis />
          <Kpi
            label="In payout request"
            value={money(b.requestedCents)}
            sub={openPayout ? 'Waiting for your transfer' : 'No open request'}
            info="Owed money inside a payout request that is waiting for you to make the bank transfer."
          />
          <Kpi label="Paid" value={money(b.paidCents)} sub="Already transferred" info="Total already paid out to this partner." />
          <Kpi
            label="Lifetime earnings"
            value={money(b.lifetimeCents)}
            info="Everything earned so far: pending, available, in a request and paid. Voided commission is not counted."
          />
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Sales generated" value={money(b.salesCents)} info="Value of orders this partner referred, not counting cancelled or refunded ones." />
          <Kpi label="Orders" value={num(b.orders)} info="Orders that came through the partner's link or coupon code, not counting voided ones." />
          <Kpi label="Link clicks" value={num(a.clicks)} info="How many times the partner's referral link was opened." />
          <Kpi
            label="Conversion"
            value={`${conversion.toFixed(1)}%`}
            info="Orders divided by link clicks. Orders from the coupon code alone also count, so this can be above 100%."
          />
        </div>
      </section>

      <div className="space-y-6">
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          <div className="min-w-0 space-y-6">
            <StatusCard a={a} />
            <RateCard a={a} />
          </div>
          <CodesCard a={a} />
          <div className="min-w-0 space-y-6 md:col-span-2 xl:col-span-1">
            <BankCard a={a} onEdit={() => setBankOpen(true)} />
          </div>
        </div>

        <Panel title="Payouts" description="Bank transfers to this partner." flush action={createButton(true)}>
          <PayoutList rows={a.payouts} showPartner={false} currentBank={a} empty="No payouts yet." />
        </Panel>
        <Panel
          title="Commissions"
          info={COMMISSION_HELP}
          description={a.commissions.length >= 100 ? 'Latest 100 commissions' : `${num(a.commissions.length)} ${a.commissions.length === 1 ? 'commission' : 'commissions'}`}
          flush
        >
          <CommissionList rows={a.commissions} showPartner={false} empty="No commissions yet. They appear when someone orders through this partner's link or coupon code." />
        </Panel>

        <div className="grid gap-6 lg:grid-cols-2">
          <ApplicationCard a={a} />
          <NoteCard a={a} />
        </div>
      </div>

      <EditBankDialog
        affiliateId={a.id}
        partnerName={a.user.name}
        initial={{ bankName: a.bankName, bankAccountName: a.bankAccountName, bankAccountNumber: a.bankAccountNumber }}
        open={bankOpen}
        onOpenChange={setBankOpen}
      />

      <ConfirmDialog
        open={payoutOpen}
        onOpenChange={setPayoutOpen}
        destructive={false}
        title="Create a payout?"
        description={`This bundles ${a.user.name}'s available balance of ${money(b.availableCents)} (${num(b.counts.available)} ${b.counts.available === 1 ? 'commission' : 'commissions'}) into one payout request. Then make the bank transfer and mark it paid with the bank reference.`}
        confirmLabel={`Create payout of ${money(b.availableCents)}`}
        cancelLabel="Cancel"
        onConfirm={async () => {
          const r = await api.post<{ id: string; amountCents: number }>(`/api/admin/affiliates/${a.id}/payouts`)
          toast.success(`Payout of ${money(r.amountCents)} created. Mark it paid once the money is sent.`)
          invalidate()
        }}
      >
        <TransferTo destination={bankLineOf(a)} amountCents={b.availableCents} />
      </ConfirmDialog>
    </div>
  )
}

// ---------- Status ----------

const STATUS_ACTIONS: { status: AffiliateStatus; label: string; icon: typeof CheckIcon; help: string }[] = [
  { status: 'APPROVED', label: 'Approve', icon: CheckIcon, help: 'Link and coupon code work and new orders earn commission.' },
  { status: 'SUSPENDED', label: 'Suspend', icon: PauseIcon, help: 'Temporarily stops new commission. Existing balances stay.' },
  { status: 'REJECTED', label: 'Reject', icon: XIcon, help: 'Not part of the program. New orders earn nothing.' },
  { status: 'PENDING', label: 'Set to pending', icon: ArrowCounterClockwiseIcon, help: 'Moves them back to the Applications list for review.' },
]

function StatusCard({ a }: { a: AffiliateDetail }) {
  const save = useSavePartner(a.id)
  const [confirm, setConfirm] = useState<AffiliateStatus | null>(null)
  const current = STATUS_ACTIONS.find((s) => s.status === a.status)

  const setStatus = (status: AffiliateStatus) =>
    save.mutateAsync({ status }).then(() => toast.success(`Status changed to ${AFFILIATE_STATUS[status].label}`))

  return (
    <Panel title="Status" action={<AffiliateStatusBadge status={a.status} />}>
      {current && <p className="mb-3 text-sm text-muted-foreground">{current.help}</p>}
      <div className="grid grid-cols-2 gap-2">
        {STATUS_ACTIONS.filter((s) => s.status !== a.status).map((s) => {
          const Icon = s.icon
          const risky = s.status === 'SUSPENDED' || s.status === 'REJECTED'
          return (
            <Button
              key={s.status}
              variant={s.status === 'APPROVED' ? 'default' : 'outline'}
              size="sm"
              className={cn(risky && 'text-destructive hover:text-destructive')}
              disabled={save.isPending}
              onClick={() => (risky ? setConfirm(s.status) : setStatus(s.status).catch((e) => toast.error(errorMessage(e))))}
            >
              <Icon />
              {s.label}
            </Button>
          )
        })}
      </div>
      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm === 'SUSPENDED' ? 'Suspend this partner?' : 'Reject this partner?'}
        description={
          confirm === 'SUSPENDED'
            ? `${a.user.name}'s link and coupon code stop earning commission until you approve them again. Commission they already earned is not changed.`
            : `${a.user.name} will be removed from the program and new orders will not earn commission. Commission they already earned is not changed.`
        }
        confirmLabel={confirm === 'SUSPENDED' ? 'Suspend partner' : 'Reject partner'}
        onConfirm={() => (confirm ? setStatus(confirm) : undefined)}
      />
    </Panel>
  )
}

// ---------- Codes ----------

function CodesCard({ a }: { a: AffiliateDetail }) {
  const save = useSavePartner(a.id)
  const [code, setCode] = useState(a.code)
  const [coupon, setCoupon] = useState(a.couponCode)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setCode(a.code)
    setCoupon(a.couponCode)
  }, [a.code, a.couponCode])

  const link = `${window.location.origin}/?ref=${code || a.code}`
  const codeOk = /^[a-z0-9]{3,20}$/.test(code)
  const couponOk = /^[A-Z0-9]{3,20}$/.test(coupon)
  const dirty = code !== a.code || coupon !== a.couponCode

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!codeOk) return setError('Link codes are 3 to 20 lowercase letters or numbers')
    if (!couponOk) return setError('Coupon codes are 3 to 20 letters or numbers')
    const body: Record<string, string> = {}
    if (code !== a.code) body.code = code
    if (coupon !== a.couponCode) body.couponCode = coupon
    setError(null)
    save.mutate(body, {
      onSuccess: () => toast.success('Codes saved'),
      onError: (err) => {
        setError(errorMessage(err))
        toast.error(errorMessage(err))
      },
    })
  }

  return (
    <Panel title="Codes" info="Changing a code stops the old one working straight away. Let the partner know so they can update their bio and posts.">
      <form onSubmit={submit} className="space-y-4">
        <Field label="Referral link code" htmlFor="ref-code" hint="Lowercase letters and numbers, 3 to 20 characters.">
          <TextInput
            id="ref-code"
            value={code}
            onChange={(e) => setCode(e.target.value.toLowerCase().replace(/[^a-z0-9]/g, ''))}
            maxLength={20}
            className="font-mono"
            aria-invalid={!codeOk}
          />
          <div className="flex min-w-0 items-center gap-1 rounded-md border bg-surface py-0.5 pr-0.5 pl-2.5">
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">{link}</span>
            <CopyButton text={link} label="Copy referral link" />
          </div>
        </Field>
        <Field
          label="Coupon code"
          htmlFor="coupon-code"
          error={error}
          hint="Shoppers type this at checkout for a discount, and the order is credited to this partner."
        >
          <div className="flex items-center gap-1">
            <TextInput
              id="coupon-code"
              value={coupon}
              onChange={(e) => setCoupon(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              maxLength={20}
              className="font-mono"
              aria-invalid={!couponOk}
            />
            <CopyButton text={coupon} label="Copy coupon code" />
          </div>
        </Field>
        <Button type="submit" className="w-full" disabled={!dirty || save.isPending}>
          {save.isPending ? 'Saving...' : 'Save codes'}
        </Button>
      </form>
    </Panel>
  )
}

// ---------- Commission rate ----------

function RateCard({ a }: { a: AffiliateDetail }) {
  const save = useSavePartner(a.id)
  const [rate, setRate] = useState(String(a.commissionRate))
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setRate(String(a.commissionRate)), [a.commissionRate])

  const n = Number(rate)
  const valid = rate !== '' && Number.isInteger(n) && n >= 0 && n <= 60
  const dirty = valid && n !== a.commissionRate

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!valid) return setError('Enter a whole number from 0 to 60')
    setError(null)
    save.mutate(
      { commissionRate: n },
      {
        onSuccess: () => toast.success(`Commission rate set to ${n}%`),
        onError: (err) => {
          setError(errorMessage(err))
          toast.error(errorMessage(err))
        },
      },
    )
  }

  return (
    <Panel title="Commission">
      <form onSubmit={submit}>
        <Field label="Rate" htmlFor="rate" error={error ?? (valid ? null : 'Enter a whole number from 0 to 60')} hint="Applies to future orders only. Existing commissions keep their rate.">
          <div className="flex gap-2">
            <NumberInput id="rate" value={rate} onChange={setRate} min={0} max={60} step={1} suffix="%" className="flex-1" />
            <Button type="submit" className="h-9" disabled={!dirty || save.isPending}>
              {save.isPending ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </Field>
      </form>
    </Panel>
  )
}

// ---------- Bank details ----------

function BankCard({ a, onEdit }: { a: AffiliateDetail; onEdit: () => void }) {
  return (
    <Panel
      title="Bank details"
      info="Payouts are sent by bank transfer to this account. A payout request keeps the account it was made with, even if these details change later."
      description="The partner can also update these from their dashboard."
      action={<EditBankButton onClick={onEdit} has={hasBank(a)} />}
    >
      <BankDetailsList b={a} />
    </Panel>
  )
}

// ---------- Application ----------

function ApplicationCard({ a }: { a: AffiliateDetail }) {
  return (
    <Panel title="Application">
      <dl className="divide-y">
        <DefRow label="Main platform">{a.platform}</DefRow>
        <DefRow label="Handle">
          <span className="break-all">{a.handle}</span>
        </DefRow>
        <DefRow label="Other channels">
          {a.otherHandles ? <span className="whitespace-pre-line">{a.otherHandles}</span> : <span className="text-muted-foreground">None</span>}
        </DefRow>
        <DefRow label="Website">
          {a.website ? (
            <a href={websiteHref(a.website)} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 break-all text-gold-ink hover:underline">
              <GlobeIcon className="size-3.5 shrink-0" />
              {a.website}
              <ArrowSquareOutIcon className="size-3 shrink-0" />
            </a>
          ) : (
            <span className="text-muted-foreground">None</span>
          )}
        </DefRow>
        <DefRow label="Phone">{a.user.phone ? <Num>{a.user.phone}</Num> : <span className="text-muted-foreground">Not given</span>}</DefRow>
        <DefRow label="Applied">
          {date(a.createdAt)}
        </DefRow>
      </dl>
      <p className="mt-3 mb-1 text-xs font-medium text-muted-foreground">How they plan to promote</p>
      <p className="rounded-md border bg-surface px-3 py-2 text-sm whitespace-pre-line">{a.promotionPlan || <span className="text-muted-foreground">Not given</span>}</p>
    </Panel>
  )
}

// ---------- Admin note ----------

function NoteCard({ a }: { a: AffiliateDetail }) {
  const save = useSavePartner(a.id)
  const [note, setNote] = useState(a.adminNote ?? '')

  useEffect(() => setNote(a.adminNote ?? ''), [a.adminNote])

  const dirty = note.trim() !== (a.adminNote ?? '').trim()

  return (
    <Panel title="Private note" description="Only admins see this. The partner never does.">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          save.mutate(
            { adminNote: note.trim() || null },
            { onSuccess: () => toast.success('Note saved'), onError: (err) => toast.error(errorMessage(err)) },
          )
        }}
        className="space-y-3"
      >
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} placeholder="e.g. Agreed 25% for the launch campaign" aria-label="Private note" />
        <Button type="submit" variant="outline" className="w-full" disabled={!dirty || save.isPending}>
          {save.isPending ? 'Saving...' : 'Save note'}
        </Button>
      </form>
    </Panel>
  )
}
