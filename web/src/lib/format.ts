// Currency comes from store settings (MYR by default because ToyyibPay settles in ringgit).
// Formatting is configured once at startup so every component can call money() synchronously.
let symbol = 'RM'
let locale = 'en-MY'

export function configureCurrency(c: { symbol: string; locale: string }) {
  symbol = c.symbol
  locale = c.locale
}

export function money(cents: number | null | undefined, opts: { compact?: boolean; whole?: boolean } = {}) {
  const v = (cents ?? 0) / 100
  const neg = v < 0
  const abs = Math.abs(v)
  let body: string
  if (opts.compact && abs >= 10000) {
    body = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(abs)
  } else {
    const digits = opts.whole || (abs % 1 === 0 && abs >= 100) ? 0 : 2
    body = abs.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits })
  }
  return `${neg ? '-' : ''}${symbol}${body}`
}

/** Exact two-decimal amount for receipts, invoices and totals. */
export function moneyExact(cents: number | null | undefined) {
  const v = (cents ?? 0) / 100
  return `${v < 0 ? '-' : ''}${symbol}${Math.abs(v).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export const currencySymbol = () => symbol

export function date(d: string | Date | null | undefined, withTime = false) {
  if (!d) return ''
  const x = typeof d === 'string' ? new Date(d) : d
  return x.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  })
}

export function relative(d: string | Date) {
  const x = typeof d === 'string' ? new Date(d) : d
  const s = Math.round((Date.now() - x.getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`
  return date(x)
}

export const num = (n: number) => n.toLocaleString('en-US')

export function plural(n: number, one: string, many = `${one}s`) {
  return `${num(n)} ${n === 1 ? one : many}`
}

/** What a number of points is worth in cents, using settings.points.valueCentsPer100. */
export function pointsCents(points: number, valueCentsPer100: number | undefined) {
  return Math.floor((points * (valueCentsPer100 ?? 100)) / 100)
}
