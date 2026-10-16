import { db } from './db.js'
import { fmtMoney, getSettings } from './settings.js'
import { setOrderStatus } from './orders.js'

/**
 * Soft delete ("archive") for admin records. Archived rows keep all their data and links,
 * disappear from admin lists, reports and the shop, and come back with one click from
 * Admin > Archive. Nothing here ever removes a row.
 */

export const ARCHIVE_TYPES = ['orders', 'products', 'customers', 'coupons', 'coas', 'messages'] as const
export type ArchiveType = (typeof ARCHIVE_TYPES)[number]

export type Skipped = { id: string; label: string; reason: string }
export type BulkResult = { done: number; skipped: Skipped[] }

const stamp = (by: string) => ({ deletedAt: new Date(), deletedBy: by })
const unstamp = { deletedAt: null, deletedBy: null }

export async function archive(type: ArchiveType, ids: string[], by: string, selfId: string): Promise<BulkResult> {
  const skipped: Skipped[] = []
  let done = 0

  switch (type) {
    case 'orders': {
      const rows = await db.order.findMany({ where: { id: { in: ids }, deletedAt: null }, select: { id: true, number: true, status: true } })
      for (const o of rows) {
        // An unpaid order could still be paid while hidden: cancel it first (stock and payment links are released).
        if (o.status === 'PENDING_PAYMENT') await setOrderStatus(o.id, 'CANCELLED', by, { note: 'Cancelled when the order was archived' })
        await db.order.update({ where: { id: o.id }, data: stamp(by) })
        done++
      }
      break
    }
    case 'products': {
      done = (await db.product.updateMany({ where: { id: { in: ids }, deletedAt: null }, data: stamp(by) })).count
      break
    }
    case 'customers': {
      const rows = await db.user.findMany({
        where: { id: { in: ids }, deletedAt: null },
        select: { id: true, email: true, role: true, affiliate: { select: { status: true } }, subscriptions: { where: { status: 'ACTIVE' }, select: { id: true } } },
      })
      for (const u of rows) {
        if (u.id === selfId) skipped.push({ id: u.id, label: u.email, reason: 'You cannot archive your own account.' })
        else if (u.role === 'ADMIN') skipped.push({ id: u.id, label: u.email, reason: 'Admin accounts cannot be archived.' })
        else if (u.affiliate && (u.affiliate.status === 'APPROVED' || u.affiliate.status === 'PENDING'))
          skipped.push({ id: u.id, label: u.email, reason: 'This customer is a partner. Reject or suspend the partner account first.' })
        else if (u.subscriptions.length) skipped.push({ id: u.id, label: u.email, reason: 'Cancel their active Build a Box subscription first.' })
        else {
          // Signed out everywhere, and sign-in is refused while archived.
          await db.user.update({ where: { id: u.id }, data: { ...stamp(by), sessionVersion: { increment: 1 } } })
          done++
        }
      }
      break
    }
    case 'coupons':
      done = (await db.coupon.updateMany({ where: { id: { in: ids }, deletedAt: null }, data: stamp(by) })).count
      break
    case 'coas':
      done = (await db.coa.updateMany({ where: { id: { in: ids }, deletedAt: null }, data: stamp(by) })).count
      break
    case 'messages':
      done = (await db.contactMessage.updateMany({ where: { id: { in: ids }, deletedAt: null }, data: stamp(by) })).count
      break
  }
  return { done, skipped }
}

export async function restore(type: ArchiveType, ids: string[]): Promise<BulkResult> {
  const where = { id: { in: ids }, deletedAt: { not: null } }
  const model = {
    orders: () => db.order.updateMany({ where, data: unstamp }),
    products: () => db.product.updateMany({ where, data: unstamp }),
    customers: () => db.user.updateMany({ where, data: unstamp }),
    coupons: () => db.coupon.updateMany({ where, data: unstamp }),
    coas: () => db.coa.updateMany({ where, data: unstamp }),
    messages: () => db.contactMessage.updateMany({ where, data: unstamp }),
  }[type]
  return { done: (await model()).count, skipped: [] }
}

export type ArchivedRow = { id: string; title: string; detail: string; deletedAt: Date; deletedBy: string | null; href: string | null }

