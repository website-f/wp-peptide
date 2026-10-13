import type { FastifyInstance } from 'fastify'
import type { Prisma, User } from '@prisma/client'
import { z } from 'zod'
import { db } from '../../lib/db.js'
import { badRequest, notFound, parse, toPage } from '../../lib/http.js'
import { affiliateBalances, bankLine, bankSchema, requestPayout } from '../affiliate.js'
import { LIVE } from './reports.js'
import { mailPartner } from '../../lib/mailer.js'

export async function adminPeopleRoutes(app: FastifyInstance) {
  // ---------- Customers ----------
  app.get('/customers', async (req) => {
    const q = parse(
      z.object({
        q: z.string().max(80).optional(),
        tier: z.enum(['MEMBER', 'INSIDER', 'VIP', 'FOUNDER']).optional(),
        page: z.coerce.number().optional(),
        pageSize: z.coerce.number().optional(),
      }),
      req.query,
    )
    const where: Prisma.UserWhereInput = {}
    if (q.tier) where.tier = q.tier
    if (q.q) where.OR = [{ email: { contains: q.q, mode: 'insensitive' } }, { name: { contains: q.q, mode: 'insensitive' } }, { phone: { contains: q.q } }]
    const { page, pageSize, skip, take } = toPage(q)
    const [total, users] = await Promise.all([
      db.user.count({ where }),
      db.user.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take, include: { affiliate: { select: { status: true, code: true } } } }),
    ])
    const spend = await db.order.groupBy({
      by: ['userId'],
      where: { userId: { in: users.map((u) => u.id) }, status: { in: LIVE } },
      _sum: { totalCents: true },
      _count: true,
      _max: { createdAt: true },
    })
    return {
      total,
      page,
      pageSize,
      rows: users.map((u) => {
        const s = spend.find((x) => x.userId === u.id)
        return {
          id: u.id,
          name: u.name,
          email: u.email,
          phone: u.phone,
          role: u.role,
          tier: u.tier,
          pointsBalance: u.pointsBalance,
          createdAt: u.createdAt,
          orders: s?._count ?? 0,
          spentCents: s?._sum.totalCents ?? 0,
          lastOrderAt: s?._max.createdAt ?? null,
          partner: u.affiliate,
        }
      }),
    }
  })

  app.get('/customers/:id', async (req) => {
    const { id } = req.params as { id: string }
    const u = await db.user.findUnique({
      where: { id },
      include: {
        orders: { orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, number: true, status: true, kind: true, totalCents: true, createdAt: true } },
        pointsTxns: { orderBy: { createdAt: 'desc' }, take: 50 },
        affiliate: { select: { id: true, status: true, code: true } },
        subscriptions: { select: { id: true, status: true, boxesShipped: true, nextShipAt: true, priceCents: true } },
      },
    })
    if (!u) throw notFound('Customer not found')
    const { passwordHash: _p, ...rest } = u
    const live = u.orders.filter((o) => (LIVE as string[]).includes(o.status))
    return { ...rest, stats: { orders: live.length, spentCents: live.reduce((a, o) => a + o.totalCents, 0) } }
  })

  app.patch('/customers/:id', async (req) => {
    const admin = (req as unknown as { admin: User }).admin
    const { id } = req.params as { id: string }
    const body = parse(
      z.object({
        name: z.string().trim().min(1).max(120).optional(),
        phone: z.string().max(40).nullable().optional(),
        tier: z.enum(['MEMBER', 'INSIDER', 'VIP', 'FOUNDER']).optional(),
        tierExpiresAt: z.coerce.date().nullable().optional(),
        role: z.enum(['CUSTOMER', 'ADMIN']).optional(),
      }),
      req.body,
    )
    if (body.role && id === admin.id && body.role !== 'ADMIN') throw badRequest('You cannot remove your own admin access')
    await db.user.update({ where: { id }, data: { ...body, ...(body.tier === 'MEMBER' ? { tierExpiresAt: null } : {}) } })
    return { ok: true }
  })

  app.post('/customers/:id/points', async (req) => {
    const admin = (req as unknown as { admin: User }).admin
    const { id } = req.params as { id: string }
    const body = parse(z.object({ delta: z.number().int().min(-1_000_000).max(1_000_000), reason: z.string().trim().min(2).max(200) }), req.body)
    if (body.delta === 0) throw badRequest('Enter a points amount')
    await db.$transaction(async (tx) => {
      const u = await tx.user.findUniqueOrThrow({ where: { id } })
      if (u.pointsBalance + body.delta < 0) throw badRequest(`Balance is only ${u.pointsBalance} points`)
      await tx.user.update({ where: { id }, data: { pointsBalance: { increment: body.delta } } })
      await tx.pointsTxn.create({ data: { userId: id, delta: body.delta, reason: `${body.reason} (by ${admin.email})` } })
    })
    return { ok: true }
  })

  // ---------- Partners ----------
  app.get('/affiliates', async (req) => {
    const q = parse(z.object({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED']).optional(), q: z.string().max(80).optional() }), req.query)
    const where: Prisma.AffiliateWhereInput = {}
    if (q.status) where.status = q.status
    if (q.q) {
      where.OR = [
        { code: { contains: q.q, mode: 'insensitive' } },
        { handle: { contains: q.q, mode: 'insensitive' } },
        { user: { email: { contains: q.q, mode: 'insensitive' } } },
        { user: { name: { contains: q.q, mode: 'insensitive' } } },
      ]
    }
    const rows = await db.affiliate.findMany({
      where,
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: { user: { select: { name: true, email: true } }, _count: { select: { clicks: true } } },
    })
    const comm = await db.commission.groupBy({
      by: ['affiliateId', 'status'],
      where: { affiliateId: { in: rows.map((r) => r.id) } },
      _sum: { amountCents: true, baseCents: true },
      _count: true,
    })
    // Approved commission already inside an unpaid payout request is shown separately.
    const inPayout = await db.commission.groupBy({
      by: ['affiliateId'],
      where: { affiliateId: { in: rows.map((r) => r.id) }, status: 'APPROVED', payoutId: { not: null } },
      _sum: { amountCents: true },
    })
    return rows.map((a) => {
      const mine = comm.filter((c) => c.affiliateId === a.id && c.status !== 'VOID')
      const s = (st: string) => mine.find((c) => c.status === st)?._sum.amountCents ?? 0
      const orders = mine.reduce((x, c) => x + c._count, 0)
      return {
        id: a.id,
        name: a.user.name,
        email: a.user.email,
        code: a.code,
        couponCode: a.couponCode,
        status: a.status,
        commissionRate: a.commissionRate,
        platform: a.platform,
        handle: a.handle,
        createdAt: a.createdAt,
        clicks: a._count.clicks,
        orders,
        salesCents: mine.reduce((x, c) => x + (c._sum.baseCents ?? 0), 0),
        pendingCents: s('PENDING'),
        approvedCents: s('APPROVED') - (inPayout.find((x) => x.affiliateId === a.id)?._sum.amountCents ?? 0),
        requestedCents: inPayout.find((x) => x.affiliateId === a.id)?._sum.amountCents ?? 0,
        paidCents: s('PAID'),
        conversionPct: a._count.clicks ? Math.round((orders / a._count.clicks) * 1000) / 10 : 0,
        bankOnFile: Boolean(a.bankName && a.bankAccountNumber),
      }
    })
  })

  app.get('/affiliates/:id', async (req) => {
    const { id } = req.params as { id: string }
    const a = await db.affiliate.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true, createdAt: true } },
        commissions: { orderBy: { createdAt: 'desc' }, take: 100, include: { order: { select: { id: true, number: true, status: true, name: true } } } },
        payouts: { orderBy: { createdAt: 'desc' } },
      },
    })
    if (!a) throw notFound('Partner not found')
    const [balances, clicks] = await Promise.all([affiliateBalances(a.id), db.affiliateClick.count({ where: { affiliateId: a.id } })])
    return { ...a, balances, clicks }
  })

  app.patch('/affiliates/:id', async (req) => {
    const { id } = req.params as { id: string }
    const body = parse(
      z.object({
        status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED']).optional(),
        commissionRate: z.number().int().min(0).max(60).optional(),
        couponCode: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{3,20}$/, 'Codes are 3-20 letters or numbers').optional(),
        code: z.string().trim().toLowerCase().regex(/^[a-z0-9]{3,20}$/, 'Links are 3-20 lowercase letters or numbers').optional(),
        adminNote: z.string().max(2000).nullable().optional(),
        bankName: bankSchema.bankName.optional(),
        bankAccountName: bankSchema.bankAccountName.optional(),
        bankAccountNumber: bankSchema.bankAccountNumber.optional(),
      }),
      req.body,
    )
    if (body.couponCode && (await db.coupon.findUnique({ where: { code: body.couponCode } }))) throw badRequest('A store coupon already uses that code')
    const a = await db.affiliate.findUnique({ where: { id } })
    if (!a) throw notFound('Partner not found')
    const updated = await db.affiliate.update({
      where: { id },
      data: { ...body, approvedAt: body.status === 'APPROVED' && !a.approvedAt ? new Date() : undefined },
    })
    // Same security notice the partner gets when they change it themselves: where their money
    // goes should never change silently, even when an admin does it on their behalf.
    if (bankLine(updated) !== bankLine(a)) mailPartner(id, 'bank-changed')
    if (body.status && body.status !== a.status) {
      if (body.status === 'APPROVED') mailPartner(id, 'approved')
      if (body.status === 'REJECTED') mailPartner(id, 'rejected')
      if (body.status === 'SUSPENDED') mailPartner(id, 'suspended')
    }
    return { ok: true }
  })

  app.get('/commissions', async (req) => {
    const q = parse(z.object({ status: z.enum(['PENDING', 'APPROVED', 'PAID', 'VOID']).optional() }), req.query)
    return db.commission.findMany({
      where: q.status ? { status: q.status } : {},
      orderBy: { createdAt: 'desc' },
      take: 300,
      include: { affiliate: { select: { id: true, code: true, user: { select: { name: true } } } }, order: { select: { id: true, number: true, status: true } } },
    })
  })

  app.post('/commissions/:id', async (req) => {
    const { id } = req.params as { id: string }
    const body = parse(z.object({ status: z.enum(['PENDING', 'APPROVED', 'VOID']) }), req.body)
    const c = await db.commission.findUnique({ where: { id } })
    if (!c) throw notFound('Commission not found')
    if (c.status === 'PAID') throw badRequest('Paid commissions cannot be changed')
    if (c.payoutId) throw badRequest('This commission is part of a payout request. Resolve the payout first.')
    await db.commission.update({ where: { id }, data: { status: body.status, approvedAt: body.status === 'APPROVED' ? new Date() : null } })
    return { ok: true }
  })

  app.get('/payouts', async (req) => {
    const q = parse(z.object({ status: z.enum(['REQUESTED', 'PAID', 'REJECTED']).optional() }), req.query)
    return db.payout.findMany({
      where: q.status ? { status: q.status } : {},
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: {
        affiliate: { select: { id: true, code: true, bankName: true, bankAccountName: true, bankAccountNumber: true, user: { select: { name: true, email: true } } } },
        _count: { select: { commissions: true } },
      },
    })
  })

  app.post('/affiliates/:id/payouts', async (req) => {
    const p = await requestPayout((req.params as { id: string }).id, 'admin')
    return { id: p.id, amountCents: p.amountCents }
  })

  app.post('/payouts/:id', async (req) => {
    const { id } = req.params as { id: string }
    const body = parse(z.object({ status: z.enum(['PAID', 'REJECTED']), reference: z.string().max(120).optional(), note: z.string().max(500).optional() }), req.body)
    const p = await db.payout.findUnique({ where: { id } })
    if (!p) throw notFound('Payout not found')
    if (p.status !== 'REQUESTED') throw badRequest('This payout is already settled')
    if (body.status === 'PAID' && !body.reference) throw badRequest('Add the transfer reference so the partner can match it')
    await db.$transaction(async (tx) => {
      await tx.payout.update({
        where: { id },
        data: { status: body.status, reference: body.reference, note: body.note, paidAt: body.status === 'PAID' ? new Date() : null },
      })
      if (body.status === 'PAID') await tx.commission.updateMany({ where: { payoutId: id }, data: { status: 'PAID' } })
      else await tx.commission.updateMany({ where: { payoutId: id }, data: { payoutId: null } })
    })
    if (body.status === 'PAID') mailPartner(p.affiliateId, 'payout-paid', { amountCents: p.amountCents, reference: body.reference })
    return { ok: true }
  })
}
