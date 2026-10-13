/**
 * Seeds the KYVO catalogue (idempotent, keyed by slug / lot / code).
 * With SEED_DEMO=1 it also creates sample customers, partners and ~3 months of
 * orders so the admin dashboards have something to show. Never run demo mode in production.
 */
import { PrismaClient, type OrderStatus, type Tier } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { seedAdminOnce } from './admin.js'
import { importCertificates } from './certificates.js'

const db = new PrismaClient()
const RM = (n: number) => Math.round(n * 100)

const categories = [
  { slug: 'metabolic', name: 'Metabolic research', sortOrder: 1 },
  { slug: 'recovery', name: 'Tissue & recovery', sortOrder: 2 },
  { slug: 'cellular', name: 'Cellular energy', sortOrder: 3 },
  { slug: 'gh-axis', name: 'GH axis', sortOrder: 4 },
  { slug: 'cosmetic', name: 'Cosmetic peptides', sortOrder: 5 },
  { slug: 'endocrine', name: 'Endocrine', sortOrder: 6 },
]

interface SeedProduct {
  slug: string
  name: string
  category: string
  tagline: string
  description: string
  featured?: boolean
  casNumber?: string
  molecularFormula?: string
  molecularWeight?: string
  sequence?: string
  variants: [label: string, priceRm: number, stock: number][]
}

const STORAGE = 'Store lyophilised at -20°C, protected from light. Once reconstituted, keep at 2-8°C.'

