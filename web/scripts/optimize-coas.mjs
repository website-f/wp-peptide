// Turns scanned certificate-of-analysis pages into small, sharp, view-only page images.
//
//   1. Pull the original page scans out of each PDF, losslessly (needs poppler):
//        pdfimages -j "Retatrutide COA.pdf" pages/Retatrutide_COA
//      -> pages/Retatrutide_COA-000.jpg, -001.jpg ...
//   2. node scripts/optimize-coas.mjs <pages-folder>
//
// Output: public/coa/<document>/p<n>-<w>.{avif,webp} at 900 px (phones) and 1700 px
// (desktop and zoom). No PDF is published, so the site has no certificate file to download.
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const src = process.argv[2]
if (!src) throw new Error('usage: node scripts/optimize-coas.mjs <folder-of-page-jpgs>')

// Source file prefix -> public document slug.
const DOCS = {
  Retatrutide_COA: 'retatrutide',
  Cagrilintide_COA: 'cagrilintide',
  'BPC-157_COA': 'bpc-157',
  'TB500-800097_COA': 'tb-500',
  'GHK-Cu_COA': 'ghk-cu',
  CJC1295_Without_DAC_COA: 'cjc-1295-no-dac',
  Ipamorelin_COA: 'ipamorelin',
  KPV_COA: 'kpv',
  'MOTS-c_COA': 'mots-c',
  NAD_COA: 'nad-plus',
  Tesamorelin_800052_COA: 'tesamorelin',
}
// Tuned on real scans: small table text stays crisp at these settings.
const SIZES = [
  { w: 900, avif: 48, webp: 70 },
  { w: 1700, avif: 40, webp: 68 },
]
const root = path.resolve(import.meta.dirname, '../public/coa')

let before = 0
let after = 0
const files = fs.readdirSync(src).filter((f) => /-\d{3}\.(jpe?g|png)$/i.test(f)).sort()
for (const [prefix, slug] of Object.entries(DOCS)) {
  const pages = files.filter((f) => f.startsWith(`${prefix}-`))
  if (!pages.length) {
    console.warn('missing pages for', prefix)
    continue
  }
  const out = path.join(root, slug)
  fs.mkdirSync(out, { recursive: true })
  for (const [i, f] of pages.entries()) {
    const input = path.join(src, f)
    before += fs.statSync(input).size
    for (const s of SIZES) {
      const base = sharp(input).flatten({ background: '#ffffff' }).resize({ width: s.w, withoutEnlargement: true })
      const a = path.join(out, `p${i + 1}-${s.w}.avif`)
      const w = path.join(out, `p${i + 1}-${s.w}.webp`)
      await base.clone().avif({ quality: s.avif, effort: 7 }).toFile(a)
      await base.clone().webp({ quality: s.webp, smartSubsample: true }).toFile(w)
      after += fs.statSync(a).size + fs.statSync(w).size
    }
  }
  console.log(`ok ${slug}: ${pages.length} page(s)`)
}
console.log(`page scans ${(before / 1e6).toFixed(1)} MB -> all renditions ${(after / 1e6).toFixed(2)} MB`)