/** Archived items of one type (newest first) plus how many of each type are archived. */
export async function listArchived(type: ArchiveType, q = '') {
  const s = await getSettings()
  const del = { deletedAt: { not: null } } as const
  const order = { deletedAt: 'desc' } as const
  const like = (field: string) => (q ? { [field]: { contains: q, mode: 'insensitive' } } : {})
  let rows: ArchivedRow[] = []

  switch (type) {
    case 'orders': {
      const r = await db.order.findMany({
        where: { ...del, ...(q ? { OR: [{ number: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }] } : {}) },
        orderBy: order,
        take: 500,
        select: { id: true, number: true, name: true, email: true, status: true, totalCents: true, deletedAt: true, deletedBy: true },
      })
      rows = r.map((o) => ({ id: o.id, title: o.number, detail: `${o.name} · ${o.email} · ${fmtMoney(s, o.totalCents)} · ${o.status.replace('_', ' ').toLowerCase()}`, deletedAt: o.deletedAt!, deletedBy: o.deletedBy, href: `/admin/orders/${o.id}` }))
      break
    }
    case 'products': {
      const r = await db.product.findMany({ where: { ...del, ...like('name') }, orderBy: order, take: 500, select: { id: true, name: true, slug: true, status: true, deletedAt: true, deletedBy: true, _count: { select: { variants: true } } } })
      rows = r.map((p) => ({ id: p.id, title: p.name, detail: `${p.slug} · ${p._count.variants} sizes`, deletedAt: p.deletedAt!, deletedBy: p.deletedBy, href: `/admin/products/${p.id}` }))
      break
    }
    case 'customers': {
      const r = await db.user.findMany({
        where: { ...del, ...(q ? { OR: [{ email: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }] } : {}) },
        orderBy: order,
        take: 500,
        select: { id: true, name: true, email: true, _count: { select: { orders: true } }, deletedAt: true, deletedBy: true },
      })
      rows = r.map((u) => ({ id: u.id, title: u.name, detail: `${u.email} · ${u._count.orders} orders`, deletedAt: u.deletedAt!, deletedBy: u.deletedBy, href: `/admin/customers/${u.id}` }))
      break
    }
    case 'coupons': {
      const r = await db.coupon.findMany({ where: { ...del, ...like('code') }, orderBy: order, take: 500, select: { id: true, code: true, type: true, value: true, uses: true, deletedAt: true, deletedBy: true } })
      rows = r.map((c) => ({ id: c.id, title: c.code, detail: `${c.type === 'PERCENT' ? `${c.value}% off` : c.type === 'FIXED' ? `${fmtMoney(s, c.value)} off` : 'Free shipping'} · used ${c.uses} times`, deletedAt: c.deletedAt!, deletedBy: c.deletedBy, href: null }))
      break
    }
    case 'coas': {
      const r = await db.coa.findMany({
        where: { ...del, ...(q ? { OR: [{ lotNumber: { contains: q, mode: 'insensitive' } }, { product: { name: { contains: q, mode: 'insensitive' } } }] } : {}) },
        orderBy: order,
        take: 500,
        select: { id: true, lotNumber: true, documentTitle: true, purity: true, product: { select: { name: true } }, deletedAt: true, deletedBy: true },
      })
      rows = r.map((c) => ({ id: c.id, title: `${c.product.name}${c.documentTitle ? ` / ${c.documentTitle}` : ''}`, detail: `Batch ${c.lotNumber} · ${Number(c.purity)}% purity`, deletedAt: c.deletedAt!, deletedBy: c.deletedBy, href: null }))
      break
    }
    case 'messages': {
      const r = await db.contactMessage.findMany({
        where: { ...del, ...(q ? { OR: [{ email: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }, { message: { contains: q, mode: 'insensitive' } }] } : {}) },
        orderBy: order,
        take: 500,
        select: { id: true, name: true, email: true, topic: true, message: true, deletedAt: true, deletedBy: true },
      })
      rows = r.map((m) => ({ id: m.id, title: `${m.name} (${m.topic})`, detail: `${m.email} · ${m.message.slice(0, 90)}${m.message.length > 90 ? '…' : ''}`, deletedAt: m.deletedAt!, deletedBy: m.deletedBy, href: null }))
      break
    }
  }

  const [orders, products, customers, coupons, coas, messages] = await Promise.all([
    db.order.count({ where: del }),
    db.product.count({ where: del }),
    db.user.count({ where: del }),
    db.coupon.count({ where: del }),
    db.coa.count({ where: del }),
    db.contactMessage.count({ where: del }),
  ])
  return { rows, counts: { orders, products, customers, coupons, coas, messages } }
}