const products: SeedProduct[] = [
  {
    slug: 'glp-3rt',
    name: 'GLP-3RT',
    category: 'metabolic',
    featured: true,
    tagline: 'Triple-agonist incretin research peptide',
    description:
      'GLP-3RT (retatrutide) is a synthetic single-chain peptide engineered to act on the GIP, GLP-1 and glucagon receptors. It is used in receptor-pharmacology and metabolic-signalling research models.\n\nSupplied as a lyophilised powder in a sealed glass vial. Each lot is independently tested for purity, identity and endotoxin before release.',
    casNumber: '2381089-83-2',
    molecularFormula: 'C221H342N46O68',
    molecularWeight: '4731.3 g/mol',
    variants: [
      ['5mg', 229, 60],
      ['10mg', 389, 80],
      ['20mg', 699, 40],
      ['30mg', 989, 24],
    ],
  },
  {
    slug: 'reta-pro',
    name: 'Reta Pro',
    category: 'metabolic',
    featured: true,
    tagline: 'High-load GLP-3RT format for extended studies',
    description:
      'Reta Pro is our high-load presentation of the GLP-3RT research peptide, packed for longer study protocols that need more material from a single lot. Same sequence, same testing, larger fill.\n\nSupplied lyophilised. Every lot ships with a certificate covering HPLC purity, LC-MS identity and endotoxin.',
    casNumber: '2381089-83-2',
    molecularFormula: 'C221H342N46O68',
    molecularWeight: '4731.3 g/mol',
    variants: [
      ['20mg', 749, 30],
      ['40mg', 1389, 18],
    ],
  },
  {
    slug: 'bpc-157-tb-500',
    name: 'BPC-157 / TB-500',
    category: 'recovery',
    featured: true,
    tagline: 'Two-peptide blend in a single vial',
    description:
      'A combined vial of BPC-157, a 15-residue synthetic sequence derived from a gastric protein fragment, and TB-500, the active fragment of thymosin beta-4. The pair is frequently studied together in tissue-signalling and cell-migration models.\n\nEach component is assayed separately so the certificate reports both measured amounts.',
    sequence: 'BPC-157: GEPPPGKPADDAGLV / TB-500: Ac-LKKTETQ',
    molecularFormula: 'C62H98N16O22 / C38H68N10O14',
    molecularWeight: '1419.5 / 889.0 g/mol',
    variants: [
      ['5mg / 5mg', 199, 70],
      ['10mg / 10mg', 259, 90],
    ],
  },
  {
    slug: 'ghk-cu',
    name: 'GHK-Cu',
    category: 'cosmetic',
    featured: true,
    tagline: 'Copper tripeptide complex',
    description:
      'GHK-Cu is the copper(II) complex of the naturally occurring tripeptide glycyl-L-histidyl-L-lysine. It is a reference compound in extracellular-matrix and fibroblast research.\n\nSupplied as a blue lyophilised powder, the colour comes from the bound copper.',
    casNumber: '89030-95-5',
    sequence: 'Gly-His-Lys (Cu²⁺ complex)',
    variants: [
      ['50mg', 189, 80],
      ['100mg', 299, 55],
    ],
  },
  {
    slug: 'ahk-cu',
    name: 'AHK-Cu',
    category: 'cosmetic',
    tagline: 'Copper tripeptide for follicle research',
    description:
      'AHK-Cu is the copper complex of the tripeptide alanyl-L-histidyl-L-lysine, a close structural relative of GHK-Cu. It is used in dermal papilla and follicle cell-culture research.\n\nLyophilised, sealed under inert gas, and tested per lot.',
    sequence: 'Ala-His-Lys (Cu²⁺ complex)',
    variants: [['100mg', 379, 35]],
  },
  {
    slug: 'snap-8',
    name: 'SNAP-8',
    category: 'cosmetic',
    tagline: 'Acetyl octapeptide-3',
    description:
      'SNAP-8 (acetyl octapeptide-3) is an eight-residue extension of the hexapeptide argireline. It is studied for its interaction with the SNARE complex in neuromuscular-junction models.\n\nSupplied as a white lyophilised powder.',
    casNumber: '868844-74-0',
    sequence: 'Ac-EEMQRRAD-NH2',
    molecularFormula: 'C41H70N16O16S',
    molecularWeight: '1075.2 g/mol',
    variants: [['100mg', 169, 60]],
  },
  {
    slug: 'kpv',
    name: 'KPV',
    category: 'recovery',
    featured: true,
    tagline: 'Alpha-MSH C-terminal tripeptide',
    description:
      'KPV (Lys-Pro-Val) is the C-terminal tripeptide of alpha-melanocyte-stimulating hormone. It is used in research on inflammatory signalling pathways in epithelial and immune cell models.\n\nLyophilised and tested per lot for purity and identity.',
    casNumber: '67727-97-3',
    sequence: 'Lys-Pro-Val',
    molecularFormula: 'C16H30N4O4',
    molecularWeight: '342.4 g/mol',
    variants: [
      ['10mg', 189, 75],
      ['30mg', 439, 40],
    ],
  },
  {
    slug: 'glutathione',
    name: 'Glutathione',
    category: 'cellular',
    featured: true,
    tagline: 'Reduced L-glutathione',
    description:
      'Reduced glutathione (GSH) is the tripeptide gamma-glutamyl-cysteinyl-glycine, the principal intracellular thiol antioxidant. It is a standard reagent in oxidative-stress and redox-biology research.\n\nSupplied as a lyophilised powder in high-fill vials.',
    casNumber: '70-18-8',
    sequence: 'γ-Glu-Cys-Gly',
    molecularFormula: 'C10H17N3O6S',
    molecularWeight: '307.3 g/mol',
    variants: [
      ['600mg', 169, 90],
      ['1500mg', 329, 50],
    ],
  },
  {
    slug: 'nad-plus',
    name: 'NAD+',
    category: 'cellular',
    featured: true,
    tagline: 'Nicotinamide adenine dinucleotide',
    description:
      'NAD+ is the oxidised form of nicotinamide adenine dinucleotide, a coenzyme central to cellular redox reactions and a substrate for sirtuins and PARPs. It is widely used in metabolism and ageing research.\n\nSupplied lyophilised. Keep the vial sealed and dry until use.',
    casNumber: '53-84-9',
    molecularFormula: 'C21H27N7O14P2',
    molecularWeight: '663.4 g/mol',
    variants: [
      ['500mg', 319, 65],
      ['1000mg', 549, 40],
    ],
  },
  {
    slug: 'mots-c',
    name: 'MOTS-c',
    category: 'cellular',
    featured: true,
    tagline: 'Mitochondrial-derived peptide',
    description:
      'MOTS-c is a 16-amino-acid peptide encoded in the mitochondrial 12S rRNA region. It is studied in research on mitochondrial-nuclear signalling and cellular energy metabolism.\n\nLyophilised, tested per lot by an independent laboratory.',
    casNumber: '1627580-64-6',
    sequence: 'MRWQEMGYIFYPRKLR',
    molecularFormula: 'C101H152N28O22S2',
    molecularWeight: '2174.6 g/mol',
    variants: [
      ['10mg', 229, 70],
      ['40mg', 699, 30],
    ],
  },
  {
    slug: 'tesamorelin',
    name: 'Tesamorelin',
    category: 'gh-axis',
    featured: true,
    tagline: 'Stabilised GHRH analogue',
    description:
      'Tesamorelin is a synthetic 44-residue analogue of growth-hormone-releasing hormone with a trans-3-hexenoyl group at the N-terminus for stability. It is used in research on the GHRH receptor and the somatotropic axis.\n\nSupplied as a lyophilised powder.',
    casNumber: '218949-48-5',
    molecularFormula: 'C221H366N72O67S',
    molecularWeight: '5135.9 g/mol',
    variants: [
      ['5mg', 219, 50],
      ['10mg', 389, 45],
      ['20mg', 699, 20],
    ],
  },
  {
    slug: 'cjc-1295-ipamorelin',
    name: 'CJC-1295 / Ipamorelin',
    category: 'gh-axis',
    featured: true,
    tagline: 'No-DAC GHRH analogue with a ghrelin-receptor agonist',
    description:
      'A combined vial of CJC-1295 without DAC (modified GRF 1-29) and ipamorelin, a selective pentapeptide agonist of the ghrelin receptor. The pairing is a common subject in pulsatile GH-release research models.\n\nBoth components are quantified on the certificate.',
    casNumber: '863288-34-0 / 170851-70-4',
    molecularFormula: 'C152H252N44O42 / C38H49N9O5',
    molecularWeight: '3367.9 / 711.9 g/mol',
    variants: [['5mg / 5mg', 319, 55]],
  },
  {
    slug: 'kisspeptin',
    name: 'Kisspeptin-10',
    category: 'endocrine',
    tagline: 'KISS1R agonist decapeptide',
    description:
      'Kisspeptin-10 is the shortest biologically active fragment of the kisspeptin family and an agonist of the KISS1 receptor (GPR54). It is used in research on the hypothalamic-pituitary-gonadal axis.\n\nSupplied lyophilised.',
    casNumber: '374675-21-5',
    sequence: 'YNWNSFGLRF-NH2',
    molecularFormula: 'C63H83N17O14',
    molecularWeight: '1302.4 g/mol',
    variants: [['10mg', 149, 4]],
  },
]

