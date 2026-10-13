import type { FastifyInstance } from 'fastify'
import { requireUser } from '../lib/auth.js'
import { db } from '../lib/db.js'
import { badRequest, notFound } from '../lib/http.js'

export async function accountRoutes(app: FastifyInstance) {
  app.get('/api/account/orders', async (req) => {
    const user = await requireUser(req)
    const orders = await db.order.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      include: { items: { select: { name: true, variantLabel: true, quantity: true, image: true } } },
      take: 100,
    })
    return orders.map((o) => ({
      number: o.number,
      kind: o.kind,
      status: o.status,
      totalCents: o.totalCents,
      createdAt: o.createdAt,
      trackingNumber: o.trackingNumber,
      carrier: o.carrier,
      items: o.items,
    }))
  })

  app.get('/api/account/points', async (req) => {
    const user = await requireUser(req)
    const txns = await db.pointsTxn.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 200 })
    const lifetime = txns.filter((t) => t.delta > 0).reduce((a, t) => a + t.delta, 0)
    return {
      balance: user.pointsBalance,
      tier: user.tier,
      tierExpiresAt: user.tierExpiresAt,
      lifetimeEarned: lifetime,
      txns: txns.map((t) => ({ id: t.id, delta: t.delta, reason: t.reason, createdAt: t.createdAt, expiresAt: t.expiresAt })),
    }
  })

  app.get('/api/account/subscriptions', async (req) => {
    const user = await requireUser(req)
    const subs = await db.subscription.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      include: { orders: { select: { number: true, status: true, createdAt: true }, orderBy: { createdAt: 'desc' } } },
    })
    return subs.map((s) => ({
      id: s.id,
      status: s.status,
      items: s.items,
      priceCents: s.priceCents,
      commitMonths: s.commitMonths,
      boxesShipped: s.boxesShipped,
      nextShipAt: s.nextShipAt,
      createdAt: s.createdAt,
      orders: s.orders,
    }))
  })

  app.post('/api/account/subscriptions/:id/cancel', async (req) => {
    const user = await requireUser(req)
    const { id } = req.params as { id: string }
    const sub = await db.subscription.findFirst({ where: { id, userId: user.id } })
    if (!sub) throw notFound('Subscription not found')
    if (sub.status === 'CANCELLED' || sub.status === 'COMPLETED') return { ok: true }
    if (sub.boxesShipped < sub.commitMonths) {
      const left = sub.commitMonths - sub.boxesShipped
      throw badRequest(`Your box has a ${sub.commitMonths}-month minimum. You can cancel after ${left} more ${left === 1 ? 'box' : 'boxes'}.`)
    }
    await db.subscription.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: new Date() } })
    return { ok: true }
  })
}
