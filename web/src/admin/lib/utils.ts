import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import type {
  AffiliateStatus,
  CommissionStatus,
  OrderKind,
  OrderStatus,
  PayoutStatus,
  ProductStatus,
  SubscriptionStatus,
  Tier,
} from './types'

/** Visual tone for status chips. Kept in one place so every list uses the same colours. */
export type Tone = 'warning' | 'gold' | 'neutral' | 'success' | 'muted' | 'destructive'

export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: Tone; help: string }> = {
  PENDING_PAYMENT: { label: 'Awaiting payment', tone: 'warning', help: 'The customer has not paid yet. Stock is reserved.' },
  PAID: { label: 'Paid', tone: 'gold', help: 'Payment received. Ready to pack.' },
  PROCESSING: { label: 'Packing', tone: 'gold', help: 'Being packed for shipping.' },
  SHIPPED: { label: 'Shipped', tone: 'neutral', help: 'Handed to the courier.' },
  DELIVERED: { label: 'Delivered', tone: 'success', help: 'Received by the customer.' },
  CANCELLED: { label: 'Cancelled', tone: 'muted', help: 'Cancelled. Stock was returned.' },
  REFUNDED: { label: 'Refunded', tone: 'destructive', help: 'Money returned to the customer.' },
}

export const KIND_LABEL: Record<OrderKind, string> = {
  STANDARD: 'Standard',
  BOX: 'Build a Box',
  WHOLESALE: 'Wholesale',
  MEMBERSHIP: 'Membership',
}

export const TIER_TONE: Record<Tier, Tone> = { MEMBER: 'muted', INSIDER: 'neutral', VIP: 'gold', FOUNDER: 'gold' }
export const TIER_LABEL: Record<Tier, string> = { MEMBER: 'Member', INSIDER: 'Insider', VIP: 'VIP', FOUNDER: 'Founder' }

export const AFFILIATE_STATUS: Record<AffiliateStatus, { label: string; tone: Tone }> = {
  PENDING: { label: 'Applied', tone: 'warning' },
  APPROVED: { label: 'Active', tone: 'success' },
  REJECTED: { label: 'Rejected', tone: 'muted' },
  SUSPENDED: { label: 'Suspended', tone: 'destructive' },
}

export const COMMISSION_STATUS: Record<CommissionStatus, { label: string; tone: Tone; help: string }> = {
  PENDING: { label: 'Pending', tone: 'warning', help: 'Order not delivered yet. Becomes approved automatically on delivery.' },
  APPROVED: { label: 'Approved', tone: 'gold', help: 'Earned and owed to the partner. Can be included in a payout.' },
  PAID: { label: 'Paid', tone: 'success', help: 'Paid out to the partner.' },
  VOID: { label: 'Void', tone: 'muted', help: 'Cancelled, usually because the order was cancelled or refunded.' },
}

export const PAYOUT_STATUS: Record<PayoutStatus, { label: string; tone: Tone }> = {
  REQUESTED: { label: 'Requested', tone: 'warning' },
  PAID: { label: 'Paid', tone: 'success' },
  REJECTED: { label: 'Rejected', tone: 'muted' },
}

export const PRODUCT_STATUS: Record<ProductStatus, { label: string; tone: Tone; help: string }> = {
  ACTIVE: { label: 'Live', tone: 'success', help: 'Visible in the store and can be bought.' },
  DRAFT: { label: 'Draft', tone: 'warning', help: 'Hidden from the store while you work on it.' },
  ARCHIVED: { label: 'Archived', tone: 'muted', help: 'Retired. Hidden from the store, kept for order history.' },
}

export const SUBSCRIPTION_STATUS: Record<SubscriptionStatus, { label: string; tone: Tone }> = {
  ACTIVE: { label: 'Active', tone: 'success' },
  PAUSED: { label: 'Paused', tone: 'warning' },
  CANCELLED: { label: 'Cancelled', tone: 'muted' },
  COMPLETED: { label: 'Completed', tone: 'neutral' },
}

export const PAYMENT_LABEL: Record<string, string> = {
  toyyibpay: 'ToyyibPay (FPX / card)',
  bank: 'Bank transfer',
  duitnow: 'DuitNow',
  crypto: 'USDT / USDC',
}
export const paymentLabel = (id: string) => PAYMENT_LABEL[id] ?? id

/** "12.50" -> 1250. Returns null when the text is not a valid amount. */
export function toCents(v: string): number | null {
  const t = v.replace(/[,\s]/g, '').replace(/^RM/i, '')
  if (t === '') return null
  if (!/^\d*(\.\d{0,2})?$/.test(t)) return null
  const n = Number(t)
  return Number.isFinite(n) ? Math.round(n * 100) : null
}

/** 1250 -> "12.50" for editable inputs. */
export const centsToInput = (c: number | null | undefined) => (c === null || c === undefined ? '' : (c / 100).toFixed(2))

export function slugify(s: string) {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\+/g, '-plus')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

/** yyyy-mm-dd in local time, for <input type="date">. */
export function isoDay(d: Date | string | null | undefined) {
  if (!d) return ''
  const x = typeof d === 'string' ? new Date(d) : d
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`
}

export function useDebounced<T>(value: T, ms = 300) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

/** Every admin query key starts with 'admin', so one call refreshes whatever is on screen. */
export function useInvalidateAdmin() {
  const qc = useQueryClient()
  return useCallback(() => qc.invalidateQueries({ queryKey: ['admin'] }), [qc])
}

export const pctText = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(1)}%`
