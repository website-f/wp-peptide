import type { FastifyInstance } from 'fastify'
import type { Order } from '@prisma/client'
import { z } from 'zod'
import { currentUser, hashPassword, requireUser, setSession } from '../lib/auth.js'
import { db } from '../lib/db.js'
import { HttpError, badRequest, notFound, parse } from '../lib/http.js'
import { createMembershipOrder, createOrder, orderInclude, paymentInstructionsFor, publicOrder } from '../lib/orders.js'
import { buildQuote, publicQuote } from '../lib/pricing.js'
import { getSettings, type PaymentMethod } from '../lib/settings.js'
import { gatewayReady } from '../lib/gateway.js'
import { createBill } from '../lib/toyyibpay.js'
import { mailOrderEvent } from '../lib/mailer.js'
import { passwordSchema } from './auth.js'

const itemsSchema = z
  .array(z.object({ variantId: z.string().min(1).max(40), quantity: z.number().int().min(1).max(1000) }))
  .min(1)
  .max(60)

export const addressSchema = z.object({
  line1: z.string().trim().min(1, 'Street address is required').max(160),
  line2: z.string().trim().max(160).optional().default(''),
  city: z.string().trim().min(1, 'City is required').max(80),
  state: z.string().trim().min(1, 'State is required').max(80),
  postalCode: z.string().trim().min(3, 'Postal code is required').max(16),
  country: z.string().trim().min(2).max(60).default('United States'),
})

const contactSchema = z.object({
  email: z.email('Enter a valid email').max(160),
  name: z.string().trim().min(1, 'Name is required').max(120),
  phone: z.string().trim().min(9, 'Phone number is required for payment').max(40),
  address: addressSchema,
  paymentMethod: z.string().min(1).max(40),
  note: z.string().max(1000).optional(),
  confirmResearch: z.literal(true, { error: 'Please confirm the research-use terms' }),
})

/** For gateway methods, create the ToyyibPay bill right away so checkout can redirect. */
async function startPayment(order: Order, method: PaymentMethod) {
  mailOrderEvent(order.id, 'created')
  if (method.type !== 'gateway') return { paymentUrl: null, paymentError: null }
  try {
    return { paymentUrl: (await createBill(order)).paymentUrl, paymentError: null }
  } catch (err) {
    // The order is safe; the shopper can retry payment from the order page.
    return { paymentUrl: null, paymentError: (err as Error).message }
  }
}

/** The free item packed with every box, from settings (empty = none). */
export const boxExtras = (item: string) => (item.trim() ? [{ name: item.trim(), variantLabel: 'Included with your box', quantity: 1, unitPriceCents: 0 }] : [])

async function checkPaymentMethod(id: string) {
  const s = await getSettings()
  const m = s.paymentMethods.find((x) => x.id === id && x.enabled)
  if (!m) throw badRequest('Choose a payment method')
  if (m.type === 'gateway' && !(await gatewayReady())) throw badRequest('Online payment is not available right now. Choose another payment method.')
  return m
}

