import type { FastifyInstance } from 'fastify'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { db } from '../../lib/db.js'
import { env } from '../../lib/env.js'
import { badRequest, csvEscape, parse } from '../../lib/http.js'
import { getSettings, licensed, saveSettings, type StoreSettings } from '../../lib/settings.js'
import { gatewayStatus } from '../../lib/gateway.js'

const MODES = ['standard', 'wholesale', 'box'] as const

const couponSchema = z
  .object({
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,24}$/, 'Codes are 3-24 letters, numbers, dashes'),
    type: z.enum(['PERCENT', 'FIXED', 'FREE_SHIPPING']),
    // PERCENT: whole percent. FIXED: cents. FREE_SHIPPING: ignored.
    value: z.number().int().min(0),
    minSubtotal: z.number().int().min(0).default(0),
    maxDiscountCents: z.number().int().min(1).nullable().optional(),
    maxUses: z.number().int().min(1).nullable().optional(),
    maxUsesPerCustomer: z.number().int().min(1).nullable().optional(),
    startsAt: z.coerce.date().nullable().optional(),
    expiresAt: z.coerce.date().nullable().optional(),
    active: z.boolean().default(true),
    firstOrderOnly: z.boolean().default(false),
    stackWithTiers: z.boolean().default(true),
    modes: z.array(z.enum(MODES)).min(1, 'Choose at least one order type the code works on').default(['standard']),
    productIds: z.array(z.string().max(40)).max(200).default([]),
    categoryIds: z.array(z.string().max(40)).max(50).default([]),
    description: z.string().max(200).nullable().optional(),
  })
  .superRefine((c, ctx) => {
    if (c.type === 'PERCENT' && (c.value < 1 || c.value > 100)) ctx.addIssue({ code: 'custom', path: ['value'], message: 'Percent off must be between 1 and 100' })
    if (c.type === 'FIXED' && c.value < 1) ctx.addIssue({ code: 'custom', path: ['value'], message: 'Enter the amount off' })
    if (c.type !== 'PERCENT' && c.maxDiscountCents) ctx.addIssue({ code: 'custom', path: ['maxDiscountCents'], message: 'A discount cap only applies to percent codes' })
    if (c.startsAt && c.expiresAt && c.startsAt >= c.expiresAt) ctx.addIssue({ code: 'custom', path: ['expiresAt'], message: 'The end date must be after the start date' })
    if (c.maxUses && c.maxUsesPerCustomer && c.maxUsesPerCustomer > c.maxUses) {
      ctx.addIssue({ code: 'custom', path: ['maxUsesPerCustomer'], message: 'Per-customer limit cannot be higher than the total limit' })
    }
  })

async function checkCoupon(body: z.infer<typeof couponSchema>) {
  if (await db.affiliate.findUnique({ where: { couponCode: body.code } })) throw badRequest('A partner already uses that code')
  if (body.productIds.length) {
    const n = await db.product.count({ where: { id: { in: body.productIds } } })
    if (n !== new Set(body.productIds).size) throw badRequest('One of the chosen products no longer exists')
  }
  if (body.categoryIds.length) {
    const n = await db.category.count({ where: { id: { in: body.categoryIds } } })
    if (n !== new Set(body.categoryIds).size) throw badRequest('One of the chosen categories no longer exists')
  }
  // Free shipping applies to the whole order, so it never carries a product or category scope.
  const free = body.type === 'FREE_SHIPPING'
  return {
    ...body,
    value: free ? 0 : body.value,
    maxDiscountCents: body.type === 'PERCENT' ? (body.maxDiscountCents ?? null) : null,
    productIds: free ? [] : body.productIds,
    categoryIds: free ? [] : body.categoryIds,
  }
}

const ladder = z
  .array(z.object({ min: z.number().int().min(1), pct: z.number().int().min(0).max(90) }))
  .max(8)
  .refine((rows) => new Set(rows.map((r) => r.min)).size === rows.length, 'Each step needs a different minimum quantity')

const countBy = z.enum(['product', 'order'])

