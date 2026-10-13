import type { FastifyInstance } from 'fastify'
import type { OrderStatus } from '@prisma/client'
import { z } from 'zod'
import { db } from '../../lib/db.js'
import { csvEscape, parse } from '../../lib/http.js'
import { getSettings } from '../../lib/settings.js'

export const LIVE: OrderStatus[] = ['PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED']

// Reports follow the store's local day (Malaysia, UTC+8, no daylight saving), so an
// order paid at 7am lands on that day rather than the previous UTC day.
const STORE_OFFSET_MS = 8 * 3600_000
const local = (d: Date) => new Date(d.getTime() + STORE_OFFSET_MS)
const dayKey = (d: Date) => local(d).toISOString().slice(0, 10)
const monthKey = (d: Date) => local(d).toISOString().slice(0, 7)

function buckets(from: Date, to: Date, by: 'day' | 'month') {
  const out: string[] = []
  const f = local(from)
  const end = local(to)
  const d = new Date(Date.UTC(f.getUTCFullYear(), f.getUTCMonth(), by === 'day' ? f.getUTCDate() : 1))
  while (d <= end) {
    out.push(by === 'day' ? d.toISOString().slice(0, 10) : d.toISOString().slice(0, 7))
    if (by === 'day') d.setUTCDate(d.getUTCDate() + 1)
    else d.setUTCMonth(d.getUTCMonth() + 1)
  }
  return out
}

const pct = (now: number, before: number) => (before === 0 ? (now > 0 ? 100 : 0) : Math.round(((now - before) / before) * 1000) / 10)

function rangeFrom(q: { from?: string; to?: string; days?: number }) {
  const to = q.to ? new Date(`${q.to}T23:59:59.999+08:00`) : new Date()
  if (q.from) return { from: new Date(`${q.from}T00:00:00.000+08:00`), to }
  // Start of the store-local day, (days - 1) days back.
  const startLocal = local(new Date(to.getTime() - ((q.days ?? 30) - 1) * 86400_000))
  startLocal.setUTCHours(0, 0, 0, 0)
  return { from: new Date(startLocal.getTime() - STORE_OFFSET_MS), to }
}

