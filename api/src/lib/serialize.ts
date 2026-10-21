import type { Prisma } from '@prisma/client'

export const productInclude = {
  category: true,
  // Retired sizes only live on in order history.
  variants: { where: { retiredAt: null }, orderBy: [{ sortOrder: 'asc' }, { priceCents: 'asc' }] },
  coas: { where: { deletedAt: null }, orderBy: { testedAt: 'desc' } },
} satisfies Prisma.ProductInclude

type ProductFull = Prisma.ProductGetPayload<{ include: typeof productInclude }>

/** Shoppers get view-only page images; the original upload (fileUrl) stays admin-only. */
export function coaDto(c: Prisma.CoaGetPayload<object>) {
  return {
    id: c.id,
    lotNumber: c.lotNumber,
    documentTitle: c.documentTitle,
    mfgDate: c.mfgDate,
    retestDate: c.retestDate,
    variantLabel: c.variantLabel,
    purity: Number(c.purity),
    labeledAmount: c.labeledAmount,
    measuredAmount: c.measuredAmount,
    identity: c.identity,
    endotoxin: c.endotoxin,
    microbial: c.microbial,
    heavyMetals: c.heavyMetals,
    appearance: c.appearance,
    lab: c.lab,
    assays: c.assays,
    testedAt: c.testedAt,
    pages: c.pages,
  }
}

export function coaAdmin(c: Prisma.CoaGetPayload<object>) {
  return { ...coaDto(c), fileUrl: c.fileUrl }
}

/** lowStockAt comes from settings.inventory.lowStockThreshold. */
export function productCard(p: ProductFull, lowStockAt = 5) {
  const variants = p.variants.filter((v) => v.active)
  const prices = variants.map((v) => v.priceCents)
  const latest = p.coas[0]
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    tagline: p.tagline,
    image: p.image,
    form: p.form,
    featured: p.featured,
    boxEligible: p.boxEligible,
    category: p.category ? { name: p.category.name, slug: p.category.slug } : null,
    purity: latest ? Number(latest.purity) : p.purity ? Number(p.purity) : null,
    latestLot: latest?.lotNumber ?? null,
    fromPriceCents: prices.length ? Math.min(...prices) : null,
    inStock: variants.some((v) => v.stock > 0),
    variants: variants.map((v) => ({ id: v.id, label: v.label, priceCents: v.priceCents, inStock: v.stock > 0, lowStock: v.stock > 0 && v.stock <= lowStockAt })),
  }
}

export function productDetail(p: ProductFull, lowStockAt = 5) {
  return {
    ...productCard(p, lowStockAt),
    description: p.description,
    gallery: p.gallery,
    casNumber: p.casNumber,
    molecularFormula: p.molecularFormula,
    molecularWeight: p.molecularWeight,
    sequence: p.sequence,
    storage: p.storage,
    coas: p.coas.map(coaDto),
  }
}

export function productAdmin(p: ProductFull & { _count?: { orderItems: number } }) {
  return {
    ...productDetail(p),
    status: p.status,
    sortOrder: p.sortOrder,
    categoryId: p.categoryId,
    purity: p.purity !== null ? Number(p.purity) : null,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    variants: p.variants.map((v) => ({
      id: v.id,
      label: v.label,
      sku: v.sku,
      priceCents: v.priceCents,
      costCents: v.costCents,
      stock: v.stock,
      active: v.active,
      sortOrder: v.sortOrder,
    })),
    totalStock: p.variants.reduce((a, v) => a + v.stock, 0),
  }
}
