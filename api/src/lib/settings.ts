import { db } from './db.js'

export type Tier = 'MEMBER' | 'INSIDER' | 'VIP' | 'FOUNDER'
export type PaidTier = Exclude<Tier, 'MEMBER'>

export interface PaymentMethod {
  id: string
  label: string
  /** gateway = pay online now (ToyyibPay); manual = customer pays offline, admin marks paid */
  type: 'gateway' | 'manual'
  instructions: string
  enabled: boolean
}

export interface StoreSettings {
  storeName: string
  /** Optional programs that can be switched off without touching code. */
  features: { membership: boolean }
  supportEmail: string
  currency: { code: string; symbol: string; locale: string }
  announcement: string
  shipping: { flatCents: number; freeThresholdCents: number; carrier: string; cutoff: string }
  taxPct: number
  tiers: { min: number; pct: number }[]
  wholesale: { min: number; pct: number }[]
  box: { slots: number; pct: number; commitMonths: number }
  affiliate: { defaultRate: number; cookieDays: number; couponPct: number; minPayoutCents: number }
  points: {
    perDollar: Record<Tier, number>
    bonusThresholdCents: number
    bonusPoints: number
    maxRedeemPct: number
    expiryMonths: number
    founderYearlyBonus: number
  }
  membership: Record<PaidTier, { monthlyCents: number; yearlyCents: number }>
  paymentMethods: PaymentMethod[]
}

export const DEFAULT_SETTINGS: StoreSettings = {
  storeName: 'KYVO',
  features: { membership: false },
  supportEmail: 'support@kyvolabs.com',
  currency: { code: 'MYR', symbol: 'RM', locale: 'en-MY' },
  announcement: 'Free tracked shipping over RM800. Orders paid before 2pm ship the same day.',
  shipping: { flatCents: 1500, freeThresholdCents: 80000, carrier: 'Tracked courier', cutoff: '2pm' },
  taxPct: 0,
  tiers: [
    { min: 3, pct: 30 },
    { min: 5, pct: 35 },
    { min: 10, pct: 40 },
  ],
  wholesale: [
    { min: 10, pct: 40 },
    { min: 50, pct: 50 },
    { min: 100, pct: 55 },
  ],
  box: { slots: 4, pct: 40, commitMonths: 3 },
  affiliate: { defaultRate: 20, cookieDays: 30, couponPct: 10, minPayoutCents: 20000 },
  points: {
    perDollar: { MEMBER: 2.5, INSIDER: 3.5, VIP: 5, FOUNDER: 10 },
    bonusThresholdCents: 80000,
    bonusPoints: 500,
    maxRedeemPct: 50,
    expiryMonths: 12,
    founderYearlyBonus: 35000,
  },
  membership: {
    INSIDER: { monthlyCents: 3900, yearlyCents: 39000 },
    VIP: { monthlyCents: 7900, yearlyCents: 79000 },
    FOUNDER: { monthlyCents: 39900, yearlyCents: 399000 },
  },
  paymentMethods: [
    {
      id: 'toyyibpay',
      label: 'Online banking (FPX) or card',
      type: 'gateway',
      instructions: 'You will be taken to ToyyibPay to pay securely with FPX online banking or a debit/credit card.',
      enabled: true,
    },
    {
      id: 'bank',
      type: 'manual',
      label: 'Bank transfer',
      instructions:
        'Transfer the order total to the account below and put your order number in the reference. We ship as soon as funds clear.\n\nBank: [set in Admin > Settings]\nAccount name: [set in Admin > Settings]\nAccount number: [set in Admin > Settings]',
      enabled: false,
    },
    {
      id: 'duitnow',
      label: 'DuitNow transfer',
      type: 'manual',
      instructions: 'Send the order total via DuitNow to [set in Admin > Settings] and put your order number in the reference.',
      enabled: false,
    },
    {
      id: 'crypto',
      label: 'USDT / USDC',
      type: 'manual',
      instructions: 'Send the exact total in USDT or USDC (TRC-20) to [wallet address, set in Admin > Settings]. Email the transaction hash with your order number.',
      enabled: false,
    },
  ],
}

let cache: { at: number; value: StoreSettings } | null = null

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

// Arrays are replaced wholesale; objects merge key by key so new defaults
// appear automatically for stores that saved settings before they existed.
function deepMerge<T>(base: T, patch: unknown): T {
  if (patch === undefined) return base
  if (!isPlainObject(base) || !isPlainObject(patch)) return patch as T
  const out: Record<string, unknown> = { ...base }
  for (const [k, v] of Object.entries(patch)) out[k] = deepMerge(out[k], v)
  return out as T
}

export async function getSettings(): Promise<StoreSettings> {
  if (cache && Date.now() - cache.at < 10_000) return cache.value
  const row = await db.setting.findUnique({ where: { key: 'store' } })
  const value = deepMerge(DEFAULT_SETTINGS, row?.value ?? {})
  cache = { at: Date.now(), value }
  return value
}

export async function saveSettings(patch: unknown): Promise<StoreSettings> {
  const next = deepMerge(await getSettings(), patch)
  next.tiers = [...next.tiers].sort((a, b) => a.min - b.min)
  next.wholesale = [...next.wholesale].sort((a, b) => a.min - b.min)
  await db.setting.upsert({
    where: { key: 'store' },
    create: { key: 'store', value: next as object },
    update: { value: next as object },
  })
  cache = null
  return getSettings()
}

export function publicSettings(s: StoreSettings) {
  return {
    ...s,
    paymentMethods: s.paymentMethods.filter((m) => m.enabled).map(({ id, label, type, instructions }) => ({ id, label, type, instructions: type === 'gateway' ? instructions : null })),
  }
}

export function pctFor(qty: number, ladder: { min: number; pct: number }[]): number {
  let pct = 0
  for (const step of ladder) if (qty >= step.min) pct = step.pct
  return pct
}

export function fmtMoney(s: StoreSettings, cents: number, digits = 2) {
  return `${s.currency.symbol}${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`
}

/** The tier that counts for pricing and points. Paid tiers only apply while the membership program is on. */
export function effectiveTier(s: StoreSettings, tier: Tier | null | undefined): Tier {
  return s.features.membership && tier ? tier : 'MEMBER'
}
