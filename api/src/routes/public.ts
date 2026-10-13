import { createHash } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { db } from '../lib/db.js'
import { notFound, parse } from '../lib/http.js'
import { coaDto, productCard, productDetail, productInclude } from '../lib/serialize.js'
import { getSettings, publicSettings } from '../lib/settings.js'

export async function publicRoutes(app: FastifyInstance) {
  app.get('/api/health', { logLevel: 'silent' }, async () => ({ ok: true }))

  app.get('/api/settings', async () => publicSettings(await getSettings()))

  app.get('/api/categories', async () => {
    const cats = await db.category.findMany({
      orderBy: { sortOrder: 'asc' },
      include: { _count: { select: { products: { where: { status: 'ACTIVE' } } } } },
    })
    return cats.map((c) => ({ id: c.id, name: c.name, slug: c.slug, count: c._count.products }))
  })

  app.get('/api/products', async (req) => {
    const q = parse(
      z.object({
        q: z.string().max(80).optional(),
        category: z.string().max(60).optional(),
        sort: z.enum(['featured', 'price-asc', 'price-desc', 'name', 'newest']).optional(),
        featured: z.enum(['1', 'true']).optional(),
        box: z.enum(['1', 'true']).optional(),
      }),
      req.query,
    )
    const where: Prisma.ProductWhereInput = { status: 'ACTIVE' }
    if (q.q) where.OR = [{ name: { contains: q.q, mode: 'insensitive' } }, { tagline: { contains: q.q, mode: 'insensitive' } }]
    if (q.category) where.category = { slug: q.category }
    if (q.featured) where.featured = true
    if (q.box) where.boxEligible = true
    const orderBy: Prisma.ProductOrderByWithRelationInput[] =
      q.sort === 'name' ? [{ name: 'asc' }] : q.sort === 'newest' ? [{ createdAt: 'desc' }] : [{ featured: 'desc' }, { sortOrder: 'asc' }]
    const low = (await getSettings()).inventory.lowStockThreshold
    const products = (await db.product.findMany({ where, orderBy, include: productInclude })).map((p) => productCard(p, low))
    if (q.sort === 'price-asc') products.sort((a, b) => (a.fromPriceCents ?? 0) - (b.fromPriceCents ?? 0))
    if (q.sort === 'price-desc') products.sort((a, b) => (b.fromPriceCents ?? 0) - (a.fromPriceCents ?? 0))
    return products
  })

  app.get('/api/products/:slug', async (req) => {
    const { slug } = req.params as { slug: string }
    const p = await db.product.findFirst({ where: { slug, status: 'ACTIVE' }, include: productInclude })
    if (!p) throw notFound('Product not found')
    const related = await db.product.findMany({
      where: { status: 'ACTIVE', id: { not: p.id } },
      orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }],
      take: 8,
      include: productInclude,
    })
    const low = (await getSettings()).inventory.lowStockThreshold
    return { product: productDetail(p, low), related: related.map((r) => productCard(r, low)) }
  })

  app.get('/api/coas', async (req) => {
    const { q } = parse(z.object({ q: z.string().max(80).optional() }), req.query)
    const coas = await db.coa.findMany({
      where: {
        product: { status: 'ACTIVE' },
        ...(q
          ? { OR: [{ lotNumber: { contains: q, mode: 'insensitive' } }, { product: { name: { contains: q, mode: 'insensitive' } } }] }
          : {}),
      },
      orderBy: { testedAt: 'desc' },
      include: { product: { select: { name: true, slug: true, image: true } } },
      take: 200,
    })
    return coas.map((c) => ({ ...coaDto(c), product: c.product }))
  })

  app.post('/api/newsletter', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req) => {
    const { email } = parse(z.object({ email: z.email().max(160) }), req.body)
    await db.subscriber.upsert({ where: { email: email.toLowerCase() }, create: { email: email.toLowerCase() }, update: {} })
    return { ok: true }
  })

  app.post('/api/contact', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req) => {
    const body = parse(
      z.object({
        name: z.string().trim().min(1).max(120),
        email: z.email().max(160),
        topic: z.string().max(60).default('General'),
        orderRef: z.string().max(40).optional(),
        message: z.string().trim().min(5).max(4000),
      }),
      req.body,
    )
    await db.contactMessage.create({ data: { ...body, email: body.email.toLowerCase() } })
    return { ok: true }
  })

  // Records a partner-link visit. The browser keeps the code for the cookie window;
  // attribution is resolved again at checkout so suspended partners never earn.
  app.post('/api/ref/click', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
    const body = parse(
      z.object({ code: z.string().trim().toLowerCase().max(40), landing: z.string().max(300).optional(), referrer: z.string().max(300).optional() }),
      req.body,
    )
    const a = await db.affiliate.findUnique({ where: { code: body.code } })
    if (!a || a.status !== 'APPROVED') return { ok: false }
    const visitorHash = createHash('sha256').update(`${req.ip}|${req.headers['user-agent'] ?? ''}|${new Date().toISOString().slice(0, 10)}`).digest('hex').slice(0, 32)
    const dupe = await db.affiliateClick.findFirst({ where: { affiliateId: a.id, visitorHash } })
    if (!dupe) await db.affiliateClick.create({ data: { affiliateId: a.id, landing: body.landing, referrer: body.referrer, visitorHash } })
    const s = await getSettings()
    return { ok: true, cookieDays: s.affiliate.cookieDays }
  })
}
