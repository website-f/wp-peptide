import { randomInt } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { Affiliate } from '@prisma/client'
import { z } from 'zod'
import { currentUser, hashPassword, requireUser, setSession } from '../lib/auth.js'
import { db } from '../lib/db.js'
import { HttpError, badRequest, notFound, parse } from '../lib/http.js'
import { mailPartner, mailPartnerApplied, mailStaffPayoutRequest } from '../lib/mailer.js'
import { fmtMoney, getSettings } from '../lib/settings.js'
import { passwordSchema } from './auth.js'

const PLATFORMS = ['TikTok', 'Instagram', 'YouTube', 'X', 'Facebook', 'Snapchat', 'Twitch', 'Podcast', 'Newsletter / Blog', 'Other'] as const

// Partners are paid by manual bank transfer, so these details are required.
export const bankSchema = {
  bankName: z.string().trim().min(2, 'Choose your bank').max(80),
  bankAccountName: z.string().trim().min(2, 'Enter the account holder name as it appears at the bank').max(120),
  bankAccountNumber: z
    .string()
    .transform((s) => s.replace(/[\s-]/g, ''))
    .pipe(z.string().regex(/^\d{6,20}$/, 'Account numbers are 6 to 20 digits')),
}

export const bankLine = (a: Pick<Affiliate, 'bankName' | 'bankAccountName' | 'bankAccountNumber'>) =>
  a.bankName && a.bankAccountNumber ? `${a.bankName}, ${a.bankAccountNumber}, ${a.bankAccountName ?? ''}`.replace(/, $/, '') : null

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 14)
}

async function uniqueCodes(seed: string) {
  const slug = slugify(seed)
  const base = slug.length >= 3 ? slug : 'partner'
  for (let i = 0; i < 20; i++) {
    const code = i === 0 ? base : `${base}${randomInt(10, 999)}`
    const couponCode = code.toUpperCase()
    const clash = await db.affiliate.findFirst({ where: { OR: [{ code }, { couponCode }] } })
    const couponClash = await db.coupon.findUnique({ where: { code: couponCode } })
    if (!clash && !couponClash) return { code, couponCode }
  }
  throw new HttpError(500, 'Could not generate a partner code')
}

/** Commission balances bucketed the way the partner dashboard and admin both show them. */
export async function affiliateBalances(affiliateId: string) {
  const rows = await db.commission.groupBy({
    by: ['status'],
    where: { affiliateId },
    _sum: { amountCents: true, baseCents: true },
    _count: true,
  })
  const sum = (st: string) => rows.find((r) => r.status === st)?._sum.amountCents ?? 0
  const count = (st: string) => rows.find((r) => r.status === st)?._count ?? 0
  const inPayout = await db.commission.aggregate({
    where: { affiliateId, status: 'APPROVED', payoutId: { not: null } },
    _sum: { amountCents: true },
    _count: true,
  })
  const inPayoutCents = inPayout._sum.amountCents ?? 0
  const live = rows.filter((r) => r.status !== 'VOID')
  return {
    pendingCents: sum('PENDING'),
    availableCents: sum('APPROVED') - inPayoutCents,
    requestedCents: inPayoutCents,
    paidCents: sum('PAID'),
    voidCents: sum('VOID'),
    lifetimeCents: sum('PENDING') + sum('APPROVED') + sum('PAID'),
    salesCents: live.reduce((a, r) => a + (r._sum.baseCents ?? 0), 0),
    orders: live.reduce((a, r) => a + r._count, 0),
    counts: {
      pending: count('PENDING'),
      available: count('APPROVED') - inPayout._count,
      requested: inPayout._count,
      paid: count('PAID'),
      void: count('VOID'),
    },
  }
}

export async function requestPayout(affiliateId: string, actor: 'partner' | 'admin') {
  const a = await db.affiliate.findUnique({ where: { id: affiliateId }, include: { user: true } })
  if (!a) throw notFound('Partner not found')
  const s = await getSettings()
  const destination = bankLine(a)
  if (!destination) {
    throw badRequest(actor === 'partner' ? 'Add your bank details before requesting a payout' : 'This partner has no bank details on file yet')
  }
  const open = await db.payout.findFirst({ where: { affiliateId, status: 'REQUESTED' } })
  if (open) {
    throw badRequest(actor === 'partner' ? 'You already have a payout request being processed' : 'This partner already has a payout waiting. Settle or reject it first.')
  }
  const commissions = await db.commission.findMany({ where: { affiliateId, status: 'APPROVED', payoutId: null } })
  const amount = commissions.reduce((x, c) => x + c.amountCents, 0)
  if (amount <= 0) throw badRequest('There is no approved balance to pay out yet')
  if (actor === 'partner' && amount < s.affiliate.minPayoutCents) {
    throw badRequest(`Payouts start at ${fmtMoney(s, s.affiliate.minPayoutCents, 0)}. Your available balance is ${fmtMoney(s, amount)}.`)
  }
  return db.$transaction(async (tx) => {
    // The bank details are copied onto the payout so later edits never redirect money already requested.
    const payout = await tx.payout.create({ data: { affiliateId, amountCents: amount, method: 'BANK', destination } })
    await tx.commission.updateMany({ where: { id: { in: commissions.map((c) => c.id) } }, data: { payoutId: payout.id } })
    return payout
  })
}

