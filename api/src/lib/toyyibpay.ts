import { createHash, timingSafeEqual } from 'node:crypto'
import type { Order } from '@prisma/client'
import { db } from './db.js'
import { env } from './env.js'
import { HttpError } from './http.js'
import { setOrderStatus } from './orders.js'

// ToyyibPay (Malaysia, MYR only). Docs: https://toyyibpay.com/apireference/
// Sandbox: https://dev.toyyibpay.com   Production: https://toyyibpay.com

export const toyyibEnabled = () => Boolean(env.toyyib.secretKey && env.toyyib.categoryCode)

/** ToyyibPay only accepts letters, digits, spaces and underscores in bill name/description. */
function clean(s: string, max: number) {
  return s
    .replace(/[^A-Za-z0-9 _]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
}

function digits(phone: string | null | undefined) {
  const d = (phone ?? '').replace(/\D/g, '')
  return d.length >= 9 ? d : '0000000000'
}

async function post(path: string, fields: Record<string, string>) {
  const res = await fetch(`${env.toyyib.baseUrl}${path}`, {
    method: 'POST',
    body: new URLSearchParams(fields),
    signal: AbortSignal.timeout(20_000),
  })
  const text = await res.text()
  try {
    return JSON.parse(text) as unknown
  } catch {
    // getBillTransactions answers a bill with no attempts yet in plain text.
    if (/no data found/i.test(text)) return []
    // Account/category errors come back as plain text, not JSON.
    throw new HttpError(502, `Payment gateway error: ${text.slice(0, 120) || res.status}`)
  }
}

export async function createBill(order: Order): Promise<{ billCode: string; paymentUrl: string }> {
  if (!toyyibEnabled()) throw new HttpError(503, 'Online payment is not configured yet')
  const returnUrl = `${env.publicUrl}/order/${order.number}?key=${order.accessKey}`
  const callbackUrl = `${env.apiPublicUrl}/api/payments/toyyibpay/callback`
  const out = await post('/index.php/api/createBill', {
    userSecretKey: env.toyyib.secretKey,
    categoryCode: env.toyyib.categoryCode,
    billName: clean(`KYVO Order ${order.number}`, 30),
    billDescription: clean(`KYVO research supplies order ${order.number}`, 100),
    billPriceSetting: '1',
    billPayorInfo: '1',
    billAmount: String(order.totalCents),
    billReturnUrl: returnUrl,
    billCallbackUrl: callbackUrl,
    billExternalReferenceNo: order.number,
    billTo: order.name.slice(0, 60),
    billEmail: order.email,
    billPhone: digits(order.phone),
    billSplitPayment: '0',
    billSplitPaymentArgs: '',
    billPaymentChannel: '2',
    billChargeToCustomer: '',
    billExpiryDays: '3',
    billContentEmail: clean(`Thank you for your order ${order.number}`, 1000),
  })
  const billCode = Array.isArray(out) ? (out[0] as { BillCode?: string })?.BillCode : undefined
  if (!billCode) {
    const msg = typeof out === 'object' && out ? JSON.stringify(out).slice(0, 160) : 'unknown error'
    throw new HttpError(502, `Payment gateway rejected the bill: ${msg}`)
  }
  const paymentUrl = `${env.toyyib.baseUrl}/${billCode}`
  await db.order.update({ where: { id: order.id }, data: { billCode, paymentUrl } })
  return { billCode, paymentUrl }
}

interface BillTxn {
  billpaymentStatus?: string
  billpaymentAmount?: string
  billpaymentInvoiceNo?: string
  billExternalReferenceNo?: string
  billPaymentDate?: string
}

/**
 * Source of truth for "is this order paid": ask ToyyibPay directly instead of
 * trusting redirect query strings or callback bodies.
 */
export async function reconcile(order: Order, actor: string): Promise<'paid' | 'pending' | 'failed' | 'unchanged'> {
  if (!order.billCode || order.status !== 'PENDING_PAYMENT') return 'unchanged'
  const out = await post('/index.php/api/getBillTransactions', { billCode: order.billCode })
  const txns = (Array.isArray(out) ? out : []) as BillTxn[]
  const success = txns.find((t) => t.billpaymentStatus === '1')
  if (success) {
    const paidCents = Math.round(Number(success.billpaymentAmount ?? '0') * 100)
    if (success.billExternalReferenceNo && success.billExternalReferenceNo !== order.number) return 'unchanged'
    if (paidCents < order.totalCents) {
      await db.order.update({ where: { id: order.id }, data: { paymentStatusNote: `Underpaid: gateway reports RM${(paidCents / 100).toFixed(2)}` } })
      return 'unchanged'
    }
    await setOrderStatus(order.id, 'PAID', actor, {
      paymentRef: success.billpaymentInvoiceNo ?? order.billCode,
      note: 'Paid online via ToyyibPay',
    })
    return 'paid'
  }
  if (txns.some((t) => t.billpaymentStatus === '2' || t.billpaymentStatus === '4')) return 'pending'
  if (txns.some((t) => t.billpaymentStatus === '3')) {
    await db.order.update({ where: { id: order.id }, data: { paymentStatusNote: 'Last payment attempt failed' } })
    return 'failed'
  }
  return 'pending'
}

/** Callback hash: MD5(userSecretKey + status + order_id + refno + "ok"). */
export function validCallbackHash(body: Record<string, string | undefined>) {
  if (!body.hash) return false
  const expected = createHash('md5')
    .update(`${env.toyyib.secretKey}${body.status ?? ''}${body.order_id ?? ''}${body.refno ?? ''}ok`)
    .digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(String(body.hash).toLowerCase())
  return a.length === b.length && timingSafeEqual(a, b)
}
