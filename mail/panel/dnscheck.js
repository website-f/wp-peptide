// "Email Deliverability": the DNS records this server needs, and what the internet sees right now.
import { Resolver } from 'node:dns/promises'
import { dkimRecord } from './store.js'

const DOMAIN = (process.env.MAIL_DOMAIN ?? '').toLowerCase()
const HOST = (process.env.MAIL_HOSTNAME ?? '').toLowerCase()
const IP = process.env.SERVER_IP ?? ''
const SELECTOR = process.env.DKIM_SELECTOR ?? 'mail'

// Public resolvers: we want what Gmail sees, not a cached local answer.
const r = new Resolver({ timeout: 4000, tries: 2 })
r.setServers(['1.1.1.1', '8.8.8.8'])

const safe = async (fn) => {
  try {
    return await fn()
  } catch {
    return null
  }
}
const txt = async (name) => ((await safe(() => r.resolveTxt(name))) ?? []).map((chunks) => chunks.join(''))
const strip = (s) => s.replace(/\s+/g, '').replace(/;$/, '')

async function ipsOf(name) {
  return (await safe(() => r.resolve4(name))) ?? []
}

/** Does this SPF record let SERVER_IP send? Handles ip4, a, mx and one level of include. */
async function spfAllows(record, depth = 0) {
  for (const term of record.split(/\s+/).slice(1)) {
    const t = term.replace(/^[+~?-]/, '')
    if (term.startsWith('-') || term.startsWith('~')) continue
    if (t.startsWith('ip4:') && t.slice(4).split('/')[0] === IP) return true
    if (t === 'a' && (await ipsOf(DOMAIN)).includes(IP)) return true
    if (t.startsWith('a:') && (await ipsOf(t.slice(2))).includes(IP)) return true
    if (t === 'mx' || t.startsWith('mx:')) {
      const mxs = (await safe(() => r.resolveMx(t === 'mx' ? DOMAIN : t.slice(3)))) ?? []
      for (const mx of mxs) if ((await ipsOf(mx.exchange)).includes(IP)) return true
    }
    if (t.startsWith('include:') && depth < 2) {
      const inc = (await txt(t.slice(8))).find((v) => v.startsWith('v=spf1'))
      if (inc && (await spfAllows(inc, depth + 1))) return true
    }
  }
  return false
}

export async function deliverability() {
  const dkimValue = await dkimRecord(SELECTOR)
  const [hostIps, mxs, rootTxt, dkimTxt, dmarcTxt, ptr] = await Promise.all([
    ipsOf(HOST),
    safe(() => r.resolveMx(DOMAIN)),
    txt(DOMAIN),
    txt(`${SELECTOR}._domainkey.${DOMAIN}`),
    txt(`_dmarc.${DOMAIN}`),
    safe(() => r.reverse(IP)),
  ])

  const mxOk = (mxs ?? []).length > 0 && (await Promise.all((mxs ?? []).map((m) => ipsOf(m.exchange)))).some((ips) => ips.includes(IP))
  const spf = rootTxt.filter((v) => v.toLowerCase().startsWith('v=spf1'))
  const spfOk = spf.length === 1 && (await spfAllows(spf[0]))
  const pubKey = (v) => /p=([A-Za-z0-9+/=]+)/.exec(strip(v ?? ''))?.[1]
  const dkimOk = Boolean(dkimValue && dkimTxt.some((v) => pubKey(v) === pubKey(dkimValue)))
  const dmarc = dmarcTxt.find((v) => v.toLowerCase().startsWith('v=dmarc1'))
  const ptrNames = (ptr ?? []).map((n) => n.toLowerCase().replace(/\.$/, ''))

  const spfValue = `v=spf1 a mx ip4:${IP} ~all`
  return {
    domain: DOMAIN,
    host: HOST,
    ip: IP,
    records: [
      { key: 'a', label: 'Mail server address', type: 'A', name: HOST, value: IP, ok: hostIps.includes(IP), current: hostIps.join(', ') || null, where: 'DNS' },
      { key: 'mx', label: 'Incoming mail (MX)', type: 'MX', name: DOMAIN, value: `10 ${HOST}`, ok: mxOk, current: (mxs ?? []).map((m) => `${m.priority} ${m.exchange}`).join(', ') || null, where: 'DNS' },
      {
        key: 'spf',
        label: 'SPF (who may send for the domain)',
        type: 'TXT',
        name: DOMAIN,
        value: spfValue,
        ok: spfOk,
        current: spf.join(' | ') || null,
        note: spf.length > 1 ? 'There is more than one SPF record. Keep only one.' : undefined,
        where: 'DNS',
      },
      { key: 'dkim', label: 'DKIM (signature key)', type: 'TXT', name: `${SELECTOR}._domainkey.${DOMAIN}`, value: dkimValue ?? '(key not generated yet)', ok: dkimOk, current: dkimTxt.join(' ') || null, where: 'DNS' },
      { key: 'dmarc', label: 'DMARC (policy)', type: 'TXT', name: `_dmarc.${DOMAIN}`, value: `v=DMARC1; p=quarantine; rua=mailto:postmaster@${DOMAIN}; adkim=r; aspf=r; pct=100`, ok: Boolean(dmarc), current: dmarc ?? null, where: 'DNS' },
      { key: 'ptr', label: 'Reverse DNS (PTR)', type: 'PTR', name: IP, value: HOST, ok: ptrNames.includes(HOST), current: ptrNames.join(', ') || null, where: 'Server host (VPS provider), not the domain DNS' },
    ],
  }
}
