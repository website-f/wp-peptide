import path from 'node:path'
import cookie from '@fastify/cookie'
import fastifyStatic from '@fastify/static'
import Fastify from 'fastify'
import { adminName, ensureAdmin, issueSession, readSession, setPassword, verifyLogin } from './auth.js'
import { deliverability } from './dnscheck.js'
import {
  DOMAIN,
  InputError,
  addForwarder,
  checkPassword,
  createAccount,
  deleteAccount,
  listAccounts,
  listForwarders,
  removeForwarder,
  updateAccount,
} from './store.js'
import { deliveries } from './track.js'

const BASE = (process.env.BASE_PATH ?? '/mail').replace(/\/$/, '')
const COOKIE = 'kyvo_mailpanel'
const secure = process.env.COOKIE_SECURE !== 'false'
const HOST = process.env.MAIL_HOSTNAME ?? ''

const app = Fastify({ logger: { level: 'warn' }, trustProxy: true, bodyLimit: 64 * 1024 })
await app.register(cookie)

// ---------- simple per-IP throttle for sign-in ----------
const attempts = new Map()
function throttled(ip) {
  const now = Date.now()
  const a = (attempts.get(ip) ?? []).filter((t) => now - t < 15 * 60_000)
  attempts.set(ip, a)
  return a.length >= 8
}

app.setErrorHandler((err, _req, reply) => {
  if (err instanceof InputError) return reply.status(400).send({ error: err.message })
  if (err.statusCode && err.statusCode < 500) return reply.status(err.statusCode).send({ error: err.message })
  app.log.error(err)
  return reply.status(500).send({ error: 'Something went wrong. Try again.' })
})

const api = async (r) => {
  // Every state-changing call must be a same-site JSON request (blocks cross-site form posts).
  r.addHook('preHandler', async (req, reply) => {
    if (req.method !== 'GET' && !String(req.headers['content-type'] ?? '').startsWith('application/json')) {
      return reply.status(415).send({ error: 'JSON only' })
    }
    if (req.routeOptions.config?.public) return
    const s = await readSession(req.cookies[COOKIE])
    if (!s) return reply.status(401).send({ error: 'Please sign in' })
    req.user = s.u
  })

  r.post('/login', { config: { public: true } }, async (req, reply) => {
    if (throttled(req.ip)) return reply.status(429).send({ error: 'Too many attempts. Wait 15 minutes and try again.' })
    const { username, password } = req.body ?? {}
    if (!(await verifyLogin(username ?? '', password ?? ''))) {
      attempts.get(req.ip).push(Date.now())
      return reply.status(401).send({ error: 'Wrong username or password' })
    }
    attempts.delete(req.ip)
    const name = await adminName()
    reply.setCookie(COOKIE, await issueSession(name), { path: BASE, httpOnly: true, secure, sameSite: 'strict', maxAge: 12 * 3600 })
    return { user: name }
  })
  r.post('/logout', { config: { public: true } }, async (_req, reply) => {
    reply.clearCookie(COOKIE, { path: BASE })
    return { ok: true }
  })
  r.get('/me', { config: { public: true } }, async (req) => {
    const s = await readSession(req.cookies[COOKIE])
    return { user: s?.u ?? null, domain: DOMAIN, host: HOST }
  })
  r.post('/password', async (req) => {
    const { current, next } = req.body ?? {}
    if (!(await verifyLogin(req.user, current ?? ''))) throw new InputError('Your current password is not correct.')
    await setPassword(req.user, checkPassword(next))
    return { ok: true }
  })

  r.get('/overview', async () => {
    const [accounts, forwarders] = await Promise.all([listAccounts(), listForwarders()])
    return {
      domain: DOMAIN,
      host: HOST,
      accounts: accounts.length,
      forwarders: forwarders.length,
      usedBytes: accounts.reduce((a, x) => a + x.usedBytes, 0),
      settings: {
        username: `name@${DOMAIN}`,
        incoming: { server: HOST, imapPort: 993, security: 'SSL/TLS' },
        outgoing: { server: HOST, ports: [{ port: 465, security: 'SSL/TLS' }, { port: 587, security: 'STARTTLS' }] },
      },
    }
  })

  r.get('/accounts', async () => listAccounts())
  r.post('/accounts', async (req) => ({ email: await createAccount(req.body ?? {}) }))
  r.patch('/accounts/:email', async (req) => {
    const { password, quotaMb } = req.body ?? {}
    await updateAccount(String(req.params.email).toLowerCase(), { password, quotaMb })
    return { ok: true }
  })
  r.delete('/accounts/:email', async (req) => {
    await deleteAccount(String(req.params.email).toLowerCase())
    return { ok: true }
  })

  r.get('/forwarders', async () => listForwarders())
  r.post('/forwarders', async (req) => addForwarder(req.body ?? {}))
  r.post('/forwarders/remove', async (req) => {
    await removeForwarder({ from: String(req.body?.from ?? '').toLowerCase(), to: String(req.body?.to ?? '').toLowerCase() })
    return { ok: true }
  })

  r.get('/delivery', async (req) => {
    const { q, status, limit } = req.query ?? {}
    return deliveries({ q: String(q ?? ''), status: String(status ?? 'all'), limit: Math.min(1000, Number(limit) || 300) })
  })
  r.get('/deliverability', async () => deliverability())
}

await app.register(api, { prefix: `${BASE}/api` })

await app.register(fastifyStatic, {
  root: path.join(import.meta.dirname, 'public'),
  prefix: `${BASE}/`,
  index: ['index.html'],
  setHeaders: (res, file) => {
    res.setHeader('Cache-Control', file.endsWith('.html') ? 'no-cache' : 'public, max-age=3600')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Referrer-Policy', 'same-origin')
    res.setHeader('Content-Security-Policy', "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; frame-ancestors 'none'; form-action 'self'")
  },
})
app.get(BASE, (_req, reply) => reply.redirect(`${BASE}/`))
app.get('/health', { logLevel: 'silent' }, async () => ({ ok: true }))

const pw = await ensureAdmin()
if (pw) {
  console.log('\n================ KYVO mail panel ================')
  console.log(' Administrator account created (shown only once):')
  console.log('   username: admin')
  console.log(`   password: ${pw}`)
  console.log(` Sign in at ${BASE}/ and change it under "Password".`)
  console.log('=================================================\n')
}
await app.listen({ port: 3000, host: '0.0.0.0' })
console.log(`[mail-panel] listening on :3000${BASE} for ${DOMAIN}`)
