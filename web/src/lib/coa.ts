import type { Coa } from './types'

/** "Batch" for real certificates, "Lot" for summary-only records. */
export function lotWord(c: Coa) {
  return c.pages.length ? 'Batch' : 'Lot'
}

/**
 * The certificates that describe what ships today: the newest one per compound
 * (a blend has one per compound). Input must be newest first.
 */
export function currentDocs(coas: Coa[]) {
  const seen = new Set<string>()
  return coas.filter((c) => {
    const k = c.documentTitle ?? ''
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * Orders a blend's certificates the way its name reads ("BPC-157 / TB-500" -> BPC-157, then TB500),
 * by where each compound's first word appears in the product name. Unmatched ones keep their order, last.
 */
export function inNameOrder(coas: Coa[], productName: string) {
  const name = squash(productName)
  const at = (c: Coa) => {
    if (!c.documentTitle) return Infinity
    const i = name.indexOf(squash(c.documentTitle.split(/[\s-]/)[0]))
    return i < 0 ? Infinity : i
  }
  return [...coas].sort((a, b) => at(a) - at(b))
}

/** Groups library rows by product, keeping the API order (real certificates first, newest first). */
export function groupByProduct(coas: Coa[]) {
  const groups = new Map<string, { product: NonNullable<Coa['product']>; docs: Coa[] }>()
  for (const c of coas) {
    if (!c.product) continue
    const g = groups.get(c.product.slug)
    if (g) g.docs.push(c)
    else groups.set(c.product.slug, { product: c.product, docs: [c] })
  }
  return [...groups.values()]
}

/** Viewer order for one product: today's certificates in name order, then older batches newest first. */
export function viewerOrder(coas: Coa[], productName: string) {
  const current = inNameOrder(currentDocs(coas), productName)
  return { current, history: coas.filter((c) => !current.includes(c)) }
}