const settingsSchema = z
  .object({
    storeName: z.string().min(1).max(40),
    features: z.object({ membership: z.boolean() }),
    supportEmail: z.email(),
    announcement: z.string().max(200),
    banner: z.object({
      enabled: z.boolean(),
      style: z.enum(['gold', 'dark', 'subtle']),
      rotateSeconds: z.number().int().min(0).max(60),
      dismissible: z.boolean(),
      messages: z
        .array(
          z
            .object({
              id: z.string().min(1).max(40),
              text: z.string().trim().min(1, 'Write the message').max(160, 'Keep it under 160 characters so it fits on a phone'),
              // Only site paths or https links: never javascript: or other schemes.
              linkUrl: z.union([z.literal(''), z.string().regex(/^\/(?!\/)\S*$/), z.url({ protocol: /^https$/ })], { error: 'Use a page path like /shop or a full https:// link' }),
              linkLabel: z.string().trim().max(30),
              enabled: z.boolean(),
              startsAt: z.iso.datetime({ offset: true }).nullable(),
              endsAt: z.iso.datetime({ offset: true }).nullable(),
            })
            .refine((m) => !m.startsAt || !m.endsAt || Date.parse(m.startsAt) < Date.parse(m.endsAt), { message: 'The end must be after the start', path: ['endsAt'] })
            .refine((m) => !m.linkLabel || m.linkUrl, { message: 'Add a link for this label', path: ['linkUrl'] }),
        )
        .max(10, 'Up to 10 messages'),
    }),
    shipping: z.object({
      flatCents: z.number().int().min(0),
      freeThresholdCents: z.number().int().min(0),
      carrier: z.string().max(60),
      cutoff: z.string().max(30),
    }),
    taxPct: z.number().min(0).max(30),
    tierPricing: z.object({ enabled: z.boolean(), countBy, hintWithinUnits: z.number().int().min(0).max(20) }),
    tiers: ladder,
    bulk: z.object({
      enabled: z.boolean(),
      countBy,
      freeShipping: z.boolean(),
      earnPoints: z.boolean(),
      maxUnitsPerOrder: z.number().int().min(0).max(100000),
    }),
    wholesale: ladder.refine((rows) => rows.length > 0, 'Add at least one bulk step'),
    box: z.object({
      enabled: z.boolean(),
      slots: z.number().int().min(1).max(12),
      pct: z.number().int().min(0).max(90),
      commitMonths: z.number().int().min(1).max(24),
      freeShipping: z.boolean(),
      earnPoints: z.boolean(),
      includedItem: z.string().max(80),
    }),
    affiliate: z.object({
      defaultRate: z.number().int().min(0).max(60),
      cookieDays: z.number().int().min(1).max(365),
      couponPct: z.number().int().min(0).max(50),
      minPayoutCents: z.number().int().min(0),
      codeDiscountOnBulk: z.boolean(),
      codeDiscountOnBox: z.boolean(),
      codeStacksWithTiers: z.boolean(),
      commissionOnBulk: z.boolean(),
      commissionOnBox: z.boolean(),
    }),
    discounts: z.object({ pointsWithCodes: z.boolean() }),
    orders: z.object({
      unpaidExpiryDaysOnline: z.number().int().min(1).max(100),
      unpaidExpiryDaysManual: z.number().int().min(1).max(60),
    }),
    inventory: z.object({ lowStockThreshold: z.number().int().min(0).max(10000) }),
    points: z.object({
      valueCentsPer100: z.number().int().min(0).max(100000),
      // Paid-tier rates are optional so an unlicensed panel can save the base rate alone.
      perDollar: z.object({ MEMBER: z.number().min(0), INSIDER: z.number().min(0).optional(), VIP: z.number().min(0).optional(), FOUNDER: z.number().min(0).optional() }),
      bonusThresholdCents: z.number().int().min(0),
      bonusPoints: z.number().int().min(0),
      maxRedeemPct: z.number().int().min(0).max(100),
      expiryMonths: z.number().int().min(1).max(60),
      founderYearlyBonus: z.number().int().min(0).optional(),
    }),
    membership: z.object({
      INSIDER: z.object({ monthlyCents: z.number().int().min(0), yearlyCents: z.number().int().min(0) }),
      VIP: z.object({ monthlyCents: z.number().int().min(0), yearlyCents: z.number().int().min(0) }),
      FOUNDER: z.object({ monthlyCents: z.number().int().min(0), yearlyCents: z.number().int().min(0) }),
    }),
    onlinePayment: z.object({ channel: z.enum(['fpx', 'card', 'both']), feesPaidBy: z.enum(['store', 'customer']) }),
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

/**
 * What the admin panel sees. Unlicensed add-ons (membership) are removed entirely,
 * so the panel never shows or saves them.
 */
function adminView(s: StoreSettings) {
  if (env.enableMembership) return s
  const { membership: _m, features: _f, ...rest } = s
  return {
    ...rest,
    points: {
      ...s.points,
      perDollar: { MEMBER: s.points.perDollar.MEMBER },
      founderYearlyBonus: undefined,
    },
  }
}

export async function adminStoreRoutes(app: FastifyInstance) {
  app.get('/coupons', async () => {
    const coupons = await db.coupon.findMany({ orderBy: [{ active: 'desc' }, { createdAt: 'desc' }] })
    // Real performance per code: paid orders, discount given and sales it brought in.
    const stats = await db.order.groupBy({
      by: ['couponCode'],
      where: { couponCode: { in: coupons.map((c) => c.code) }, status: { in: ['PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'] } },
      _count: true,
      _sum: { couponDiscountCents: true, totalCents: true },
    })
    return coupons.map((c) => {
      const st = stats.find((x) => x.couponCode === c.code)
      return { ...c, paidOrders: st?._count ?? 0, discountGivenCents: st?._sum.couponDiscountCents ?? 0, salesCents: st?._sum.totalCents ?? 0 }
    })
  })
  app.post('/coupons', async (req) => db.coupon.create({ data: await checkCoupon(parse(couponSchema, req.body)) }))
  app.put('/coupons/:id', async (req) => {
    const data = await checkCoupon(parse(couponSchema, req.body))
    return db.coupon.update({ where: { id: (req.params as { id: string }).id }, data: data as Prisma.CouponUpdateInput })
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
    settings: adminView(await getSettings()),
    licensed: licensed(),
    gateway: await gatewayStatus(),
  }))
  app.put('/settings', async (req) => {
    const body = parse(settingsSchema, req.body)
    if (!env.enableMembership) {
      // Never let a request touch the unlicensed add-on, even if crafted by hand.
      delete body.membership
      delete body.features
      if (body.points) {
        body.points.perDollar = { MEMBER: body.points.perDollar.MEMBER }
        delete body.points.founderYearlyBonus
      }
    }
    return { settings: adminView(await saveSettings(body)), licensed: licensed() }
  })
}
