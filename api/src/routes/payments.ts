import formbody from '@fastify/formbody'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { currentUser } from '../lib/auth.js'
import { db } from '../lib/db.js'
import { badRequest, notFound, parse } from '../lib/http.js'
import { getSettings } from '../lib/settings.js'
import { createBill, reconcile, validCallbackHash } from '../lib/toyyibpay.js'

async function findOwnedOrder(number: string, key: string | undefined, req: Parameters<typeof currentUser>[0]) {
  const order = await db.order.findUnique({ where: { number } })
  if (!order) throw notFound('Order not found')
  const user = await currentUser(req)
  const allowed = (key && key === order.accessKey) || (user && (user.id === order.userId || user.role === 'ADMIN'))
  if (!allowed) throw notFound('Order not found')
  return order
}

export async function paymentRoutes(app: FastifyInstance) {
  // ToyyibPay posts its callback as a form. The parser is scoped to this plugin only, so the
  // rest of the API accepts JSON alone (no cross-site form submissions to cookie-auth routes).
  await app.register(formbody)

  // Starts (or resumes) online payment for an order and returns the gateway URL.
  app.post('/api/payments/toyyibpay/start', { config: { rateLimit: { max: 15, timeWindow: '1 minute' } } }, async (req) => {
    const body = parse(z.object({ number: z.string().max(20), key: z.string().max(60).optional() }), req.body)
    const order = await findOwnedOrder(body.number, body.key, req)
    if (order.status !== 'PENDING_PAYMENT') throw badRequest('This order no longer needs payment')
    const s = await getSettings()
    const method = s.paymentMethods.find((m) => m.id === order.paymentMethod)
    if (method?.type !== 'gateway') throw badRequest('This order uses an offline payment method')
    // A previous bill may already be paid (e.g. the shopper closed the tab before returning).
    if (order.billCode) {
      const r = await reconcile(order, 'toyyibpay')
      if (r === 'paid') return { paid: true }
    }
    // Bills expire after 3 days, so always issue a fresh one when resuming.
    const { paymentUrl } = await createBill(order)
    return { paid: false, paymentUrl }
  })

  // Called by the order page when the shopper lands back from ToyyibPay.
  app.post('/api/payments/toyyibpay/verify', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const body = parse(z.object({ number: z.string().max(20), key: z.string().max(60).optional() }), req.body)
    const order = await findOwnedOrder(body.number, body.key, req)
    const result = await reconcile(order, 'toyyibpay')
    const fresh = await db.order.findUniqueOrThrow({ where: { id: order.id }, select: { status: true, paymentStatusNote: true } })
    return { result, status: fresh.status, note: fresh.paymentStatusNote }
  })

  // Server-to-server callback. The hash proves it came from ToyyibPay; we still
  // re-query the bill so a replayed or tampered callback cannot mark an order paid.
  app.post('/api/payments/toyyibpay/callback', async (req, reply) => {
    const body = (req.body ?? {}) as Record<string, string | undefined>
    if (!validCallbackHash(body)) {
      req.log.warn({ order: body.order_id }, 'toyyibpay callback with bad hash')
      return reply.status(400).send('bad hash')
    }
    const order = body.order_id ? await db.order.findUnique({ where: { number: body.order_id } }) : null
    if (order) {
      try {
        await reconcile(order, 'toyyibpay-callback')
      } catch (err) {
        req.log.error(err, 'toyyibpay reconcile failed')
        return reply.status(500).send('retry')
      }
    }
    return reply.send('OK')
  })
}
