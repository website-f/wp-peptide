export type Tier = 'MEMBER' | 'INSIDER' | 'VIP' | 'FOUNDER'
export type OrderStatus = 'PENDING_PAYMENT' | 'PAID' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'REFUNDED'
export type OrderKind = 'STANDARD' | 'BOX' | 'WHOLESALE' | 'MEMBERSHIP'

export interface Ladder {
  min: number
  pct: number
}

export interface Settings {
  storeName: string
  /** Only present when the membership add-on is licensed. */
  features?: { membership: boolean }
  supportEmail: string
  currency: { code: string; symbol: string; locale: string }
  /** Top-of-page banner; only live (enabled, in-schedule) messages are sent to shoppers. */
  banner: {
    style: 'gold' | 'dark' | 'subtle'
    rotateSeconds: number
    dismissible: boolean
    messages: { id: string; text: string; linkUrl: string; linkLabel: string }[]
  }
  shipping: { flatCents: number; freeThresholdCents: number; carrier: string; cutoff: string }
  taxPct: number
  tierPricing: { enabled: boolean; countBy: 'product' | 'order'; hintWithinUnits: number }
  tiers: Ladder[]
  bulk: { enabled: boolean; countBy: 'product' | 'order'; freeShipping: boolean; earnPoints: boolean; maxUnitsPerOrder: number }
  wholesale: Ladder[]
  box: { enabled: boolean; slots: number; pct: number; commitMonths: number; freeShipping: boolean; earnPoints: boolean; includedItem: string }
  affiliate: {
    defaultRate: number
    cookieDays: number
    couponPct: number
    minPayoutCents: number
    codeDiscountOnBulk: boolean
    codeDiscountOnBox: boolean
    codeStacksWithTiers: boolean
    commissionOnBulk: boolean
    commissionOnBox: boolean
  }
  discounts: { pointsWithCodes: boolean }
  orders: { unpaidExpiryDaysOnline: number; unpaidExpiryDaysManual: number }
  inventory: { lowStockThreshold: number }
  points: {
    valueCentsPer100: number
    /** Only MEMBER is present unless the membership add-on is licensed. */
    perDollar: Partial<Record<Tier, number>> & { MEMBER: number }
    bonusThresholdCents: number
    bonusPoints: number
    maxRedeemPct: number
    expiryMonths: number
    founderYearlyBonus?: number
  }
  /** Only present when the membership add-on is licensed. */
  membership?: Record<Exclude<Tier, 'MEMBER'>, { monthlyCents: number; yearlyCents: number }>
  paymentMethods: { id: string; label: string; type: 'gateway' | 'manual'; instructions: string | null }[]
}

export interface VariantLite {
  id: string
  label: string
  priceCents: number
  inStock: boolean
  lowStock: boolean
}

export interface ProductCard {
  id: string
  slug: string
  name: string
  tagline: string
  image: string | null
  form: 'VIAL' | 'MIST' | 'SUPPLY'
  featured: boolean
  boxEligible: boolean
  category: { name: string; slug: string } | null
  purity: number | null
  latestLot: string | null
  fromPriceCents: number | null
  inStock: boolean
  variants: VariantLite[]
}

export interface Coa {
  id: string
  lotNumber: string
  variantLabel: string | null
  purity: number
  labeledAmount: string | null
  measuredAmount: string | null
  identity: string
  endotoxin: string
  microbial: string
  heavyMetals: string
  appearance: string
  lab: string
  assays: number
  testedAt: string
  fileUrl: string | null
  product?: { name: string; slug: string; image: string | null }
}

export interface ProductDetail extends ProductCard {
  description: string
  gallery: string[]
  casNumber: string | null
  molecularFormula: string | null
  molecularWeight: string | null
  sequence: string | null
  storage: string | null
  coas: Coa[]
}

export interface Category {
  id: string
  name: string
  slug: string
  count: number
}

export interface Me {
  user: {
    id: string
    email: string
    name: string
    phone: string | null
    role: 'CUSTOMER' | 'ADMIN'
    tier: Tier
    tierExpiresAt: string | null
    pointsBalance: number
    mustChangePassword?: boolean
    createdAt: string
  } | null
  affiliate: { status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED'; code: string } | null
}

export interface QuoteLine {
  variantId: string
  productId: string
  slug: string
  name: string
  variantLabel: string
  image: string | null
  quantity: number
  unitPriceCents: number
  discountPct: number
  lineListCents: number
  lineTotalCents: number
  stock: number
}

export interface Quote {
  mode: 'standard' | 'wholesale' | 'box'
  lines: QuoteLine[]
  subtotalCents: number
  tierDiscountCents: number
  couponDiscountCents: number
  pointsDiscountCents: number
  pointsRedeemed: number
  maxRedeemablePoints: number
  shippingCents: number
  taxCents: number
  totalCents: number
  pointsEarned: number
  coupon: { code: string; label: string; kind: 'store' | 'partner'; freeShipping: boolean } | null
  couponError: string | null
  partnerApplied: boolean
  freeShippingRemainingCents: number
  hints: { productId: string; name: string; addQty: number; pct: number }[]
  warnings: string[]
}

export interface Address {
  line1: string
  line2?: string
  city: string
  state: string
  postalCode: string
  country: string
}

export interface PublicOrder {
  number: string
  accessKey: string
  kind: OrderKind
  status: OrderStatus
  email: string
  name: string
  phone: string | null
  shippingAddress: Address | Record<string, never>
  paymentMethod: string
  paymentInstructions: string | null
  subtotalCents: number
  tierDiscountCents: number
  couponDiscountCents: number
  pointsDiscountCents: number
  shippingCents: number
  taxCents: number
  totalCents: number
  couponCode: string | null
  pointsRedeemed: number
  pointsEarned: number
  carrier: string | null
  trackingNumber: string | null
  createdAt: string
  paidAt: string | null
  shippedAt: string | null
  deliveredAt: string | null
  items: { name: string; variantLabel: string; image: string | null; quantity: number; unitPriceCents: number; discountPct: number; lineTotalCents: number }[]
  events: { type: string; message: string; createdAt: string }[]
}

export interface PlaceOrderResult {
  number: string
  accessKey: string
  paymentUrl: string | null
  paymentError: string | null
}

export const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'Awaiting payment',
  PAID: 'Paid',
  PROCESSING: 'Packing',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded',
}

export const TIER_LABEL: Record<Tier, string> = { MEMBER: 'Member', INSIDER: 'Insider', VIP: 'VIP', FOUNDER: 'Founder' }
