// Partner bank details: payouts are manual bank transfers, so these blocks are what the
// owner copies into their banking app. Account numbers are always shown in mono digits.
import { BankIcon, PencilSimpleIcon, WarningIcon } from '@phosphor-icons/react'
import { useMutation } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { api, errorMessage } from '@/lib/api'
import { money } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { BankDetails } from '../lib/types'
import { useInvalidateAdmin } from '../lib/utils'
import { CopyButton, Field, Num, Pill, TextInput } from './kit'

export const MALAYSIAN_BANKS = [
  'Maybank',
  'CIMB Bank',
  'Public Bank',
  'RHB Bank',
  'Hong Leong Bank',
  'AmBank',
  'Bank Islam',
  'Bank Rakyat',
  'BSN',
  'Affin Bank',
  'Alliance Bank',
  'OCBC Bank',
  'UOB',
  'HSBC',
  'Standard Chartered',
  'Agrobank',
  'Bank Muamalat',
  'MBSB Bank',
  'Al Rajhi Bank',
] as const
const OTHER = 'Other'

export const hasBank = (b: Partial<BankDetails> | null | undefined) => Boolean(b?.bankName && b?.bankAccountNumber)

/** Same format the API snapshots onto a payout: "Bank, number, holder". */
export function bankLineOf(b: Partial<BankDetails> | null | undefined) {
  if (!b?.bankName || !b.bankAccountNumber) return null
  return `${b.bankName}, ${b.bankAccountNumber}, ${b.bankAccountName ?? ''}`.replace(/, $/, '')
}

/** Splits a payout destination snapshot back into its parts. Falls back to the raw text. */
export function parseDestination(d: string | null | undefined): { bankName: string; bankAccountNumber: string; bankAccountName: string } | null {
  if (!d) return null
  const m = /^(.+?), (\d{6,20})(?:, (.*))?$/.exec(d.trim())
  if (!m) return null
  return { bankName: m[1], bankAccountNumber: m[2], bankAccountName: m[3] ?? '' }
}

/** 123456789012 -> "1234 5678 9012" for reading aloud / checking. Copy always uses the raw digits. */
export const groupDigits = (n: string) => n.replace(/(\d{4})(?=\d)/g, '$1 ')

/** Amount as plain digits for pasting into a banking app ("1234.50"). */
export const amountForBank = (cents: number) => (cents / 100).toFixed(2)

function Line({ label, children, copy, copyLabel }: { label: string; children: ReactNode; copy?: string; copyLabel?: string }) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 py-1.5">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="flex min-w-0 items-center gap-0.5">
        <span className="min-w-0 text-right text-sm break-words">{children}</span>
        {copy && <CopyButton text={copy} label={copyLabel ?? `Copy ${label.toLowerCase()}`} className="-my-1 shrink-0" />}
      </span>
    </div>
  )
}

/**
 * Where to send a payout. Uses the snapshot taken when the payout was requested as the
 * source of truth, and flags it if the partner's current details differ.
 */
