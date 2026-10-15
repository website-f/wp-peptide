import bcrypt from 'bcryptjs'
import type { FastifyReply, FastifyRequest } from 'fastify'
import jwt from 'jsonwebtoken'
import type { User } from '@prisma/client'
import { db } from './db.js'
import { env } from './env.js'
import { forbidden, unauthorized } from './http.js'

export const SESSION_COOKIE = 'kyvo_session'
const MAX_AGE = 60 * 60 * 24 * 30

export const hashPassword = (pw: string) => bcrypt.hash(pw, 11)
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash)

export function setSession(reply: FastifyReply, user: Pick<User, 'id' | 'role' | 'sessionVersion'>) {
  // "v" ties the session to the password: changing or resetting it ends every older session.
  const token = jwt.sign({ sub: user.id, role: user.role, v: user.sessionVersion }, env.jwtSecret, { expiresIn: MAX_AGE })
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: env.cookieSecure,
    maxAge: MAX_AGE,
  })
}

export function clearSession(reply: FastifyReply) {
  reply.clearCookie(SESSION_COOKIE, { path: '/' })
}

export async function currentUser(req: FastifyRequest): Promise<User | null> {
  const token = req.cookies[SESSION_COOKIE]
  if (!token) return null
  try {
    const payload = jwt.verify(token, env.jwtSecret) as { sub: string; v?: number }
    const user = await db.user.findUnique({ where: { id: payload.sub } })
    return user && (payload.v ?? 0) === user.sessionVersion ? user : null
  } catch {
    return null
  }
}

export async function requireUser(req: FastifyRequest): Promise<User> {
  const user = await currentUser(req)
  if (!user) throw unauthorized()
  return user
}

export async function requireAdmin(req: FastifyRequest): Promise<User> {
  const user = await requireUser(req)
  if (user.role !== 'ADMIN') throw forbidden('Admin access only')
  // The one-time bootstrap password only opens the change-password screen, nothing else.
  if (user.mustChangePassword) throw forbidden('Set a new password before using the admin panel')
  return user
}

export function publicUser(u: User) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    phone: u.phone,
    role: u.role,
    tier: u.tier,
    tierExpiresAt: u.tierExpiresAt,
    pointsBalance: u.pointsBalance,
    mustChangePassword: u.mustChangePassword,
    createdAt: u.createdAt,
  }
}
