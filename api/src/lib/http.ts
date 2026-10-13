import type { FastifyReply } from 'fastify'
import type { ZodType } from 'zod'

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message)
  }
}

export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, details)
export const notFound = (what = 'Not found') => new HttpError(404, what)
export const forbidden = (msg = 'Forbidden') => new HttpError(403, msg)
export const unauthorized = (msg = 'Please sign in') => new HttpError(401, msg)

export function parse<T>(schema: ZodType<T>, data: unknown): T {
  const r = schema.safeParse(data)
  if (!r.success) {
    const first = r.error.issues[0]
    const field = first?.path.join('.')
    throw new HttpError(400, field ? `${field}: ${first.message}` : (first?.message ?? 'Invalid input'), r.error.issues)
  }
  return r.data
}

export function sendError(reply: FastifyReply, err: unknown) {
  if (err instanceof HttpError) return reply.status(err.status).send({ error: err.message, details: err.details })
  const e = err as { statusCode?: number; message?: string; code?: string }
  if (e?.code === 'P2002') {
    const target = (err as { meta?: { target?: string[] | string } }).meta?.target
    const field = (Array.isArray(target) ? target.join(', ') : target)?.replace(/couponCode/, 'coupon code')
    return reply.status(409).send({ error: field ? `That ${field} is already in use` : 'That value is already in use' })
  }
  if (e?.code === 'P2025') return reply.status(404).send({ error: 'Not found' })
  if (e?.statusCode && e.statusCode < 500) return reply.status(e.statusCode).send({ error: e.message })
  reply.log.error(err)
  return reply.status(500).send({ error: 'Something went wrong on our side. Please try again.' })
}

export function toPage(q: { page?: unknown; pageSize?: unknown }, max = 100) {
  const page = Math.max(1, Number(q.page) || 1)
  const pageSize = Math.min(max, Math.max(1, Number(q.pageSize) || 20))
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize }
}

export function csvEscape(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v)
  // Neutralise spreadsheet formula injection as well as quoting.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}
