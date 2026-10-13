import { randomBytes } from 'node:crypto'
import type { Order, OrderKind, OrderStatus, Prisma, User } from '@prisma/client'
import { db, nextOrderNumber } from './db.js'
import { closeOpenBills } from './gateway.js'
import { mailOrderEvent } from './mailer.js'
import { badRequest, notFound } from './http.js'
import type { Quote } from './pricing.js'
import { getSettings, type PaidTier } from './settings.js'

type Tx = Prisma.TransactionClient

export interface ShippingAddress {
  line1: string
  line2?: string
  city: string
  state: string
  postalCode: string
  country: string
}

export interface CreateOrderArgs {
  quote: Quote
  kind: OrderKind
  user: User | null
  email: string
  name: string
  phone?: string | null
  address: ShippingAddress
  paymentMethod: string
  customerNote?: string | null
  subscriptionId?: string | null
  meta?: Prisma.InputJsonValue
  extraItems?: { name: string; variantLabel: string; quantity: number; unitPriceCents: number }[]
}

export async function createOrder(a: CreateOrderArgs) {
  const number = await nextOrderNumber()
  const accessKey = randomBytes(18).toString('base64url')
  const { quote } = a

  return db.$transaction(async (tx) => {
    // Reserve stock atomically; the conditional update fails if another order took the last unit.
    for (const l of quote.lines) {
      const r = await tx.variant.updateMany({
        where: { id: l.variantId, stock: { gte: l.quantity } },
        data: { stock: { decrement: l.quantity } },
      })
      if (r.count === 0) throw badRequest(`${l.name} ${l.variantLabel} just sold out. Please update your cart.`)
    }
    if (quote.pointsRedeemed > 0 && a.user) {
      const r = await tx.user.updateMany({
        where: { id: a.user.id, pointsBalance: { gte: quote.pointsRedeemed } },
        data: { pointsBalance: { decrement: quote.pointsRedeemed } },
      })
      if (r.count === 0) throw badRequest('Your points balance changed. Please review your order.')
    }
    // Store coupons: take one use, re-checking the total limit inside the transaction so
    // two shoppers cannot both claim the last use.
    if (quote.couponId) {
      const c = await tx.coupon.findUniqueOrThrow({ where: { id: quote.couponId } })
      if (c.maxUses !== null && c.uses >= c.maxUses) throw badRequest('That code has just reached its usage limit. Remove it to continue.')
      await tx.coupon.update({ where: { id: c.id }, data: { uses: { increment: 1 } } })
    }

    const order = await tx.order.create({
      data: {
        number,
        accessKey,
        kind: a.kind,
        userId: a.user?.id ?? null,
        email: a.email.toLowerCase(),
        name: a.name,
        phone: a.phone ?? null,
        shippingAddress: a.address as unknown as Prisma.InputJsonValue,
        paymentMethod: a.paymentMethod,
        subtotalCents: quote.subtotalCents,
        tierDiscountCents: quote.tierDiscountCents,
        couponDiscountCents: quote.couponDiscountCents,
        pointsDiscountCents: quote.pointsDiscountCents,
        shippingCents: quote.shippingCents,
        taxCents: quote.taxCents,
        totalCents: quote.totalCents,
        costCents: quote.costCents,
        couponCode: quote.coupon?.code ?? null,
        couponCounted: Boolean(quote.couponId),
        affiliateId: quote.affiliate?.id ?? null,
        pointsRedeemed: quote.pointsRedeemed,
        pointsEarned: a.user ? quote.pointsEarned : 0,
        customerNote: a.customerNote ?? null,
        subscriptionId: a.subscriptionId ?? null,
        meta: a.meta,
        items: {
          create: [
            ...quote.lines.map((l) => ({
              productId: l.productId,
              variantId: l.variantId,
              name: l.name,
              variantLabel: l.variantLabel,
              image: l.image,
              quantity: l.quantity,
              unitPriceCents: l.unitPriceCents,
              discountPct: l.discountPct,
              lineTotalCents: l.lineTotalCents,
              unitCostCents: l.unitCostCents,
            })),
            ...(a.extraItems ?? []).map((x) => ({
              name: x.name,
              variantLabel: x.variantLabel,
              quantity: x.quantity,
              unitPriceCents: x.unitPriceCents,
              lineTotalCents: x.unitPriceCents * x.quantity,
            })),
          ],
        },
        events: { create: { type: 'created', message: 'Order placed, awaiting payment', actor: a.user?.email ?? a.email } },
      },
    })
    if (quote.pointsRedeemed > 0 && a.user) {
      await tx.pointsTxn.create({
        data: { userId: a.user.id, delta: -quote.pointsRedeemed, reason: `Redeemed on order ${number}`, orderId: order.id },
      })
    }
    return order
  })
}

