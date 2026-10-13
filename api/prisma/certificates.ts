/**
 * Real batch certificates of analysis (supplier COAs, KYVO-watermarked scans).
 * Page images live in web/public/coa/<doc>/p<n>-{900|1700}.{avif,webp}
 * (built by web/scripts/optimize-coas.mjs); no PDF is published.
 *
 * Runs once per MARKER: replaces the placeholder lots of each mapped product with
 * the real documents, then never touches certificates again (admins own them after that).
 */
import type { PrismaClient } from '@prisma/client'

const MARKER = 'coa.realDocs.v1'
const LAB = 'Manufacturer batch QC'

interface Doc {
  title: string
  slug: string
  pages: number
  batch: string
  mfg: string
  retest: string | null
  reported: string
  purity: number
  identity: string
  appearance: string
  endotoxin: string
  microbial: string
  heavyMetals: string
  tests: number
}

// Transcribed from the certificates. Empty string = not tested on that certificate (hidden on the site).
const DOCS: Record<string, Doc> = {
  retatrutide: { title: 'Retatrutide', slug: 'retatrutide', pages: 2, batch: 'RET-26031501', mfg: '2026-03-15', retest: '2028-03-14', reported: '2026-03-15', purity: 99.2, identity: 'Conforms (HPLC, MS)', appearance: 'White loose powder', endotoxin: '<3 EU/mg', microbial: 'Conforms', heavyMetals: '', tests: 17 },
  cagrilintide: { title: 'Cagrilintide', slug: 'cagrilintide', pages: 2, batch: '26030603-01', mfg: '2026-03-06', retest: '2028-03-05', reported: '2026-03-06', purity: 99.7, identity: 'Conforms (MS)', appearance: 'Conforms', endotoxin: '<3 EU/mg', microbial: 'Conforms', heavyMetals: '', tests: 14 },
  bpc157: { title: 'BPC-157 Acetate', slug: 'bpc-157', pages: 2, batch: '26031801-03', mfg: '2026-03-18', retest: '2028-03-17', reported: '2026-03-18', purity: 99.7, identity: 'Conforms (HPLC, MS)', appearance: 'White powder', endotoxin: 'Conforms', microbial: 'Conforms', heavyMetals: 'Conforms', tests: 13 },
  tb500: { title: 'TB500', slug: 'tb-500', pages: 1, batch: '26031901', mfg: '2026-03-19', retest: '2028-03-18', reported: '2026-03-19', purity: 99.6, identity: 'Conforms (MS)', appearance: 'White powder', endotoxin: '<10 EU/mg', microbial: '', heavyMetals: '', tests: 9 },
  ghkcu: { title: 'GHK-Cu', slug: 'ghk-cu', pages: 2, batch: '100003-26010702', mfg: '2026-04-02', retest: '2028-04-01', reported: '2026-04-02', purity: 99.9, identity: 'Conforms (HPLC, MS)', appearance: 'Blue crystalline particles', endotoxin: '', microbial: 'Conforms', heavyMetals: 'Conforms', tests: 15 },
  cjc: { title: 'CJC-1295 without DAC', slug: 'cjc-1295-no-dac', pages: 2, batch: '800028-26031301', mfg: '2026-03-13', retest: '2028-03-12', reported: '2026-03-13', purity: 99.7, identity: 'Conforms (HPLC, MS)', appearance: 'White powder', endotoxin: 'Conforms', microbial: 'Conforms', heavyMetals: '', tests: 13 },
  ipamorelin: { title: 'Ipamorelin', slug: 'ipamorelin', pages: 2, batch: '800046-26031501-04', mfg: '2026-03-15', retest: '2028-03-14', reported: '2026-03-15', purity: 99.8, identity: 'Conforms (HPLC, MS)', appearance: 'White powder', endotoxin: 'Conforms', microbial: 'Conforms', heavyMetals: '', tests: 13 },
  // KPV prints an expiry date, not a retest date, so none is shown.
  kpv: { title: 'KPV', slug: 'kpv', pages: 2, batch: '26031605', mfg: '2026-03-16', retest: null, reported: '2026-03-16', purity: 99.3, identity: 'Conforms (HPLC, MS)', appearance: 'Conforms', endotoxin: 'Conforms', microbial: '', heavyMetals: '', tests: 12 },
  motsc: { title: 'MOTS-c', slug: 'mots-c', pages: 2, batch: '26030503-04', mfg: '2026-03-06', retest: '2028-03-05', reported: '2026-03-06', purity: 99.4, identity: 'Conforms (HPLC, MS)', appearance: 'White powder', endotoxin: '<3 EU/mg', microbial: 'Conforms', heavyMetals: '', tests: 15 },
  nad: { title: 'NAD+', slug: 'nad-plus', pages: 2, batch: '26032501', mfg: '2026-03-18', retest: null, reported: '2026-03-18', purity: 99.2, identity: 'Conforms (MS)', appearance: 'White powder', endotoxin: '<0.2 EU/mg', microbial: 'Conforms', heavyMetals: 'Not detected', tests: 18 },
  tesamorelin: { title: 'Tesamorelin', slug: 'tesamorelin', pages: 2, batch: '26030604-03', mfg: '2026-03-06', retest: '2028-03-05', reported: '2026-03-06', purity: 99.4, identity: 'Conforms (HPLC, MS)', appearance: 'White powder', endotoxin: 'Conforms', microbial: 'Conforms', heavyMetals: '', tests: 13 },
}