// Partner analytics use the store's local day (Malaysia, UTC+8), same as admin reports.
const OFFSET = 8 * 3600_000
const localDay = (d: Date) => new Date(d.getTime() + OFFSET).toISOString().slice(0, 10)
const localMonth = (d: Date) => new Date(d.getTime() + OFFSET).toISOString().slice(0, 7)

export async function affiliateRoutes(app: FastifyInstance) {
  app.post('/api/affiliate/apply', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req, reply) => {
    const body = parse(
      z.object({
        // Name/email/password are only needed when the applicant is not signed in.
        name: z.string().trim().min(1).max(120).optional(),
        email: z.email().max(160).optional(),
        password: passwordSchema.optional(),
        phone: z.string().max(40).optional(),
        platform: z.enum(PLATFORMS),
        handle: z.string().trim().min(1, 'Add your main handle or channel').max(200),
        otherHandles: z.string().max(500).optional(),
        website: z.string().max(200).optional(),
        promotionPlan: z.string().max(2000).optional(),
        ...bankSchema,
        agree: z.literal(true, { error: 'Please accept the partner terms' }),
      }),
      req.body,
    )
    let user = await currentUser(req)
    if (!user) {
      if (!body.name || !body.email) throw badRequest('Enter your name and email')
      const email = body.email.toLowerCase()
      if (await db.user.findUnique({ where: { email } })) throw new HttpError(409, 'That email already has an account. Sign in first, then apply.')
      if (!body.password) throw badRequest('Choose a password for your partner account')
      user = await db.user.create({ data: { email, name: body.name, phone: body.phone || null, passwordHash: await hashPassword(body.password) } })
      setSession(reply, user)
    }
    if (await db.affiliate.findUnique({ where: { userId: user.id } })) throw new HttpError(409, 'You have already applied. Check your partner dashboard.')
    const s = await getSettings()
    const codes = await uniqueCodes(body.handle.split(/[\s/]/).filter(Boolean).pop() ?? user.name)
    const aff = await db.affiliate.create({
      data: {
        userId: user.id,
        ...codes,
        commissionRate: s.affiliate.defaultRate,
        platform: body.platform,
        handle: body.handle,
        otherHandles: body.otherHandles || null,
        website: body.website || null,
        payoutMethod: 'BANK',
        bankName: body.bankName,
        bankAccountName: body.bankAccountName,
        bankAccountNumber: body.bankAccountNumber,
        promotionPlan: body.promotionPlan || null,
      },
    })
    mailPartnerApplied(aff.id)
    return { status: aff.status, code: aff.code }
  })

  app.get('/api/affiliate/me', async (req) => {
    const user = await requireUser(req)
    const a = await db.affiliate.findUnique({ where: { userId: user.id } })
    if (!a) return { affiliate: null }
    const s = await getSettings()

    // Window starts at local midnight 29 days ago (30 days including today).
    const todayLocal = new Date(Date.now() + OFFSET)
    todayLocal.setUTCHours(0, 0, 0, 0)
    const since = new Date(todayLocal.getTime() - 29 * 86400_000 - OFFSET)
    const yearStartLocal = new Date(Date.UTC(todayLocal.getUTCFullYear(), todayLocal.getUTCMonth() - 11, 1))
    const yearSince = new Date(yearStartLocal.getTime() - OFFSET)

    const [balances, clicksTotal, clicks30, commissions, payouts, recentClicks, yearCommissions, top] = await Promise.all([
      affiliateBalances(a.id),
      db.affiliateClick.count({ where: { affiliateId: a.id } }),
      db.affiliateClick.count({ where: { affiliateId: a.id, createdAt: { gte: since } } }),
      db.commission.findMany({
        where: { affiliateId: a.id },
        orderBy: { createdAt: 'desc' },
        take: 200,
        include: { order: { select: { number: true, createdAt: true, status: true, kind: true, _count: { select: { items: true } } } } },
      }),
      db.payout.findMany({ where: { affiliateId: a.id }, orderBy: { createdAt: 'desc' }, take: 50, include: { _count: { select: { commissions: true } } } }),
      db.affiliateClick.findMany({ where: { affiliateId: a.id, createdAt: { gte: since } }, select: { createdAt: true } }),
      db.commission.findMany({
        where: { affiliateId: a.id, createdAt: { gte: yearSince }, status: { not: 'VOID' } },
        select: { createdAt: true, amountCents: true, baseCents: true },
      }),
      db.orderItem.groupBy({
        by: ['name'],
        where: { order: { affiliateId: a.id, commission: { status: { not: 'VOID' } } } },
        _sum: { quantity: true, lineTotalCents: true },
        orderBy: { _sum: { lineTotalCents: 'desc' } },
        take: 5,
      }),
    ])

    const days = Array.from({ length: 30 }, (_, i) => ({
      date: new Date(todayLocal.getTime() - (29 - i) * 86400_000).toISOString().slice(0, 10),
      clicks: 0,
      orders: 0,
      salesCents: 0,
      earningsCents: 0,
    }))
    const byDay = new Map(days.map((d) => [d.date, d]))
    for (const c of recentClicks) {
      const row = byDay.get(localDay(c.createdAt))
      if (row) row.clicks++
    }
    for (const c of commissions) {
      if (c.status === 'VOID') continue
      const row = byDay.get(localDay(c.createdAt))
      if (!row) continue
      row.orders++
      row.salesCents += c.baseCents
      row.earningsCents += c.amountCents
    }

    const months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(Date.UTC(yearStartLocal.getUTCFullYear(), yearStartLocal.getUTCMonth() + i, 1))
      return { month: d.toISOString().slice(0, 7), orders: 0, salesCents: 0, earningsCents: 0 }
    })
    const byMonth = new Map(months.map((m) => [m.month, m]))
    for (const c of yearCommissions) {
      const row = byMonth.get(localMonth(c.createdAt))
      if (!row) continue
      row.orders++
      row.salesCents += c.baseCents
      row.earningsCents += c.amountCents
    }

    const orders30 = days.reduce((x, d) => x + d.orders, 0)
    const earnings30 = days.reduce((x, d) => x + d.earningsCents, 0)
    return {
      affiliate: {
        status: a.status,
        code: a.code,
        couponCode: a.couponCode,
        commissionRate: a.commissionRate,
        platform: a.platform,
        handle: a.handle,
        website: a.website,
        payoutMethod: 'BANK',
        bankName: a.bankName,
        bankAccountName: a.bankAccountName,
        bankAccountNumber: a.bankAccountNumber,
        createdAt: a.createdAt,
        approvedAt: a.approvedAt,
      },
      terms: { cookieDays: s.affiliate.cookieDays, couponPct: s.affiliate.couponPct, minPayoutCents: s.affiliate.minPayoutCents },
      stats: {
        ...balances,
        clicksTotal,
        clicks30,
        orders30,
        earnings30Cents: earnings30,
        conversionPct: clicksTotal > 0 ? Math.round((balances.orders / clicksTotal) * 1000) / 10 : 0,
        conversion30Pct: clicks30 > 0 ? Math.round((orders30 / clicks30) * 1000) / 10 : 0,
        avgCommissionCents: balances.orders ? Math.round(balances.lifetimeCents / balances.orders) : 0,
        avgOrderCents: balances.orders ? Math.round(balances.salesCents / balances.orders) : 0,
        earningsPerClickCents: clicksTotal ? Math.round(balances.lifetimeCents / clicksTotal) : 0,
      },
      series: days,
      monthly: months,
      topProducts: top.map((t) => ({ name: t.name, units: t._sum.quantity ?? 0, salesCents: t._sum.lineTotalCents ?? 0 })),
      commissions: commissions.map((c) => ({
        id: c.id,
        orderNumber: c.order.number,
        orderDate: c.order.createdAt,
        orderStatus: c.order.status,
        orderKind: c.order.kind,
        items: c.order._count.items,
        baseCents: c.baseCents,
        rate: c.rate,
        amountCents: c.amountCents,
        status: c.status,
        inPayout: Boolean(c.payoutId),
        approvedAt: c.approvedAt,
      })),
      payouts: payouts.map((p) => ({
        id: p.id,
        amountCents: p.amountCents,
        method: p.method,
        destination: p.destination,
        status: p.status,
        reference: p.reference,
        note: p.note,
        commissions: p._count.commissions,
        createdAt: p.createdAt,
        paidAt: p.paidAt,
      })),
    }
  })

  app.patch('/api/affiliate/me', async (req) => {
    const user = await requireUser(req)
    const a = await db.affiliate.findUnique({ where: { userId: user.id } })
    if (!a) throw notFound('No partner account')
    const body = parse(
      z.object({
        website: z.string().max(200).optional(),
        handle: z.string().trim().min(1).max(200).optional(),
        bankName: bankSchema.bankName.optional(),
        bankAccountName: bankSchema.bankAccountName.optional(),
        bankAccountNumber: bankSchema.bankAccountNumber.optional(),
      }),
      req.body,
    )
    const updated = await db.affiliate.update({ where: { id: a.id }, data: { ...body, payoutMethod: 'BANK' } })
    // Security notice: a hijacked account changing where money goes should never be silent.
    if (bankLine(updated) !== bankLine(a)) mailPartner(a.id, 'bank-changed')
    return { ok: true }
  })

  app.post('/api/affiliate/payouts', async (req) => {
    const user = await requireUser(req)
    const a = await db.affiliate.findUnique({ where: { userId: user.id } })
    if (!a || a.status !== 'APPROVED') throw badRequest('Your partner account is not active')
    const p = await requestPayout(a.id, 'partner')
    mailStaffPayoutRequest(a.id, p.amountCents)
    return { id: p.id, amountCents: p.amountCents }
  })
}
