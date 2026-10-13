// Response shapes for /api/admin/*. Mirrors api/src/routes/admin/*.ts.
import type { Address, OrderKind, OrderStatus, Tier } from '@/lib/types'

export type { OrderKind, OrderStatus, Tier }
export type AffiliateStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED'
export type CommissionStatus = 'PENDING' | 'APPROVED' | 'PAID' | 'VOID'
export type PayoutStatus = 'REQUESTED' | 'PAID' | 'REJECTED'
export type ProductStatus = 'ACTIVE' | 'DRAFT' | 'ARCHIVED'
export type ProductForm = 'VIAL' | 'MIST' | 'SUPPLY'
export type SubscriptionStatus = 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'COMPLETED'

// ---------- Dashboard ----------
export interface Queue {
  awaitingPayment: number
  toFulfil: number
  inTransit: number
  partnerApplications: number
  payoutRequests: number
  payoutRequestedCents: number
  commissionsOwedCents: number
  unreadMessages: number
}

export interface DashboardData {
  range: { from: string; to: string }
  kpis: {
    revenueCents: number
    revenueDelta: number
    orders: number
    ordersDelta: number
    aovCents: number
    aovDelta: number
    newCustomers: number
    customersDelta: number
    totalCustomers: number
    activeSubscriptions: number
  }
  queue: Queue
  series: { date: string; revenueCents: number; orders: number }[]
  topProducts: { id?: string; name?: string; image?: string | null; revenueCents: number; units: number }[]
  recentOrders: { id: string; number: string; name: string; email: string; totalCents: number; status: OrderStatus; kind: OrderKind; createdAt: string }[]
  lowStock: { variantId: string; label: string; stock: number; product: { id: string; name: string; image: string | null } }[]
}

// ---------- Orders ----------
export interface OrderRow {
  id: string
  number: string
  kind: OrderKind
  status: OrderStatus
  name: string
  email: string
  totalCents: number
  paymentMethod: string
  itemCount: number
  partner: string | null
  createdAt: string
  paidAt: string | null
  trackingNumber: string | null
}

export interface Paged<T> {
  total: number
  page: number
  pageSize: number
  rows: T[]
}

export interface OrderList extends Paged<OrderRow> {
  counts: Partial<Record<OrderStatus, number>>
}

export interface OrderItem {
  id: string
  productId: string | null
  variantId: string | null
  name: string
  variantLabel: string
  image: string | null
  quantity: number
  unitPriceCents: number
  discountPct: number
  lineTotalCents: number
  unitCostCents: number
}

export interface OrderEvent {
  id: string
  type: string
  message: string
  actor: string | null
  createdAt: string
}

export interface Commission {
  id: string
  affiliateId: string
  orderId: string
  baseCents: number
  rate: number
  amountCents: number
  status: CommissionStatus
  payoutId: string | null
  createdAt: string
  approvedAt: string | null
  affiliate?: { id: string; code: string; user: { name: string } }
  order?: { id: string; number: string; status: OrderStatus; name?: string }
}

export interface OrderDetail {
  id: string
  number: string
  accessKey: string
  kind: OrderKind
  status: OrderStatus
  userId: string | null
  email: string
  name: string
  phone: string | null
  shippingAddress: Partial<Address>
  paymentMethod: string
  paymentRef: string | null
  billCode: string | null
  paymentUrl: string | null
  paymentStatusNote: string | null
  subtotalCents: number
  tierDiscountCents: number
  couponDiscountCents: number
  pointsDiscountCents: number
  shippingCents: number
  taxCents: number
  totalCents: number
  costCents: number
  couponCode: string | null
  affiliateId: string | null
  pointsRedeemed: number
  pointsEarned: number
  carrier: string | null
  trackingNumber: string | null
  customerNote: string | null
  adminNote: string | null
  meta: Record<string, unknown> | null
  subscriptionId: string | null
  createdAt: string
  paidAt: string | null
  shippedAt: string | null
  deliveredAt: string | null
  cancelledAt: string | null
  refundedAt: string | null
  items: OrderItem[]
  events: OrderEvent[]
  user: { id: string; name: string; email: string; tier: Tier; createdAt: string; _count: { orders: number } } | null
  affiliate: { id: string; code: string; user: { name: string } } | null
  commission: Commission | null
  subscription: { id: string; status: SubscriptionStatus; boxesShipped: number; commitMonths: number } | null
  nextStatuses: OrderStatus[]
}