// Deterministic pseudo-random so re-seeding produces the same numbers.
let seed = 42
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646
const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)]
const between = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1))

async function seedCatalog() {
  const catIds = new Map<string, string>()
  for (const c of categories) {
    const row = await db.category.upsert({ where: { slug: c.slug }, create: c, update: { name: c.name, sortOrder: c.sortOrder } })
    catIds.set(c.slug, row.id)
  }

  // Only stock an empty store; never resurrect products an admin has since removed.
  if ((await db.product.count()) > 0) {
    console.log('catalog: products already exist, skipping')
    return
  }
  for (const [i, p] of products.entries()) {
    const code = p.slug.replace(/[^a-z0-9]/g, '').slice(0, 6).toUpperCase()
    const product = await db.product.create({
      data: {
        slug: p.slug,
        name: p.name,
        tagline: p.tagline,
        description: p.description,
        image: `/img/products/${p.slug}`,
        categoryId: catIds.get(p.category),
        featured: p.featured ?? false,
        casNumber: p.casNumber,
        molecularFormula: p.molecularFormula,
        molecularWeight: p.molecularWeight,
        sequence: p.sequence,
        storage: STORAGE,
        sortOrder: i,
        variants: {
          create: p.variants.map(([label, price, stock], j) => ({
            label,
            sku: `KY-${code}-${label.replace(/[^0-9a-z]/gi, '').toUpperCase()}`,
            priceCents: RM(price),
            costCents: Math.round(RM(price) * (0.22 + rand() * 0.08)),
            stock,
            sortOrder: j,
          })),
        },
      },
    })
    // Two lots per product: current and previous.
    for (const [k, months] of [
      [0, 0],
      [1, 2],
    ] as const) {
      const tested = new Date(Date.UTC(2026, 8 - months, between(3, 26)))
      const label = p.variants[Math.min(k, p.variants.length - 1)][0]
      const labeled = parseFloat(label)
      const measured = labeled * (1 + (rand() * 0.14 - 0.03))
      await db.coa.create({
        data: {
          productId: product.id,
          lotNumber: `KY-${code}-${String(tested.getUTCMonth() + 1).padStart(2, '0')}${String(tested.getUTCFullYear()).slice(2)}${k ? 'B' : 'A'}`,
          variantLabel: label,
          purity: (99 + rand() * 0.89).toFixed(2),
          labeledAmount: label,
          measuredAmount: label.includes('/') ? `${label} (both within spec)` : `${measured.toFixed(2)}${label.replace(/[0-9.]/g, '')}`,
          assays: pick([6, 7, 7, 8]),
          testedAt: tested,
        },
      })
    }
    console.log('product', p.name)
  }

  for (const c of [
    { code: 'WELCOME10', type: 'PERCENT' as const, value: 10, minSubtotal: RM(200), description: 'First-order welcome code' },
    { code: 'LAB50', type: 'FIXED' as const, value: RM(50), minSubtotal: RM(600), description: 'RM50 off orders over RM600' },
  ]) {
    await db.coupon.upsert({ where: { code: c.code }, create: c, update: {} })
  }
}

