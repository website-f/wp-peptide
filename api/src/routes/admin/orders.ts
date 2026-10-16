import type { FastifyInstance } from 'fastify'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import type { User } from '@prisma/client'
import { db } from '../../lib/db.js'
import { badRequest, notFound, parse, toPage } from '../../lib/http.js'
import { ALLOWED, createOrder, setOrderStatus } from '../../lib/orders.js'
import { buildQuote } from '../../lib/pricing.js'
import { PAYMENT_ISSUE, reconcile } from '../../lib/toyyibpay.js'
import { mailOrderEvent } from '../../lib/mailer.js'
import { getSettings } from '../../lib/settings.js'
import { boxExtras } from '../checkout.js'

const STATUSES = ['PENDING_PAYMENT', 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED'] as const

export async function adminOrderRoutes(app: FastifyInstance) {
  app.get('/orders', async (req) => {
    const q = parse(
      z.object({
        status: z.enum([...STATUSES, 'OPEN']).optional(),
        kind: z.enum(['STANDARD', 'BOX', 'WHOLESALE', 'MEMBERSHIP']).optional(),
        q: z.string().max(80).optional(),
        issue: z.literal('payment').optional(),
        page: z.coerce.number().optional(),
        pageSize: z.coerce.number().optional(),
      }),
      req.query,
    )
    const where: Prisma.OrderWhereInput = { deletedAt: null }
    if (q.status === 'OPEN') where.status = { in: ['PAID', 'PROCESSING'] }
    else if (q.status) where.status = q.status
    if (q.kind) where.kind = q.kind
    if (q.issue === 'payment') where.AND = [PAYMENT_ISSUE]
    if (q.q) {
      where.OR = [
        { number: { contains: q.q, mode: 'insensitive' } },
        { email: { contains: q.q, mode: 'insensitive' } },
        { name: { contains: q.q, mode: 'insensitive' } },
        { trackingNumber: { contains: q.q, mode: 'insensitive' } },
      ]
    }
    const { page, pageSize, skip, take } = toPage(q)
    const [total, rows, counts] = await Promise.all([
      db.order.count({ where }),
      db.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { _count: { select: { items: true } }, affiliate: { select: { code: true } } },
      }),
      db.order.groupBy({ by: ['status'], where: { deletedAt: null }, _count: true }),
    ])
    return {
      total,
      page,
      pageSize,
      counts: Object.fromEntries(counts.map((c) => [c.status, c._count])),
      rows: rows.map((o) => ({
        id: o.id,
        number: o.number,
        kind: o.kind,
        status: o.status,
        name: o.name,
        email: o.email,
        totalCents: o.totalCents,
        paymentMethod: o.paymentMethod,
        itemCount: o._count.items,
        partner: o.affiliate?.code ?? null,
        createdAt: o.createdAt,
        paidAt: o.paidAt,
        trackingNumber: o.trackingNumber,
      })),
    }
  })

  app.get('/orders/:id', async (req) => {
    const { id } = req.params as { id: string }
    const o = await db.order.findUnique({
      where: { id },
      include: {
        items: { orderBy: { id: 'asc' } },
        events: { orderBy: { createdAt: 'asc' } },
        user: { select: { id: true, name: true, email: true, tier: true, createdAt: true, _count: { select: { orders: true } } } },
        affiliate: { select: { id: true, code: true, user: { select: { name: true } } } },
        commission: true,
        subscription: { select: { id: true, status: true, boxesShipped: true, commitMonths: true } },
      },
    })
    if (!o) throw notFound('Order not found')
    return { ...o, nextStatuses: ALLOWED[o.status] }
  })

  app.post('/orders/:id/status', async (req) => {
    const admin = (req as unknown as { admin: User }).admin
    const { id } = req.params as { id: string }
    const body = parse(
      z.object({
        status: z.enum(STATUSES),
        carrier: z.string().max(60).optional(),
        trackingNumber: z.string().max(80).optional(),
        paymentRef: z.string().max(120).optional(),
        note: z.string().max(500).optional(),
      }),
      req.body,
    )
    if (body.status === 'SHIPPED' && !body.trackingNumber) {
      const o = await db.order.findUnique({ where: { id }, select: { trackingNumber: true, kind: true } })
      if (!o?.trackingNumber && o?.kind !== 'MEMBERSHIP') throw badRequest('Add a tracking number before marking as shipped')
    }
    await setOrderStatus(id, body.status, admin.email, body)
    return { ok: true }
  })

  app.post('/orders/:id/check-payment', async (req) => {
    const admin = (req as unknown as { admin: User }).admin
    const { id } = req.params as { id: string }
    const o = await db.order.findUnique({ where: { id } })
    if (!o) throw notFound('Order not found')
    if (!o.billCode) throw badRequest('This order has no online payment bill')
    return { result: await reconcile(o, admin.email) }
  })

  app.patch('/orders/:id', async (req) => {
    const admin = (req as unknown as { admin: User }).admin
    const { id } = req.params as { id: string }
    const body = parse(
      z.object({
        adminNote: z.string().max(2000).nullable().optional(),
        carrier: z.string().max(60).nullable().optional(),
        trackingNumber: z.string().max(80).nullable().optional(),
        paymentRef: z.string().max(120).nullable().optional(),
      }),
      req.body,
    )
    const before = await db.order.findUnique({ where: { id } })
    if (!before) throw notFound('Order not found')
    const o = await db.order.update({ where: { id }, data: body })
    if (body.trackingNumber && body.trackingNumber !== before.trackingNumber) {
      await db.orderEvent.create({
        data: { orderId: id, type: 'tracking', message: `Tracking updated: ${o.carrier ?? 'carrier'} ${o.trackingNumber}`, actor: admin.email },
      })
    }
    return { ok: true }
  })

  // Generates the next monthly box as a new order awaiting payment.
  app.post('/subscriptions/:id/next-box', async (req) => {
    const admin = (req as unknown as { admin: User }).admin
    const { id } = req.params as { id: string }
    const sub = await db.subscription.findUnique({ where: { id }, include: { user: true } })
    if (!sub) throw notFound('Subscription not found')
    if (sub.status !== 'ACTIVE') throw badRequest('Only active subscriptions can ship a new box')
    const items = sub.items as { variantId: string; quantity: number }[]
    const quote = await buildQuote({ items, mode: 'box', user: sub.user })
    const order = await createOrder({
      quote,
      kind: 'BOX',
      user: sub.user,
      email: sub.email,
      name: sub.name,
      phone: sub.user?.phone,
      address: sub.shippingAddress as never,
      // Keep the payment method the subscriber chose for their first box.
      paymentMethod: (await db.order.findFirst({ where: { subscriptionId: sub.id }, orderBy: { createdAt: 'desc' }, select: { paymentMethod: true } }))?.paymentMethod ?? 'toyyibpay',
      subscriptionId: sub.id,
      meta: { box: sub.boxesShipped + 1 },
      extraItems: boxExtras((await getSettings()).box.includedItem),
    })
    // An overdue subscription moves to a month from today, not a month from the missed date.
    const next = new Date(Math.max(sub.nextShipAt.getTime(), Date.now()))
    next.setMonth(next.getMonth() + 1)
    await db.subscription.update({
      where: { id },
      data: { boxesShipped: { increment: 1 }, nextShipAt: next, priceCents: quote.totalCents },
    })
    await db.orderEvent.create({ data: { orderId: order.id, type: 'note', message: `Box ${sub.boxesShipped + 1} generated`, actor: admin.email } })
    // The customer gets a payment link for this month's box.
    mailOrderEvent(order.id, 'created')
    return { id: order.id, number: order.number }
  })

  app.get('/subscriptions', async (req) => {
    const q = parse(z.object({ status: z.enum(['ACTIVE', 'PAUSED', 'CANCELLED', 'COMPLETED']).optional() }), req.query)
    const subs = await db.subscription.findMany({
      where: q.status ? { status: q.status } : {},
      orderBy: { nextShipAt: 'asc' },
      include: { orders: { select: { id: true, number: true, status: true, createdAt: true }, orderBy: { createdAt: 'desc' } } },
    })
    return subs
  })

  app.patch('/subscriptions/:id', async (req) => {
    const { id } = req.params as { id: string }
    const body = parse(
      z.object({ status: z.enum(['ACTIVE', 'PAUSED', 'CANCELLED', 'COMPLETED']).optional(), nextShipAt: z.coerce.date().optional() }),
      req.body,
    )
    await db.subscription.update({
      where: { id },
      data: { ...body, cancelledAt: body.status === 'CANCELLED' ? new Date() : body.status === 'ACTIVE' ? null : undefined },
    })
    return { ok: true }
  })
}
