import type { FastifyInstance } from 'fastify'
import type { User } from '@prisma/client'
import { archive } from '../../lib/archive.js'
import { z } from 'zod'
import { db } from '../../lib/db.js'
import { badRequest, notFound, parse } from '../../lib/http.js'
import { saveCertificate, saveProductImage } from '../../lib/images.js'
import { coaAdmin, productAdmin, productInclude } from '../../lib/serialize.js'

const slugRe = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const variantSchema = z.object({
  id: z.string().optional(),
  label: z.string().trim().min(1, 'Each size needs a label').max(40),
  sku: z.string().trim().min(1, 'Each size needs a SKU').max(60),
  priceCents: z.number().int().min(0),
  costCents: z.number().int().min(0).default(0),
  stock: z.number().int().min(0).default(0),
  active: z.boolean().default(true),
  sortOrder: z.number().int().default(0),
})

const productSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().regex(slugRe, 'Use lowercase letters, numbers and dashes'),
  tagline: z.string().max(200).default(''),
  description: z.string().max(10000).default(''),
  image: z.string().max(300).nullable().optional(),
  gallery: z.array(z.string().max(300)).max(12).default([]),
  categoryId: z.string().nullable().optional(),
  form: z.enum(['VIAL', 'MIST', 'SUPPLY']).default('VIAL'),
  status: z.enum(['ACTIVE', 'DRAFT', 'ARCHIVED']).default('ACTIVE'),
  featured: z.boolean().default(false),
  boxEligible: z.boolean().default(true),
  purity: z.number().min(0).max(100).nullable().optional(),
  casNumber: z.string().max(60).nullable().optional(),
  molecularFormula: z.string().max(120).nullable().optional(),
  molecularWeight: z.string().max(60).nullable().optional(),
  sequence: z.string().max(500).nullable().optional(),
  storage: z.string().max(300).nullable().optional(),
  sortOrder: z.number().int().default(0),
  variants: z.array(variantSchema).min(1, 'Add at least one size'),
})

const coaSchema = z.object({
  productId: z.string(),
  lotNumber: z.string().trim().min(1).max(60),
  documentTitle: z.string().trim().max(80).nullable().optional(),
  mfgDate: z.coerce.date().nullable().optional(),
  retestDate: z.coerce.date().nullable().optional(),
  variantLabel: z.string().max(40).nullable().optional(),
  purity: z.number().min(0).max(100),
  labeledAmount: z.string().max(40).nullable().optional(),
  measuredAmount: z.string().max(40).nullable().optional(),
  identity: z.string().max(80).default('Confirmed (LC-MS)'),
  // Empty means "not on this certificate"; the storefront hides those rows.
  endotoxin: z.string().max(40).default('Pass'),
  microbial: z.string().max(40).default('Pass'),
  heavyMetals: z.string().max(40).default('Pass'),
  appearance: z.string().max(120).default('White lyophilized powder'),
  lab: z.string().max(120).default('Independent ISO/IEC 17025 lab'),
  assays: z.number().int().min(1).max(30).default(6),
  testedAt: z.coerce.date(),
  fileUrl: z.string().max(300).nullable().optional(),
  pages: z.array(z.string().regex(/^\/(uploads\/coa|coa)\/[\w/-]+$/, 'Invalid page path')).max(20).default([]),
})

