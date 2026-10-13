import { db } from './db.js'
import { env } from './env.js'
import { open, seal } from './crypto.js'
import { badRequest } from './http.js'

/**
 * ToyyibPay credentials and mode, managed in Admin > Settings (never in .env).
 *
 * Stored in its own Setting row, apart from the store settings, so it can never reach
 * the public settings endpoint. The category code and secret key are encrypted
 * (lib/crypto.ts); the admin panel only ever sees the category code and the last 4
 * characters of the key. Sandbox and production keep separate credentials, so switching
 * mode is a single toggle.
 */

export type PayEnv = 'sandbox' | 'production'
export const PAY_ENVS: PayEnv[] = ['sandbox', 'production']
export const TOYYIB_HOSTS: Record<PayEnv, string> = {
  sandbox: 'https://dev.toyyibpay.com',
  production: 'https://toyyibpay.com',
}

const KEY = 'secret.toyyibpay'
const LOG_SIZE = 30

interface StoredCreds {
  categoryCode: string // sealed
  secretKey: string // sealed
  secretHint: string // last 4 characters only
  categoryName: string | null
  verifiedAt: string | null
  updatedAt: string
  updatedBy: string
}

interface StoredGateway {
  mode: PayEnv
  sandbox: StoredCreds | null
  production: StoredCreds | null
  log: { at: string; by: string; action: string }[]
}

export interface GatewayCreds {
  env: PayEnv
  baseUrl: string
  categoryCode: string
  secretKey: string
}

const EMPTY: StoredGateway = { mode: 'sandbox', sandbox: null, production: null, log: [] }
const field = (e: PayEnv, f: 'categoryCode' | 'secretKey') => `toyyibpay.${e}.${f}`

let cache: { at: number; value: StoredGateway } | null = null

async function load(): Promise<StoredGateway> {
  if (cache && Date.now() - cache.at < 10_000) return cache.value
  const row = await db.setting.findUnique({ where: { key: KEY } })
  const value = { ...EMPTY, ...((row?.value ?? {}) as Partial<StoredGateway>) }
  cache = { at: Date.now(), value }
  return value
}

async function store(next: StoredGateway) {
  await db.setting.upsert({ where: { key: KEY }, create: { key: KEY, value: next as object }, update: { value: next as object } })
  cache = null
}

function unseal(e: PayEnv, c: StoredCreds | null): GatewayCreds | null {
  if (!c) return null
  const categoryCode = open(c.categoryCode, field(e, 'categoryCode'))
  const secretKey = open(c.secretKey, field(e, 'secretKey'))
  if (!categoryCode || !secretKey) return null
  return { env: e, baseUrl: TOYYIB_HOSTS[e], categoryCode, secretKey }
}

/** Decrypted credentials for one environment, or null if not set up (or unreadable). */
export async function credsFor(e: PayEnv): Promise<GatewayCreds | null> {
  return unseal(e, (await load())[e])
}

/** Credentials new bills are created with. */
export async function activeCreds(): Promise<GatewayCreds | null> {
  return credsFor((await load()).mode)
}

export async function gatewayReady() {
  return (await activeCreds()) !== null
}

/** Live HTTPS address that ToyyibPay can call back and send shoppers back to. */
export function publicUrlsProblem(): string | null {
  for (const [name, url] of [
    ['PUBLIC_URL', env.publicUrl],
    ['API_PUBLIC_URL', env.apiPublicUrl],
  ] as const) {
    let u: URL
    try {
      u = new URL(url)
    } catch {
      return `${name} is not a valid address`
    }
    if (u.protocol !== 'https:') return `The site must run on https:// (${name} is ${url})`
    if (['localhost', '127.0.0.1', '0.0.0.0'].includes(u.hostname)) return `${name} points at this computer (${url}), so ToyyibPay cannot reach it`
  }
  return null
}

