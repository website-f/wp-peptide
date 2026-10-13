import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import sharp, { type Metadata, type Sharp } from 'sharp'
import { env } from './env.js'
import { badRequest } from './http.js'

// Every product image is stored as a "base" path; the storefront requests
// `${base}-${width}.avif|webp`. Seeded images use the same scheme under /img/products.
export const SQUARE_WIDTHS = [320, 560, 900] as const

const execFileAsync = promisify(execFile)
const MAX_INPUT_BYTES = 15 * 1024 * 1024

export async function saveProductImage(buf: Buffer): Promise<string> {
  if (buf.length > MAX_INPUT_BYTES) throw badRequest('Image is larger than 15 MB')
  let meta: Metadata
  try {
    meta = await sharp(buf).metadata()
  } catch {
    throw badRequest('That file is not a supported image')
  }
  if (!meta.width || !meta.height) throw badRequest('That file is not a supported image')

  const id = `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`
  const dir = path.join(env.uploadDir, 'products')
  await fs.mkdir(dir, { recursive: true })
  const base = sharp(buf, { failOn: 'error' }).rotate()
  for (const w of SQUARE_WIDTHS) {
    const sized = base.clone().resize(w, w, { fit: 'cover', position: 'attention' })
    await sized.clone().avif({ quality: 48, effort: 5 }).toFile(path.join(dir, `${id}-${w}.avif`))
    await sized.clone().webp({ quality: 68, effort: 5 }).toFile(path.join(dir, `${id}-${w}.webp`))
  }
  return `/uploads/products/${id}`
}

// Certificates are published as page images only, so the storefront never serves a
// downloadable document. Each page is a base path rendered at `${base}-{900|1700}.avif|webp`.
export const COA_WIDTHS = [
  { w: 900, avif: 48, webp: 70 },
  { w: 1700, avif: 40, webp: 68 },
] as const
const MAX_COA_PAGES = 12

async function pdfPages(buf: Buffer, tmp: string): Promise<string[]> {
  if (buf.subarray(0, 5).toString() !== '%PDF-') throw badRequest('That PDF looks damaged')
  const src = path.join(tmp, 'in.pdf')
  await fs.writeFile(src, buf)
  try {
    // 200 dpi keeps A4 table text sharp at the 1700 px rendition.
    await execFileAsync('pdftoppm', ['-r', '200', '-l', String(MAX_COA_PAGES), '-png', src, path.join(tmp, 'page')], { timeout: 90_000 })
  } catch {
    throw badRequest('Could not read that PDF')
  }
  const pages = (await fs.readdir(tmp)).filter((f) => f.startsWith('page') && f.endsWith('.png')).sort()
  if (!pages.length) throw badRequest('That PDF has no pages')
  return pages.map((f) => path.join(tmp, f))
}

/** COA upload (PDF or image) -> view-only page image bases. The original file is not kept. */
export async function saveCertificate(buf: Buffer, mimetype: string): Promise<string[]> {
  if (buf.length > MAX_INPUT_BYTES) throw badRequest('File is larger than 15 MB')
  const id = `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`
  const dir = path.join(env.uploadDir, 'coa', id)
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'coa-'))
  try {
    const inputs: (string | Buffer)[] = mimetype === 'application/pdf' ? await pdfPages(buf, tmp) : [buf]
    await fs.mkdir(dir, { recursive: true })
    const bases: string[] = []
    for (const [i, input] of inputs.entries()) {
      for (const s of COA_WIDTHS) {
        let sized: Sharp
        try {
          sized = sharp(input, { failOn: 'error' }).rotate().flatten({ background: '#ffffff' }).resize({ width: s.w, withoutEnlargement: true })
          // effort 3: ~0.8 s a page (effort 6 is ~7x slower for ~8% smaller files)
          await sized.clone().avif({ quality: s.avif, effort: 3 }).toFile(path.join(dir, `p${i + 1}-${s.w}.avif`))
        } catch {
          throw badRequest('Upload a PDF or an image of the certificate')
        }
        await sized.clone().webp({ quality: s.webp, smartSubsample: true }).toFile(path.join(dir, `p${i + 1}-${s.w}.webp`))
      }
      bases.push(`/uploads/coa/${id}/p${i + 1}`)
    }
    return bases
  } catch (e) {
    await fs.rm(dir, { recursive: true, force: true })
    throw e
  } finally {
    await fs.rm(tmp, { recursive: true, force: true })
  }
}