// Product slug -> its certificates, in the order shown (blends carry one per compound).
const PRODUCTS: Record<string, (keyof typeof DOCS)[]> = {
  'glp-3rt': ['retatrutide'],
  'reta-pro': ['retatrutide', 'cagrilintide'],
  'bpc-157-tb-500': ['bpc157', 'tb500'],
  'ghk-cu': ['ghkcu'],
  'cjc-1295-ipamorelin': ['cjc', 'ipamorelin'],
  kpv: ['kpv'],
  'mots-c': ['motsc'],
  'nad-plus': ['nad'],
  tesamorelin: ['tesamorelin'],
}

const day = (s: string) => new Date(`${s}T00:00:00.000Z`)

export async function importCertificates(db: PrismaClient) {
  if (await db.setting.findUnique({ where: { key: MARKER } })) return
  let count = 0
  for (const [slug, keys] of Object.entries(PRODUCTS)) {
    const product = await db.product.findUnique({ where: { slug }, select: { id: true } })
    if (!product) continue
    await db.$transaction(async (tx) => {
      // Placeholder lots from the first catalogue seed have no page images.
      await tx.coa.deleteMany({ where: { productId: product.id, pages: { isEmpty: true }, lotNumber: { startsWith: 'KY-' } } })
      // Order matters: the storefront lists a product's certificates newest first, so
      // stagger testedAt by a second to keep the manifest order stable.
      for (const [i, key] of keys.entries()) {
        const d = DOCS[key]
        const data = {
          documentTitle: d.title,
          mfgDate: day(d.mfg),
          retestDate: d.retest ? day(d.retest) : null,
          purity: d.purity,
          identity: d.identity,
          appearance: d.appearance,
          endotoxin: d.endotoxin,
          microbial: d.microbial,
          heavyMetals: d.heavyMetals,
          lab: LAB,
          assays: d.tests,
          testedAt: new Date(day(d.reported).getTime() + (keys.length - i) * 1000),
          labeledAmount: null,
          measuredAmount: null,
          variantLabel: null,
          pages: Array.from({ length: d.pages }, (_, n) => `/coa/${d.slug}/p${n + 1}`),
        }
        await tx.coa.upsert({
          where: { productId_lotNumber: { productId: product.id, lotNumber: d.batch } },
          create: { productId: product.id, lotNumber: d.batch, ...data },
          update: data,
        })
        count++
      }
    })
  }
  await db.setting.create({ data: { key: MARKER, value: { at: new Date().toISOString(), documents: count } } })
  console.log(`certificates: imported ${count} real certificate documents`)
}
