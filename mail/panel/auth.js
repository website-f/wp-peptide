// Panel sign-in. One administrator, password hashed with bcrypt in /data/admin.json.
// On first start a random password is generated and printed to the logs once
// (`docker compose logs panel`); `npm run reset-password` issues a new one.
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import bcrypt from 'bcryptjs'

const DATA = process.env.PANEL_DATA_DIR ?? '/data'
const ADMIN = path.join(DATA, 'admin.json')
const SECRET = path.join(DATA, 'session.key')
const SESSION_HOURS = 12

export const randomPassword = () => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  const bytes = randomBytes(18)
  let s = ''
  for (const b of bytes) s += alphabet[b % alphabet.length]
  return `${s.slice(0, 6)}-${s.slice(6, 12)}-${s.slice(12, 18)}`
}

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  } catch {
    return null
  }
}

let key = null
async function sessionKey() {
  if (key) return key
  try {
    key = await fs.readFile(SECRET)
  } catch {
    key = randomBytes(32)
    await fs.mkdir(DATA, { recursive: true })
    await fs.writeFile(SECRET, key, { mode: 0o600 })
  }
  return key
}

export async function setPassword(username, password) {
  await fs.mkdir(DATA, { recursive: true })
  const hash = await bcrypt.hash(password, 12)
  await fs.writeFile(ADMIN, JSON.stringify({ username, hash, changedAt: new Date().toISOString() }, null, 2), { mode: 0o600 })
}

/** Creates the administrator once. Returns the one-time password, or null if one exists. */
export async function ensureAdmin() {
  if (await readJson(ADMIN)) return null
  const pw = randomPassword()
  await setPassword('admin', pw)
  return pw
}

let dummy = null

export async function verifyLogin(username, password) {
  const admin = await readJson(ADMIN)
  if (!admin || String(username).trim().toLowerCase() !== admin.username) {
    // Spend the same time as a real check, so unknown usernames are not distinguishable.
    dummy ??= await bcrypt.hash(randomBytes(8).toString('hex'), 12)
    await bcrypt.compare(String(password), dummy)
    return false
  }
  return bcrypt.compare(String(password), admin.hash)
}

export async function issueSession(username) {
  const payload = Buffer.from(JSON.stringify({ u: username, exp: Date.now() + SESSION_HOURS * 3600_000 })).toString('base64url')
  const sig = createHmac('sha256', await sessionKey()).update(payload).digest('base64url')
  return `${payload}.${sig}`
}

export async function readSession(token) {
  if (!token || typeof token !== 'string') return null
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return null
  const want = createHmac('sha256', await sessionKey()).update(payload).digest()
  const got = Buffer.from(sig, 'base64url')
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null
  try {
    const s = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    return s.exp > Date.now() ? s : null
  } catch {
    return null
  }
}

export async function adminName() {
  return (await readJson(ADMIN))?.username ?? 'admin'
}
