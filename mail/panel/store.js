// Reads and writes docker-mailserver's file-based account config.
//
//   postfix-accounts.cf   user@domain|{BLF-CRYPT}$2y$...      mailboxes
//   postfix-virtual.cf    alias@domain target@domain[,more]  forwarders
//   dovecot-quotas.cf     user@domain:2048M                  per-mailbox storage limits
//
// docker-mailserver polls these files and applies changes within a few seconds.
// Every write is atomic (temp file + rename) and serialised, so it never reads half a file.
import fs from 'node:fs/promises'
import path from 'node:path'
import bcrypt from 'bcryptjs'

const CONFIG = process.env.DMS_CONFIG_DIR ?? '/dms-config'
const MAIL = process.env.MAIL_DATA_DIR ?? '/mail-data'
const DATA = process.env.PANEL_DATA_DIR ?? '/data'
export const DOMAIN = (process.env.MAIL_DOMAIN ?? '').toLowerCase()

const F = {
  accounts: path.join(CONFIG, 'postfix-accounts.cf'),
  virtual: path.join(CONFIG, 'postfix-virtual.cf'),
  quotas: path.join(CONFIG, 'dovecot-quotas.cf'),
  meta: path.join(DATA, 'accounts-meta.json'),
}

let chain = Promise.resolve()
/** Runs fn after every earlier write has finished. */
export function serial(fn) {
  const run = chain.then(fn, fn)
  chain = run.catch(() => {})
  return run
}

async function readLines(file) {
  try {
    return (await fs.readFile(file, 'utf8')).split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
  } catch (e) {
    if (e.code === 'ENOENT') return []
    throw e
  }
}

async function writeAtomic(file, content) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
  await fs.writeFile(tmp, content, { mode: 0o640 })
  await fs.rename(tmp, file)
}

export class InputError extends Error {}

export const LOCAL_RE = /^[a-z0-9](?:[a-z0-9._+-]{0,62}[a-z0-9])?$/

export function normalizeLocal(local) {
  const l = String(local ?? '').trim().toLowerCase()
  if (!LOCAL_RE.test(l) || l.includes('..')) throw new InputError('Use letters, numbers, dots, dashes or underscores (it cannot start or end with a dot).')
  return l
}

export function checkPassword(pw) {
  const p = String(pw ?? '')
  if (p.length < 10) throw new InputError('The password needs at least 10 characters.')
  if (p.length > 128) throw new InputError('The password is too long (128 characters at most).')
  if (/[\s|]/.test(p)) throw new InputError('The password cannot contain spaces or the | character.')
  let classes = 0
  for (const re of [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/]) if (re.test(p)) classes++
  if (classes < 3) throw new InputError('Use at least three of: lowercase, uppercase, numbers, symbols.')
  return p
}

/** Dovecot verifies BLF-CRYPT (bcrypt) through the system crypt(), same scheme it generates itself. */
async function hashMailbox(pw) {
  const h = await bcrypt.hash(pw, 11)
  return `{BLF-CRYPT}${h.replace(/^\$2[ab]\$/, '$2y$')}`
}

// ---------- metadata the mail server does not track (creation time) ----------
async function readMeta() {
  try {
    return JSON.parse(await fs.readFile(F.meta, 'utf8'))
  } catch {
    return {}
  }
}
const writeMeta = (m) => writeAtomic(F.meta, JSON.stringify(m, null, 2))

// ---------- quotas ----------
function parseQuota(v) {
  const m = /^(\d+)([KMGT]?)$/i.exec(v ?? '')
  if (!m) return null
  const mult = { '': 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 }[m[2].toUpperCase()]
  return Number(m[1]) * mult
}
async function readQuotas() {
  const map = new Map()
  for (const l of await readLines(F.quotas)) {
    const i = l.lastIndexOf(':')
    if (i > 0) map.set(l.slice(0, i).toLowerCase(), l.slice(i + 1))
  }
  return map
}
async function writeQuotas(map) {
  await writeAtomic(F.quotas, [...map].map(([k, v]) => `${k}:${v}`).join('\n') + (map.size ? '\n' : ''))
}

