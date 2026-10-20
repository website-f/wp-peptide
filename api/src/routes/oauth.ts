import { createHash, randomBytes } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { findClient, purchasesFor, secretMatches } from '../lib/apps.js'
import { currentUser } from '../lib/auth.js'
import { db } from '../lib/db.js'
import { HttpError, badRequest, parse } from '../lib/http.js'

// "Sign in with KYVO" for first-party apps: OAuth 2 authorization code flow with PKCE (S256).
//   1. App sends the browser to GET /api/oauth/authorize?client_id&redirect_uri&state&code_challenge
//   2. Signed-in users go straight back to redirect_uri with ?code&state (others sign in first)
//   3. App server exchanges the code at POST /api/oauth/token (client secret + code_verifier)

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
const b64url = (buf: Buffer) => buf.toString('base64url')

function clientFromBasic(req: FastifyRequest) {
  const h = req.headers.authorization ?? ''
  if (!h.startsWith('Basic ')) return null
  const [id, secret] = Buffer.from(h.slice(6), 'base64').toString('utf8').split(':')
  const client = id ? findClient(id) : null
  return client && secret && secretMatches(client, secret) ? client : null
}

export async function oauthRoutes(app: FastifyInstance) {
  app.get('/api/oauth/authorize', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    const q = parse(
      z.object({
        client_id: z.string().min(1).max(80),
        redirect_uri: z.string().url().max(300),
        state: z.string().min(8).max(200),
        code_challenge: z.string().min(43).max(128),
        code_challenge_method: z.literal('S256').default('S256'),
        response_type: z.literal('code').default('code'),
      }),
      req.query,
    )
    const client = findClient(q.client_id)
    // Never redirect to an address the app did not register (open-redirect / code theft).
    if (!client || !client.redirectUris.includes(q.redirect_uri)) throw badRequest('Unknown app or return address')

    const user = await currentUser(req)
    if (!user) {
      const back = req.url
      return reply.redirect(`/login?next=${encodeURIComponent(back)}&app=${encodeURIComponent(client.name)}`)
    }

    const code = b64url(randomBytes(32))
    await db.$transaction([
      db.appGrant.upsert({
        where: { userId_clientId: { userId: user.id, clientId: client.clientId } },
        create: { userId: user.id, clientId: client.clientId, lastUsedAt: new Date() },
        update: { lastUsedAt: new Date() },
      }),
      db.appCode.create({
        data: { codeHash: sha256(code), userId: user.id, clientId: client.clientId, redirectUri: q.redirect_uri, codeChallenge: q.code_challenge, expiresAt: new Date(Date.now() + 120_000) },
      }),
    ])
    const url = new URL(q.redirect_uri)
    url.searchParams.set('code', code)
    url.searchParams.set('state', q.state)
    return reply.redirect(url.toString())
  })

  app.post('/api/oauth/token', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const b = parse(
      z.object({
        grant_type: z.literal('authorization_code'),
        code: z.string().min(20).max(200),
        redirect_uri: z.string().max(300),
        client_id: z.string().max(80),
        client_secret: z.string().max(200),
        code_verifier: z.string().min(43).max(128),
      }),
      req.body,
    )
    const client = findClient(b.client_id)
    if (!client || !secretMatches(client, b.client_secret)) throw new HttpError(401, 'invalid_client')
    const row = await db.appCode.findUnique({ where: { codeHash: sha256(b.code) } })
    const challenge = b64url(createHash('sha256').update(b.code_verifier).digest())
    if (!row || row.usedAt || row.expiresAt < new Date() || row.clientId !== client.clientId || row.redirectUri !== b.redirect_uri || row.codeChallenge !== challenge) {
      throw new HttpError(400, 'invalid_grant')
    }
    // Single use, even under a race.
    const claimed = await db.appCode.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } })
    if (!claimed.count) throw new HttpError(400, 'invalid_grant')
    const user = await db.user.findUnique({ where: { id: row.userId } })
    if (!user || user.deletedAt) throw new HttpError(400, 'invalid_grant')
    return { user: { id: user.id, email: user.email, name: user.name } }
  })

  // App server -> what this user has bought (only for users who signed in to that app).
  app.get('/api/oauth/purchases', async (req) => {
    const client = clientFromBasic(req)
    if (!client) throw new HttpError(401, 'invalid_client')
    const { user_id } = parse(z.object({ user_id: z.string().min(1).max(40) }), req.query)
    const grant = await db.appGrant.findUnique({ where: { userId_clientId: { userId: user_id, clientId: client.clientId } } })
    if (!grant) throw new HttpError(403, 'not_linked')
    const user = await db.user.findUnique({ where: { id: user_id }, select: { deletedAt: true, email: true, name: true } })
    if (!user || user.deletedAt) throw new HttpError(403, 'not_linked')
    return { user: { id: user_id, email: user.email, name: user.name }, items: await purchasesFor(user_id) }
  })

  // App server -> the user disconnected or deleted their app account.
  app.post('/api/oauth/revoke', async (req) => {
    const client = clientFromBasic(req)
    if (!client) throw new HttpError(401, 'invalid_client')
    const { user_id } = parse(z.object({ user_id: z.string().min(1).max(40) }), req.body)
    await db.appGrant.deleteMany({ where: { userId: user_id, clientId: client.clientId } })
    return { ok: true }
  })
}
