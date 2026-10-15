import { createHash, timingSafeEqual } from 'node:crypto'
import type { Order, PaymentBill } from '@prisma/client'
import { db } from './db.js'
import { env } from './env.js'
import { activeCreds, closeOpenBills, TOYYIB_HOSTS, type PayEnv } from './gateway.js'
import { HttpError } from './http.js'
import { mailStaffPaymentIssue } from './mailer.js'
import { setOrderStatus } from './orders.js'
import { getSettings } from './settings.js'

// ToyyibPay (Malaysia, MYR only). Docs: https://toyyibpay.com/apireference/
// Keys and sandbox/production mode come from Admin > Settings (lib/gateway.ts), not .env.

/** Never offer a bill with less than this left before the order is cancelled. */
const MIN_PAY_WINDOW_MS = 15 * 60_000

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

/** "dd-mm-yyyy hh:mm:ss" in Malaysia time, as ToyyibPay expects for billExpiryDate. */
function myt(d: Date) {
  const t = new Date(d.getTime() + 8 * 3600_000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(t.getUTCDate())}-${p(t.getUTCMonth() + 1)}-${t.getUTCFullYear()} ${p(t.getUTCHours())}:${p(t.getUTCMinutes())}:${p(t.getUTCSeconds())}`
}

async function post(e: PayEnv, path: string, fields: Record<string, string>) {
  const res = await fetch(`${TOYYIB_HOSTS[e]}${path}`, {
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
    throw new HttpError(502, `Payment gateway error: ${text.trim().slice(0, 120) || res.status}`)
  }
}

// billPaymentChannel: 0 = FPX, 1 = card, 2 = both.
const CHANNEL = { fpx: '0', card: '1', both: '2' } as const
// billChargeToCustomer: blank = the store pays all fees, 2 = the customer pays FPX and card fees.
const FEES = { store: '', customer: '2' } as const

/**
 * Returns a payment link for the order. An open bill on the active gateway for the same
 * amount is reused (one link per order means fewer double payments); otherwise a new bill
 * is created that expires together with the order.
 */
export async function createBill(order: Order): Promise<{ billCode: string; paymentUrl: string }> {
  const gw = await activeCreds()
  if (!gw) throw new HttpError(503, 'Online payment is not available right now. Please choose another payment method or contact us.')
  const s = await getSettings()
  const orderExpiresAt = new Date(order.createdAt.getTime() + s.orders.unpaidExpiryDaysOnline * 86400_000)
  if (orderExpiresAt.getTime() - Date.now() < MIN_PAY_WINDOW_MS) {
    throw new HttpError(409, 'This order has run out of time for payment. Please place a new order.')
  }

  const open = await db.paymentBill.findFirst({
    where: { orderId: order.id, env: gw.env, amountCents: order.totalCents, closedAt: null, expiresAt: { gt: new Date(Date.now() + MIN_PAY_WINDOW_MS) } },
    orderBy: { createdAt: 'desc' },
  })
  if (open) {
    if (order.billCode !== open.billCode) await db.order.update({ where: { id: order.id }, data: { billCode: open.billCode, paymentUrl: open.paymentUrl } })
    return { billCode: open.billCode, paymentUrl: open.paymentUrl }
  }

  // Older links for this order (other amount, other gateway, nearly expired) stop working.
  await closeOpenBills(order.id)

  const returnUrl = `${env.publicUrl}/order/${order.number}?key=${order.accessKey}`
  const callbackUrl = `${env.apiPublicUrl}/api/payments/toyyibpay/callback`
  const days = Math.min(100, Math.max(1, Math.ceil((orderExpiresAt.getTime() - Date.now()) / 86400_000)))
  const out = await post(gw.env, '/index.php/api/createBill', {
    userSecretKey: gw.secretKey,
    categoryCode: gw.categoryCode,
    billName: clean(`${s.storeName} Order ${order.number}`, 30),
    billDescription: clean(`${s.storeName} order ${order.number}`, 100),
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
    billPaymentChannel: CHANNEL[s.onlinePayment.channel],
    billChargeToCustomer: FEES[s.onlinePayment.feesPaidBy],
    // The bill closes when the unpaid order would be cancelled, not a full window later.
    billExpiryDays: String(days),
    billExpiryDate: myt(orderExpiresAt),
    billContentEmail: clean(`Thank you for your order ${order.number}`, 1000),
  })
  const billCode = Array.isArray(out) ? (out[0] as { BillCode?: string })?.BillCode : undefined
  if (!billCode) {
    const msg = typeof out === 'object' && out ? JSON.stringify(out).slice(0, 160) : 'unknown error'
    throw new HttpError(502, `Payment gateway rejected the bill: ${msg}`)
  }
  const paymentUrl = `${TOYYIB_HOSTS[gw.env]}/${billCode}`
  await db.$transaction([
    db.paymentBill.create({ data: { orderId: order.id, billCode, env: gw.env, amountCents: order.totalCents, paymentUrl, expiresAt: orderExpiresAt } }),
    db.order.update({ where: { id: order.id }, data: { billCode, paymentUrl } }),
  ])
  return { billCode, paymentUrl }
}

interface BillTxn {
  billpaymentStatus?: string
  billpaymentAmount?: string
  billpaymentInvoiceNo?: string
  billExternalReferenceNo?: string
  billPaymentDate?: string
}

async function billTransactions(bill: Pick<PaymentBill, 'billCode' | 'env'>) {
  const out = await post(bill.env as PayEnv, '/index.php/api/getBillTransactions', { billCode: bill.billCode })
  return (Array.isArray(out) ? out : []) as BillTxn[]
}

/** Orders whose payment needs a person: money to refund, or a bill paid short. */
export const PAYMENT_ISSUE = {
  OR: [{ paymentStatusNote: { startsWith: 'Extra payment' } }, { paymentStatusNote: { startsWith: 'Underpaid' } }],
}

const rm = (cents: number) => `RM${(cents / 100).toFixed(2)}`

/**
 * Source of truth for "is this order paid": ask ToyyibPay directly about every bill
 * issued for the order (each on the gateway it was created on) instead of trusting
 * redirect query strings or callback bodies.
 */
export async function reconcile(order: Order, actor: string): Promise<'paid' | 'pending' | 'failed' | 'unchanged'> {
  if (order.status !== 'PENDING_PAYMENT') return 'unchanged'
  const bills = await db.paymentBill.findMany({ where: { orderId: order.id }, orderBy: { createdAt: 'desc' }, take: 10 })
  if (!bills.length) return 'unchanged'
  let pending = false
  let failed = false
  for (const bill of bills) {
    const txns = await billTransactions(bill)
    const success = txns.find((t) => t.billpaymentStatus === '1')
    if (success) {
      if (success.billExternalReferenceNo && success.billExternalReferenceNo !== order.number) continue
      const paidCents = Math.round(Number(success.billpaymentAmount ?? '0') * 100)
      if (paidCents < order.totalCents) {
        const note = `Underpaid: gateway reports ${rm(paidCents)} on bill ${bill.billCode}`
        if (order.paymentStatusNote !== note) {
          await db.order.update({ where: { id: order.id }, data: { paymentStatusNote: note } })
          mailStaffPaymentIssue(order.id, `${note}, but the order total is ${rm(order.totalCents)}.`)
        }
        return 'unchanged'
      }
      // The paying bill is done; setOrderStatus then closes the order's other open bills.
      await db.paymentBill.update({ where: { id: bill.id }, data: { closedAt: new Date() } })
      await setOrderStatus(order.id, 'PAID', actor, {
        paymentRef: success.billpaymentInvoiceNo ?? bill.billCode,
        note: `Paid online via ToyyibPay${bill.env === 'sandbox' ? ' (sandbox, test money)' : ''}, bill ${bill.billCode}`,
      })
      return 'paid'
    }
    if (txns.some((t) => t.billpaymentStatus === '2' || t.billpaymentStatus === '4')) pending = true
    else if (txns.some((t) => t.billpaymentStatus === '3')) failed = true
  }
  if (pending) return 'pending'
  if (failed) {
    await db.order.update({ where: { id: order.id }, data: { paymentStatusNote: 'Last payment attempt failed' } })
    return 'failed'
  }
  return 'pending'
}

/**
 * Money arrived on a bill after the order stopped waiting for it (already paid on another
 * bill, cancelled, or expired). Confirmed with ToyyibPay, then flagged on the order once
 * so the team can refund it.
 */
export async function flagLatePayment(order: Order, bill: PaymentBill) {
  const success = (await billTransactions(bill)).find((t) => t.billpaymentStatus === '1')
  if (!success) return false
  const ref = success.billpaymentInvoiceNo ?? bill.billCode
  if (order.paymentRef && order.paymentRef === ref) return false
  if (await db.orderEvent.findFirst({ where: { orderId: order.id, type: 'payment_extra', message: { contains: ref } } })) return false
  const amount = rm(Math.round(Number(success.billpaymentAmount ?? '0') * 100))
  const why = order.status === 'CANCELLED' ? 'the order was cancelled' : `the order was already ${order.status.toLowerCase().replace('_', ' ')}`
  const message = `Extra payment of ${amount} received on ToyyibPay bill ${bill.billCode} (ref ${ref}) after ${why}. Refund it from the ToyyibPay dashboard or contact the customer.`
  await db.$transaction([
    db.orderEvent.create({ data: { orderId: order.id, type: 'payment_extra', message, actor: 'toyyibpay' } }),
    db.order.update({ where: { id: order.id }, data: { paymentStatusNote: `Extra payment ${amount} needs a refund (ref ${ref})` } }),
  ])
  mailStaffPaymentIssue(order.id, message)
  return true
}

/** Callback hash: MD5(userSecretKey + status + order_id + refno + "ok"). */
export function validCallbackHash(body: Record<string, string | undefined>, secretKey: string) {
  if (!body.hash || !secretKey) return false
  const expected = createHash('md5')
    .update(`${secretKey}${body.status ?? ''}${body.order_id ?? ''}${body.refno ?? ''}ok`)
    .digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(String(body.hash).toLowerCase())
  return a.length === b.length && timingSafeEqual(a, b)
}
