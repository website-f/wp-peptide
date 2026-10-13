import { db } from './db.js'
import { env } from './env.js'

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

export interface BannerMessage {
  id: string
  text: string
  /** Internal path (/shop) or https:// URL. Empty = no link. */
  linkUrl: string
  linkLabel: string
  enabled: boolean
  /** ISO date-times; null = no limit. */
  startsAt: string | null
  endsAt: string | null
}

export interface StoreSettings {
  storeName: string
  /** Optional programs that can be switched off without touching code. */
  features: { membership: boolean }
  supportEmail: string
  currency: { code: string; symbol: string; locale: string }
  /** Legacy single-line announcement; migrated into `banner` and kept only for old saves. */
  announcement: string
  /** The strip across the top of every shop page. */
  banner: {
    enabled: boolean
    style: 'gold' | 'dark' | 'subtle'
    /** Seconds between messages when there is more than one (0 = show only the first). */
    rotateSeconds: number
    /** Let shoppers close it; it reappears when the messages change. */
    dismissible: boolean
    messages: BannerMessage[]
  }
  shipping: { flatCents: number; freeThresholdCents: number; carrier: string; cutoff: string }
  taxPct: number
  /** Quantity tiers on normal shop orders ("buy 3, save 30%"). */
  tierPricing: {
    enabled: boolean
    /** product = units of the same compound (any size) count together; order = every unit in the cart counts */
    countBy: 'product' | 'order'
    /** Show "add N more for X% off" in the cart when this many units or fewer away from the next tier (0 = never). */
    hintWithinUnits: number
  }
  tiers: { min: number; pct: number }[]
  /** Bulk (wholesale) orders. The discount ladder lives in `wholesale`. */
  bulk: {
    enabled: boolean
    countBy: 'product' | 'order'
    freeShipping: boolean
    earnPoints: boolean
    /** 0 = no limit */
    maxUnitsPerOrder: number
  }
  wholesale: { min: number; pct: number }[]
  box: {
    enabled: boolean
    slots: number
    pct: number
    commitMonths: number
    freeShipping: boolean
    earnPoints: boolean
    /** Free item packed with every box, e.g. "Bacteriostatic Water". Empty = none. */
    includedItem: string
  }
  affiliate: {
    defaultRate: number
    cookieDays: number
    couponPct: number
    minPayoutCents: number
    /** Does the shopper discount from a partner code also apply to these order types? */
    codeDiscountOnBulk: boolean
    codeDiscountOnBox: boolean
    /** When false, a partner code only discounts items without a quantity-tier discount. */
    codeStacksWithTiers: boolean
    /** Do partners earn commission on these order types? */
    commissionOnBulk: boolean
    commissionOnBox: boolean
  }
  discounts: {
    /** Can points be redeemed on an order that already uses a discount or partner code? */
    pointsWithCodes: boolean
  }
  orders: {
    /** Days an unpaid order holds stock before it is cancelled automatically. */
    unpaidExpiryDaysOnline: number
    unpaidExpiryDaysManual: number
  }
  inventory: { lowStockThreshold: number }
  points: {
    /** What 100 points are worth at checkout, in cents (100 = RM1). */
    valueCentsPer100: number
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
  announcement: '',
  banner: {
    enabled: true,
    style: 'gold',
    rotateSeconds: 6,
    dismissible: false,
    messages: [
      {
        id: 'shipping',
        text: 'Free tracked shipping over RM800. Orders paid before 2pm ship the same day.',
        linkUrl: '',
        linkLabel: '',
        enabled: true,
        startsAt: null,
        endsAt: null,
      },
    ],
  },
  shipping: { flatCents: 1500, freeThresholdCents: 80000, carrier: 'Tracked courier', cutoff: '2pm' },
  taxPct: 0,
  tierPricing: { enabled: true, countBy: 'product', hintWithinUnits: 2 },
  tiers: [
    { min: 3, pct: 30 },
    { min: 5, pct: 35 },
    { min: 10, pct: 40 },
  ],
  bulk: { enabled: true, countBy: 'product', freeShipping: true, earnPoints: true, maxUnitsPerOrder: 0 },
  wholesale: [
    { min: 10, pct: 40 },
    { min: 50, pct: 50 },
    { min: 100, pct: 55 },
  ],
  box: { enabled: true, slots: 4, pct: 40, commitMonths: 3, freeShipping: true, earnPoints: true, includedItem: 'Bacteriostatic Water' },
  affiliate: {
    defaultRate: 20,
    cookieDays: 30,
    couponPct: 10,
    minPayoutCents: 20000,
    codeDiscountOnBulk: false,
    codeDiscountOnBox: false,
    codeStacksWithTiers: true,
    commissionOnBulk: true,
    commissionOnBox: true,
  },
  discounts: { pointsWithCodes: true },
  orders: { unpaidExpiryDaysOnline: 3, unpaidExpiryDaysManual: 7 },
  inventory: { lowStockThreshold: 5 },
  points: {
    valueCentsPer100: 100,
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
  const stored = (row?.value ?? {}) as Partial<StoreSettings>
  const value = deepMerge(DEFAULT_SETTINGS, stored)
  // Stores saved before the banner existed: carry their single announcement over.
  if (!stored.banner && typeof stored.announcement === 'string') {
    value.banner = stored.announcement.trim()
      ? { ...value.banner, messages: [{ ...value.banner.messages[0], text: stored.announcement.trim() }] }
      : { ...value.banner, enabled: false }
  }
  // Membership is a licensed add-on: without ENABLE_MEMBERSHIP it is off no matter what is stored.
  if (!env.enableMembership) value.features = { ...value.features, membership: false }
  cache = { at: Date.now(), value }
  return value
}

export async function saveSettings(patch: unknown): Promise<StoreSettings> {
  const next = deepMerge(await getSettings(), patch)
  next.tiers = [...next.tiers].sort((a, b) => a.min - b.min)
  next.wholesale = [...next.wholesale].sort((a, b) => a.min - b.min)
  // The membership switch can only be stored while the add-on is licensed.
  if (!env.enableMembership) next.features = { ...next.features, membership: false }
  await db.setting.upsert({
    where: { key: 'store' },
    create: { key: 'store', value: next as object },
    update: { value: next as object },
  })
  cache = null
  return getSettings()
}

/** Which optional programs this installation is licensed to show at all. */
export const licensed = () => ({ membership: env.enableMembership })

export function publicSettings(s: StoreSettings) {
  // Unlicensed programs are not described to the public at all.
  const { membership, features, announcement: _legacy, banner, ...rest } = s
  // Shoppers only receive messages that are switched on and inside their schedule.
  const now = Date.now()
  const live = banner.enabled
    ? banner.messages
        .filter((m) => m.enabled && m.text.trim() && (!m.startsAt || Date.parse(m.startsAt) <= now) && (!m.endsAt || Date.parse(m.endsAt) > now))
        .map(({ id, text, linkUrl, linkLabel }) => ({ id, text, linkUrl, linkLabel }))
    : []
  const { founderYearlyBonus: _bonus, ...basePoints } = s.points
  const points = env.enableMembership ? s.points : { ...basePoints, perDollar: { MEMBER: s.points.perDollar.MEMBER } }
  return {
    ...rest,
    banner: { style: banner.style, rotateSeconds: banner.rotateSeconds, dismissible: banner.dismissible, messages: live },
    points,
    ...(env.enableMembership ? { membership, features } : {}),
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

/** Points to currency: what a number of points is worth in cents. */
export const pointsToCents = (s: StoreSettings, points: number) => Math.floor((points * s.points.valueCentsPer100) / 100)

/** Currency to points: the most points that fit inside an amount in cents. */
export const centsToPoints = (s: StoreSettings, cents: number) => (s.points.valueCentsPer100 > 0 ? Math.floor((cents * 100) / s.points.valueCentsPer100) : 0)