// ---------- storage used (walks the maildir; cached briefly) ----------
const usage = new Map()
async function dirSize(dir) {
  let total = 0
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return 0
  }
  for (const e of entries) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) total += await dirSize(p)
    else if (e.isFile()) {
      // Maildir files carry their size in the name (",S=1234"); fall back to stat.
      const m = /,S=(\d+)/.exec(e.name)
      total += m ? Number(m[1]) : (await fs.stat(p).catch(() => ({ size: 0 }))).size
    }
  }
  return total
}
function maildirOf(email) {
  const [local, domain] = email.split('@')
  return path.join(MAIL, domain, local)
}
async function usedBytes(email) {
  const hit = usage.get(email)
  if (hit && Date.now() - hit.at < 60_000) return hit.bytes
  const bytes = await dirSize(maildirOf(email))
  usage.set(email, { at: Date.now(), bytes })
  return bytes
}

// ---------- accounts ----------
async function readAccounts() {
  return (await readLines(F.accounts))
    .map((l) => {
      const i = l.indexOf('|')
      return i > 0 ? { email: l.slice(0, i).toLowerCase(), hash: l.slice(i + 1) } : null
    })
    .filter(Boolean)
}
async function writeAccounts(list) {
  await writeAtomic(F.accounts, list.map((a) => `${a.email}|${a.hash}`).join('\n') + (list.length ? '\n' : ''))
}

export async function listAccounts() {
  const [accounts, quotas, meta] = await Promise.all([readAccounts(), readQuotas(), readMeta()])
  return Promise.all(
    accounts.map(async (a) => ({
      email: a.email,
      quotaBytes: quotas.has(a.email) ? parseQuota(quotas.get(a.email)) : null,
      usedBytes: await usedBytes(a.email),
      createdAt: meta[a.email]?.createdAt ?? null,
    })),
  ).then((rows) => rows.sort((x, y) => x.email.localeCompare(y.email)))
}

export async function accountExists(email) {
  return (await readAccounts()).some((a) => a.email === email)
}

const quotaValue = (mb) => (mb === null || mb === undefined || mb === '' ? null : `${Math.round(Number(mb))}M`)
function checkQuotaMb(mb) {
  if (mb === null || mb === undefined || mb === '') return null
  const n = Number(mb)
  if (!Number.isFinite(n) || n < 50 || n > 1024 * 1024) throw new InputError('Storage must be between 50 MB and 1 TB, or unlimited.')
  return Math.round(n)
}

export function createAccount({ local, password, quotaMb }) {
  return serial(async () => {
    const email = `${normalizeLocal(local)}@${DOMAIN}`
    const pw = checkPassword(password)
    const mb = checkQuotaMb(quotaMb)
    const accounts = await readAccounts()
    if (accounts.some((a) => a.email === email)) throw new InputError(`${email} already exists.`)
    if ((await readForwardersRaw()).some((f) => f.from === email)) throw new InputError(`${email} is already a forwarder. Delete the forwarder first.`)
    accounts.push({ email, hash: await hashMailbox(pw) })
    await writeAccounts(accounts)
    if (mb !== null) {
      const q = await readQuotas()
      q.set(email, quotaValue(mb))
      await writeQuotas(q)
    }
    const meta = await readMeta()
    meta[email] = { createdAt: new Date().toISOString() }
    await writeMeta(meta)
    return email
  })
}

export function updateAccount(email, { password, quotaMb }) {
  return serial(async () => {
    const accounts = await readAccounts()
    const acc = accounts.find((a) => a.email === email)
    if (!acc) throw new InputError('No such email account.')
    if (password !== undefined) {
      acc.hash = await hashMailbox(checkPassword(password))
      await writeAccounts(accounts)
    }
    if (quotaMb !== undefined) {
      const mb = checkQuotaMb(quotaMb)
      const q = await readQuotas()
      if (mb === null) q.delete(email)
      else q.set(email, quotaValue(mb))
      await writeQuotas(q)
    }
  })
}

