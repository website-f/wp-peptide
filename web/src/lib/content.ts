import type { Settings } from './types'
import { money } from './format'

export interface FaqItem {
  q: string
  a: string
  group: 'Ordering' | 'Quality' | 'Shipping' | 'Programs'
}

/** FAQ copy reads live numbers from store settings so it never drifts from checkout. */
export function faqs(s?: Settings): FaqItem[] {
  const t = s?.tiers ?? [
    { min: 3, pct: 30 },
    { min: 5, pct: 35 },
    { min: 10, pct: 40 },
  ]
  const tierText = t.map((x) => `${x.min} vials ${x.pct}% off`).join(', ')
  const free = s ? money(s.shipping.freeThresholdCents) : 'RM800'
  const cutoff = s?.shipping.cutoff ?? '2pm'
  const box = s?.box ?? { slots: 4, pct: 40, commitMonths: 3 }
  return [
    {
      group: 'Ordering',
      q: 'Are your products for human use?',
      a: 'No. Every product we sell is for laboratory, in vitro research only. Nothing on this site is intended for human or veterinary use, and we do not give dosing or usage advice.',
    },
    {
      group: 'Ordering',
      q: 'How do the quantity tiers work?',
      a: `Buy more units of the same compound and the price per vial drops automatically: ${tierText}. Different sizes of the same compound count together. The discount is applied in your cart.`,
    },
    {
      group: 'Quality',
      q: 'Do you provide certificates of analysis?',
      a: 'Yes. Every lot is tested by an independent ISO/IEC 17025 laboratory before release. Certificates cover HPLC purity, identity, measured content and safety screening, and are listed on each product page and in the COA library.',
    },
    {
      group: 'Shipping',
      q: 'How are orders shipped?',
      a: `Orders paid before ${cutoff} on a business day leave the same day by tracked courier. You get the tracking number by email and on your order page. Shipping is free on orders over ${free}.`,
    },
    {
      group: 'Ordering',
      q: 'How do I pay?',
      a: 'Checkout runs through ToyyibPay, so you can pay with FPX online banking from any major Malaysian bank or with a debit or credit card. Your order is confirmed the moment payment clears.',
    },
    {
      group: 'Programs',
      q: 'What is Build a Box?',
      a: `Pick any ${box.slots} compounds and we pack them into one monthly box at ${box.pct}% off list price, with bacteriostatic water and free shipping included. The box runs for a minimum of ${box.commitMonths} months, then continues month to month until you cancel.`,
    },
    {
      group: 'Programs',
      q: 'How do KYVO Points work?',
      a: `You earn points on every order, after discounts and before shipping. 100 points are worth ${money(100)} off a future order, and points can cover up to ${s?.points.maxRedeemPct ?? 50}% of an order.`,
    },
    {
      group: 'Quality',
      q: 'How should products be stored?',
      a: 'Keep lyophilised vials sealed at -20°C away from light. Once reconstituted for an experiment, store at 2-8°C and follow your lab protocol.',
    },
  ]
}
