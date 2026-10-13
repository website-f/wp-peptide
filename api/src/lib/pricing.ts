import type { Affiliate, Coupon, User } from '@prisma/client'
import { db } from './db.js'
import { badRequest } from './http.js'
import { effectiveTier, fmtMoney, getSettings, pctFor, type StoreSettings, type Tier } from './settings.js'

export type QuoteMode = 'standard' | 'wholesale' | 'box'

export interface QuoteInput {
  items: { variantId: string; quantity: number }[]
  mode: QuoteMode
  couponCode?: string | null
  refCode?: string | null
  redeemPoints?: number
  user?: User | null
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
  coupon: { code: string; label: string } | null
  couponError: string | null
  affiliate: { id: string; code: string } | null
  freeShippingRemainingCents: number
  hints: { productId: string; name: string; addQty: number; pct: number }[]
  warnings: string[]
}

const tierRank: Record<Tier, number> = { MEMBER: 0, INSIDER: 1, VIP: 2, FOUNDER: 3 }

export function earnRate(s: StoreSettings, tier: Tier) {
  return s.points.perDollar[tier] ?? s.points.perDollar.MEMBER
}

export function pointsFor(s: StoreSettings, tier: Tier, eligibleCents: number, triggerCents: number) {
  const base = Math.floor((eligibleCents / 100) * earnRate(s, tier))
  const bonus = triggerCents >= s.points.bonusThresholdCents ? s.points.bonusPoints : 0
  return base + bonus
}

async function resolveCoupon(code: string, mode: QuoteMode, user: User | null | undefined) {
  const normalized = code.trim().toUpperCase()
  const coupon = await db.coupon.findUnique({ where: { code: normalized } })
  if (coupon) return { kind: 'coupon' as const, coupon }
  const affiliate = await db.affiliate.findUnique({ where: { couponCode: normalized } })
  if (affiliate && affiliate.status === 'APPROVED') {
    if (user && affiliate.userId === user.id) return { kind: 'error' as const, message: 'You cannot use your own partner code' }
    return { kind: 'affiliate' as const, affiliate }
  }
  if (mode === 'wholesale') return { kind: 'error' as const, message: 'Code not recognised' }
  return { kind: 'error' as const, message: 'That code is not valid' }
}

function couponProblem(s: StoreSettings, c: Coupon, afterTierCents: number): string | null {
  if (!c.active) return 'That code is no longer active'
  if (c.expiresAt && c.expiresAt < new Date()) return 'That code has expired'
  if (c.maxUses !== null && c.uses >= c.maxUses) return 'That code has reached its usage limit'
  if (afterTierCents < c.minSubtotal) return `Spend ${fmtMoney(s, c.minSubtotal)} to use this code`
  return null
}

