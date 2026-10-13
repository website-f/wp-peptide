// Turns the raw 1536x1024 PNG product shots into small AVIF + WebP renditions.
//   node scripts/optimize-images.mjs <folder-with-pngs>
// Output: public/img/products/<slug>-<w>.{avif,webp} (square, cards/PDP)
//         public/img/wide/<slug>-<w>.{avif,webp}     (3:2, hero/features)
import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const src = process.argv[2]
if (!src) throw new Error('usage: node scripts/optimize-images.mjs <folder>')

const MAP = {
  'Kyvo Glutathione Luxury Vial': 'glutathione',
  'Kyvo Reta Pro Luxury Vial': 'reta-pro',
  'KYVO SNAP-8 Luxury Vial Product Shot': 'snap-8',
  'Luxurious KYVO KPV Research Vial': 'kpv',
  'Luxury KYVO AHK-CU Research Vial': 'ahk-cu',
  'Luxury KYVO GHK-CU Vial': 'ghk-cu',
  'Luxury KYVO GLP3-RT Vial on Marble': 'glp-3rt',
  'Luxury KYVO Kisspeptin Peptide Vial': 'kisspeptin',
  'Luxury KYVO MOTS-C Peptide Vial': 'mots-c',
  'Luxury KYVO NAD+ Vial on Black Marble': 'nad-plus',
  'Luxury KYVO Research Vial on Marble': 'bpc-157-tb-500',
  'Luxury KYVO Tesamorelin Research Vial': 'tesamorelin',
  'Premium CJC-1295 Ipamorelin Vial': 'cjc-1295-ipamorelin',
}
const SQUARE = [320, 560, 900]
const WIDE = [960, 1600]
const root = path.resolve(import.meta.dirname, '../public/img')
fs.mkdirSync(path.join(root, 'products'), { recursive: true })
fs.mkdirSync(path.join(root, 'wide'), { recursive: true })

async function emit(pipeline, out) {
  await pipeline.clone().avif({ quality: 48, effort: 7, chromaSubsampling: '4:2:0' }).toFile(out + '.avif')
  await pipeline.clone().webp({ quality: 68, effort: 6, smartSubsample: true }).toFile(out + '.webp')
}

let before = 0
for (const file of fs.readdirSync(src)) {
  const slug = MAP[path.parse(file).name]
  if (!slug) { console.warn('skip (unmapped):', file); continue }
  const input = path.join(src, file)
  before += fs.statSync(input).size
  const { width, height } = await sharp(input).metadata()
  const side = Math.min(width, height)
  const square = sharp(input).extract({ left: Math.round((width - side) / 2), top: Math.round((height - side) / 2), width: side, height: side })
  for (const w of SQUARE) await emit(square.clone().resize(w, w), path.join(root, 'products', `${slug}-${w}`))
  for (const w of WIDE) await emit(sharp(input).resize(w), path.join(root, 'wide', `${slug}-${w}`))
  console.log('ok', slug)
}
let after = 0
for (const d of ['products', 'wide']) for (const f of fs.readdirSync(path.join(root, d))) after += fs.statSync(path.join(root, d, f)).size
console.log(`source ${(before / 1e6).toFixed(1)} MB -> all renditions ${(after / 1e6).toFixed(2)} MB`)
