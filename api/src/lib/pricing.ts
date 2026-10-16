import type { Affiliate, Coupon, User } from '@prisma/client'
import { db } from './db.js'
import { badRequest } from './http.js'
import { centsToPoints, effectiveTier, fmtMoney, getSettings, pctFor, pointsToCents, type StoreSettings, type Tier } from './settings.js'

// Every amount and rule here comes from store settings or the coupon record.
// Nothing about a product's price or discount is decided in code.

export type QuoteMode = 'standard' | 'wholesale' | 'box'

export interface QuoteInput {
  items: { variantId: string; quantity: number }[]
  mode: QuoteMode
  couponCode?: string | null
  refCode?: string | null
  redeemPoints?: number
  user?: User | null
  /** Guest email, known at checkout; enables per-customer and first-order code checks. */
  email?: string | null
}

export interface QuoteLine {
  variantId: string
  productId: string
  categoryId: string | null
  slug: string
  name: string
  variantLabel: string
  image: string | null
  quantity: number
  unitPriceCents: number
  unitCostCents: number
  discountPct: number
  lineListCents: number
  lineTotalCents: number
  stock: number
}

export interface Quote {
  mode: QuoteMode
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
  costCents: number
  pointsEarned: number
  coupon: { code: string; label: string; kind: 'store' | 'partner'; freeShipping: boolean } | null
  couponError: string | null
  /** Set when a store coupon is applied; the order consumes one use of it. */
  couponId: string | null
  affiliate: { id: string; code: string } | null
  freeShippingRemainingCents: number
  hints: { productId: string; name: string; addQty: number; pct: number }[]
  warnings: string[]
}

const tierRank: Record<Tier, number> = { MEMBER: 0, INSIDER: 1, VIP: 2, FOUNDER: 3 }
const OPEN_OR_PAID = { notIn: ['CANCELLED', 'REFUNDED'] as ('CANCELLED' | 'REFUNDED')[] }

export function earnRate(s: StoreSettings, tier: Tier) {
  return s.points.perDollar[tier] ?? s.points.perDollar.MEMBER
}

export function pointsFor(s: StoreSettings, tier: Tier, eligibleCents: number, triggerCents: number) {
  const base = Math.floor((eligibleCents / 100) * earnRate(s, tier))
  const bonus = triggerCents >= s.points.bonusThresholdCents ? s.points.bonusPoints : 0
  return base + bonus
}

const MODE_LABEL: Record<QuoteMode, string> = { standard: 'shop orders', wholesale: 'bulk orders', box: 'Build a Box' }

/** Who is asking, for per-customer limits. Matches the account or, for guests, the email. */
function customerWhere(user: User | null | undefined, email: string | null | undefined) {
  const or: { userId?: string; email?: string }[] = []
  if (user) or.push({ userId: user.id }, { email: user.email })
  else if (email) or.push({ email: email.toLowerCase() })
  return or.length ? { OR: or } : null
}

async function couponProblem(s: StoreSettings, c: Coupon, mode: QuoteMode, afterTierCents: number, user: User | null | undefined, email: string | null | undefined) {
  const now = new Date()
  if (!c.active) return 'That code is no longer active'
  if (c.startsAt && c.startsAt > now) return 'That code is not active yet'
  if (c.expiresAt && c.expiresAt < now) return 'That code has expired'
  if (!c.modes.includes(mode)) return `That code cannot be used on ${MODE_LABEL[mode]}`
  if (afterTierCents < c.minSubtotal) return `Spend ${fmtMoney(s, c.minSubtotal)} to use this code`
  const who = customerWhere(user, email)
  if (who && c.maxUsesPerCustomer !== null) {
    const used = await db.order.count({ where: { ...who, couponCode: c.code, couponCounted: true, status: OPEN_OR_PAID } })
    if (used >= c.maxUsesPerCustomer) return c.maxUsesPerCustomer === 1 ? 'You have already used this code' : `This code can be used ${c.maxUsesPerCustomer} times per customer`
  }
  // Checked after the per-customer limit so a repeat customer hears the more specific reason.
  if (c.maxUses !== null && c.uses >= c.maxUses) return 'That code has reached its usage limit'
  if (who && c.firstOrderOnly) {
    const prior = await db.order.count({ where: { ...who, status: OPEN_OR_PAID, kind: { not: 'MEMBERSHIP' } } })
    if (prior > 0) return 'That code is for first orders only'
  }
  return null
}