export function TransferTo({
  destination,
  current,
  amountCents,
  className,
}: {
  destination: string | null
  current?: Partial<BankDetails> | null
  amountCents?: number
  className?: string
}) {
  const snap = parseDestination(destination)
  const currentLine = current ? bankLineOf(current) : null
  const changed = Boolean(destination && currentLine && currentLine !== destination)
  return (
    <div className={cn('min-w-0 rounded-md border bg-surface px-3 py-1.5', className)}>
      <p className="flex items-center gap-1.5 pt-1 pb-0.5 text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
        <BankIcon className="size-3.5 text-gold-ink" />
        Transfer to
      </p>
      {snap ? (
        <div className="divide-y">
          <Line label="Bank">{snap.bankName}</Line>
          <Line label="Account holder">{snap.bankAccountName || <span className="text-muted-foreground">Not given</span>}</Line>
          <Line label="Account number" copy={snap.bankAccountNumber} copyLabel="Copy account number">
            <Num className="font-medium">{groupDigits(snap.bankAccountNumber)}</Num>
          </Line>
          {amountCents !== undefined && (
            <Line label="Amount" copy={amountForBank(amountCents)} copyLabel="Copy amount">
              <Num className="font-medium">{money(amountCents)}</Num>
            </Line>
          )}
        </div>
      ) : (
        <>
          {destination && (
            <Line label="Recorded as">
              <span className="break-all text-muted-foreground">{destination}</span>
            </Line>
          )}
          <div className="my-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-2 text-xs">
            <p className="flex items-center gap-1.5 font-medium text-destructive">
              <WarningIcon className="size-3.5 shrink-0" weight="fill" />
              No bank account on this request
            </p>
            <p className="mt-1 text-muted-foreground">
              It was made before bank details were required.{' '}
              {currentLine
                ? 'Their bank details on file are shown below. Confirm them with the partner, then reject this request and create a new one so the account is recorded.'
                : 'Ask the partner to add their bank details, then reject this request and create a new one.'}
            </p>
          </div>
          {currentLine && current && (
            <div className="divide-y">
              <Line label="Bank (on file now)">{current.bankName}</Line>
              <Line label="Account holder">{current.bankAccountName || <span className="text-muted-foreground">Not given</span>}</Line>
              <Line label="Account number" copy={current.bankAccountNumber ?? ''} copyLabel="Copy account number">
                <Num className="font-medium">{groupDigits(current.bankAccountNumber ?? '')}</Num>
              </Line>
            </div>
          )}
          {amountCents !== undefined && (
            <Line label="Amount" copy={amountForBank(amountCents)} copyLabel="Copy amount">
              <Num className="font-medium">{money(amountCents)}</Num>
            </Line>
          )}
        </>
      )}
      {changed && snap && current && (
        <div className="my-1.5 rounded-md border border-warning/35 bg-warning/[0.08] px-2.5 py-2 text-xs">
          <p className="flex items-center gap-1.5 font-medium">
            <WarningIcon className="size-3.5 shrink-0 text-warning" weight="fill" />
            Bank details changed since this request
          </p>
          <p className="mt-1 text-muted-foreground">
            Their profile now says <span className="text-foreground">{current.bankName}</span>,{' '}
            <Num className="text-foreground">{current.bankAccountNumber}</Num>
            {current.bankAccountName ? <>, {current.bankAccountName}</> : null}. Confirm with the partner before sending. If the new account is
            right, reject this request and create a new one.
          </p>
        </div>
      )}
    </div>
  )
}

export function NoBankBadge() {
  return (
    <Pill tone="destructive" className="gap-1">
      No bank details
    </Pill>
  )
}

// ---------------------------------------------------------------------------
// Edit dialog
// ---------------------------------------------------------------------------

