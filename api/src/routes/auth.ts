import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { clearSession, currentUser, hashPassword, publicUser, requireUser, setSession, verifyPassword } from '../lib/auth.js'
import { db } from '../lib/db.js'
import { HttpError, badRequest, parse } from '../lib/http.js'

const limited = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }

export const passwordSchema = z.string().min(8, 'Use at least 8 characters').max(128)

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
    await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
    setSession(reply, user)
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

  app.patch('/api/auth/me', async (req) => {
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
    const data: { name?: string; phone?: string | null; email?: string; passwordHash?: string; mustChangePassword?: boolean } = {}
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
    } else if (user.mustChangePassword) {
      throw badRequest('Set a new password to finish setting up your account')
    }
    return publicUser(await db.user.update({ where: { id: user.id }, data }))
  })
}