/** The part of the order a code can discount, after its product, category and stacking rules. */
function eligibleCents(lines: QuoteLine[], rule: { productIds: string[]; categoryIds: string[]; stackWithTiers: boolean }) {
  const scoped = rule.productIds.length > 0 || rule.categoryIds.length > 0
  return lines
    .filter((l) => !scoped || rule.productIds.includes(l.productId) || (l.categoryId !== null && rule.categoryIds.includes(l.categoryId)))
    .filter((l) => rule.stackWithTiers || l.discountPct === 0)
    .reduce((a, l) => a + l.lineTotalCents, 0)
}

export async function buildQuote(input: QuoteInput): Promise<Quote> {
  const s = await getSettings()
  const { mode, user } = input
  const email = input.email ?? null
  const warnings: string[] = []

  if (mode === 'wholesale' && !s.bulk.enabled) throw badRequest('Bulk ordering is not available right now')
  if (mode === 'box' && !s.box.enabled) throw badRequest('Build a Box is not available right now')

  // Merge duplicate variant rows so stock and discount maths see real totals.
  const wanted = new Map<string, number>()
  for (const it of input.items) {
    if (!Number.isInteger(it.quantity) || it.quantity < 1) throw badRequest('Quantity must be at least 1')
    wanted.set(it.variantId, (wanted.get(it.variantId) ?? 0) + it.quantity)
  }
  if (wanted.size === 0) throw badRequest('Your cart is empty')
  const totalUnits = [...wanted.values()].reduce((a, b) => a + b, 0)
  if (mode === 'box' && totalUnits !== s.box.slots) throw badRequest(`Pick exactly ${s.box.slots} compounds for your box`)
  if (mode === 'wholesale' && s.bulk.maxUnitsPerOrder > 0 && totalUnits > s.bulk.maxUnitsPerOrder) {
    throw badRequest(`Bulk orders are limited to ${s.bulk.maxUnitsPerOrder} units. Contact us for larger quantities.`)
  }

  const variants = await db.variant.findMany({ where: { id: { in: [...wanted.keys()] } }, include: { product: true } })
  const lines: QuoteLine[] = []
  for (const [variantId, quantity] of wanted) {
    const v = variants.find((x) => x.id === variantId)
    if (!v || !v.active || v.product.status !== 'ACTIVE' || v.product.deletedAt) {
      warnings.push('An item in your cart is no longer available and was removed')
      continue
    }
    if (mode === 'box' && !v.product.boxEligible) throw badRequest(`${v.product.name} is not available in Build a Box`)
    if (v.stock < quantity) {
      throw badRequest(v.stock <= 0 ? `${v.product.name} ${v.label} is sold out` : `Only ${v.stock} of ${v.product.name} ${v.label} left in stock`)
    }
    lines.push({
      variantId,
      productId: v.productId,
      categoryId: v.product.categoryId,
      slug: v.product.slug,
      name: v.product.name,
      variantLabel: v.label,
      image: v.product.image,
      quantity,
      unitPriceCents: v.priceCents,
      unitCostCents: v.costCents,
      discountPct: 0,
      lineListCents: v.priceCents * quantity,
      lineTotalCents: v.priceCents * quantity,
      stock: v.stock,
    })
  }
  if (lines.length === 0) throw badRequest('Your cart is empty')

  // Discount ladders count units either per compound (all sizes together) or across the whole order.
  const perProduct = new Map<string, number>()
  for (const l of lines) perProduct.set(l.productId, (perProduct.get(l.productId) ?? 0) + l.quantity)
  const cartUnits = lines.reduce((a, l) => a + l.quantity, 0)
  const unitsFor = (l: QuoteLine, countBy: 'product' | 'order') => (countBy === 'order' ? cartUnits : perProduct.get(l.productId)!)

  const hints: Quote['hints'] = []
  for (const l of lines) {
    if (mode === 'box') l.discountPct = s.box.pct
    else if (mode === 'wholesale') {
      const min = s.wholesale[0]?.min ?? 1
      const units = unitsFor(l, s.bulk.countBy)
      if (units < min) throw badRequest(s.bulk.countBy === 'order' ? `Bulk pricing starts at ${min} units per order` : `Bulk pricing starts at ${min} units of ${l.name}`)
      l.discountPct = pctFor(units, s.wholesale)
    } else if (s.tierPricing.enabled) l.discountPct = pctFor(unitsFor(l, s.tierPricing.countBy), s.tiers)
    l.lineTotalCents = Math.round((l.lineListCents * (100 - l.discountPct)) / 100)
  }
  if (mode === 'standard' && s.tierPricing.enabled && s.tierPricing.hintWithinUnits > 0) {
    const groups = s.tierPricing.countBy === 'order' ? [[lines[0].productId, cartUnits] as const] : [...perProduct.entries()]
    for (const [productId, qty] of groups) {
      const next = s.tiers.find((t) => t.min > qty)
      if (next && next.min - qty <= s.tierPricing.hintWithinUnits) {
        const name = s.tierPricing.countBy === 'order' ? 'items' : lines.find((l) => l.productId === productId)!.name
        hints.push({ productId, name, addQty: next.min - qty, pct: next.pct })
      }
    }
  }

  const subtotalCents = lines.reduce((a, l) => a + l.lineListCents, 0)
  const afterTier = lines.reduce((a, l) => a + l.lineTotalCents, 0)
  const tierDiscountCents = subtotalCents - afterTier
  const costCents = lines.reduce((a, l) => a + l.unitCostCents * l.quantity, 0)

  // Discount codes: store coupons first, then partner codes.
  let couponDiscountCents = 0
  let coupon: Quote['coupon'] = null
  let couponError: string | null = null
  let couponId: string | null = null
  let freeShippingByCode = false
  let affiliate: Affiliate | null = null
  const code = input.couponCode?.trim().toUpperCase()
  if (code) {
    const found = await db.coupon.findUnique({ where: { code } })
    // Archived coupons are dead codes for shoppers.
    const storeCoupon = found?.deletedAt ? null : found
    const partner = storeCoupon ? null : await db.affiliate.findUnique({ where: { couponCode: code } })
    if (storeCoupon) {
      const problem = await couponProblem(s, storeCoupon, mode, afterTier, user, email)
      if (problem) couponError = problem
      else if (storeCoupon.type === 'FREE_SHIPPING') {
        freeShippingByCode = true
        couponId = storeCoupon.id
        coupon = { code: storeCoupon.code, label: 'Free shipping', kind: 'store', freeShipping: true }
      } else {
        const base = eligibleCents(lines, storeCoupon)
        if (base <= 0) {
          couponError = storeCoupon.stackWithTiers ? 'That code does not apply to the items in your cart' : 'That code does not combine with items that already have a discount'
        } else {
          let off = storeCoupon.type === 'PERCENT' ? Math.round((base * Math.min(100, storeCoupon.value)) / 100) : Math.min(base, storeCoupon.value)
          if (storeCoupon.type === 'PERCENT' && storeCoupon.maxDiscountCents !== null) off = Math.min(off, storeCoupon.maxDiscountCents)
          couponDiscountCents = off
          couponId = storeCoupon.id
          const scoped = storeCoupon.productIds.length > 0 || storeCoupon.categoryIds.length > 0
          coupon = {
            code: storeCoupon.code,
            label: `${storeCoupon.type === 'PERCENT' ? `${storeCoupon.value}% off` : `${fmtMoney(s, storeCoupon.value)} off`}${scoped ? ' selected items' : ''}`,
            kind: 'store',
            freeShipping: false,
          }
        }
      }
    } else if (partner && partner.status === 'APPROVED') {
      if (user && partner.userId === user.id) couponError = 'You cannot use your own partner code'
      else {
        affiliate = partner
        const discountHere = mode === 'standard' || (mode === 'wholesale' && s.affiliate.codeDiscountOnBulk) || (mode === 'box' && s.affiliate.codeDiscountOnBox)
        const base = discountHere ? eligibleCents(lines, { productIds: [], categoryIds: [], stackWithTiers: s.affiliate.codeStacksWithTiers }) : 0
        couponDiscountCents = Math.round((base * s.affiliate.couponPct) / 100)
        coupon = {
          code: partner.couponCode,
          label: couponDiscountCents > 0 ? `${s.affiliate.couponPct}% partner discount` : 'Partner code applied',
          kind: 'partner',
          freeShipping: false,
        }
      }
    } else couponError = 'That code is not valid'
  }
  if (!affiliate && input.refCode) {
    const a = await db.affiliate.findUnique({ where: { code: input.refCode.trim().toLowerCase() } })
    if (a && a.status === 'APPROVED' && (!user || a.userId !== user.id)) affiliate = a
  }

  const afterCoupon = afterTier - couponDiscountCents

  // Points: worth settings.points.valueCentsPer100 per 100 points, capped by share of order and balance.
  let maxRedeemablePoints = 0
  let pointsRedeemed = 0
  const codeUsed = couponDiscountCents > 0 || freeShippingByCode
  if (user && mode === 'standard' && (s.discounts.pointsWithCodes || !codeUsed)) {
    const capCents = Math.floor((afterCoupon * s.points.maxRedeemPct) / 100)
    maxRedeemablePoints = Math.max(0, Math.min(user.pointsBalance, centsToPoints(s, capCents)))
    pointsRedeemed = Math.max(0, Math.min(Math.floor(input.redeemPoints ?? 0), maxRedeemablePoints))
  }
  const pointsDiscountCents = pointsToCents(s, pointsRedeemed)
  const merchandiseCents = afterCoupon - pointsDiscountCents

  const tier: Tier = effectiveTier(s, user?.tier as Tier | undefined)
  const freeByMode = (mode === 'box' && s.box.freeShipping) || (mode === 'wholesale' && s.bulk.freeShipping)
  const freeByTier = tierRank[tier] >= tierRank.INSIDER
  const freeByThreshold = afterCoupon >= s.shipping.freeThresholdCents
  const shippingCents = freeByMode || freeByTier || freeByThreshold || freeShippingByCode ? 0 : s.shipping.flatCents
  const taxCents = Math.round((merchandiseCents * s.taxPct) / 100)
  const totalCents = merchandiseCents + shippingCents + taxCents

  // Bulk orders earn at the base rate (membership multipliers never stack with wholesale pricing).
  const earns = mode === 'standard' || (mode === 'wholesale' && s.bulk.earnPoints) || (mode === 'box' && s.box.earnPoints)
  const pointsEarned = earns ? pointsFor(s, mode === 'wholesale' ? 'MEMBER' : tier, merchandiseCents, afterCoupon) : 0

  return {
    mode,
    lines,
    subtotalCents,
    tierDiscountCents,
    couponDiscountCents,
    pointsDiscountCents,
    pointsRedeemed,
    maxRedeemablePoints,
    shippingCents,
    taxCents,
    totalCents,
    costCents,
    pointsEarned,
    coupon,
    couponError,
    couponId,
    affiliate: affiliate ? { id: affiliate.id, code: affiliate.code } : null,
    freeShippingRemainingCents: shippingCents > 0 ? Math.max(0, s.shipping.freeThresholdCents - afterCoupon) : 0,
    hints,
    warnings,
  }
}

/** Shopper-facing view: hides cost data and internal ids. */
export function publicQuote(q: Quote) {
  const { costCents: _c, affiliate, couponId: _id, ...rest } = q
  return {
    ...rest,
    lines: rest.lines.map(({ unitCostCents: _u, categoryId: _cat, ...l }) => l),
    partnerApplied: Boolean(affiliate),
  }
}