/** Admin-safe view: never includes a decrypted secret. */
export async function gatewayStatus() {
  const g = await load()
  const view = (e: PayEnv) => {
    const c = g[e]
    if (!c) return { configured: false as const }
    const creds = unseal(e, c)
    return {
      configured: true as const,
      readable: creds !== null,
      categoryCode: creds?.categoryCode ?? null,
      secretHint: c.secretHint,
      categoryName: c.categoryName,
      verifiedAt: c.verifiedAt,
      updatedAt: c.updatedAt,
      updatedBy: c.updatedBy,
    }
  }
  return {
    provider: 'ToyyibPay',
    mode: g.mode,
    ready: unseal(g.mode, g[g.mode]) !== null,
    sandbox: view('sandbox'),
    production: view('production'),
    callbackUrl: `${env.apiPublicUrl}/api/payments/toyyibpay/callback`,
    returnUrl: `${env.publicUrl}/order/...`,
    productionBlocker: publicUrlsProblem(),
    log: g.log.slice(0, 10),
  }
}

/**
 * Asks ToyyibPay whether this key owns this category. A wrong key or category answers
 * with an empty body or empty fields, so a category name back means the pair is valid.
 */
export async function verifyWithToyyib(e: PayEnv, categoryCode: string, secretKey: string) {
  let text = ''
  try {
    const res = await fetch(`${TOYYIB_HOSTS[e]}/index.php/api/getCategoryDetails`, {
      method: 'POST',
      body: new URLSearchParams({ userSecretKey: secretKey, categoryCode }),
      signal: AbortSignal.timeout(15_000),
    })
    text = (await res.text()).trim()
  } catch {
    return { ok: false as const, error: `Could not reach ToyyibPay (${TOYYIB_HOSTS[e]}). Try again in a minute.` }
  }
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    data = null
  }
  const row = (Array.isArray(data) ? data[0] : data) as { CategoryName?: string; categoryStatus?: string } | null
  if (!row?.CategoryName) {
    const where = e === 'production' ? 'your live ToyyibPay account (toyyibpay.com)' : 'your sandbox account (dev.toyyibpay.com)'
    return { ok: false as const, error: `ToyyibPay did not accept this secret key and category code. Check both are from ${where}.` }
  }
  if (row.categoryStatus !== '1') return { ok: false as const, error: `Category "${row.CategoryName}" is switched off in ToyyibPay. Activate it there first.` }
  return { ok: true as const, categoryName: row.CategoryName }
}

function logged(g: StoredGateway, by: string, action: string): StoredGateway {
  return { ...g, log: [{ at: new Date().toISOString(), by, action }, ...g.log].slice(0, LOG_SIZE) }
}

const label = (e: PayEnv) => (e === 'production' ? 'production' : 'sandbox')

/**
 * Verifies the pair with ToyyibPay, then stores it encrypted. A blank secret keeps the
 * stored one (so the admin can fix a category code without re-pasting the key).
 */
export async function saveCreds(e: PayEnv, input: { categoryCode: string; secretKey?: string }, by: string) {
  const g = await load()
  const current = unseal(e, g[e])
  const secretKey = input.secretKey?.trim() || current?.secretKey
  if (!secretKey) throw badRequest('Enter the secret key')
  const categoryCode = input.categoryCode.trim()
  const check = await verifyWithToyyib(e, categoryCode, secretKey)
  if (!check.ok) throw badRequest(check.error)
  const now = new Date().toISOString()
  const next: StoredGateway = {
    ...g,
    [e]: {
      categoryCode: seal(categoryCode, field(e, 'categoryCode')),
      secretKey: seal(secretKey, field(e, 'secretKey')),
      secretHint: secretKey.slice(-4),
      categoryName: check.categoryName,
      verifiedAt: now,
      updatedAt: now,
      updatedBy: by,
    },
  }
  await store(logged(next, by, `${g[e] ? 'Updated' : 'Added'} ${label(e)} keys (category ${check.categoryName})`))
  return check
}

/** Re-checks stored credentials with ToyyibPay and records the result. */
export async function testCreds(e: PayEnv, by: string) {
  const g = await load()
  const c = g[e]
  if (!c) throw badRequest(`No ${label(e)} keys saved yet`)
  const creds = unseal(e, c)
  if (!creds) throw badRequest('The saved keys cannot be read on this server (the encryption key changed). Enter them again.')
  const check = await verifyWithToyyib(e, creds.categoryCode, creds.secretKey)
  if (check.ok) await store({ ...g, [e]: { ...c, categoryName: check.categoryName, verifiedAt: new Date().toISOString() } })
  void by
  return check
}