// ---------- Catalogue ----------
export interface AdminVariant {
  id: string
  label: string
  sku: string
  priceCents: number
  costCents: number
  stock: number
  active: boolean
  sortOrder: number
}

export interface CoaDto {
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
}

export interface AdminCoa extends CoaDto {
  product: { id: string; name: string; image: string | null }
}

export interface AdminProduct {
  id: string
  slug: string
  name: string
  tagline: string
  image: string | null
  form: ProductForm
  featured: boolean
  boxEligible: boolean
  category: { name: string; slug: string } | null
  purity: number | null
  latestLot: string | null
  fromPriceCents: number | null
  inStock: boolean
  description: string
  gallery: string[]
  casNumber: string | null
  molecularFormula: string | null
  molecularWeight: string | null
  sequence: string | null
  storage: string | null
  coas: CoaDto[]
  status: ProductStatus
  sortOrder: number
  categoryId: string | null
  createdAt: string
  updatedAt: string
  variants: AdminVariant[]
  totalStock: number
  unitsSold?: number
  revenueCents?: number
}

export interface AdminCategory {
  id: string
  name: string
  slug: string
  sortOrder: number
  _count: { products: number }
}

// ---------- People ----------
export interface CustomerRow {
  id: string
  name: string
  email: string
  phone: string | null
  role: 'CUSTOMER' | 'ADMIN'
  tier: Tier
  pointsBalance: number
  createdAt: string
  orders: number
  spentCents: number
  lastOrderAt: string | null
  partner: { status: AffiliateStatus; code: string } | null
}

export interface PointsTxn {
  id: string
  delta: number
  reason: string
  orderId: string | null
  expiresAt: string | null
  createdAt: string
}

export interface CustomerDetail {
  id: string
  email: string
  name: string
  phone: string | null
  role: 'CUSTOMER' | 'ADMIN'
  tier: Tier
  tierExpiresAt: string | null
  pointsBalance: number
  createdAt: string
  lastLoginAt: string | null
  orders: { id: string; number: string; status: OrderStatus; kind: OrderKind; totalCents: number; createdAt: string }[]
  pointsTxns: PointsTxn[]
  affiliate: { id: string; status: AffiliateStatus; code: string } | null
  subscriptions: { id: string; status: SubscriptionStatus; boxesShipped: number; nextShipAt: string; priceCents: number }[]
  stats: { orders: number; spentCents: number }
}

export interface AffiliateRow {
  id: string
  name: string
  email: string
  code: string
  couponCode: string
  status: AffiliateStatus
  commissionRate: number
  platform: string
  handle: string
  createdAt: string
  clicks: number
  orders: number
  salesCents: number
  pendingCents: number
  /** Approved and not yet in a payout request. */
  approvedCents: number
  /** Approved commission inside an open payout request. */
  requestedCents: number
  paidCents: number
  conversionPct: number
  /** False when the partner has not given bank details, so no payout can be created. */
  bankOnFile: boolean
}

export interface BankDetails {
  bankName: string | null
  bankAccountName: string | null
  bankAccountNumber: string | null
}

