import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { User } from '@prisma/client'
import { z } from 'zod'
import { ARCHIVE_TYPES, archive, listArchived, restore, type ArchiveType } from '../../lib/archive.js'
import { parse } from '../../lib/http.js'

const typeParam = z.object({ type: z.enum(ARCHIVE_TYPES as unknown as [ArchiveType, ...ArchiveType[]]) })
const idsBody = z.object({ ids: z.array(z.string().min(1).max(40)).min(1, 'Select at least one item').max(10_000) })
const adminOf = (req: FastifyRequest) => (req as unknown as { admin: User }).admin

/** Bulk archive (soft delete) and restore for admin lists, and the Archive page. */
export async function adminArchiveRoutes(app: FastifyInstance) {
  app.post('/archive/:type', async (req) => {
    const { type } = parse(typeParam, req.params)
    const { ids } = parse(idsBody, req.body)
    const admin = adminOf(req)
    return archive(type, ids, admin.email, admin.id)
  })

  app.post('/restore/:type', async (req) => {
    const { type } = parse(typeParam, req.params)
    const { ids } = parse(idsBody, req.body)
    return restore(type, ids)
  })

  // Every archived item of a type matching the search, for "Select all" beyond the first page.
  app.get('/archive/:type/ids', async (req) => {
    const { type } = parse(typeParam, req.params)
    const { q } = parse(z.object({ q: z.string().max(80).optional() }), req.query)
    return { ids: (await listArchived(type, q?.trim() ?? '', 10_000)).rows.map((r) => r.id) }
  })

  app.get('/archive/:type', async (req) => {
    const { type } = parse(typeParam, req.params)
    const { q } = parse(z.object({ q: z.string().max(80).optional() }), req.query)
    return listArchived(type, q?.trim() ?? '')
  })
}