/** Membership purchases are orders too, so finance and fulfilment see one ledger. */
export async function createMembershipOrder(user: User, tier: PaidTier, billing: 'monthly' | 'yearly', paymentMethod: string) {
  const s = await getSettings()
  const price = billing === 'yearly' ? s.membership[tier].yearlyCents : s.membership[tier].monthlyCents
  const number = await nextOrderNumber()
  const label = tier.charAt(0) + tier.slice(1).toLowerCase()
  return db.order.create({
    data: {
      number,
      accessKey: randomBytes(18).toString('base64url'),
      kind: 'MEMBERSHIP',
      userId: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone,
      shippingAddress: {},
      paymentMethod,
      subtotalCents: price,
      totalCents: price,
      meta: { tier, billing },
      items: {
        create: {
          name: `${label} membership`,
          variantLabel: billing === 'yearly' ? 'Billed yearly' : 'Billed monthly',
          quantity: 1,
          unitPriceCents: price,
          lineTotalCents: price,
        },
      },
      events: { create: { type: 'created', message: `${label} membership requested`, actor: user.email } },
    },
  })
}

const LIVE: OrderStatus[] = ['PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED']

export const ALLOWED: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ['PAID', 'CANCELLED'],
  PAID: ['PROCESSING', 'SHIPPED', 'DELIVERED', 'REFUNDED', 'CANCELLED'],
  PROCESSING: ['SHIPPED', 'DELIVERED', 'REFUNDED', 'CANCELLED'],
  SHIPPED: ['DELIVERED', 'REFUNDED'],
  DELIVERED: ['REFUNDED'],
  CANCELLED: [],
  REFUNDED: [],
}

const LABEL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: 'Awaiting payment',
  PAID: 'Payment received',
  PROCESSING: 'Being packed',
  SHIPPED: 'Shipped',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled',
  REFUNDED: 'Refunded',
}

async function onPaid(tx: Tx, orderId: string) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { affiliate: true, user: true } })
  const s = await getSettings()

  if (order.user && order.pointsEarned > 0) {
    const expiresAt = new Date()
    expiresAt.setMonth(expiresAt.getMonth() + s.points.expiryMonths)
    await tx.pointsTxn.create({
      data: { userId: order.user.id, delta: order.pointsEarned, reason: `Earned on order ${order.number}`, orderId, expiresAt },
    })
    await tx.user.update({ where: { id: order.user.id }, data: { pointsBalance: { increment: order.pointsEarned } } })
  }

  // Which order types pay commission is a store setting (membership fees never do).
  const commissionable =
    order.kind === 'STANDARD' || (order.kind === 'WHOLESALE' && s.affiliate.commissionOnBulk) || (order.kind === 'BOX' && s.affiliate.commissionOnBox)
  if (order.affiliate && order.affiliate.status === 'APPROVED' && commissionable) {
    const base = order.subtotalCents - order.tierDiscountCents - order.couponDiscountCents - order.pointsDiscountCents
    const rate = order.affiliate.commissionRate
    await tx.commission.upsert({
      where: { orderId },
      create: { affiliateId: order.affiliate.id, orderId, baseCents: base, rate, amountCents: Math.round((base * rate) / 100) },
      update: {},
    })
  }

  if (order.kind === 'MEMBERSHIP' && order.user) {
    const meta = (order.meta ?? {}) as { tier?: PaidTier; billing?: 'monthly' | 'yearly' }
    if (meta.tier) {
      const from = order.user.tierExpiresAt && order.user.tierExpiresAt > new Date() && order.user.tier === meta.tier ? order.user.tierExpiresAt : new Date()
      const until = new Date(from)
      if (meta.billing === 'yearly') until.setFullYear(until.getFullYear() + 1)
      else until.setMonth(until.getMonth() + 1)
      await tx.user.update({ where: { id: order.user.id }, data: { tier: meta.tier, tierExpiresAt: until } })
      if (meta.tier === 'FOUNDER' && meta.billing === 'yearly' && s.points.founderYearlyBonus > 0) {
        await tx.pointsTxn.create({
          data: { userId: order.user.id, delta: s.points.founderYearlyBonus, reason: 'Founder yearly welcome points', orderId },
        })
        await tx.user.update({ where: { id: order.user.id }, data: { pointsBalance: { increment: s.points.founderYearlyBonus } } })
      }
    }
  }
}

