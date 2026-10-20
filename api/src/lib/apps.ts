import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import { db } from './db.js'
import { env } from './env.js'

/**
 * First-party apps that use "Sign in with KYVO" (OAuth 2 authorization code + PKCE) and
 * receive the user's purchases. Configured in .env; today that is the dose tracker.
 */
export type AppClient = (typeof env.apps)[number]

export const findClient = (clientId: string) => env.apps.find((a) => a.clientId && a.clientId === clientId) ?? null

export function secretMatches(client: AppClient, secret: string) {
  const a = Buffer.from(createHash('sha256').update(client.clientSecret).digest('hex'))
  const b = Buffer.from(createHash('sha256').update(secret).digest('hex'))
  return client.clientSecret.length > 0 && timingSafeEqual(a, b)
}

/** Peptide items the user has paid for (supplies such as bacteriostatic water are left out). */
export async function purchasesFor(userId: string) {
  const items = await db.orderItem.findMany({
    where: {
      order: { userId, status: { in: ['PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'] }, deletedAt: null },
      product: { form: { in: ['VIAL', 'MIST'] } },
    },
    orderBy: { order: { paidAt: 'desc' } },
    take: 500,
    select: {
      id: true,
      name: true,
      variantLabel: true,
      quantity: true,
      order: { select: { number: true, paidAt: true } },
      product: { select: { slug: true, form: true, image: true } },
    },
  })
  return items.map((i) => ({
    orderItemId: i.id,
    orderNumber: i.order.number,
    paidAt: i.order.paidAt,
    productSlug: i.product?.slug ?? null,
    productName: i.name,
    form: i.product?.form ?? 'VIAL',
    variantLabel: i.variantLabel,
    quantity: i.quantity,
    image: i.product?.image ? `${env.publicUrl}${i.product.image}-320.webp` : null,
    shopUrl: i.product?.slug ? `${env.publicUrl}/shop/${i.product.slug}` : null,
  }))
}

/**
 * Tells connected apps that an order was paid, so the tracker adds the vials straight away.
 * Signed like Stripe: X-Kyvo-Signature: t=<unix>,v1=<hex HMAC-SHA256 of "t.body">. Retries
 * a few times; the app also catches up on every sign-in, so a missed call is never lost.
 */
export function notifyOrderPaid(orderId: string) {
  void (async () => {
    const order = await db.order.findUnique({ where: { id: orderId }, select: { userId: true, number: true } })
    if (!order?.userId) return
    for (const app of env.apps) {
      if (!app.webhookUrl || !app.webhookSecret) continue
      const grant = await db.appGrant.findUnique({ where: { userId_clientId: { userId: order.userId, clientId: app.clientId } } })
      if (!grant) continue
      const items = (await purchasesFor(order.userId)).filter((i) => i.orderNumber === order.number)
      if (!items.length) continue
      const body = JSON.stringify({ type: 'order.paid', userId: order.userId, orderNumber: order.number, items })
      for (let attempt = 0; attempt < 4; attempt++) {
        const t = Math.floor(Date.now() / 1000)
        const sig = createHmac('sha256', app.webhookSecret).update(`${t}.${body}`).digest('hex')
        try {
          const res = await fetch(app.webhookUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-kyvo-signature': `t=${t},v1=${sig}` },
            body,
            signal: AbortSignal.timeout(10_000),
          })
          if (res.ok) break
        } catch {
          /* retried below */
        }
        await new Promise((r) => setTimeout(r, 2000 * 3 ** attempt))
      }
    }
  })().catch((e) => console.error('[apps] webhook failed:', (e as Error).message))
}
