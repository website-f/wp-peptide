import { BankIcon, ShieldCheckIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Field } from './Field'

// Partner commission is paid by manual bank transfer (IBG / DuitNow) into a Malaysian account.
export const MY_BANKS = [
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
  'GXBank',
  'Other',
]

export interface BankValue {
  bankName: string
  bankAccountName: string
  bankAccountNumber: string
}

export type BankErrors = Partial<Record<keyof BankValue, string>>

export const emptyBank: BankValue = { bankName: '', bankAccountName: '', bankAccountNumber: '' }

export function validateBank(b: BankValue): BankErrors {
  const e: BankErrors = {}
  if (!b.bankName) e.bankName = 'Choose your bank'
  if (b.bankAccountName.trim().length < 2) e.bankAccountName = 'Enter the account holder name exactly as the bank has it'
  const digits = b.bankAccountNumber.replace(/[\s-]/g, '')
  if (!/^\d{6,20}$/.test(digits)) e.bankAccountNumber = 'Account numbers are 6 to 20 digits'
  return e
}

/** Shows only the last 4 digits, for places where the full number is not needed. */
export const maskAccount = (n: string | null | undefined) => (n ? `•••• ${n.slice(-4)}` : '')

export function BankFields({
  idPrefix,
  value,
  onChange,
  errors,
}: {
  idPrefix: string
  value: BankValue
  onChange: (v: BankValue) => void
  errors: BankErrors
}) {
  // "Other" reveals a text box for banks that are not in the list.
  const listed = MY_BANKS.includes(value.bankName) && value.bankName !== 'Other'
  const [other, setOther] = useState(Boolean(value.bankName) && !listed)
  const selectValue = other ? 'Other' : value.bankName
  return (
    <div className="grid gap-5">
      <div className="flex items-start gap-3 rounded-md border border-gold/25 bg-gold/5 p-3.5 text-sm">
        <BankIcon className="mt-0.5 size-5 shrink-0 text-gold-ink" aria-hidden />
        <p className="text-muted-foreground">
          Commission is paid by bank transfer to a Malaysian account in your name. We copy these details onto each payout request, so double-check them.
        </p>
      </div>
      <Field id={`${idPrefix}-bankName`} label="Bank" error={errors.bankName}>
        {(aria) => (
          <Select
            value={selectValue}
            onValueChange={(v) => {
              setOther(v === 'Other')
              onChange({ ...value, bankName: v === 'Other' ? '' : v })
            }}
          >
            <SelectTrigger {...aria} className="w-full">
              <SelectValue placeholder="Choose your bank" />
            </SelectTrigger>
            <SelectContent>
              {MY_BANKS.map((b) => (
                <SelectItem key={b} value={b} className="min-h-10">
                  {b}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Field>
      {other && (
        <Field id={`${idPrefix}-bankOther`} label="Bank name" hint="Type the full name of your bank." error={errors.bankName}>
          <Input autoComplete="off" value={value.bankName} onChange={(e) => onChange({ ...value, bankName: e.target.value })} />
        </Field>
      )}
      <Field id={`${idPrefix}-bankAccountName`} label="Account holder name" error={errors.bankAccountName} hint="As printed on your bank statement.">
        <Input autoComplete="name" autoCapitalize="characters" value={value.bankAccountName} onChange={(e) => onChange({ ...value, bankAccountName: e.target.value })} />
      </Field>
      <Field id={`${idPrefix}-bankAccountNumber`} label="Account number" error={errors.bankAccountNumber} hint="Digits only. Spaces and dashes are removed for you.">
        <Input
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          className="font-mono tabular-nums"
          value={value.bankAccountNumber}
          onChange={(e) => onChange({ ...value, bankAccountNumber: e.target.value.replace(/[^\d\s-]/g, '') })}
        />
      </Field>
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <ShieldCheckIcon className="size-4 text-gold-ink" aria-hidden /> Only the KYVO payouts team sees these details. We email you whenever they change.
      </p>
    </div>
  )
}