async function onReversed(tx: Tx, orderId: string, wasPaid: boolean, why: string) {
  const order = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } })
  // Give the coupon use back so a cancelled or refunded order does not burn a limited code.
  if (order.couponCounted && order.couponCode) {
    await tx.coupon.updateMany({ where: { code: order.couponCode, uses: { gt: 0 } }, data: { uses: { decrement: 1 } } })
    await tx.order.update({ where: { id: orderId }, data: { couponCounted: false } })
  }
  for (const it of order.items) {
    // Variants with order history are retired, never deleted, so the row still exists.
    if (it.variantId) await tx.variant.update({ where: { id: it.variantId }, data: { stock: { increment: it.quantity } } })
  }
  if (order.userId) {
    let delta = order.pointsRedeemed
    if (wasPaid) delta -= order.pointsEarned
    // Earned points may already be spent; claw back only what is left so balances never go negative.
    const user = await tx.user.findUniqueOrThrow({ where: { id: order.userId }, select: { pointsBalance: true } })
    if (user.pointsBalance + delta < 0) delta = -user.pointsBalance
    if (delta !== 0) {
      await tx.pointsTxn.create({ data: { userId: order.userId, delta, reason: `${why} order ${order.number}`, orderId } })
      await tx.user.update({ where: { id: order.userId }, data: { pointsBalance: { increment: delta } } })
    }
  }

  // Void the partner commission. If it sits in a payout request that has not been paid yet,
  // pull it out of that request so a refunded sale is never paid to the partner.
  const c = await tx.commission.findUnique({ where: { orderId }, include: { payout: true } })
  if (c && (c.status === 'PENDING' || c.status === 'APPROVED')) {
    if (!c.payout || c.payout.status === 'REQUESTED') {
      if (c.payout) await tx.payout.update({ where: { id: c.payout.id }, data: { amountCents: { decrement: c.amountCents } } })
      await tx.commission.update({ where: { id: c.id }, data: { status: 'VOID', payoutId: null } })
    }
  }
  if (c?.status === 'PAID') {
    await tx.orderEvent.create({
      data: { orderId, type: 'note', message: `Partner commission of RM${(c.amountCents / 100).toFixed(2)} was already paid out. Recover it manually if needed.`, actor: 'system' },
    })
  }
}

/**
 * Releases stock held by checkouts that were never paid. Gateway orders are
 * re-checked with ToyyibPay first so a late payment is never cancelled.
 */
export async function expireUnpaidOrders(reconcileFn: (o: Order) => Promise<unknown>, log: (msg: string) => void) {
  const s = await getSettings()
  const gatewayCutoff = new Date(Date.now() - s.orders.unpaidExpiryDaysOnline * 86400_000)
  const manualCutoff = new Date(Date.now() - s.orders.unpaidExpiryDaysManual * 86400_000)
  const stale = await db.order.findMany({
    where: {
      status: 'PENDING_PAYMENT',
      OR: [
        { billCode: { not: null }, createdAt: { lt: gatewayCutoff } },
        { billCode: null, createdAt: { lt: manualCutoff } },
      ],
    },
    take: 200,
  })
  let cancelled = 0
  for (const o of stale) {
    try {
      if (o.billCode) await reconcileFn(o)
      const fresh = await db.order.findUnique({ where: { id: o.id }, select: { status: true } })
      if (fresh?.status !== 'PENDING_PAYMENT') continue
      await setOrderStatus(o.id, 'CANCELLED', 'system', { note: 'Payment was not received in time, stock released' })
      cancelled++
    } catch (err) {
      log(`Could not expire order ${o.number}: ${(err as Error).message}`)
    }
  }
  if (cancelled) log(`Cancelled ${cancelled} unpaid orders`)
}