const people = [
  ['Aisyah Rahman', 'aisyah.rahman'],
  ['Daniel Tan Wei Jie', 'daniel.tan'],
  ['Priya Nair', 'priya.nair'],
  ['Hafiz Kamarudin', 'hafiz.k'],
  ['Mei Ling Chong', 'meiling.c'],
  ['Arjun Subramaniam', 'arjun.s'],
  ['Nurul Izzah Azmi', 'nurul.izzah'],
  ['Jason Lim Kok Seng', 'jason.lim'],
  ['Siti Hajar Osman', 'sitihajar'],
  ['Kavitha Ramasamy', 'kavitha.r'],
  ['Farid Zulkifli', 'farid.z'],
  ['Grace Ooi Hui Min', 'grace.ooi'],
  ['Ravi Chandran', 'ravi.c'],
  ['Amirul Hakim', 'amirul.h'],
  ['Chloe Yap Xin Yi', 'chloe.yap'],
  ['Syafiq Ismail', 'syafiq.i'],
  ['Lavanya Pillai', 'lavanya.p'],
  ['Kenneth Goh', 'kenneth.goh'],
]
const cities = [
  ['Petaling Jaya', 'Selangor', '47800'],
  ['Kuala Lumpur', 'W.P. Kuala Lumpur', '50450'],
  ['George Town', 'Pulau Pinang', '10200'],
  ['Johor Bahru', 'Johor', '80000'],
  ['Shah Alam', 'Selangor', '40000'],
  ['Ipoh', 'Perak', '30450'],
  ['Kota Kinabalu', 'Sabah', '88000'],
  ['Kuching', 'Sarawak', '93000'],
]

