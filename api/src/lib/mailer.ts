import nodemailer, { type Transporter } from 'nodemailer'
import type { Order, OrderItem } from '@prisma/client'
import { db } from './db.js'
import { env } from './env.js'
import { fmtMoney, getSettings } from './settings.js'

// Transactional email. With no SMTP_HOST configured, messages are logged and skipped
// so local development and tests never need a mail server.

let transport: Transporter | null | undefined

function getTransport() {
  if (transport !== undefined) return transport
  transport = env.smtp.host
    ? nodemailer.createTransport({
        host: env.smtp.host,
        port: env.smtp.port,
        secure: env.smtp.port === 465,
        auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
      })
    : null
  return transport
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

function layout(title: string, bodyHtml: string, cta?: { label: string; url: string }) {
  return `<!doctype html><html><body style="margin:0;background:#121110;font-family:Helvetica,Arial,sans-serif;color:#efe9dd">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#121110;padding:32px 12px"><tr><td align="center">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#1b1916;border:1px solid #2d2a25;border-radius:14px">
<tr><td style="padding:28px 28px 8px"><div style="font-family:Georgia,serif;letter-spacing:4px;font-size:22px;color:#d9ad5b">KYVO</div></td></tr>
<tr><td style="padding:8px 28px 4px"><h1 style="margin:0;font-size:24px;line-height:1.2;color:#f3efe6">${esc(title)}</h1></td></tr>
<tr><td style="padding:8px 28px 24px;font-size:15px;line-height:1.6;color:#c9c2b4">${bodyHtml}
${cta ? `<p style="margin:24px 0 0"><a href="${cta.url}" style="display:inline-block;background:#d9ad5b;color:#16130f;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:6px">${esc(cta.label)}</a></p>` : ''}
</td></tr>
<tr><td style="padding:16px 28px 24px;border-top:1px solid #2d2a25;font-size:12px;color:#8d877c">All products are for laboratory, in vitro research use only. Not for human or veterinary use.</td></tr>
</table></td></tr></table></body></html>`
}

async function send(to: string, subject: string, html: string) {
  const t = getTransport()
  if (!t) {
    console.log(`[mail skipped, SMTP not configured] to=${to} subject="${subject}"`)
    return
  }
  const s = await getSettings()
  await t.sendMail({ from: env.smtp.from || `${s.storeName} <${s.supportEmail}>`, to, subject, html })
}

/** Never let a mail failure break the request that triggered it. */
function fire(p: Promise<unknown>) {
  p.catch((e) => console.error('[mail] failed:', (e as Error).message))
}

function itemsTable(items: OrderItem[]) {
  return `<table width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;font-size:14px">${items
    .map(
      (i) =>
        `<tr><td style="padding:6px 0;color:#efe9dd">${esc(i.name)} <span style="color:#8d877c">${esc(i.variantLabel)} x ${i.quantity}</span></td><td align="right" style="padding:6px 0;font-family:monospace">${i.lineTotalCents === 0 ? 'Included' : `RM${(i.lineTotalCents / 100).toFixed(2)}`}</td></tr>`,
    )
    .join('')}</table>`
}

const orderUrl = (o: Pick<Order, 'number' | 'accessKey'>) => `${env.publicUrl}/order/${o.number}?key=${o.accessKey}`

export function mailOrderEvent(orderId: string, event: 'created' | 'paid' | 'shipped' | 'delivered' | 'cancelled' | 'refunded') {
  fire(
    (async () => {
      const o = await db.order.findUnique({ where: { id: orderId }, include: { items: true } })
      if (!o) return
      const s = await getSettings()
      const total = fmtMoney(s, o.totalCents)
      const url = orderUrl(o)
      switch (event) {
        case 'created':
          return send(
            o.email,
            `Order ${o.number} received`,
            layout(
              `Order ${o.number} is reserved`,
              `<p>Hi ${esc(o.name.split(' ')[0])}, we have reserved your order. It ships as soon as payment of <b>${total}</b> clears.</p>${itemsTable(o.items)}`,
              { label: 'Complete payment', url },
            ),
          )
        case 'paid':
          return send(
            o.email,
            `Payment received for ${o.number}`,
            layout(
              'Payment received. Thank you.',
              `<p>We received ${total} for order <b>${o.number}</b>. Orders paid before ${esc(s.shipping.cutoff)} on a business day ship the same day.</p>${itemsTable(o.items)}${o.pointsEarned > 0 ? `<p>You earned <b>${o.pointsEarned}</b> KYVO Points.</p>` : ''}`,
              { label: 'View your order', url },
            ),
          )
        case 'shipped':
          return send(
            o.email,
            `Order ${o.number} has shipped`,
            layout(
              'Your order is on its way',
              `<p>Order <b>${o.number}</b> left our lab today with ${esc(o.carrier ?? 'our courier')}.</p>${o.trackingNumber ? `<p>Tracking number: <b style="font-family:monospace">${esc(o.trackingNumber)}</b></p>` : ''}`,
              { label: 'Track your order', url },
            ),
          )
        case 'delivered':
          return send(o.email, `Order ${o.number} delivered`, layout('Delivered', `<p>Order <b>${o.number}</b> has been delivered. The certificate for each lot is in the COA library.</p>`, { label: 'Open the COA library', url: `${env.publicUrl}/coa-library` }))
        case 'cancelled':
          return send(o.email, `Order ${o.number} cancelled`, layout('Order cancelled', `<p>Order <b>${o.number}</b> has been cancelled and any reserved stock released. Reply to this email if this was unexpected.</p>`))
        case 'refunded':
          return send(o.email, `Refund for ${o.number}`, layout('Refund issued', `<p>We refunded ${total} for order <b>${o.number}</b>. Depending on your bank it can take 5 to 10 business days to appear.</p>`))
      }
    })(),
  )
}

export function mailPartner(affiliateId: string, event: 'approved' | 'rejected' | 'suspended' | 'payout-paid' | 'bank-changed', extra?: { amountCents?: number; reference?: string | null }) {
  fire(
    (async () => {
      const a = await db.affiliate.findUnique({ where: { id: affiliateId }, include: { user: true } })
      if (!a) return
      const s = await getSettings()
      const first = esc(a.user.name.split(' ')[0])
      const dash = `${env.publicUrl}/partners/dashboard`
      if (event === 'approved') {
        return send(
          a.user.email,
          'You are a KYVO partner',
          layout(
            'Welcome to the partner program',
            `<p>Hi ${first}, your application is approved. You earn <b>${a.commissionRate}%</b> on every order you send us.</p><p>Your link: <b style="font-family:monospace">${env.publicUrl}/?ref=${a.code}</b><br/>Your code: <b style="font-family:monospace">${a.couponCode}</b> (${s.affiliate.couponPct}% off for shoppers)</p><p>Please keep every post research-use only: no dosing advice and no health claims.</p>`,
            { label: 'Open your dashboard', url: dash },
          ),
        )
      }
      if (event === 'rejected' || event === 'suspended') {
        return send(
          a.user.email,
          'About your KYVO partner account',
          layout(
            event === 'rejected' ? 'Application update' : 'Partner account paused',
            `<p>Hi ${first}, ${event === 'rejected' ? 'we are not able to approve your partner application right now' : 'your partner account has been paused'}. If you think this is a mistake, reply to this email or write to ${esc(s.supportEmail)}.</p>`,
          ),
        )
      }
      if (event === 'bank-changed') {
        return send(
          a.user.email,
          'Your payout bank details were changed',
          layout(
            'Bank details updated',
            `<p>Hi ${first}, the bank account for your KYVO partner payouts was just changed to <b>${esc(a.bankName ?? '')}</b>, account ending <b style="font-family:monospace">${esc((a.bankAccountNumber ?? '').slice(-4))}</b>.</p><p>If you did not make this change, sign in, change your password and contact ${esc(s.supportEmail)} straight away.</p>`,
            { label: 'Review your details', url: dash },
          ),
        )
      }
      return send(
        a.user.email,
        'Your KYVO payout has been sent',
        layout('Payout sent', `<p>Hi ${first}, we transferred <b>${fmtMoney(s, extra?.amountCents ?? 0)}</b> to your ${esc(a.bankName ?? 'bank')} account ending ${esc((a.bankAccountNumber ?? '').slice(-4))}.${extra?.reference ? ` Reference: <b style="font-family:monospace">${esc(extra.reference)}</b>.` : ''}</p>`, { label: 'View payouts', url: dash }),
      )
    })(),
  )
}
