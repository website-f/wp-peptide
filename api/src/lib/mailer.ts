import nodemailer, { type Transporter } from 'nodemailer'
import type { Order, OrderItem } from '@prisma/client'
import { db } from './db.js'
import { env } from './env.js'
import { fmtMoney, getSettings, type StoreSettings } from './settings.js'

// Transactional email. With no SMTP_HOST configured, messages are logged and skipped
// so local development and tests never need a mail server.
//
// Every email is built by a render* function (subject + HTML) and sent by send().
// Real events and the admin "Send test emails" tool use the same renderers.

let transport: Transporter | null | undefined

function getTransport() {
  if (transport !== undefined) return transport
  transport = env.smtp.host
    ? nodemailer.createTransport({
        host: env.smtp.host,
        port: env.smtp.port,
        secure: env.smtp.port === 465,
        // Port 587 must upgrade to TLS before the password is sent.
        requireTLS: env.smtp.port !== 465,
        tls: { rejectUnauthorized: env.smtp.tlsRejectUnauthorized, minVersion: 'TLSv1.2' },
        auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
        pool: true,
        maxConnections: 3,
      })
    : null
  return transport
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

type Cta = { label: string; url: string }
export type Mail = { subject: string; html: string; replyTo?: string }

/** Shared frame. `preview` is the grey line mail apps show next to the subject. */
function layout(s: StoreSettings, opts: { title: string; body: string; cta?: Cta; preview?: string; top?: string }) {
  const preview = opts.preview ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(opts.preview)}&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;&#847;&zwnj;&nbsp;</div>` : ''
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="dark light"><title>${esc(opts.title)}</title></head>
<body style="margin:0;padding:0;background:#121110;font-family:Helvetica,Arial,sans-serif;color:#efe9dd">${preview}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#121110;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#1b1916;border:1px solid #2d2a25;border-radius:14px">
<tr><td style="padding:28px 28px 8px"><div style="font-family:Georgia,serif;letter-spacing:4px;font-size:22px;color:#d9ad5b">${esc(s.storeName.toUpperCase())}</div></td></tr>
${opts.top ? `<tr><td style="padding:12px 28px 0">${opts.top}</td></tr>` : ''}
<tr><td style="padding:14px 28px 4px"><h1 style="margin:0;font-size:24px;line-height:1.25;color:#f3efe6">${esc(opts.title)}</h1></td></tr>
<tr><td style="padding:8px 28px 24px;font-size:15px;line-height:1.6;color:#c9c2b4">${opts.body}
${opts.cta ? `<p style="margin:24px 0 0"><a href="${opts.cta.url}" style="display:inline-block;background:#d9ad5b;color:#16130f;text-decoration:none;font-weight:bold;padding:12px 20px;border-radius:6px">${esc(opts.cta.label)}</a></p>` : ''}
</td></tr>
<tr><td style="padding:16px 28px 24px;border-top:1px solid #2d2a25;font-size:12px;line-height:1.5;color:#8d877c">Questions? Reply to this email or write to ${esc(s.supportEmail)}.<br/>All products are for laboratory, in vitro research use only. Not for human or veterinary use.</td></tr>
</table></td></tr></table></body></html>`
}

/** Plain-text twin of an HTML email. Mail with both parts scores better with spam filters. */
function toText(html: string) {
  return html
    .replace(/<head[\s\S]*?<\/head>/gi, '')
    .replace(/<div style="display:none[\s\S]*?<\/div>/i, '')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, label: string) => `${label.replace(/<[^>]+>/g, '').trim()}: ${href}`)
    .replace(/<(br|\/p|\/tr|\/h1|\/div)[^>]*>/gi, '\n')
    .replace(/<\/td>/gi, '  ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

async function send(to: string, mail: Mail) {
  const t = getTransport()
  if (!t) {
    console.log(`[mail skipped, SMTP not configured] to=${to} subject="${mail.subject}"`)
    return
  }
  const s = await getSettings()
  await t.sendMail({
    from: env.smtp.from || `${s.storeName} <${s.supportEmail}>`,
    to,
    replyTo: mail.replyTo ?? s.supportEmail,
    subject: mail.subject,
    html: mail.html,
    text: toText(mail.html),
    headers: {
      // Transactional mail: ask mail apps not to send out-of-office replies back.
      'Auto-Submitted': 'auto-generated',
      'X-Auto-Response-Suppress': 'OOF, AutoReply',
      // Mailbox providers trust senders that offer a way out; this one simply emails support.
      'List-Unsubscribe': `<mailto:${s.supportEmail}?subject=Unsubscribe>`,
    },
  })
}

/** Never let a mail failure break the request that triggered it. */
function fire(p: Promise<unknown>) {
  p.catch((e) => console.error('[mail] failed:', (e as Error).message))
}

const first = (name: string) => esc(name.split(' ')[0] || name)
const mono = (s: string) => `<b style="font-family:monospace">${esc(s)}</b>`

// ---------- orders ----------

export type OrderMailEvent = 'created' | 'paid' | 'processing' | 'shipped' | 'delivered' | 'cancelled' | 'refunded'
type OrderMailData = Pick<Order, 'id' | 'number' | 'accessKey' | 'name' | 'email' | 'totalCents' | 'carrier' | 'trackingNumber' | 'pointsEarned'> & {
  items: Pick<OrderItem, 'name' | 'variantLabel' | 'quantity' | 'lineTotalCents'>[]
}

function itemsTable(s: StoreSettings, items: OrderMailData['items'], totalCents?: number) {
  const rows = items
    .map(
      (i) =>
        `<tr><td style="padding:6px 0;color:#efe9dd">${esc(i.name)} <span style="color:#8d877c">${esc(i.variantLabel)} x ${i.quantity}</span></td><td align="right" style="padding:6px 0;font-family:monospace;white-space:nowrap">${i.lineTotalCents === 0 ? 'Included' : fmtMoney(s, i.lineTotalCents)}</td></tr>`,
    )
    .join('')
  const total = totalCents !== undefined ? `<tr><td style="padding:10px 0 0;border-top:1px solid #2d2a25;color:#efe9dd"><b>Total</b></td><td align="right" style="padding:10px 0 0;border-top:1px solid #2d2a25;font-family:monospace"><b>${fmtMoney(s, totalCents)}</b></td></tr>` : ''
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;font-size:14px">${rows}${total}</table>`
}

