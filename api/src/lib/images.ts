import { randomBytes } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import sharp, { type Metadata } from 'sharp'
import { env } from './env.js'
import { badRequest } from './http.js'

// Every product image is stored as a "base" path; the storefront requests
// `${base}-${width}.avif|webp`. Seeded images use the same scheme under /img/products.
export const SQUARE_WIDTHS = [320, 560, 900] as const

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

const DOC_TYPES: Record<string, string> = { 'application/pdf': 'pdf' }

/** COA certificates: PDFs are kept as-is, photos/scans are re-encoded to a compact WebP. */
export async function saveCertificate(buf: Buffer, mimetype: string): Promise<string> {
  if (buf.length > MAX_INPUT_BYTES) throw badRequest('File is larger than 15 MB')
  const dir = path.join(env.uploadDir, 'coa')
  await fs.mkdir(dir, { recursive: true })
  const id = `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`
  if (DOC_TYPES[mimetype]) {
    if (buf.subarray(0, 5).toString() !== '%PDF-') throw badRequest('That PDF looks damaged')
    await fs.writeFile(path.join(dir, `${id}.pdf`), buf)
    return `/uploads/coa/${id}.pdf`
  }
  try {
    await sharp(buf).rotate().resize({ width: 1800, withoutEnlargement: true }).webp({ quality: 78 }).toFile(path.join(dir, `${id}.webp`))
  } catch {
    throw badRequest('Upload a PDF or an image of the certificate')
  }
  return `/uploads/coa/${id}.webp`
}