export async function checkoutRoutes(app: FastifyInstance) {
  app.post('/api/cart/quote', async (req) => {
    const body = parse(
      z.object({
        items: itemsSchema,
        mode: z.enum(['standard', 'wholesale', 'box']).default('standard'),
        couponCode: z.string().max(40).nullish(),
        refCode: z.string().max(40).nullish(),
        redeemPoints: z.number().int().min(0).optional(),
      }),
      req.body,
    )
    const user = await currentUser(req)
    return publicQuote(await buildQuote({ ...body, user }))
  })

  app.post('/api/orders', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const body = parse(
      contactSchema.extend({
        items: itemsSchema,
        mode: z.enum(['standard', 'wholesale']).default('standard'),
        couponCode: z.string().max(40).nullish(),
        refCode: z.string().max(40).nullish(),
        redeemPoints: z.number().int().min(0).optional(),
        createPassword: passwordSchema.optional(),
      }),
      req.body,
    )
    const method = await checkPaymentMethod(body.paymentMethod)
    let user = await currentUser(req)
    if (!user && body.createPassword) {
      const email = body.email.toLowerCase()
      if (await db.user.findUnique({ where: { email } })) {
        throw new HttpError(409, 'An account already uses this email. Sign in to check out with it, or continue as a guest.')
      }
      user = await db.user.create({
        data: { email, name: body.name, phone: body.phone || null, passwordHash: await hashPassword(body.createPassword) },
      })
      setSession(reply, user)
    }
    // Email is passed so per-customer and first-order code limits also apply to guests.
    const quote = await buildQuote({ ...body, user, email: user?.email ?? body.email })
    if (body.couponCode && quote.couponError) throw badRequest(quote.couponError)
    const order = await createOrder({
      quote,
      kind: body.mode === 'wholesale' ? 'WHOLESALE' : 'STANDARD',
      user,
      email: user?.email ?? body.email,
      name: body.name,
      phone: body.phone,
      address: body.address,
      paymentMethod: body.paymentMethod,
      customerNote: body.note,
    })
    return { number: order.number, accessKey: order.accessKey, ...(await startPayment(order, method)) }
  })

  // Guests view their order with the private key from the confirmation link; owners and admins without it.
  app.get('/api/orders/:number', async (req) => {
    const { number } = req.params as { number: string }
    const { key } = req.query as { key?: string }
    const order = await db.order.findUnique({ where: { number }, include: orderInclude })
    if (!order) throw notFound('Order not found')
    const user = await currentUser(req)
    const allowed = (key && key === order.accessKey) || (user && (user.id === order.userId || user.role === 'ADMIN'))
    if (!allowed) throw notFound('Order not found')
    const instructions = order.status === 'PENDING_PAYMENT' ? await paymentInstructionsFor(order.paymentMethod) : null
    return publicOrder(order, instructions)
  })

  app.post('/api/box', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const user = await requireUser(req)
    const body = parse(
      contactSchema.extend({ items: itemsSchema, couponCode: z.string().max(40).nullish(), refCode: z.string().max(40).nullish() }),
      req.body,
    )
    const method = await checkPaymentMethod(body.paymentMethod)
    const s = await getSettings()
    const quote = await buildQuote({ items: body.items, mode: 'box', user, couponCode: body.couponCode, refCode: body.refCode })
    if (body.couponCode && quote.couponError) throw badRequest(quote.couponError)
    const next = new Date()
    next.setMonth(next.getMonth() + 1)
    const sub = await db.subscription.create({
      data: {
        userId: user.id,
        email: user.email,
        name: body.name,
        shippingAddress: body.address,
        items: quote.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity, name: l.name, variantLabel: l.variantLabel })),
        // The recurring price is before any one-off code used on the first box.
        priceCents: quote.totalCents + quote.couponDiscountCents,
        commitMonths: s.box.commitMonths,
        boxesShipped: 1,
        nextShipAt: next,
      },
    })
    const order = await createOrder({
      quote,
      kind: 'BOX',
      user,
      email: user.email,
      name: body.name,
      phone: body.phone,
      address: body.address,
      paymentMethod: body.paymentMethod,
      customerNote: body.note,
      subscriptionId: sub.id,
      meta: { box: 1 },
      extraItems: boxExtras(s.box.includedItem),
    })
    return { number: order.number, accessKey: order.accessKey, subscriptionId: sub.id, ...(await startPayment(order, method)) }
  })

  app.post('/api/membership', async (req) => {
    const user = await requireUser(req)
    if (!(await getSettings()).features.membership) throw badRequest('Membership is not available right now')
    const body = parse(
      z.object({ tier: z.enum(['INSIDER', 'VIP', 'FOUNDER']), billing: z.enum(['monthly', 'yearly']), paymentMethod: z.string().min(1).max(40) }),
      req.body,
    )
    const method = await checkPaymentMethod(body.paymentMethod)
    const pending = await db.order.findFirst({ where: { userId: user.id, kind: 'MEMBERSHIP', status: 'PENDING_PAYMENT' } })
    if (pending) throw badRequest(`You already have a membership request waiting for payment (order ${pending.number})`)
    const order = await createMembershipOrder(user, body.tier, body.billing, body.paymentMethod)
    return { number: order.number, accessKey: order.accessKey, ...(await startPayment(order, method)) }
  })
}