export async function adminCatalogRoutes(app: FastifyInstance) {
  app.get('/products', async () => {
    const rows = await db.product.findMany({
      where: { deletedAt: null },
      orderBy: [{ status: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      include: { ...productInclude, _count: { select: { orderItems: true } } },
    })
    const sold = await db.orderItem.groupBy({
      by: ['productId'],
      where: { order: { status: { in: ['PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'] }, deletedAt: null } },
      _sum: { quantity: true, lineTotalCents: true },
    })
    return rows.map((p) => {
      const s = sold.find((x) => x.productId === p.id)
      return { ...productAdmin(p), unitsSold: s?._sum.quantity ?? 0, revenueCents: s?._sum.lineTotalCents ?? 0 }
    })
  })

  app.get('/products/:id', async (req) => {
    const { id } = req.params as { id: string }
    const p = await db.product.findUnique({ where: { id }, include: productInclude })
    if (!p) throw notFound('Product not found')
    return productAdmin(p)
  })

  async function saveProduct(id: string | null, raw: unknown) {
    const body = parse(productSchema, raw)
    const skus = body.variants.map((v) => v.sku.toUpperCase())
    if (new Set(skus).size !== skus.length) throw badRequest('Each size needs a unique SKU')
    const { variants, purity, ...data } = body
    return db.$transaction(async (tx) => {
      const product = id
        ? await tx.product.update({ where: { id }, data: { ...data, purity: purity ?? null } })
        : await tx.product.create({ data: { ...data, purity: purity ?? null } })
      const existing = await tx.variant.findMany({ where: { productId: product.id }, include: { _count: { select: { orderItems: true } } } })
      const keep = new Set(variants.filter((v) => v.id).map((v) => v.id))
      for (const old of existing.filter((e) => !keep.has(e.id))) {
        // Sizes with order history are retired instead of deleted so old orders stay intact.
        if (old._count.orderItems > 0) await tx.variant.update({ where: { id: old.id }, data: { active: false, sku: `${old.sku}-RETIRED-${Date.now().toString(36)}` } })
        else await tx.variant.delete({ where: { id: old.id } })
      }
      for (const [i, v] of variants.entries()) {
        const data = { ...v, sku: v.sku.toUpperCase(), sortOrder: v.sortOrder || i }
        delete (data as { id?: string }).id
        if (v.id && existing.some((e) => e.id === v.id)) await tx.variant.update({ where: { id: v.id }, data })
        else await tx.variant.create({ data: { ...data, productId: product.id } })
      }
      return productAdmin(await tx.product.findUniqueOrThrow({ where: { id: product.id }, include: productInclude }))
    })
  }

  app.post('/products', async (req) => saveProduct(null, req.body))
  app.put('/products/:id', async (req) => saveProduct((req.params as { id: string }).id, req.body))

  // "Delete" archives (restorable from Admin > Archive); order history keeps its product.
  app.delete('/products/:id', async (req) => {
    const admin = (req as unknown as { admin: User }).admin
    await archive('products', [(req.params as { id: string }).id], admin.email, admin.id)
    return { archived: true }
  })

  app.patch('/variants/:id/stock', async (req) => {
    const { id } = req.params as { id: string }
    const body = parse(z.object({ stock: z.number().int().min(0).max(1_000_000) }), req.body)
    await db.variant.update({ where: { id }, data: { stock: body.stock } })
    return { ok: true }
  })

  app.get('/categories', async () =>
    db.category.findMany({ orderBy: { sortOrder: 'asc' }, include: { _count: { select: { products: true } } } }),
  )
  app.post('/categories', async (req) => {
    const body = parse(z.object({ name: z.string().trim().min(1).max(60), slug: z.string().regex(slugRe), sortOrder: z.number().int().default(0) }), req.body)
    return db.category.create({ data: body })
  })
  app.put('/categories/:id', async (req) => {
    const body = parse(z.object({ name: z.string().trim().min(1).max(60), slug: z.string().regex(slugRe), sortOrder: z.number().int().default(0) }), req.body)
    return db.category.update({ where: { id: (req.params as { id: string }).id }, data: body })
  })
  app.delete('/categories/:id', async (req) => {
    await db.category.delete({ where: { id: (req.params as { id: string }).id } })
    return { ok: true }
  })

  app.get('/coas', async () => {
    const rows = await db.coa.findMany({ where: { deletedAt: null }, orderBy: { testedAt: 'desc' }, include: { product: { select: { id: true, name: true, image: true } } } })
    return rows.map((c) => ({ ...coaAdmin(c), product: c.product }))
  })
  app.post('/coas', async (req) => {
    const c = await db.coa.create({ data: parse(coaSchema, req.body) })
    return coaAdmin(c)
  })
  app.put('/coas/:id', async (req) => {
    const c = await db.coa.update({ where: { id: (req.params as { id: string }).id }, data: parse(coaSchema, req.body) })
    return coaAdmin(c)
  })
  app.delete('/coas/:id', async (req) => {
    const admin = (req as unknown as { admin: User }).admin
    await archive('coas', [(req.params as { id: string }).id], admin.email, admin.id)
    return { ok: true }
  })

  app.post('/uploads/image', async (req) => {
    const file = await req.file()
    if (!file) throw badRequest('Choose an image to upload')
    return { image: await saveProductImage(await file.toBuffer()) }
  })

  app.post('/uploads/certificate', async (req) => {
    const file = await req.file()
    if (!file) throw badRequest('Choose a file to upload')
    return { pages: await saveCertificate(await file.toBuffer(), file.mimetype) }
  })
}