export interface Payout {
  id: string
  affiliateId: string
  amountCents: number
  method: string
  /** Snapshot "Bank, account number, account holder" taken when the payout was requested. */
  destination: string | null
  reference: string | null
  status: PayoutStatus
  note: string | null
  createdAt: string
  paidAt: string | null
  /** Present on /api/admin/payouts rows: the partner's CURRENT bank details. */
  affiliate?: { id: string; code: string; user: { name: string; email: string } } & Partial<BankDetails>
  _count?: { commissions: number }
}

export interface AffiliateDetail extends BankDetails {
  id: string
  userId: string
  code: string
  couponCode: string
  status: AffiliateStatus
  commissionRate: number
  platform: string
  handle: string
  otherHandles: string | null
  website: string | null
  /** Legacy (pre bank-transfer) field. Not shown anywhere; payouts use the bank fields. */
  paymentEmail: string | null
  payoutMethod: string
  promotionPlan: string | null
  adminNote: string | null
  createdAt: string
  approvedAt: string | null
  user: { id: string; name: string; email: string; phone: string | null; createdAt: string }
  commissions: (Commission & { order: { id: string; number: string; status: OrderStatus; name: string } })[]
  payouts: Payout[]
  balances: {
    pendingCents: number
    availableCents: number
    requestedCents: number
    paidCents: number
    voidCents: number
    lifetimeCents: number
    salesCents: number
    orders: number
    counts: { pending: number; available: number; requested: number; paid: number; void: number }
  }
  clicks: number
}

// ---------- Finance ----------
export interface FinanceData {
  range: { from: string; to: string; by: 'day' | 'month' }
  summary: {
    orders: number
    grossSalesCents: number
    tierDiscountCents: number
    couponDiscountCents: number
    pointsDiscountCents: number
    netSalesCents: number
    shippingCents: number
    taxCents: number
    collectedCents: number
    refundsCents: number
    cogsCents: number
    commissionsCents: number
    payoutsPaidCents: number
    commissionsOwedCents: number
    pointsLiabilityCents: number
    netRevenueCents: number
    grossProfitCents: number
    netProfitCents: number
    marginPct: number
  }
  series: { period: string; revenueCents: number; refundsCents: number; profitCents: number; orders: number }[]
  byKind: { key: string; orders: number; revenueCents: number }[]
  byPaymentMethod: { key: string; orders: number; revenueCents: number }[]
  products: { productId: string; name: string; units: number; revenueCents: number; costCents: number; marginPct: number }[]
}

// ---------- Store ----------
export interface SubscriptionRow {
  id: string
  userId: string | null
  email: string
  name: string
  shippingAddress: Partial<Address>
  items: { name?: string; quantity: number; variantId: string; variantLabel?: string }[]
  priceCents: number
  status: SubscriptionStatus
  commitMonths: number
  boxesShipped: number
  nextShipAt: string
  createdAt: string
  cancelledAt: string | null
  orders: { id: string; number: string; status: OrderStatus; createdAt: string }[]
}

export interface Coupon {
  id: string
  code: string
  type: 'PERCENT' | 'FIXED'
  value: number
  minSubtotal: number
  maxUses: number | null
  uses: number
  expiresAt: string | null
  active: boolean
  description: string | null
  createdAt: string
}

export interface ContactMessage {
  id: string
  name: string
  email: string
  topic: string
  orderRef: string | null
  message: string
  handled: boolean
  createdAt: string
}

export interface Subscriber {
  id: string
  email: string
  createdAt: string
}

export interface PaymentMethodSetting {
  id: string
  label: string
  type: 'gateway' | 'manual'
  instructions: string
  enabled: boolean
}

export interface StoreSettings {
  storeName: string
  /** Optional programs. Membership off = paid tiers have no effect and the Membership page is hidden. */
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
  membership: Record<Exclude<Tier, 'MEMBER'>, { monthlyCents: number; yearlyCents: number }>
  paymentMethods: PaymentMethodSetting[]
}

export interface SettingsResponse {
  settings: StoreSettings
  gateway: { provider: string; configured: boolean; sandbox: boolean; callbackUrl: string }
}
