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
  app.post('/api/payments/toyyibpay/callback', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req, reply) => {
    // ToyyibPay posts the callback as multipart/form-data; accept url-encoded too.
    const body: Record<string, string | undefined> = {}
    if (req.isMultipart()) {
      for await (const part of req.parts()) {
        if (part.type === 'field') body[part.fieldname] = String(part.value)
        else await part.toBuffer() // drain any unexpected file part
      }
    } else Object.assign(body, (req.body ?? {}) as Record<string, string | undefined>)

    const order = body.order_id ? await db.order.findUnique({ where: { number: String(body.order_id).slice(0, 20) } }) : null
    const signed = validCallbackHash(body)
    // The signature proves origin, but reconcile() is the real gate: it asks ToyyibPay's API
    // for the bill's status and amount. So an unsigned callback that names a bill we actually
    // issued for that order may still trigger that (read-only) re-check; it can never mark an
    // order paid by itself.
    const knownBill = Boolean(order && order.billCode && body.billcode && body.billcode === order.billCode)
    if (!signed) {
      req.log.warn(
        { order: body.order_id, contentType: req.headers['content-type']?.split(';')[0], fields: Object.keys(body), knownBill },
        'toyyibpay callback signature mismatch',
      )
      if (!knownBill) return reply.status(400).send('bad hash')
    }
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
