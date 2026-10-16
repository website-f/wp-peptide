import { createHash, randomBytes } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { clearSession, currentUser, hashPassword, publicUser, requireUser, setSession, verifyPassword } from '../lib/auth.js'
import { db } from '../lib/db.js'
import { env } from '../lib/env.js'
import { HttpError, badRequest, parse } from '../lib/http.js'
import { mailAccount } from '../lib/mailer.js'

const limited = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }

export const passwordSchema = z.string().min(8, 'Use at least 8 characters').max(128)

const RESET_MINUTES = 60
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
const resetGone = () => badRequest('This reset link has expired or was already used. Request a new one.')

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/register', limited, async (req, reply) => {
    const body = parse(
      z.object({
        name: z.string().trim().min(1).max(120),
        email: z.email().max(160),
        password: passwordSchema,
        phone: z.string().max(40).optional(),
        confirmAge: z.literal(true, { error: 'Please confirm you are 21 or older' }),
      }),
      req.body,
    )
    const email = body.email.toLowerCase()
    if (await db.user.findUnique({ where: { email } })) throw new HttpError(409, 'An account with that email already exists. Sign in instead.')
    const user = await db.user.create({
      data: { email, name: body.name, phone: body.phone || null, passwordHash: await hashPassword(body.password), lastLoginAt: new Date() },
    })
    // Guest orders are deliberately NOT merged by email: without email verification
    // that would expose someone else's order history. Guests keep their private order link.
    setSession(reply, user)
    return publicUser(user)
  })

  app.post('/api/auth/login', limited, async (req, reply) => {
    const body = parse(z.object({ email: z.email(), password: z.string().min(1).max(128) }), req.body)
    const user = await db.user.findUnique({ where: { email: body.email.toLowerCase() } })
    if (!user || !(await verifyPassword(body.password, user.passwordHash))) throw new HttpError(401, 'Email or password is incorrect')
    if (user.deletedAt) throw new HttpError(403, 'This account has been closed. Contact us if you need it back.')
    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
    setSession(reply, user)
    return publicUser(user)
  })

  // "Forgot password": always answers the same way, so it cannot reveal who has an account.
  app.post('/api/auth/forgot', { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } }, async (req) => {
    const { email } = parse(z.object({ email: z.email('Enter a valid email').max(160) }), req.body)
    const user = await db.user.findUnique({ where: { email: email.toLowerCase() } })
    if (user && !user.deletedAt) {
      const recent = await db.passwordReset.count({ where: { userId: user.id, createdAt: { gt: new Date(Date.now() - 3600_000) } } })
      if (recent < 3) {
        const token = randomBytes(32).toString('base64url')
        await db.passwordReset.create({
          data: { userId: user.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + RESET_MINUTES * 60_000), ip: req.ip },
        })
        mailAccount(user.id, 'password-reset', { url: `${env.publicUrl}/reset-password?token=${token}`, minutes: RESET_MINUTES })
      }
    }
    return { ok: true }
  })

  app.get('/api/auth/reset/:token', limited, async (req) => {
    const r = await db.passwordReset.findUnique({ where: { tokenHash: sha256((req.params as { token: string }).token) }, include: { user: { select: { email: true } } } })
    if (!r || r.usedAt || r.expiresAt < new Date()) throw resetGone()
    // Shown on the reset page so people know which account they are changing.
    const [local, domain] = r.user.email.split('@')
    return { email: `${local.slice(0, 2)}${'*'.repeat(Math.max(1, local.length - 2))}@${domain}` }
  })

  app.post('/api/auth/reset', limited, async (req, reply) => {
    const body = parse(z.object({ token: z.string().min(20).max(200), password: passwordSchema }), req.body)
    const r = await db.passwordReset.findUnique({ where: { tokenHash: sha256(body.token) } })
    if (!r || r.usedAt || r.expiresAt < new Date()) throw resetGone()
    const passwordHash = await hashPassword(body.password)
    const user = await db.$transaction(async (tx) => {
      // Claim the link atomically: two simultaneous submits cannot both use it.
      const claimed = await tx.passwordReset.updateMany({ where: { id: r.id, usedAt: null }, data: { usedAt: new Date() } })
      if (!claimed.count) throw resetGone()
      await tx.passwordReset.updateMany({ where: { userId: r.userId, usedAt: null }, data: { usedAt: new Date() } })
      return tx.user.update({
        where: { id: r.userId },
        data: { passwordHash, mustChangePassword: false, sessionVersion: { increment: 1 }, lastLoginAt: new Date() },
      })
    })
    setSession(reply, user)
    mailAccount(user.id, 'password-changed')
    return publicUser(user)
  })

  app.post('/api/auth/logout', async (_req, reply) => {
    clearSession(reply)
    return { ok: true }
  })

  app.get('/api/auth/me', async (req) => {
    const user = await currentUser(req)
    if (!user) return { user: null, affiliate: null }
    const affiliate = await db.affiliate.findUnique({ where: { userId: user.id }, select: { status: true, code: true } })
    return { user: publicUser(user), affiliate }
  })

  app.patch('/api/auth/me', async (req, reply) => {
    const user = await requireUser(req)
    const body = parse(
      z.object({
        name: z.string().trim().min(1).max(120).optional(),
        phone: z.string().max(40).nullable().optional(),
        email: z.email().max(160).optional(),
        currentPassword: z.string().max(128).optional(),
        newPassword: passwordSchema.optional(),
      }),
      req.body,
    )
    const data: { name?: string; phone?: string | null; email?: string; passwordHash?: string; mustChangePassword?: boolean; sessionVersion?: { increment: number } } = {}
    if (body.name) data.name = body.name
    if (body.phone !== undefined) data.phone = body.phone || null
    const newEmail = body.email?.toLowerCase()
    // Changing the sign-in email or password both require the current password.
    if (body.newPassword || (newEmail && newEmail !== user.email)) {
      if (!body.currentPassword || !(await verifyPassword(body.currentPassword, user.passwordHash))) {
        throw badRequest('Your current password is incorrect')
      }
    }
    if (newEmail && newEmail !== user.email) {
      if (await db.user.findUnique({ where: { email: newEmail } })) throw new HttpError(409, 'Another account already uses that email')
      data.email = newEmail
    }
    if (body.newPassword) {
      if (await verifyPassword(body.newPassword, user.passwordHash)) throw badRequest('Choose a password different from the current one')
      data.passwordHash = await hashPassword(body.newPassword)
      data.mustChangePassword = false
      // Sign out every other device; this one gets a fresh session below.
      data.sessionVersion = { increment: 1 }
    } else if (user.mustChangePassword) {
      throw badRequest('Set a new password to finish setting up your account')
    }
    const updated = await db.user.update({ where: { id: user.id }, data })
    if (body.newPassword) {
      setSession(reply, updated)
      mailAccount(updated.id, 'password-changed')
    }
    return publicUser(updated)
  })
}