export async function buildQuote(input: QuoteInput): Promise<Quote> {
  const s = await getSettings()
  const { mode, user } = input
  const warnings: string[] = []

  // Merge duplicate variant rows so stock and tier maths see real totals.
  const wanted = new Map<string, number>()
  for (const it of input.items) {
    if (!Number.isInteger(it.quantity) || it.quantity < 1) throw badRequest('Quantity must be at least 1')
    wanted.set(it.variantId, (wanted.get(it.variantId) ?? 0) + it.quantity)
  }
  if (wanted.size === 0) throw badRequest('Your cart is empty')
  if (mode === 'box') {
    const slots = [...wanted.values()].reduce((a, b) => a + b, 0)
    if (slots !== s.box.slots) throw badRequest(`Pick exactly ${s.box.slots} compounds for your box`)
  }

  const variants = await db.variant.findMany({
    where: { id: { in: [...wanted.keys()] } },
    include: { product: true },
  })
  const lines: QuoteLine[] = []
  for (const [variantId, quantity] of wanted) {
    const v = variants.find((x) => x.id === variantId)
    if (!v || !v.active || v.product.status !== 'ACTIVE') {
      warnings.push('An item in your cart is no longer available and was removed')
      continue
    }
    if (mode === 'box' && !v.product.boxEligible) throw badRequest(`${v.product.name} is not available in Build a Box`)
    if (v.stock < quantity) {
      throw badRequest(
        v.stock <= 0
          ? `${v.product.name} ${v.label} is sold out`
          : `Only ${v.stock} of ${v.product.name} ${v.label} left in stock`,
      )
    }
    lines.push({
      variantId,
      productId: v.productId,
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

  // Quantity tiers count units of the same compound across all its sizes.
  const perProduct = new Map<string, number>()
  for (const l of lines) perProduct.set(l.productId, (perProduct.get(l.productId) ?? 0) + l.quantity)

  const hints: Quote['hints'] = []
  for (const l of lines) {
    const qty = perProduct.get(l.productId)!
    if (mode === 'box') l.discountPct = s.box.pct
    else if (mode === 'wholesale') {
      const min = s.wholesale[0]?.min ?? 10
      if (qty < min) throw badRequest(`Bulk pricing starts at ${min} units of ${l.name}`)
      l.discountPct = pctFor(qty, s.wholesale)
    } else l.discountPct = pctFor(qty, s.tiers)
    l.lineTotalCents = Math.round((l.lineListCents * (100 - l.discountPct)) / 100)
  }
  if (mode === 'standard') {
    for (const [productId, qty] of perProduct) {
      const next = s.tiers.find((t) => t.min > qty)
      if (next && next.min - qty <= 2) {
        const name = lines.find((l) => l.productId === productId)!.name
        hints.push({ productId, name, addQty: next.min - qty, pct: next.pct })
      }
    }
  }

  const subtotalCents = lines.reduce((a, l) => a + l.lineListCents, 0)
  const afterTier = lines.reduce((a, l) => a + l.lineTotalCents, 0)
  const tierDiscountCents = subtotalCents - afterTier
  const costCents = lines.reduce((a, l) => a + l.unitCostCents * l.quantity, 0)

  // Coupon / partner code. Partner codes give the shopper a discount and attribute the order.
  let couponDiscountCents = 0
  let coupon: Quote['coupon'] = null
  let couponError: string | null = null
  let affiliate: Affiliate | null = null
  if (input.couponCode?.trim()) {
    const r = await resolveCoupon(input.couponCode, mode, user)
    if (r.kind === 'error') couponError = r.message
    else if (r.kind === 'affiliate') {
      affiliate = r.affiliate
      if (mode === 'standard') {
        couponDiscountCents = Math.round((afterTier * s.affiliate.couponPct) / 100)
        coupon = { code: r.affiliate.couponCode, label: `${s.affiliate.couponPct}% partner discount` }
      } else coupon = { code: r.affiliate.couponCode, label: 'Partner code applied' }
    } else {
      const problem = couponProblem(s, r.coupon, afterTier)
      if (problem) couponError = problem
      else if (mode !== 'standard') couponError = 'Discount codes do not stack with bulk or box pricing'
      else {
        couponDiscountCents =
          r.coupon.type === 'PERCENT'
            ? Math.round((afterTier * Math.min(100, r.coupon.value)) / 100)
            : Math.min(afterTier, r.coupon.value)
        coupon = {
          code: r.coupon.code,
          label: r.coupon.type === 'PERCENT' ? `${r.coupon.value}% off` : `${fmtMoney(s, r.coupon.value)} off`,
        }
      }
    }
  }
  if (!affiliate && input.refCode) {
    const a = await db.affiliate.findUnique({ where: { code: input.refCode.trim().toLowerCase() } })
    if (a && a.status === 'APPROVED' && (!user || a.userId !== user.id)) affiliate = a
  }

  const afterCoupon = afterTier - couponDiscountCents

  // Points: 1 point = 1 cent; capped at a share of the order and at the balance.
  let maxRedeemablePoints = 0
  let pointsRedeemed = 0
  if (user && mode === 'standard') {
    maxRedeemablePoints = Math.max(0, Math.min(user.pointsBalance, Math.floor((afterCoupon * s.points.maxRedeemPct) / 100)))
    pointsRedeemed = Math.max(0, Math.min(Math.floor(input.redeemPoints ?? 0), maxRedeemablePoints))
  }
  const pointsDiscountCents = pointsRedeemed
  const merchandiseCents = afterCoupon - pointsDiscountCents

  const tier: Tier = effectiveTier(s, user?.tier as Tier | undefined)
  const freeByTier = tierRank[tier] >= tierRank.INSIDER
  const freeByMode = mode === 'box' || mode === 'wholesale'
  const freeByThreshold = afterCoupon >= s.shipping.freeThresholdCents
  const shippingCents = freeByMode || freeByTier || freeByThreshold ? 0 : s.shipping.flatCents
  const taxCents = Math.round((merchandiseCents * s.taxPct) / 100)
  const totalCents = merchandiseCents + shippingCents + taxCents

  // Bulk orders earn at the base rate; membership multipliers do not stack with wholesale.
  const pointsEarned = pointsFor(s, mode === 'wholesale' ? 'MEMBER' : tier, merchandiseCents, afterCoupon)

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
    affiliate: affiliate ? { id: affiliate.id, code: affiliate.code } : null,
    freeShippingRemainingCents: shippingCents > 0 && !freeByMode ? Math.max(0, s.shipping.freeThresholdCents - afterCoupon) : 0,
    hints,
    warnings,
  }
}

/** Shopper-facing view: hides cost data and internal affiliate ids. */
export function publicQuote(q: Quote) {
  const { costCents: _c, affiliate, ...rest } = q
  return {
    ...rest,
    lines: rest.lines.map(({ unitCostCents: _u, ...l }) => l),
    partnerApplied: Boolean(affiliate),
  }
}
