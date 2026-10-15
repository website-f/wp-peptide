// "Track Delivery": turns Postfix's mail.log into one row per recipient per message,
// like cPanel's delivery report. Reads the live log plus the previous rotation.
import fs from 'node:fs/promises'
import path from 'node:path'
import zlib from 'node:zlib'
import { promisify } from 'node:util'

const gunzip = promisify(zlib.gunzip)
const LOGS = process.env.MAIL_LOG_DIR ?? '/mail-logs'
const MAX_BYTES = 12 * 1024 * 1024

async function readTail(file) {
  try {
    const st = await fs.stat(file)
    const fh = await fs.open(file, 'r')
    try {
      const len = Math.min(st.size, MAX_BYTES)
      const buf = Buffer.alloc(len)
      await fh.read(buf, 0, len, st.size - len)
      return buf.toString('utf8')
    } finally {
      await fh.close()
    }
  } catch {
    return ''
  }
}

async function readLog() {
  const names = await fs.readdir(LOGS).catch(() => [])
  const rotated = names.filter((n) => /^mail\.log\.1(\.gz)?$/.test(n))
  let older = ''
  for (const n of rotated) {
    const p = path.join(LOGS, n)
    older += n.endsWith('.gz') ? (await gunzip(await fs.readFile(p)).catch(() => Buffer.from(''))).toString('utf8') : await readTail(p)
  }
  return older + '\n' + (await readTail(path.join(LOGS, 'mail.log')))
}

const YEAR = new Date().getFullYear()
const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 }

/** Accepts ISO timestamps (rsyslog) and classic "Oct 15 10:00:01" syslog stamps. */
function parseTime(line) {
  const iso = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)\s/.exec(line)
  if (iso) return { time: new Date(iso[1]).toISOString(), rest: line.slice(iso[0].length) }
  const sys = /^([A-Z][a-z]{2})\s+(\d{1,2}) (\d{2}):(\d{2}):(\d{2})\s/.exec(line)
  if (sys) {
    const d = new Date(YEAR, MONTHS[sys[1]], Number(sys[2]), Number(sys[3]), Number(sys[4]), Number(sys[5]))
    if (d.getTime() > Date.now() + 86400_000) d.setFullYear(YEAR - 1)
    return { time: d.toISOString(), rest: line.slice(sys[0].length) }
  }
  return null
}

const kv = (s, k) => {
  const m = new RegExp(`${k}=<([^>]*)>`).exec(s)
  return m ? m[1] : null
}

/** Newest first. Each row: one recipient of one message (or one rejected attempt). */
export async function deliveries({ q = '', status = 'all', limit = 300 } = {}) {
  const text = await readLog()
  const msgs = new Map() // queue id -> { from, size, messageId, client }
  const rows = []

  for (const line of text.split('\n')) {
    const t = parseTime(line)
    if (!t) continue
    const m = /postfix\/([\w/-]+)\[\d+\]:\s+(.*)$/.exec(t.rest)
    if (!m) continue
    const [, proc, body] = m

    // Rejected before a queue id exists (spam source, unknown recipient, relay attempt).
    if (body.startsWith('NOQUEUE: reject:')) {
      const reason = /: (\d{3} [\d.]+ .*?);\s*from=/.exec(body)?.[1] ?? body.slice(17, 200)
      rows.push({ time: t.time, id: null, from: kv(body, 'from') ?? '', to: kv(body, 'to') ?? '', status: 'rejected', relay: /RCPT from ([^:]+)/.exec(body)?.[1] ?? '', detail: reason, direction: 'in' })
      continue
    }

    const idm = /^([0-9A-F]{6,}|[0-9A-Za-z]{10,}):\s+(.*)$/.exec(body)
    if (!idm) continue
    const [, id, rest] = idm
    const msg = msgs.get(id) ?? {}
    msgs.set(id, msg)

    if (proc.endsWith('smtpd') && rest.startsWith('client=')) {
      msg.client = rest.slice(7)
      msg.auth = /sasl_username=([^,\s]+)/.exec(rest)?.[1] ?? null
    } else if (proc.endsWith('cleanup') && rest.startsWith('message-id=')) {
      msg.messageId = rest.slice(11).replace(/[<>]/g, '')
    } else if (proc.endsWith('cleanup') && /milter-(reject|discard)/.test(rest)) {
      rows.push({ time: t.time, id, from: kv(rest, 'from') ?? '', to: kv(rest, 'to') ?? '', status: 'rejected', relay: 'spam filter', detail: /: ([\d.]+ .*?);/.exec(rest)?.[1] ?? 'Rejected by the spam filter', direction: msg.auth ? 'out' : 'in' })
    } else if (proc.endsWith('qmgr') && rest.startsWith('from=<')) {
      msg.from = kv(rest, 'from') ?? ''
      msg.size = Number(/size=(\d+)/.exec(rest)?.[1] ?? 0)
    } else if (/to=</.test(rest) && /status=/.test(rest)) {
      const st = /status=(\w+)/.exec(rest)?.[1] ?? 'unknown'
      const relay = /relay=([^,]+)/.exec(rest)?.[1] ?? ''
      const local = /dovecot|lmtp|local/.test(proc) || /dovecot/.test(relay)
      rows.push({
        time: t.time,
        id,
        from: msg.from ?? '',
        to: kv(rest, 'to') ?? '',
        status: st === 'sent' ? 'delivered' : st, // delivered | deferred | bounced | expired
        relay: relay.replace(/\[[^\]]*\]:\d+$/, '').replace(/^none$/, ''),
        detail: /status=\w+ \((.*)\)\s*$/.exec(rest)?.[1] ?? '',
        dsn: /dsn=([\d.]+)/.exec(rest)?.[1] ?? '',
        size: msg.size ?? 0,
        messageId: msg.messageId ?? '',
        direction: local ? 'in' : 'out',
      })
    }
  }

  const needle = q.trim().toLowerCase()
  return rows
    .filter((r) => status === 'all' || r.status === status || (status === 'problems' && r.status !== 'delivered'))
    .filter((r) => !needle || `${r.from} ${r.to} ${r.id ?? ''} ${r.messageId ?? ''}`.toLowerCase().includes(needle))
    .reverse()
    .slice(0, limit)
}
