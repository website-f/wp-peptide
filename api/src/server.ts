import fs from 'node:fs'
import path from 'node:path'
import cookie from '@fastify/cookie'
import multipart from '@fastify/multipart'
import rateLimit from '@fastify/rate-limit'
import fastifyStatic from '@fastify/static'
import Fastify from 'fastify'
import { requireAdmin } from './lib/auth.js'
import { db, ensureSequences } from './lib/db.js'
import { env } from './lib/env.js'
import { sendError } from './lib/http.js'
import { expireUnpaidOrders } from './lib/orders.js'
import { activeCreds, importLegacyEnvKeys } from './lib/gateway.js'
import { reconcile } from './lib/toyyibpay.js'
import { accountRoutes } from './routes/account.js'
import { adminArchiveRoutes } from './routes/admin/archive.js'
import { adminCatalogRoutes } from './routes/admin/catalog.js'
import { adminOrderRoutes } from './routes/admin/orders.js'
import { adminPaymentRoutes } from './routes/admin/payments.js'
import { adminPeopleRoutes } from './routes/admin/people.js'
import { reportRoutes } from './routes/admin/reports.js'
import { adminStoreRoutes } from './routes/admin/store.js'
import { affiliateRoutes } from './routes/affiliate.js'
import { authRoutes } from './routes/auth.js'
import { checkoutRoutes } from './routes/checkout.js'
import { paymentRoutes } from './routes/payments.js'
import { publicRoutes } from './routes/public.js'
import { seoRoutes } from './routes/seo.js'
import { oauthRoutes } from './routes/oauth.js'

const app = Fastify({
  logger: { level: env.isProd ? 'info' : 'warn' },
  trustProxy: true,
  bodyLimit: 1024 * 1024,
})

await app.register(cookie)
await app.register(multipart, { limits: { fileSize: 15 * 1024 * 1024, files: 1 } })
await app.register(rateLimit, { max: 300, timeWindow: '1 minute' })

fs.mkdirSync(env.uploadDir, { recursive: true })
await app.register(fastifyStatic, {
  root: path.resolve(env.uploadDir),
  prefix: '/uploads/',
  // Upload names are unique per file, so they can be cached forever.
  maxAge: '365d',
  immutable: true,
})

app.setErrorHandler((err, _req, reply) => sendError(reply, err))
app.setNotFoundHandler((_req, reply) => reply.status(404).send({ error: 'Not found' }))

await app.register(publicRoutes)
await app.register(seoRoutes)
await app.register(oauthRoutes)
await app.register(authRoutes)
await app.register(checkoutRoutes)
await app.register(paymentRoutes)
await app.register(accountRoutes)
await app.register(affiliateRoutes)

await app.register(
  async (admin) => {
    admin.addHook('preHandler', async (req) => {
      ;(req as unknown as { admin: unknown }).admin = await requireAdmin(req)
    })
    await admin.register(reportRoutes)
    await admin.register(adminOrderRoutes)
    await admin.register(adminCatalogRoutes)
    await admin.register(adminPeopleRoutes)
    await admin.register(adminStoreRoutes)
    await admin.register(adminPaymentRoutes)
    await admin.register(adminArchiveRoutes)
  },
  { prefix: '/api/admin' },
)

async function bootstrap() {
  await ensureSequences()
  // The admin account is created once by the seeder (prisma/admin.ts), never from env.
  // ToyyibPay keys live encrypted in Admin > Settings; old .env keys are moved there once.
  await importLegacyEnvKeys((m) => app.log.warn(m))
}

// Paid memberships lapse back to the free tier when their period ends.
async function expireMemberships() {
  const r = await db.user.updateMany({ where: { tier: { not: 'MEMBER' }, tierExpiresAt: { lt: new Date() } }, data: { tier: 'MEMBER', tierExpiresAt: null } })
  if (r.count) app.log.info(`Expired ${r.count} memberships`)
}

await bootstrap()
await expireMemberships()
setInterval(() => void expireMemberships().catch((e) => app.log.error(e)), 60 * 60 * 1000).unref()
const sweepUnpaid = () => expireUnpaidOrders((o) => reconcile(o, 'system'), (m) => app.log.warn(m)).catch((e) => app.log.error(e))
void sweepUnpaid()
setInterval(() => void sweepUnpaid(), 30 * 60 * 1000).unref()

await app.listen({ port: env.port, host: '0.0.0.0' })
const gw = await activeCreds()
console.log(`KYVO API listening on :${env.port} (ToyyibPay ${gw ? `ready, ${gw.env}` : 'not set up: Admin > Settings > ToyyibPay'})`)

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    await app.close()
    await db.$disconnect()
    process.exit(0)
  })
}
