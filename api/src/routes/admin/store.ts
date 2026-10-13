import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { db } from '../../lib/db.js'
import { env } from '../../lib/env.js'
import { badRequest, csvEscape, parse } from '../../lib/http.js'
import { getSettings, saveSettings } from '../../lib/settings.js'
import { toyyibEnabled } from '../../lib/toyyibpay.js'

const couponSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,24}$/, 'Codes are 3-24 letters, numbers, dashes'),
  type: z.enum(['PERCENT', 'FIXED']),
  value: z.number().int().min(1),
  minSubtotal: z.number().int().min(0).default(0),
  maxUses: z.number().int().min(1).nullable().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
  active: z.boolean().default(true),
  description: z.string().max(200).nullable().optional(),
})

const ladder = z.array(z.object({ min: z.number().int().min(1), pct: z.number().int().min(0).max(90) })).max(6)

const settingsSchema = z
  .object({
    storeName: z.string().min(1).max(40),
    features: z.object({ membership: z.boolean() }),
    supportEmail: z.email(),
    announcement: z.string().max(200),
    shipping: z.object({
      flatCents: z.number().int().min(0),
      freeThresholdCents: z.number().int().min(0),
      carrier: z.string().max(60),
      cutoff: z.string().max(30),
    }),
    taxPct: z.number().min(0).max(30),
    tiers: ladder,
    wholesale: ladder,
    box: z.object({ slots: z.number().int().min(1).max(8), pct: z.number().int().min(0).max(90), commitMonths: z.number().int().min(1).max(24) }),
    affiliate: z.object({
      defaultRate: z.number().int().min(0).max(60),
      cookieDays: z.number().int().min(1).max(365),
      couponPct: z.number().int().min(0).max(50),
      minPayoutCents: z.number().int().min(0),
    }),
    points: z.object({
      perDollar: z.object({ MEMBER: z.number().min(0), INSIDER: z.number().min(0), VIP: z.number().min(0), FOUNDER: z.number().min(0) }),
      bonusThresholdCents: z.number().int().min(0),
      bonusPoints: z.number().int().min(0),
      maxRedeemPct: z.number().int().min(0).max(100),
      expiryMonths: z.number().int().min(1).max(60),
      founderYearlyBonus: z.number().int().min(0),
    }),
    membership: z.object({
      INSIDER: z.object({ monthlyCents: z.number().int().min(0), yearlyCents: z.number().int().min(0) }),
      VIP: z.object({ monthlyCents: z.number().int().min(0), yearlyCents: z.number().int().min(0) }),
      FOUNDER: z.object({ monthlyCents: z.number().int().min(0), yearlyCents: z.number().int().min(0) }),
    }),
    paymentMethods: z
      .array(
        z.object({
          id: z.string().regex(/^[a-z0-9_-]{2,24}$/),
          label: z.string().min(1).max(60),
          type: z.enum(['gateway', 'manual']),
          instructions: z.string().max(1500),
          enabled: z.boolean(),
        }),
      )
      .max(8),
  })
  .partial()

export async function adminStoreRoutes(app: FastifyInstance) {
  app.get('/coupons', async () => db.coupon.findMany({ orderBy: [{ active: 'desc' }, { createdAt: 'desc' }] }))
  app.post('/coupons', async (req) => {
    const body = parse(couponSchema, req.body)
    if (body.type === 'PERCENT' && body.value > 100) throw badRequest('Percent off cannot exceed 100')
    if (await db.affiliate.findUnique({ where: { couponCode: body.code } })) throw badRequest('A partner already uses that code')
    return db.coupon.create({ data: body })
  })
  app.put('/coupons/:id', async (req) => {
    const body = parse(couponSchema, req.body)
    if (body.type === 'PERCENT' && body.value > 100) throw badRequest('Percent off cannot exceed 100')
    if (await db.affiliate.findUnique({ where: { couponCode: body.code } })) throw badRequest('A partner already uses that code')
    return db.coupon.update({ where: { id: (req.params as { id: string }).id }, data: body })
  })
  app.delete('/coupons/:id', async (req) => {
    await db.coupon.delete({ where: { id: (req.params as { id: string }).id } })
    return { ok: true }
  })

  app.get('/messages', async () => db.contactMessage.findMany({ orderBy: [{ handled: 'asc' }, { createdAt: 'desc' }], take: 300 }))
  app.patch('/messages/:id', async (req) => {
    const body = parse(z.object({ handled: z.boolean() }), req.body)
    await db.contactMessage.update({ where: { id: (req.params as { id: string }).id }, data: body })
    return { ok: true }
  })

  app.get('/subscribers', async () => db.subscriber.findMany({ orderBy: { createdAt: 'desc' } }))
  app.get('/subscribers.csv', async (_req, reply) => {
    const rows = await db.subscriber.findMany({ orderBy: { createdAt: 'desc' } })
    reply.header('content-type', 'text/csv; charset=utf-8')
    reply.header('content-disposition', 'attachment; filename="kyvo-subscribers.csv"')
    return ['email,subscribed_at', ...rows.map((r) => `${csvEscape(r.email)},${r.createdAt.toISOString()}`)].join('\n')
  })

  app.get('/settings', async () => ({
    settings: await getSettings(),
    gateway: { provider: 'ToyyibPay', configured: toyyibEnabled(), sandbox: env.toyyib.baseUrl.includes('dev.'), callbackUrl: `${env.apiPublicUrl}/api/payments/toyyibpay/callback` },
  }))
  app.put('/settings', async (req) => ({ settings: await saveSettings(parse(settingsSchema, req.body)) }))
}