export function EditBankDialog({
  affiliateId,
  partnerName,
  initial,
  open,
  onOpenChange,
}: {
  affiliateId: string
  partnerName: string
  initial: BankDetails
  open: boolean
  onOpenChange: (o: boolean) => void
}) {
  const invalidate = useInvalidateAdmin()
  const [bank, setBank] = useState('')
  const [otherBank, setOtherBank] = useState('')
  const [holder, setHolder] = useState('')
  const [number, setNumber] = useState('')
  const [touched, setTouched] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const known = initial.bankName && (MALAYSIAN_BANKS as readonly string[]).includes(initial.bankName)
    setBank(initial.bankName ? (known ? initial.bankName : OTHER) : '')
    setOtherBank(initial.bankName && !known ? initial.bankName : '')
    setHolder(initial.bankAccountName ?? '')
    setNumber(initial.bankAccountNumber ?? '')
    setTouched(false)
    setApiError(null)
  }, [open, initial.bankName, initial.bankAccountName, initial.bankAccountNumber])

  const bankName = (bank === OTHER ? otherBank : bank).trim()
  const digits = number.replace(/[\s-]/g, '')
  const errors = {
    bank: !bank ? 'Choose the bank' : bank === OTHER && bankName.length < 2 ? 'Type the bank name' : null,
    holder: holder.trim().length < 2 ? 'Enter the account holder name as it appears at the bank' : null,
    number: !/^\d{6,20}$/.test(digits) ? 'Account numbers are 6 to 20 digits' : null,
  }
  const valid = !errors.bank && !errors.holder && !errors.number
  const dirty =
    bankName !== (initial.bankName ?? '') || holder.trim() !== (initial.bankAccountName ?? '') || digits !== (initial.bankAccountNumber ?? '')

  const save = useMutation({
    mutationFn: () => api.patch(`/api/admin/affiliates/${affiliateId}`, { bankName, bankAccountName: holder.trim(), bankAccountNumber: digits }),
    onSuccess: () => {
      toast.success('Bank details saved. The partner gets an email about the change.')
      invalidate()
      onOpenChange(false)
    },
    onError: (e) => setApiError(errorMessage(e)),
  })

  const submit = (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    setApiError(null)
    if (!valid || !dirty) return
    save.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !save.isPending && onOpenChange(o)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-semibold tracking-wide uppercase">Edit bank details</DialogTitle>
          <DialogDescription>
            Where {partnerName}'s payouts are sent. Only change this when the partner asked you to. Payouts already requested keep the account they were
            requested with.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="space-y-4">
          {apiError && (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {apiError}
            </p>
          )}
          <Field label="Bank" htmlFor="bank-name" error={touched ? errors.bank : null}>
            <Select value={bank} onValueChange={setBank}>
              <SelectTrigger id="bank-name" className="w-full data-[size=default]:h-9" aria-invalid={(touched && Boolean(errors.bank)) || undefined}>
                <SelectValue placeholder="Choose a bank" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {MALAYSIAN_BANKS.map((b) => (
                  <SelectItem key={b} value={b}>
                    {b}
                  </SelectItem>
                ))}
                <SelectItem value={OTHER}>Other</SelectItem>
              </SelectContent>
            </Select>
            {bank === OTHER && (
              <TextInput aria-label="Bank name" placeholder="Bank name" value={otherBank} onChange={(e) => setOtherBank(e.target.value)} maxLength={80} />
            )}
          </Field>
          <Field label="Account holder" htmlFor="bank-holder" error={touched ? errors.holder : null} hint="Exactly as the bank has it, so the transfer is not rejected.">
            <TextInput id="bank-holder" value={holder} onChange={(e) => setHolder(e.target.value)} maxLength={120} autoComplete="off" />
          </Field>
          <Field label="Account number" htmlFor="bank-number" error={touched ? errors.number : null} hint="Digits only. Spaces and dashes are removed.">
            <TextInput
              id="bank-number"
              value={number}
              onChange={(e) => setNumber(e.target.value.replace(/[^\d\s-]/g, ''))}
              inputMode="numeric"
              autoComplete="off"
              maxLength={26}
              className="font-mono tabular-nums"
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending || !dirty}>
              {save.isPending ? 'Saving...' : 'Save bank details'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Card body for a partner's current bank details. */
export function BankDetailsList({ b }: { b: Partial<BankDetails> }) {
  if (!hasBank(b))
    return (
      <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm">
        <WarningIcon className="mt-0.5 size-4 shrink-0 text-destructive" weight="fill" />
        <span>No bank details on file. Payouts cannot be created until the partner adds them in their dashboard, or you add them here.</span>
      </div>
    )
  return (
    <div className="divide-y">
      <Line label="Bank">{b.bankName}</Line>
      <Line label="Account holder">{b.bankAccountName || <span className="text-muted-foreground">Not given</span>}</Line>
      <Line label="Account number" copy={b.bankAccountNumber ?? ''} copyLabel="Copy account number">
        <Num className="font-medium">{groupDigits(b.bankAccountNumber ?? '')}</Num>
      </Line>
    </div>
  )
}

export function EditBankButton({ onClick, has }: { onClick: () => void; has: boolean }) {
  return (
    <Button size="sm" variant="outline" onClick={onClick}>
      <PencilSimpleIcon />
      {has ? 'Edit bank details' : 'Add bank details'}
    </Button>
  )
}