const STEPS = ['Order placed', 'Paid', 'Being packed', 'Shipped', 'Delivered'] as const
const STEP_OF: Partial<Record<OrderMailEvent, number>> = { created: 0, paid: 1, processing: 2, shipped: 3, delivered: 4 }

/** Status tracker shown at the top of order emails. */
function progress(event: OrderMailEvent) {
  const at = STEP_OF[event]
  if (at === undefined) return ''
  const cells = STEPS.map((label, i) => {
    const done = i <= at
    return `<td align="center" style="padding:0 2px;width:20%"><div style="height:4px;border-radius:2px;background:${done ? '#d9ad5b' : '#3a362f'}"></div><div style="margin-top:6px;font-size:11px;line-height:1.3;color:${i === at ? '#f3efe6' : done ? '#c9c2b4' : '#6f6a61'};font-weight:${i === at ? 'bold' : 'normal'}">${label}</div></td>`
  }).join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${cells}</tr></table>`
}

export function renderOrder(event: OrderMailEvent, o: OrderMailData, s: StoreSettings): Mail {
  const total = fmtMoney(s, o.totalCents)
  const url = `${env.publicUrl}/order/${o.number}?key=${o.accessKey}`
  const hi = `Hi ${first(o.name)},`
  const top = progress(event)
  switch (event) {
    case 'created':
      return {
        subject: `Order ${o.number} received`,
        html: layout(s, {
          title: `Order ${o.number} is reserved`,
          preview: `We have reserved your order. Complete payment of ${total} to ship it.`,
          top,
          body: `<p>${hi} we have reserved your order. It ships as soon as payment of <b>${total}</b> clears.</p>${itemsTable(s, o.items, o.totalCents)}`,
          cta: { label: 'Complete payment', url },
        }),
      }
    case 'paid':
      return {
        subject: `Payment received for ${o.number}`,
        html: layout(s, {
          title: 'Payment received. Thank you.',
          preview: `We received ${total} for order ${o.number}.`,
          top,
          body: `<p>${hi} we received <b>${total}</b> for order <b>${o.number}</b>. Orders paid before ${esc(s.shipping.cutoff)} on a business day ship the same day.</p>${itemsTable(s, o.items, o.totalCents)}${o.pointsEarned > 0 ? `<p>You earned <b>${o.pointsEarned}</b> points with this order.</p>` : ''}`,
          cta: { label: 'View your order', url },
        }),
      }
    case 'processing':
      return {
        subject: `Order ${o.number} is being packed`,
        html: layout(s, {
          title: 'Your order is being packed',
          preview: `Order ${o.number} is with our packing team. Tracking follows when it ships.`,
          top,
          body: `<p>${hi} order <b>${o.number}</b> is with our packing team now. Every vial is checked against its lot certificate before it is sealed.</p><p>We will email the tracking number as soon as it ships.</p>`,
          cta: { label: 'View your order', url },
        }),
      }
    case 'shipped':
      return {
        subject: `Order ${o.number} has shipped`,
        html: layout(s, {
          title: 'Your order is on its way',
          preview: o.trackingNumber ? `Tracking number ${o.trackingNumber} (${o.carrier ?? 'courier'}).` : `Order ${o.number} has left our lab.`,
          top,
          body: `<p>${hi} order <b>${o.number}</b> left our lab today with ${esc(o.carrier ?? 'our courier')}.</p>${o.trackingNumber ? `<p>Tracking number: ${mono(o.trackingNumber)}</p>` : ''}`,
          cta: { label: 'Track your order', url },
        }),
      }
    case 'delivered':
      return {
        subject: `Order ${o.number} delivered`,
        html: layout(s, {
          title: 'Delivered',
          preview: `Order ${o.number} has been delivered.`,
          top,
          body: `<p>${hi} order <b>${o.number}</b> has been delivered. The certificate for each lot is in the COA library.</p>`,
          cta: { label: 'Open the COA library', url: `${env.publicUrl}/coa-library` },
        }),
      }
    case 'cancelled':
      return {
        subject: `Order ${o.number} cancelled`,
        html: layout(s, {
          title: 'Order cancelled',
          preview: `Order ${o.number} has been cancelled.`,
          body: `<p>${hi} order <b>${o.number}</b> has been cancelled and any reserved stock released. If this was unexpected, just reply to this email.</p>`,
          cta: { label: 'Shop again', url: `${env.publicUrl}/shop` },
        }),
      }
    case 'refunded':
      return {
        subject: `Refund for ${o.number}`,
        html: layout(s, {
          title: 'Refund issued',
          preview: `We refunded ${total} for order ${o.number}.`,
          body: `<p>${hi} we refunded <b>${total}</b> for order <b>${o.number}</b>. Depending on your bank it can take 5 to 10 business days to appear.</p>`,
          cta: { label: 'View your order', url },
        }),
      }
  }
}

export function mailOrderEvent(orderId: string, event: OrderMailEvent) {
  fire(
    (async () => {
      const o = await db.order.findUnique({ where: { id: orderId }, include: { items: true } })
      if (!o) return
      await send(o.email, renderOrder(event, o, await getSettings()))
    })(),
  )
}

// ---------- partners ----------

export type PartnerMailEvent = 'applied' | 'approved' | 'rejected' | 'suspended' | 'payout-paid' | 'bank-changed'
type PartnerMailData = { name: string; commissionRate: number; code: string; couponCode: string; bankName: string | null; bankAccountNumber: string | null }

export function renderPartner(event: PartnerMailEvent, a: PartnerMailData, s: StoreSettings, extra?: { amountCents?: number; reference?: string | null }): Mail {
  const hi = `Hi ${first(a.name)},`
  const dash = { label: 'Open your dashboard', url: `${env.publicUrl}/partners/dashboard` }
  const acct = `${esc(a.bankName ?? 'bank')} account ending ${mono((a.bankAccountNumber ?? '').slice(-4))}`
  switch (event) {
    case 'applied':
      return {
        subject: `We received your ${s.storeName} partner application`,
        html: layout(s, {
          title: 'Application received',
          preview: 'We review every application by hand and will email you the decision.',
          body: `<p>${hi} thanks for applying to the partner program. We review every application by hand and will email you as soon as it is decided.</p>`,
          cta: { label: 'View your application', url: dash.url },
        }),
      }
    case 'approved':
      return {
        subject: `You are a ${s.storeName} partner`,
        html: layout(s, {
          title: 'Welcome to the partner program',
          preview: `Your application is approved. You earn ${a.commissionRate}% on every order you send us.`,
          body: `<p>${hi} your application is approved. You earn <b>${a.commissionRate}%</b> on every order you send us.</p><p>Your link: ${mono(`${env.publicUrl}/?ref=${a.code}`)}<br/>Your code: ${mono(a.couponCode)} (${s.affiliate.couponPct}% off for shoppers)</p><p>Please keep every post research-use only: no dosing advice and no health claims.</p>`,
          cta: dash,
        }),
      }
    case 'rejected':
    case 'suspended':
      return {
        subject: `About your ${s.storeName} partner account`,
        html: layout(s, {
          title: event === 'rejected' ? 'Application update' : 'Partner account paused',
          body: `<p>${hi} ${event === 'rejected' ? 'we are not able to approve your partner application right now' : 'your partner account has been paused'}. If you think this is a mistake, reply to this email.</p>`,
        }),
      }
    case 'bank-changed':
      return {
        subject: 'Your payout bank details were changed',
        html: layout(s, {
          title: 'Bank details updated',
          preview: 'The bank account for your partner payouts was changed.',
          body: `<p>${hi} the bank account for your partner payouts was just changed to ${acct}.</p><p>If you did not make this change, sign in, change your password and reply to this email straight away.</p>`,
          cta: { label: 'Review your details', url: dash.url },
        }),
      }
    case 'payout-paid':
      return {
        subject: `Your ${s.storeName} payout has been sent`,
        html: layout(s, {
          title: 'Payout sent',
          preview: `We transferred ${fmtMoney(s, extra?.amountCents ?? 0)} to your bank.`,
          body: `<p>${hi} we transferred <b>${fmtMoney(s, extra?.amountCents ?? 0)}</b> to your ${acct}.${extra?.reference ? ` Reference: ${mono(extra.reference)}.` : ''}</p>`,
          cta: { label: 'View payouts', url: dash.url },
        }),
      }
  }
}

export function mailPartner(affiliateId: string, event: Exclude<PartnerMailEvent, 'applied'>, extra?: { amountCents?: number; reference?: string | null }) {
  fire(
    (async () => {
      const a = await db.affiliate.findUnique({ where: { id: affiliateId }, include: { user: true } })
      if (!a) return
      await send(a.user.email, renderPartner(event, { ...a, name: a.user.name }, await getSettings(), extra))
    })(),
  )
}

export function mailPartnerApplied(affiliateId: string) {
  fire(
    (async () => {
      const a = await db.affiliate.findUnique({ where: { id: affiliateId }, include: { user: true } })
      if (!a) return
      const s = await getSettings()
      await send(a.user.email, renderPartner('applied', { ...a, name: a.user.name }, s))
      await staffAlert(s, 'partnerApplication', renderStaff('partnerApplication', s, { name: a.user.name, email: a.user.email, platform: a.platform, handle: a.handle, id: a.id }))
    })(),
  )
}

// ---------- account security ----------

export type AccountMailEvent = 'password-reset' | 'password-changed'

export function renderAccount(event: AccountMailEvent, u: { name: string }, s: StoreSettings, extra?: { url?: string; minutes?: number }): Mail {
  if (event === 'password-reset') {
    return {
      subject: `Reset your ${s.storeName} password`,
      html: layout(s, {
        title: 'Reset your password',
        preview: `This link works once, for the next ${extra?.minutes ?? 60} minutes.`,
        body: `<p>Hi ${first(u.name)}, someone asked to reset the password for your ${esc(s.storeName)} account. The link works once, for the next ${extra?.minutes ?? 60} minutes.</p><p>If this was not you, ignore this email. Your password stays the same.</p>`,
        cta: { label: 'Choose a new password', url: extra?.url ?? `${env.publicUrl}/forgot-password` },
      }),
    }
  }
  return {
    subject: `Your ${s.storeName} password was changed`,
    html: layout(s, {
      title: 'Password changed',
      preview: 'Every other signed-in device was signed out.',
      body: `<p>Hi ${first(u.name)}, the password for your account was just changed and every other signed-in device was signed out.</p><p>If you did not do this, reset your password straight away and reply to this email.</p>`,
      cta: { label: 'Reset password', url: `${env.publicUrl}/forgot-password` },
    }),
  }
}

export function mailAccount(userId: string, event: AccountMailEvent, extra?: { url?: string; minutes?: number }) {
  fire(
    (async () => {
      const u = await db.user.findUnique({ where: { id: userId } })
      if (!u) return
      await send(u.email, renderAccount(event, u, await getSettings(), extra))
    })(),
  )
}

// ---------- team alerts (Admin > Settings > Notifications) ----------

export type StaffEvent = 'orderPaid' | 'partnerApplication' | 'payoutRequest' | 'contactMessage' | 'paymentIssue'

type StaffData = {
  orderPaid: { order: OrderMailData }
  partnerApplication: { id: string; name: string; email: string; platform: string; handle: string }
  payoutRequest: { name: string; amountCents: number; bankName: string | null; bankAccountNumber: string | null }
  contactMessage: { name: string; email: string; topic: string; orderRef?: string | null; message: string }
  paymentIssue: { id: string; number: string; email: string; note: string }
}

export function renderStaff<E extends StaffEvent>(event: E, s: StoreSettings, d: StaffData[E]): Mail {
  const tag = (subject: string) => `[${s.storeName}] ${subject}`
  const admin = (path: string) => `${env.publicUrl}/admin${path}`
  switch (event) {
    case 'orderPaid': {
      const { order: o } = d as StaffData['orderPaid']
      const total = fmtMoney(s, o.totalCents)
      return {
        subject: tag(`New paid order ${o.number} (${total})`),
        html: layout(s, { title: `Order ${o.number} is paid`, preview: `${o.name} paid ${total}. Ready to pack.`, body: `<p><b>${esc(o.name)}</b> (${esc(o.email)}) paid <b>${total}</b>. It is ready to pack.</p>${itemsTable(s, o.items, o.totalCents)}`, cta: { label: 'Open the order', url: admin(`/orders/${o.id}`) } }),
      }
    }
    case 'partnerApplication': {
      const a = d as StaffData['partnerApplication']
      return {
        subject: tag(`New partner application: ${a.name}`),
        html: layout(s, { title: 'New partner application', preview: `${a.name} applied (${a.platform}).`, body: `<p><b>${esc(a.name)}</b> (${esc(a.email)}) applied to the partner program.</p><p>Platform: ${esc(a.platform)}<br/>Handle: ${esc(a.handle)}</p>`, cta: { label: 'Review application', url: admin(`/partners/${a.id}`) } }),
      }
    }
    case 'payoutRequest': {
      const p = d as StaffData['payoutRequest']
      const amount = fmtMoney(s, p.amountCents)
      return {
        subject: tag(`Payout request from ${p.name} (${amount})`),
        html: layout(s, { title: 'Partner payout requested', preview: `${p.name} asked to be paid ${amount}.`, body: `<p><b>${esc(p.name)}</b> asked to be paid <b>${amount}</b> by bank transfer to ${esc(p.bankName ?? 'their bank')}, account ending ${mono((p.bankAccountNumber ?? '').slice(-4))}.</p>`, cta: { label: 'Review payouts', url: admin('/partners?tab=payouts') } }),
      }
    }
    case 'contactMessage': {
      const m = d as StaffData['contactMessage']
      return {
        subject: tag(`${m.topic}: message from ${m.name}`),
        replyTo: m.email,
        html: layout(s, { title: 'New contact message', preview: m.message.slice(0, 120), body: `<p><b>${esc(m.name)}</b> (${esc(m.email)})${m.orderRef ? `, order ${esc(m.orderRef)}` : ''} wrote:</p><p style="white-space:pre-wrap;border-left:3px solid #d9ad5b;padding-left:12px">${esc(m.message)}</p><p>Reply to this email to answer them directly.</p>`, cta: { label: 'Open the inbox', url: admin('/inbox') } }),
      }
    }
    case 'paymentIssue': {
      const i = d as StaffData['paymentIssue']
      return {
        subject: tag(`Payment issue on order ${i.number}`),
        html: layout(s, { title: 'A payment needs your attention', preview: i.note.slice(0, 120), body: `<p>Order <b>${i.number}</b> (${esc(i.email)}): ${esc(i.note)}</p>`, cta: { label: 'Open the order', url: admin(`/orders/${i.id}`) } }),
      }
    }
  }
  throw new Error(`Unknown staff event ${event}`)
}

const staffTo = (s: StoreSettings) => (s.notifications.staffEmail || s.supportEmail).trim()

async function staffAlert(s: StoreSettings, event: StaffEvent, mail: Mail) {
  if (!s.notifications[event]) return
  const to = staffTo(s)
  if (to) await send(to, mail)
}

export function mailStaffOrderPaid(orderId: string) {
  fire(
    (async () => {
      const o = await db.order.findUnique({ where: { id: orderId }, include: { items: true } })
      if (!o) return
      const s = await getSettings()
      await staffAlert(s, 'orderPaid', renderStaff('orderPaid', s, { order: o }))
    })(),
  )
}

export function mailStaffPayoutRequest(affiliateId: string, amountCents: number) {
  fire(
    (async () => {
      const a = await db.affiliate.findUnique({ where: { id: affiliateId }, include: { user: true } })
      if (!a) return
      const s = await getSettings()
      await staffAlert(s, 'payoutRequest', renderStaff('payoutRequest', s, { name: a.user.name, amountCents, bankName: a.bankName, bankAccountNumber: a.bankAccountNumber }))
    })(),
  )
}

export function mailStaffContact(msg: StaffData['contactMessage']) {
  fire(
    (async () => {
      const s = await getSettings()
      await staffAlert(s, 'contactMessage', renderStaff('contactMessage', s, msg))
    })(),
  )
}

export function mailStaffPaymentIssue(orderId: string, note: string) {
  fire(
    (async () => {
      const o = await db.order.findUnique({ where: { id: orderId } })
      if (!o) return
      const s = await getSettings()
      await staffAlert(s, 'paymentIssue', renderStaff('paymentIssue', s, { id: o.id, number: o.number, email: o.email, note }))
    })(),
  )
}

// ---------- test emails (Admin > Settings > Notifications) ----------

export const TEST_GROUPS = ['orders', 'account', 'partners', 'team'] as const
export type TestGroup = (typeof TEST_GROUPS)[number]

/** Every template filled with sample data. Subjects carry a [Test] prefix. */
export async function testEmails(groups: TestGroup[]): Promise<Mail[]> {
  const s = await getSettings()
  const product = await db.product.findFirst({ where: { status: 'ACTIVE' }, include: { variants: { where: { active: true }, take: 1 } }, orderBy: { sortOrder: 'asc' } })
  const v = product?.variants[0]
  const unit = v?.priceCents ?? 18900
  const order: OrderMailData = {
    id: 'sample',
    number: 'KY10000',
    accessKey: 'sample',
    name: 'Sample Customer',
    email: 'customer@example.com',
    totalCents: unit * 2 + s.shipping.flatCents,
    carrier: 'J&T Express',
    trackingNumber: 'JT0000000000MY',
    pointsEarned: Math.floor(((unit * 2) / 100) * (s.points.perDollar.MEMBER ?? 0)),
    items: [
      { name: product?.name ?? 'Sample product', variantLabel: v?.label ?? '10mg', quantity: 2, lineTotalCents: unit * 2 },
      { name: 'Shipping', variantLabel: 'Tracked', quantity: 1, lineTotalCents: s.shipping.flatCents },
    ],
  }
  const partner: PartnerMailData = { name: 'Sample Partner', commissionRate: s.affiliate.defaultRate, code: 'sample', couponCode: 'SAMPLE10', bankName: 'Maybank', bankAccountNumber: '1234567890' }
  const out: Mail[] = []
  if (groups.includes('orders')) for (const e of ['created', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'] as const) out.push(renderOrder(e, order, s))
  if (groups.includes('account')) out.push(renderAccount('password-reset', order, s, { minutes: 60 }), renderAccount('password-changed', order, s))
  if (groups.includes('partners'))
    for (const e of ['applied', 'approved', 'rejected', 'suspended', 'bank-changed', 'payout-paid'] as const) out.push(renderPartner(e, partner, s, { amountCents: 45000, reference: 'IBG-SAMPLE-001' }))
  if (groups.includes('team')) {
    out.push(
      renderStaff('orderPaid', s, { order }),
      renderStaff('partnerApplication', s, { id: 'sample', name: partner.name, email: 'partner@example.com', platform: 'Instagram', handle: '@sample.lab' }),
      renderStaff('payoutRequest', s, { name: partner.name, amountCents: 45000, bankName: partner.bankName, bankAccountNumber: partner.bankAccountNumber }),
      renderStaff('contactMessage', s, { name: 'Sample Customer', email: 'customer@example.com', topic: 'Order', orderRef: order.number, message: 'Hi, when will my order ship?' }),
      renderStaff('paymentIssue', s, { id: 'sample', number: order.number, email: order.email, note: 'Extra payment of RM10.00 received after the order was paid. Refund it from the ToyyibPay dashboard.' }),
    )
  }
  return out.map((m) => ({ ...m, subject: `[Test] ${m.subject}` }))
}

/** Sends the samples one by one, a few seconds apart (a burst from a new domain looks like spam). */
export function sendTestEmails(to: string, mails: Mail[], gapMs = 4000) {
  fire(
    (async () => {
      for (const [i, m] of mails.entries()) {
        if (i) await new Promise((r) => setTimeout(r, gapMs))
        await send(to, m).catch((e) => console.error('[mail] test send failed:', (e as Error).message))
      }
    })(),
  )
}