export async function removeCreds(e: PayEnv, by: string) {
  const g = await load()
  if (g.mode === e) throw badRequest(`These keys are in use. Switch to ${e === 'production' ? 'sandbox' : 'production'} first.`)
  if (!g[e]) return
  await store(logged({ ...g, [e]: null }, by, `Removed ${label(e)} keys`))
}

export async function setMode(mode: PayEnv, by: string) {
  const g = await load()
  if (g.mode === mode) return
  const creds = unseal(mode, g[mode])
  if (!creds) throw badRequest(`Save and verify the ${label(mode)} keys before switching.`)
  if (mode === 'production') {
    const blocker = publicUrlsProblem()
    if (blocker) throw badRequest(`Cannot take live payments yet: ${blocker}.`)
  }
  // Prove the keys still work right now; a revoked key would break checkout the moment we switch.
  const check = await verifyWithToyyib(mode, creds.categoryCode, creds.secretKey)
  if (!check.ok) throw badRequest(check.error)
  await store(logged({ ...g, mode, [mode]: { ...g[mode]!, categoryName: check.categoryName, verifiedAt: new Date().toISOString() } }, by,
    mode === 'production' ? 'Switched to PRODUCTION (live payments)' : 'Switched to sandbox (test payments)'))
}

/**
 * One-time move of keys that used to live in .env into encrypted settings. Runs only while
 * nothing has been set up in the panel, so the panel always wins afterwards.
 */
export async function importLegacyEnvKeys(log: (m: string) => void) {
  const { secretKey, categoryCode, baseUrl } = env.legacyToyyib
  if (!secretKey || !categoryCode) return
  if (await db.setting.findUnique({ where: { key: KEY } })) return
  const e: PayEnv = baseUrl && !baseUrl.includes('dev.toyyibpay.com') ? 'production' : 'sandbox'
  const now = new Date().toISOString()
  const g: StoredGateway = {
    ...EMPTY,
    mode: e,
    [e]: {
      categoryCode: seal(categoryCode, field(e, 'categoryCode')),
      secretKey: seal(secretKey, field(e, 'secretKey')),
      secretHint: secretKey.slice(-4),
      categoryName: null,
      verifiedAt: null,
      updatedAt: now,
      updatedBy: 'server .env (one-time import)',
    },
  }
  await store(logged(g, 'system', `Imported ${label(e)} keys from the server .env file. Remove TOYYIBPAY_* from .env now.`))
  log(`ToyyibPay ${label(e)} keys imported from .env into encrypted settings. Remove TOYYIBPAY_* from .env.`)
}

/**
 * Deactivates every still-open ToyyibPay bill of an order, so a stale link (old tab, an
 * email, a cancelled order) cannot take money. Best effort: a bill that fails to close
 * stays open and is retried on the next status change; any payment that still lands on
 * it is caught by reconcile() or flagged as an extra payment.
 */
export async function closeOpenBills(orderId: string, log: (m: string) => void = () => {}) {
  const bills = await db.paymentBill.findMany({ where: { orderId, closedAt: null } })
  for (const b of bills) {
    const creds = await credsFor(b.env as PayEnv)
    if (!creds) continue
    try {
      const res = await fetch(`${TOYYIB_HOSTS[b.env as PayEnv]}/index.php/api/inactiveBill`, {
        method: 'POST',
        body: new URLSearchParams({ secretKey: creds.secretKey, billCode: b.billCode }),
        signal: AbortSignal.timeout(15_000),
      })
      const text = await res.text()
      if (/"status"\s*:\s*"success"/i.test(text)) await db.paymentBill.update({ where: { id: b.id }, data: { closedAt: new Date() } })
      else log(`ToyyibPay did not close bill ${b.billCode}: ${text.trim().slice(0, 120)}`)
    } catch (err) {
      log(`Could not reach ToyyibPay to close bill ${b.billCode}: ${(err as Error).message}`)
    }
  }
}