export function deleteAccount(email) {
  return serial(async () => {
    const accounts = await readAccounts()
    if (!accounts.some((a) => a.email === email)) throw new InputError('No such email account.')
    await writeAccounts(accounts.filter((a) => a.email !== email))
    const q = await readQuotas()
    if (q.delete(email)) await writeQuotas(q)
    // Forwarders that only pointed at this mailbox would bounce now: drop them, trim the rest.
    const fwd = (await readForwardersRaw())
      .map((f) => ({ ...f, to: f.to.filter((t) => t !== email) }))
      .filter((f) => f.to.length)
    await writeForwardersRaw(fwd)
    const meta = await readMeta()
    delete meta[email]
    await writeMeta(meta)
    usage.delete(email)
    // Give the mail server a moment to stop serving the mailbox, then remove its mail.
    setTimeout(() => fs.rm(maildirOf(email), { recursive: true, force: true }).catch(() => {}), 8000)
  })
}

// ---------- forwarders ----------
async function readForwardersRaw() {
  return (await readLines(F.virtual))
    .map((l) => {
      const [from, to] = l.split(/\s+/, 2)
      return from && to ? { from: from.toLowerCase(), to: to.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean) } : null
    })
    .filter(Boolean)
}
async function writeForwardersRaw(list) {
  await writeAtomic(F.virtual, list.map((f) => `${f.from} ${f.to.join(',')}`).join('\n') + (list.length ? '\n' : ''))
}

export async function listForwarders() {
  return (await readForwardersRaw()).sort((a, b) => a.from.localeCompare(b.from))
}

const EMAIL_RE = /^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/

export function addForwarder({ local, to }) {
  return serial(async () => {
    const from = `${normalizeLocal(local)}@${DOMAIN}`
    const dest = String(to ?? '').trim().toLowerCase()
    if (!EMAIL_RE.test(dest)) throw new InputError('Enter a valid destination email address.')
    if (dest === from) throw new InputError('A forwarder cannot point at itself.')
    if ((await readAccounts()).some((a) => a.email === from)) throw new InputError(`${from} is a mailbox. Forwarders are for addresses without a mailbox.`)
    const list = await readForwardersRaw()
    const f = list.find((x) => x.from === from)
    if (f) {
      if (f.to.includes(dest)) throw new InputError('That forwarder already exists.')
      f.to.push(dest)
    } else list.push({ from, to: [dest] })
    await writeForwardersRaw(list)
    return { from, to: dest }
  })
}

export function removeForwarder({ from, to }) {
  return serial(async () => {
    const list = await readForwardersRaw()
    const f = list.find((x) => x.from === from)
    if (!f || !f.to.includes(to)) throw new InputError('No such forwarder.')
    f.to = f.to.filter((t) => t !== to)
    await writeForwardersRaw(list.filter((x) => x.to.length))
  })
}

// ---------- DKIM public key published by Rspamd ----------
export async function dkimRecord(selector) {
  const dir = path.join(CONFIG, 'rspamd', 'dkim')
  let files = []
  try {
    files = await fs.readdir(dir)
  } catch {
    return null
  }
  const f = files.find((n) => n.includes(`-${selector}-${DOMAIN}`) && n.endsWith('.public.dns.txt'))
  if (!f) return null
  const raw = await fs.readFile(path.join(dir, f), 'utf8')
  // Joins the quoted chunks of a BIND-style TXT record into one value.
  const parts = [...raw.matchAll(/"([^"]*)"/g)].map((m) => m[1])
  const value = (parts.length ? parts.join('') : raw.replace(/^.*?TXT\s*/s, '')).replace(/\s+/g, ' ').trim()
  return value.includes('p=') ? value : null
}