export async function reportRoutes(app: FastifyInstance) {
  app.get('/dashboard', async (req) => {
    const q = parse(z.object({ days: z.coerce.number().int().min(1).max(365).default(30) }), req.query)
    const { from, to } = rangeFrom(q)
    const span = to.getTime() - from.getTime()
    const prevFrom = new Date(from.getTime() - span)
    const lowAt = (await getSettings()).inventory.lowStockThreshold

    const [paid, prevPaid, statusCounts, newCustomers, prevCustomers, totalCustomers, recent, lowStock, affPending, payoutReqs, owed, unread, activeSubs] =
      await Promise.all([
        db.order.findMany({
          where: { paidAt: { gte: from, lte: to }, status: { in: LIVE } },
          select: { id: true, totalCents: true, paidAt: true, kind: true },
        }),
        db.order.aggregate({ where: { paidAt: { gte: prevFrom, lt: from }, status: { in: LIVE } }, _sum: { totalCents: true }, _count: true }),
        db.order.groupBy({ by: ['status'], _count: true }),
        db.user.count({ where: { role: 'CUSTOMER', createdAt: { gte: from, lte: to } } }),
        db.user.count({ where: { role: 'CUSTOMER', createdAt: { gte: prevFrom, lt: from } } }),
        db.user.count({ where: { role: 'CUSTOMER' } }),
        db.order.findMany({
          orderBy: { createdAt: 'desc' },
          take: 8,
          select: { id: true, number: true, name: true, email: true, totalCents: true, status: true, kind: true, createdAt: true },
        }),
        db.variant.findMany({
          where: { active: true, stock: { lte: lowAt }, product: { status: 'ACTIVE' } },
          orderBy: { stock: 'asc' },
          take: 8,
          include: { product: { select: { id: true, name: true, image: true } } },
        }),
        db.affiliate.count({ where: { status: 'PENDING' } }),
        db.payout.aggregate({ where: { status: 'REQUESTED' }, _sum: { amountCents: true }, _count: true }),
        db.commission.aggregate({ where: { status: { in: ['PENDING', 'APPROVED'] } }, _sum: { amountCents: true } }),
        db.contactMessage.count({ where: { handled: false } }),
        db.subscription.count({ where: { status: 'ACTIVE' } }),
      ])

    const revenue = paid.reduce((a, o) => a + o.totalCents, 0)
    const prevRevenue = prevPaid._sum.totalCents ?? 0
    const series = buckets(from, to, 'day').map((date) => ({ date, revenueCents: 0, orders: 0 }))
    const idx = new Map(series.map((s) => [s.date, s]))
    for (const o of paid) {
      const row = idx.get(dayKey(o.paidAt!))
      if (row) {
        row.revenueCents += o.totalCents
        row.orders++
      }
    }

    const top = await db.orderItem.groupBy({
      by: ['productId'],
      where: { productId: { not: null }, order: { paidAt: { gte: from, lte: to }, status: { in: LIVE } } },
      _sum: { lineTotalCents: true, quantity: true },
      orderBy: { _sum: { lineTotalCents: 'desc' } },
      take: 6,
    })
    const topProducts = await db.product.findMany({ where: { id: { in: top.map((t) => t.productId!) } }, select: { id: true, name: true, image: true } })

    const count = (s: OrderStatus) => statusCounts.find((c) => c.status === s)?._count ?? 0
    return {
      range: { from, to },
      kpis: {
        revenueCents: revenue,
        revenueDelta: pct(revenue, prevRevenue),
        orders: paid.length,
        ordersDelta: pct(paid.length, prevPaid._count),
        aovCents: paid.length ? Math.round(revenue / paid.length) : 0,
        aovDelta: pct(paid.length ? revenue / paid.length : 0, prevPaid._count ? prevRevenue / prevPaid._count : 0),
        newCustomers,
        customersDelta: pct(newCustomers, prevCustomers),
        totalCustomers,
        activeSubscriptions: activeSubs,
      },
      queue: {
        awaitingPayment: count('PENDING_PAYMENT'),
        toFulfil: count('PAID') + count('PROCESSING'),
        inTransit: count('SHIPPED'),
        partnerApplications: affPending,
        payoutRequests: payoutReqs._count,
        payoutRequestedCents: payoutReqs._sum.amountCents ?? 0,
        commissionsOwedCents: owed._sum.amountCents ?? 0,
        unreadMessages: unread,
      },
      series,
      topProducts: top.map((t) => ({
        ...topProducts.find((p) => p.id === t.productId),
        revenueCents: t._sum.lineTotalCents ?? 0,
        units: t._sum.quantity ?? 0,
      })),
      recentOrders: recent,
      lowStock: lowStock.map((v) => ({ variantId: v.id, label: v.label, stock: v.stock, product: v.product })),
    }
  })

  const financeQuery = z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    days: z.coerce.number().int().min(1).max(1100).optional(),
  })

  app.get('/finance', async (req) => {
    const { from, to } = rangeFrom(parse(financeQuery, req.query))
    const by: 'day' | 'month' = to.getTime() - from.getTime() > 92 * 86400_000 ? 'month' : 'day'

    const [orders, refunded, liability, owed, paidOut] = await Promise.all([
      db.order.findMany({
        where: { paidAt: { gte: from, lte: to } },
        include: { commission: { select: { amountCents: true, status: true } } },
      }),
      // Money returned: refunds, plus orders that were paid and then cancelled.
      db.order.findMany({
        where: { OR: [{ refundedAt: { gte: from, lte: to } }, { status: 'CANCELLED', paidAt: { not: null }, cancelledAt: { gte: from, lte: to } }] },
        select: { totalCents: true, refundedAt: true, cancelledAt: true },
      }),
      db.user.aggregate({ _sum: { pointsBalance: true } }),
      db.commission.aggregate({ where: { status: { in: ['PENDING', 'APPROVED'] } }, _sum: { amountCents: true } }),
      db.payout.aggregate({ where: { status: 'PAID', paidAt: { gte: from, lte: to } }, _sum: { amountCents: true } }),
    ])

    const kept = orders.filter((o) => o.status !== 'REFUNDED' && o.status !== 'CANCELLED')
    const sum = (rows: typeof orders, f: (o: (typeof orders)[number]) => number) => rows.reduce((a, o) => a + f(o), 0)
    const netSales = (o: (typeof orders)[number]) => o.subtotalCents - o.tierDiscountCents - o.couponDiscountCents - o.pointsDiscountCents
    const commission = (o: (typeof orders)[number]) => (o.commission && o.commission.status !== 'VOID' ? o.commission.amountCents : 0)

    const summary = {
      orders: orders.length,
      grossSalesCents: sum(orders, (o) => o.subtotalCents),
      tierDiscountCents: sum(orders, (o) => o.tierDiscountCents),
      couponDiscountCents: sum(orders, (o) => o.couponDiscountCents),
      pointsDiscountCents: sum(orders, (o) => o.pointsDiscountCents),
      netSalesCents: sum(orders, netSales),
      shippingCents: sum(orders, (o) => o.shippingCents),
      taxCents: sum(orders, (o) => o.taxCents),
      collectedCents: sum(orders, (o) => o.totalCents),
      refundsCents: refunded.reduce((a, o) => a + o.totalCents, 0),
      cogsCents: sum(kept, (o) => o.costCents),
      commissionsCents: sum(kept, commission),
      payoutsPaidCents: paidOut._sum.amountCents ?? 0,
      commissionsOwedCents: owed._sum.amountCents ?? 0,
      pointsLiabilityCents: liability._sum.pointsBalance ?? 0,
      netRevenueCents: 0,
      grossProfitCents: 0,
      netProfitCents: 0,
      marginPct: 0,
    }
    summary.netRevenueCents = summary.collectedCents - summary.refundsCents
    summary.grossProfitCents = sum(kept, netSales) - summary.cogsCents
    summary.netProfitCents = summary.grossProfitCents - summary.commissionsCents
    summary.marginPct = sum(kept, netSales) > 0 ? Math.round((summary.netProfitCents / sum(kept, netSales)) * 1000) / 10 : 0

    const series = buckets(from, to, by).map((period) => ({ period, revenueCents: 0, refundsCents: 0, profitCents: 0, orders: 0 }))
    const idx = new Map(series.map((s) => [s.period, s]))
    const key = by === 'day' ? dayKey : monthKey
    for (const o of orders) {
      const row = idx.get(key(o.paidAt!))
      if (!row) continue
      row.revenueCents += o.totalCents
      row.orders++
      if (o.status !== 'REFUNDED' && o.status !== 'CANCELLED') row.profitCents += netSales(o) - o.costCents - commission(o)
    }
    for (const r of refunded) {
      const row = idx.get(key((r.refundedAt ?? r.cancelledAt)!))
      if (row) row.refundsCents += r.totalCents
    }

    const group = (f: (o: (typeof orders)[number]) => string) => {
      const m = new Map<string, { key: string; orders: number; revenueCents: number }>()
      for (const o of orders) {
        const k = f(o)
        const row = m.get(k) ?? { key: k, orders: 0, revenueCents: 0 }
        row.orders++
        row.revenueCents += o.totalCents
        m.set(k, row)
      }
      return [...m.values()].sort((a, b) => b.revenueCents - a.revenueCents)
    }

    const items = await db.orderItem.groupBy({
      by: ['productId', 'name'],
      where: { productId: { not: null }, order: { paidAt: { gte: from, lte: to }, status: { in: LIVE } } },
      _sum: { lineTotalCents: true, quantity: true },
    })
    const costs = await db.orderItem.findMany({
      where: { productId: { not: null }, order: { paidAt: { gte: from, lte: to }, status: { in: LIVE } } },
      select: { productId: true, unitCostCents: true, quantity: true },
    })
    const costBy = new Map<string, number>()
    for (const c of costs) costBy.set(c.productId!, (costBy.get(c.productId!) ?? 0) + c.unitCostCents * c.quantity)
    const products = items
      .map((i) => {
        const revenue = i._sum.lineTotalCents ?? 0
        const cost = costBy.get(i.productId!) ?? 0
        return { productId: i.productId, name: i.name, units: i._sum.quantity ?? 0, revenueCents: revenue, costCents: cost, marginPct: revenue ? Math.round(((revenue - cost) / revenue) * 1000) / 10 : 0 }
      })
      .sort((a, b) => b.revenueCents - a.revenueCents)

    return {
      range: { from, to, by },
      summary,
      series,
      byKind: group((o) => o.kind),
      byPaymentMethod: group((o) => o.paymentMethod),
      products,
    }
  })

  app.get('/finance/export.csv', async (req, reply) => {
    const { from, to } = rangeFrom(parse(financeQuery, req.query))
    const orders = await db.order.findMany({
      where: { createdAt: { gte: from, lte: to } },
      orderBy: { createdAt: 'asc' },
      include: { affiliate: { select: { code: true } }, commission: { select: { amountCents: true, status: true } } },
    })
    const head = [
      'order', 'created_at', 'paid_at', 'status', 'kind', 'customer', 'email', 'payment_method', 'payment_ref',
      'subtotal', 'tier_discount', 'coupon_discount', 'points_discount', 'shipping', 'tax', 'total', 'cost',
      'coupon', 'partner', 'commission', 'commission_status',
    ]
    const money = (c: number) => (c / 100).toFixed(2)
    const rows = orders.map((o) =>
      [
        o.number, o.createdAt.toISOString(), o.paidAt?.toISOString() ?? '', o.status, o.kind, o.name, o.email, o.paymentMethod, o.paymentRef ?? '',
        money(o.subtotalCents), money(o.tierDiscountCents), money(o.couponDiscountCents), money(o.pointsDiscountCents),
        money(o.shippingCents), money(o.taxCents), money(o.totalCents), money(o.costCents),
        o.couponCode ?? '', o.affiliate?.code ?? '', o.commission ? money(o.commission.amountCents) : '', o.commission?.status ?? '',
      ]
        .map(csvEscape)
        .join(','),
    )
    reply.header('content-type', 'text/csv; charset=utf-8')
    reply.header('content-disposition', `attachment; filename="kyvo-orders-${dayKey(from)}-to-${dayKey(to)}.csv"`)
    return [head.join(','), ...rows].join('\n')
  })
}