export async function setOrderStatus(
  orderId: string,
  next: OrderStatus,
  actor: string,
  extra: { carrier?: string | null; trackingNumber?: string | null; note?: string | null; paymentRef?: string | null } = {},
) {
  let mail: Parameters<typeof mailOrderEvent>[1] | null = null
  const result = await db.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId } })
    if (!order) throw notFound('Order not found')
    if (order.status === next) return order
    if (!ALLOWED[order.status].includes(next)) {
      throw badRequest(`An order that is "${LABEL[order.status]}" cannot move to "${LABEL[next]}"`)
    }
    const wasPaid = LIVE.includes(order.status)
    const now = new Date()
    const data: Prisma.OrderUpdateInput = { status: next }
    if (extra.paymentRef) data.paymentRef = extra.paymentRef
    if (next === 'PAID' || (!wasPaid && LIVE.includes(next))) data.paidAt = order.paidAt ?? now
    if (next === 'SHIPPED') {
      data.shippedAt = now
      if (extra.carrier) data.carrier = extra.carrier
      if (extra.trackingNumber) data.trackingNumber = extra.trackingNumber
    }
    if (next === 'DELIVERED') data.deliveredAt = now
    if (next === 'CANCELLED') data.cancelledAt = now
    if (next === 'REFUNDED') data.refundedAt = now
    const updated = await tx.order.update({ where: { id: orderId }, data })

    if (!wasPaid && LIVE.includes(next)) await onPaid(tx, orderId)
    if (next === 'DELIVERED') {
      await tx.commission.updateMany({ where: { orderId, status: 'PENDING' }, data: { status: 'APPROVED', approvedAt: now } })
    }
    if (next === 'CANCELLED' || next === 'REFUNDED') await onReversed(tx, orderId, wasPaid, next === 'CANCELLED' ? 'Cancelled' : 'Refunded')

    let message = LABEL[next]
    if (next === 'SHIPPED' && (extra.trackingNumber || order.trackingNumber)) {
      message += ` via ${extra.carrier || order.carrier || 'carrier'}, tracking ${extra.trackingNumber || order.trackingNumber}`
    }
    if (extra.note) message += `. ${extra.note}`
    await tx.orderEvent.create({ data: { orderId, type: next.toLowerCase(), message, actor } })
    if (!wasPaid && LIVE.includes(next)) mail = 'paid'
    if (next === 'SHIPPED') mail = 'shipped'
    if (next === 'DELIVERED') mail = 'delivered'
    if (next === 'CANCELLED') mail = 'cancelled'
    if (next === 'REFUNDED') mail = 'refunded'
    return updated
  })
  // Customer emails go out only after the transaction has committed.
  if (mail && actor !== 'seed') mailOrderEvent(orderId, mail)
  // Once an order stops waiting for payment, its other ToyyibPay links must stop taking money.
  if (next !== 'PENDING_PAYMENT' && result.billCode && actor !== 'seed') {
    void closeOpenBills(orderId, (m) => console.warn(m)).catch((e) => console.warn('closeOpenBills failed', e))
  }
  return result
}

export const orderInclude = {
  items: { orderBy: { id: 'asc' } },
  events: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.OrderInclude

export function publicOrder(o: Prisma.OrderGetPayload<{ include: typeof orderInclude }>, paymentInstructions?: string | null) {
  return {
    number: o.number,
    accessKey: o.accessKey,
    kind: o.kind,
    status: o.status,
    email: o.email,
    name: o.name,
    phone: o.phone,
    shippingAddress: o.shippingAddress,
    paymentMethod: o.paymentMethod,
    paymentInstructions: paymentInstructions ?? null,
    subtotalCents: o.subtotalCents,
    tierDiscountCents: o.tierDiscountCents,
    couponDiscountCents: o.couponDiscountCents,
    pointsDiscountCents: o.pointsDiscountCents,
    shippingCents: o.shippingCents,
    taxCents: o.taxCents,
    totalCents: o.totalCents,
    couponCode: o.couponCode,
    pointsRedeemed: o.pointsRedeemed,
    pointsEarned: o.pointsEarned,
    carrier: o.carrier,
    trackingNumber: o.trackingNumber,
    createdAt: o.createdAt,
    paidAt: o.paidAt,
    shippedAt: o.shippedAt,
    deliveredAt: o.deliveredAt,
    items: o.items.map((i) => ({
      name: i.name,
      variantLabel: i.variantLabel,
      image: i.image,
      quantity: i.quantity,
      unitPriceCents: i.unitPriceCents,
      discountPct: i.discountPct,
      lineTotalCents: i.lineTotalCents,
    })),
    events: o.events.map((e) => ({ type: e.type, message: e.message, createdAt: e.createdAt })),
  }
}

export async function paymentInstructionsFor(methodId: string) {
  const s = await getSettings()
  return s.paymentMethods.find((m) => m.id === methodId)?.instructions ?? null
}