async function seedDemo() {
  if ((await db.order.count()) > 0) {
    console.log('demo: orders already exist, skipping')
    return
  }
  // Import after env is loaded so the app modules see DATABASE_URL.
  const { createOrder, setOrderStatus } = await import('../src/lib/orders.js')
  const { buildQuote } = await import('../src/lib/pricing.js')
  const { ensureSequences } = await import('../src/lib/db.js')
  await ensureSequences()

  // Generous stock while generating history, real levels restored afterwards.
  const variants = await db.variant.findMany({ include: { product: true } })
  const realStock = new Map(variants.map((v) => [v.id, v.stock]))
  await db.variant.updateMany({ data: { stock: 5000 } })

  const hash = await bcrypt.hash('demo12345', 10)
  const tiers: Tier[] = ['MEMBER', 'MEMBER', 'MEMBER', 'INSIDER', 'VIP', 'MEMBER', 'FOUNDER', 'INSIDER']
  const users = []
  for (const [i, [name, handle]] of people.entries()) {
    const created = new Date(Date.now() - between(20, 160) * 86400_000)
    const tier = tiers[i % tiers.length]
    users.push(
      await db.user.create({
        data: {
          name,
          email: `${handle}@example.com`,
          phone: `01${between(1, 9)}${between(1000000, 9999999)}`,
          passwordHash: hash,
          tier,
          tierExpiresAt: tier === 'MEMBER' ? null : new Date(Date.now() + between(10, 300) * 86400_000),
          createdAt: created,
        },
      }),
    )
  }

  const partners = [
    { user: users[1], code: 'danieltan', couponCode: 'DANIELTAN', platform: 'YouTube', handle: '@danieltan.lab', status: 'APPROVED' as const },
    { user: users[4], code: 'meilingc', couponCode: 'MEILING', platform: 'Instagram', handle: '@meiling.research', status: 'APPROVED' as const },
    { user: users[9], code: 'kavithar', couponCode: 'KAVITHA', platform: 'TikTok', handle: '@kavlabnotes', status: 'PENDING' as const },
  ]
  const affiliates = []
  for (const p of partners) {
    affiliates.push(
      await db.affiliate.create({
        data: {
          userId: p.user.id,
          code: p.code,
          couponCode: p.couponCode,
          platform: p.platform,
          handle: p.handle,
          status: p.status,
          approvedAt: p.status === 'APPROVED' ? new Date(Date.now() - 100 * 86400_000) : null,
          promotionPlan: 'Lab walkthrough videos and COA explainers.',
          payoutMethod: 'BANK',
          bankName: pick(['Maybank', 'CIMB Bank', 'Public Bank']),
          bankAccountName: p.user.name.toUpperCase(),
          bankAccountNumber: String(between(100000000000, 999999999999)),
          createdAt: new Date(Date.now() - 110 * 86400_000),
        },
      }),
    )
  }
  for (const a of affiliates.slice(0, 2)) {
    const n = between(180, 420)
    await db.affiliateClick.createMany({
      data: Array.from({ length: n }, () => ({
        affiliateId: a.id,
        landing: '/',
        createdAt: new Date(Date.now() - rand() * 90 * 86400_000),
      })),
    })
  }

  const active = variants.filter((v) => v.product.status === 'ACTIVE')
  const statuses: OrderStatus[] = ['DELIVERED', 'DELIVERED', 'DELIVERED', 'DELIVERED', 'SHIPPED', 'PROCESSING', 'PAID', 'PENDING_PAYMENT', 'CANCELLED', 'REFUNDED']
  const paths: Record<OrderStatus, OrderStatus[]> = {
    PENDING_PAYMENT: [],
    PAID: ['PAID'],
    PROCESSING: ['PAID', 'PROCESSING'],
    SHIPPED: ['PAID', 'PROCESSING', 'SHIPPED'],
    DELIVERED: ['PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'],
    CANCELLED: ['CANCELLED'],
    REFUNDED: ['PAID', 'REFUNDED'],
  }

  const ORDERS = 150
  for (let i = 0; i < ORDERS; i++) {
    const daysAgo = Math.floor(Math.pow(rand(), 1.4) * 90)
    const created = new Date(Date.now() - daysAgo * 86400_000 - between(0, 20) * 3600_000)
    const guest = rand() < 0.2
    const user = guest ? null : pick(users)
    const lines = between(1, 3)
    const items: { variantId: string; quantity: number }[] = []
    for (let l = 0; l < lines; l++) {
      const v = pick(active)
      if (items.some((x) => x.variantId === v.id)) continue
      items.push({ variantId: v.id, quantity: pick([1, 1, 1, 2, 3, 3, 5, 10]) })
    }
    const aff = rand() < 0.28 ? pick(affiliates.slice(0, 2)) : null
    const useCoupon = aff && rand() < 0.6 ? aff.couponCode : !aff && rand() < 0.08 ? 'WELCOME10' : null
    const freshUser = user ? await db.user.findUnique({ where: { id: user.id } }) : null
    const quote = await buildQuote({
      items,
      mode: 'standard',
      user: freshUser,
      couponCode: useCoupon,
      refCode: aff && !useCoupon ? aff.code : null,
      redeemPoints: freshUser && freshUser.pointsBalance > 2000 && rand() < 0.3 ? 1500 : 0,
    })
    const [city, state, postcode] = pick(cities)
    const name = user?.name ?? pick(['Hidayah Musa', 'Terence Lee', 'Sharmila Devi', 'Iskandar Yusof'])
    const order = await createOrder({
      quote,
      kind: 'STANDARD',
      user: freshUser,
      email: user?.email ?? `${name.split(' ')[0].toLowerCase()}${between(10, 99)}@example.com`,
      name,
      phone: user?.phone ?? `012${between(1000000, 9999999)}`,
      address: { line1: `${between(1, 88)}, Jalan ${pick(['SS 2/24', 'Bukit Bintang', 'Ampang', 'Tun Razak', 'Kenanga 3', 'Perdana 5'])}`, city, state, postalCode: postcode, country: 'Malaysia' },
      paymentMethod: rand() < 0.85 ? 'toyyibpay' : 'bank',
    })
    const target = daysAgo < 2 ? pick<OrderStatus>(['PENDING_PAYMENT', 'PAID', 'PROCESSING']) : daysAgo < 5 ? pick<OrderStatus>(['PAID', 'PROCESSING', 'SHIPPED']) : pick(statuses)
    for (const st of paths[target]) {
      await setOrderStatus(order.id, st, 'seed', {
        paymentRef: st === 'PAID' ? `TP${between(100000000, 999999999)}` : undefined,
        carrier: st === 'SHIPPED' ? pick(['J&T Express', 'Pos Laju', 'DHL eCommerce']) : undefined,
        trackingNumber: st === 'SHIPPED' ? `MY${between(100000000, 999999999)}` : undefined,
      })
    }
    // Shift the whole timeline into the past.
    const at = (h: number) => new Date(created.getTime() + h * 3600_000)
    const o = await db.order.findUniqueOrThrow({ where: { id: order.id } })
    await db.order.update({
      where: { id: order.id },
      data: {
        createdAt: created,
        paidAt: o.paidAt ? at(1) : null,
        shippedAt: o.shippedAt ? at(20) : null,
        deliveredAt: o.deliveredAt ? at(68) : null,
        cancelledAt: o.cancelledAt ? at(30) : null,
        refundedAt: o.refundedAt ? at(120) : null,
      },
    })
    const events = await db.orderEvent.findMany({ where: { orderId: order.id }, orderBy: { createdAt: 'asc' } })
    const offsets: Record<string, number> = { created: 0, paid: 1, processing: 4, shipped: 20, delivered: 68, cancelled: 30, refunded: 120 }
    for (const e of events) await db.orderEvent.update({ where: { id: e.id }, data: { createdAt: at(offsets[e.type] ?? 0) } })
    await db.commission.updateMany({ where: { orderId: order.id }, data: { createdAt: at(1) } })
    const exp = new Date(at(1))
    exp.setMonth(exp.getMonth() + 12)
    await db.pointsTxn.updateMany({ where: { orderId: order.id }, data: { createdAt: at(1) } })
    await db.pointsTxn.updateMany({ where: { orderId: order.id, delta: { gt: 0 } }, data: { expiresAt: exp } })
  }

  // One settled payout and one open request so the payouts screen has both states.
  const { requestPayout } = await import('../src/routes/affiliate.js')
  for (const [i, a] of affiliates.slice(0, 2).entries()) {
    try {
      const p = await requestPayout(a.id, 'admin')
      if (i === 0) {
        await db.payout.update({ where: { id: p.id }, data: { status: 'PAID', reference: `PP-${between(10000000, 99999999)}`, paidAt: new Date(Date.now() - 6 * 86400_000), createdAt: new Date(Date.now() - 8 * 86400_000) } })
        await db.commission.updateMany({ where: { payoutId: p.id }, data: { status: 'PAID' } })
      }
    } catch (e) {
      console.log('payout skipped:', (e as Error).message)
    }
  }

  // Build a Box subscribers.
  const boxable = active.filter((v) => v.product.boxEligible)
  for (const u of [users[2], users[7]]) {
    const items = [0, 1, 2, 3].map(() => ({ variantId: pick(boxable).id, quantity: 1 }))
    const quote = await buildQuote({ items, mode: 'box', user: u })
    const next = new Date(Date.now() + between(5, 25) * 86400_000)
    const sub = await db.subscription.create({
      data: {
        userId: u.id,
        email: u.email,
        name: u.name,
        shippingAddress: { line1: '12, Jalan Kenanga 3', city: 'Shah Alam', state: 'Selangor', postalCode: '40000', country: 'Malaysia' },
        items: quote.lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity, name: l.name, variantLabel: l.variantLabel })),
        priceCents: quote.totalCents,
        boxesShipped: 1,
        nextShipAt: next,
        createdAt: new Date(next.getTime() - 30 * 86400_000),
      },
    })
    const o = await createOrder({
      quote,
      kind: 'BOX',
      user: u,
      email: u.email,
      name: u.name,
      phone: u.phone,
      address: { line1: '12, Jalan Kenanga 3', city: 'Shah Alam', state: 'Selangor', postalCode: '40000', country: 'Malaysia' },
      paymentMethod: 'toyyibpay',
      subscriptionId: sub.id,
      extraItems: [{ name: 'Bacteriostatic Water', variantLabel: 'Included with your box', quantity: 1, unitPriceCents: 0 }],
    })
    await setOrderStatus(o.id, 'PAID', 'seed', { paymentRef: `TP${between(100000000, 999999999)}` })
  }

  await db.contactMessage.createMany({
    data: [
      { name: 'Hidayah Musa', email: 'hidayah@example.com', topic: 'Order', orderRef: 'KY10433', message: 'Hi, can I change the delivery address for my order? I moved last week.' },
      { name: 'Terence Lee', email: 'terence.lee@example.com', topic: 'COA', message: 'Where can I find the certificate for the GHK-Cu 100mg lot I received?' },
      { name: 'Sharmila Devi', email: 'sharmila@example.com', topic: 'Bulk', message: 'Our lab needs 60 vials of NAD+ 500mg monthly. Do you offer invoicing?', handled: true },
    ],
  })
  await db.subscriber.createMany({
    data: ['lab.notes', 'researcher.kl', 'pg.bench', 'ms.wan', 'biochem.jb', 'nadia.r'].map((h) => ({ email: `${h}@example.com` })),
    skipDuplicates: true,
  })

  for (const [id, stock] of realStock) await db.variant.update({ where: { id }, data: { stock } })
  console.log(`demo: ${people.length} customers, ${ORDERS} orders, ${affiliates.length} partners (password for demo users: demo12345)`)
}

await seedAdminOnce(db)
await seedCatalog()
await importCertificates(db)
if (process.env.SEED_DEMO === '1') await seedDemo()
await db.$disconnect()
