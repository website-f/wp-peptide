import { useQuery, useQueryClient } from '@tanstack/react-query'
import { LockKeyIcon, PlusIcon, TrashIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { api, errorMessage } from '@/lib/api'
import { cn } from '@/lib/utils'
import { CopyButton, ErrorState, Field, MoneyInput, Num, NumberInput, PageHeader, Panel, Pill, TextInput } from '../components/kit'
import type { PaymentMethodSetting, SettingsResponse, StoreSettings, Tier } from '../lib/types'
import { TIER_LABEL, centsToInput, toCents } from '../lib/utils'

type PaidTier = Exclude<Tier, 'MEMBER'>
const TIERS: Tier[] = ['MEMBER', 'INSIDER', 'VIP', 'FOUNDER']
const PAID_TIERS: PaidTier[] = ['INSIDER', 'VIP', 'FOUNDER']
const MAX_LADDER = 6

interface LadderRow {
  key: string
  min: string
  pct: string
}

/** Editable copy of the settings. Every number is kept as text so typing "12." or clearing a field works. */
interface Form {
  features: { membership: boolean }
  storeName: string
  supportEmail: string
  announcement: string
  shipping: {
    flat: string
    freeThreshold: string
    carrier: string
    cutoff: string
  }
  taxPct: string
  tiers: LadderRow[]
  wholesale: LadderRow[]
  box: { slots: string; pct: string; commitMonths: string }
  affiliate: {
    defaultRate: string
    cookieDays: string
    couponPct: string
    minPayout: string
  }
  points: {
    perDollar: Record<Tier, string>
    bonusThreshold: string
    bonusPoints: string
    maxRedeemPct: string
    expiryMonths: string
    founderYearlyBonus: string
  }
  membership: Record<PaidTier, { monthly: string; yearly: string }>
  paymentMethods: PaymentMethodSetting[]
}

type Payload = Omit<StoreSettings, 'currency'>
type Errors = Record<string, string>

let rowSeq = 0
const ladderRows = (l: { min: number; pct: number }[]): LadderRow[] =>
  l.map((r) => ({
    key: `r${++rowSeq}`,
    min: String(r.min),
    pct: String(r.pct),
  }))

function toForm(s: StoreSettings): Form {
  return {
    features: { membership: Boolean(s.features?.membership) },
    storeName: s.storeName,
    supportEmail: s.supportEmail,
    announcement: s.announcement,
    shipping: {
      flat: centsToInput(s.shipping.flatCents),
      freeThreshold: centsToInput(s.shipping.freeThresholdCents),
      carrier: s.shipping.carrier,
      cutoff: s.shipping.cutoff,
    },
    taxPct: String(s.taxPct),
    tiers: ladderRows(s.tiers),
    wholesale: ladderRows(s.wholesale),
    box: {
      slots: String(s.box.slots),
      pct: String(s.box.pct),
      commitMonths: String(s.box.commitMonths),
    },
    affiliate: {
      defaultRate: String(s.affiliate.defaultRate),
      cookieDays: String(s.affiliate.cookieDays),
      couponPct: String(s.affiliate.couponPct),
      minPayout: centsToInput(s.affiliate.minPayoutCents),
    },
    points: {
      perDollar: Object.fromEntries(TIERS.map((t) => [t, String(s.points.perDollar[t] ?? 0)])) as Record<Tier, string>,
      bonusThreshold: centsToInput(s.points.bonusThresholdCents),
      bonusPoints: String(s.points.bonusPoints),
      maxRedeemPct: String(s.points.maxRedeemPct),
      expiryMonths: String(s.points.expiryMonths),
      founderYearlyBonus: String(s.points.founderYearlyBonus),
    },
    membership: Object.fromEntries(
      PAID_TIERS.map((t) => [
        t,
        {
          monthly: centsToInput(s.membership[t].monthlyCents),
          yearly: centsToInput(s.membership[t].yearlyCents),
        },
      ]),
    ) as Form['membership'],
    paymentMethods: s.paymentMethods.map((m) => ({ ...m })),
  }
}

/** Mirrors the zod settingsSchema in api/src/routes/admin/store.ts so mistakes show before saving. */
function validate(f: Form): { payload: Payload | null; errors: Errors } {
  const errors: Errors = {}

  const int = (path: string, v: string, min: number, max?: number) => {
    const t = v.trim()
    const n = Number(t)
    if (t === '' || !Number.isFinite(n)) errors[path] = 'Enter a number'
    else if (!Number.isInteger(n)) errors[path] = 'Use a whole number'
    else if (n < min || (max !== undefined && n > max)) errors[path] = max !== undefined ? `Must be between ${min} and ${max}` : `Must be ${min} or more`
    return n
  }
  const dec = (path: string, v: string, min: number, max?: number) => {
    const t = v.trim()
    const n = Number(t)
    if (t === '' || !Number.isFinite(n)) errors[path] = 'Enter a number'
    else if (n < min || (max !== undefined && n > max)) errors[path] = max !== undefined ? `Must be between ${min} and ${max}` : `Must be ${min} or more`
    return n
  }
  const cents = (path: string, v: string) => {
    const c = toCents(v)
    if (c === null) errors[path] = 'Enter an amount, for example 15.00'
    return c ?? 0
  }
  const text = (path: string, v: string, max: number, required = false) => {
    if (required && !v.trim()) errors[path] = 'Required'
    else if (v.length > max) errors[path] = `Keep it under ${max} characters`
    return required ? v.trim() : v
  }
  const ladder = (path: string, rows: LadderRow[]) => {
    if (rows.length > MAX_LADDER) errors[path] = `At most ${MAX_LADDER} steps`
    const out = rows.map((r) => ({
      min: int(`${path}.${r.key}.min`, r.min, 1),
      pct: int(`${path}.${r.key}.pct`, r.pct, 0, 90),
    }))
    const seen = new Set<number>()
    for (const [i, r] of out.entries()) {
      const k = `${path}.${rows[i].key}.min`
      if (!errors[k] && seen.has(r.min)) errors[k] = 'Two steps use the same quantity'
      seen.add(r.min)
    }
    return [...out].sort((a, b) => a.min - b.min)
  }

  const email = f.supportEmail.trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.supportEmail = 'Enter a valid email address'

  const payload: Payload = {
    features: { membership: f.features.membership },
    storeName: text('storeName', f.storeName, 40, true),
    supportEmail: email,
    announcement: text('announcement', f.announcement, 200),
    shipping: {
      flatCents: cents('shipping.flat', f.shipping.flat),
      freeThresholdCents: cents('shipping.freeThreshold', f.shipping.freeThreshold),
      carrier: text('shipping.carrier', f.shipping.carrier, 60),
      cutoff: text('shipping.cutoff', f.shipping.cutoff, 30),
    },
    taxPct: dec('taxPct', f.taxPct, 0, 30),
    tiers: ladder('tiers', f.tiers),
    wholesale: ladder('wholesale', f.wholesale),
    box: {
      slots: int('box.slots', f.box.slots, 1, 8),
      pct: int('box.pct', f.box.pct, 0, 90),
      commitMonths: int('box.commitMonths', f.box.commitMonths, 1, 24),
    },
    affiliate: {
      defaultRate: int('affiliate.defaultRate', f.affiliate.defaultRate, 0, 60),
      cookieDays: int('affiliate.cookieDays', f.affiliate.cookieDays, 1, 365),
      couponPct: int('affiliate.couponPct', f.affiliate.couponPct, 0, 50),
      minPayoutCents: cents('affiliate.minPayout', f.affiliate.minPayout),
    },
    points: {
      perDollar: Object.fromEntries(TIERS.map((t) => [t, dec(`points.perDollar.${t}`, f.points.perDollar[t], 0)])) as Record<Tier, number>,
      bonusThresholdCents: cents('points.bonusThreshold', f.points.bonusThreshold),
      bonusPoints: int('points.bonusPoints', f.points.bonusPoints, 0),
      maxRedeemPct: int('points.maxRedeemPct', f.points.maxRedeemPct, 0, 100),
      expiryMonths: int('points.expiryMonths', f.points.expiryMonths, 1, 60),
      founderYearlyBonus: int('points.founderYearlyBonus', f.points.founderYearlyBonus, 0),
    },
    membership: Object.fromEntries(
      PAID_TIERS.map((t) => [
        t,
        {
          monthlyCents: cents(`membership.${t}.monthly`, f.membership[t].monthly),
          yearlyCents: cents(`membership.${t}.yearly`, f.membership[t].yearly),
        },
      ]),
    ) as Payload['membership'],
    paymentMethods: f.paymentMethods.map((m) => ({
      id: m.id,
      type: m.type,
      enabled: m.enabled,
      label: text(`pm.${m.id}.label`, m.label, 60, true),
      instructions: text(`pm.${m.id}.instructions`, m.instructions, 1500),
    })),
  }
  return { payload: Object.keys(errors).length ? null : payload, errors }
}

const SECTIONS = [
  { id: 'programs', label: 'Programs' },
  { id: 'store', label: 'Store' },
  { id: 'shipping', label: 'Shipping and tax' },
  { id: 'pricing', label: 'Volume pricing' },
  { id: 'box', label: 'Build a Box' },
  { id: 'partners', label: 'Partner program' },
  { id: 'points', label: 'Points' },
  { id: 'membership', label: 'Membership prices' },
  { id: 'payments', label: 'Payment methods' },
] as const

export default function Settings() {
  const qc = useQueryClient()
  const q = useQuery({
    queryKey: ['admin', 'settings'],
    queryFn: () => api.get<SettingsResponse>('/api/admin/settings'),
    staleTime: 30_000,
  })

  const [baseline, setBaseline] = useState<Form | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [showErrors, setShowErrors] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const dirty = useMemo(() => !!form && !!baseline && JSON.stringify(form) !== JSON.stringify(baseline), [form, baseline])

  // Load the saved settings once, and again after a refetch as long as nothing is being edited.
  useEffect(() => {
    if (!q.data) return
    if (form && dirty) return
    const f = toForm(q.data.settings)
    setBaseline(f)
    setForm(structuredClone(f))
  }, [q.data])

  // Jump to a section when linked with a hash, e.g. /admin/settings#box.
  const loaded = !!form
  useEffect(() => {
    if (!loaded || !window.location.hash) return
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: 'start' })
  }, [loaded])

  // Warn before closing the tab with unsaved edits.
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  const result = useMemo(() => (form ? validate(form) : null), [form])
  const errors: Errors = showErrors && result ? result.errors : {}
  const err = (path: string) => errors[path] ?? null

  const update = (fn: (d: Form) => void) =>
    setForm((f) => {
      if (!f) return f
      const d = structuredClone(f)
      fn(d)
      return d
    })

  async function save() {
    if (!result) return
    setShowErrors(true)
    setApiError(null)
    if (!result.payload) {
      toast.error('Some fields need fixing before you can save')
      requestAnimationFrame(() => document.querySelector('[role="alert"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
      return
    }
    setSaving(true)
    try {
      const res = await api.put<{ settings: StoreSettings }>('/api/admin/settings', result.payload)
      const f = toForm(res.settings)
      setBaseline(f)
      setForm(structuredClone(f))
      setShowErrors(false)
      qc.setQueryData<SettingsResponse>(['admin', 'settings'], (old) => (old ? { ...old, settings: res.settings } : old))
      await Promise.all([qc.invalidateQueries({ queryKey: ['admin'] }), qc.invalidateQueries({ queryKey: ['settings'] })])
      toast.success('Settings saved')
    } catch (e) {
      setApiError(errorMessage(e))
      toast.error(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  function discard() {
    if (!baseline) return
    setForm(structuredClone(baseline))
    setShowErrors(false)
    setApiError(null)
  }

  if (q.isError) {
    return (
      <div>
        <PageHeader title="Settings" />
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      </div>
    )
  }
  if (!form || !q.data) return <SettingsSkeleton />

  const gateway = q.data.gateway

  return (
    <div className={cn(dirty && 'pb-24 md:pb-0')}>
      <PageHeader title="Settings" description="Store details, prices, programs and how customers pay. Changes apply to the shop as soon as you save." />

      <div className="grid gap-6 lg:grid-cols-[190px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="hidden lg:block">
          <ul className="sticky top-20 space-y-0.5">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  onClick={(e) => {
                    e.preventDefault()
                    document.getElementById(s.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }}
                  className="block rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 space-y-6">
          {apiError && (
            <div role="alert" className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
              <span>Could not save: {apiError}</span>
            </div>
          )}

          <Section id="programs" title="Programs" description="Optional parts of the store you can switch on or off without losing their settings.">
            <div className="flex items-start justify-between gap-4 rounded-lg border bg-surface p-3 sm:p-4">
              <div className="min-w-0">
                <label htmlFor="feature-membership" className="flex items-center gap-2 font-medium">
                  Membership program
                  <Pill tone={form.features.membership ? 'success' : 'muted'}>{form.features.membership ? 'On' : 'Off'}</Pill>
                </label>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  When off, the Membership page, tiers and membership pricing are hidden from shoppers and everyone earns the base points rate.
                </p>
              </div>
              <Switch
                id="feature-membership"
                checked={form.features.membership}
                onCheckedChange={(v) => update((d) => void (d.features.membership = v))}
                aria-label="Membership program"
                className="mt-1"
              />
            </div>
          </Section>

          <Section id="store" title="Store" description="Basic details shown across the shop and in emails.">
            <div className="grid items-start gap-4 sm:grid-cols-2">
              <Field label="Store name" htmlFor="storeName" error={err('storeName')}>
                <TextInput id="storeName" value={form.storeName} maxLength={40} onChange={(e) => update((d) => void (d.storeName = e.target.value))} />
              </Field>
              <Field label="Support email" htmlFor="supportEmail" error={err('supportEmail')} hint="Customers reply to this address.">
                <TextInput id="supportEmail" type="email" value={form.supportEmail} onChange={(e) => update((d) => void (d.supportEmail = e.target.value))} />
              </Field>
              <Field
                label="Announcement bar"
                htmlFor="announcement"
                className="sm:col-span-2"
                error={err('announcement')}
                hint={
                  <span className="flex justify-between gap-3">
                    <span>The thin strip at the top of every page. Leave empty to hide it.</span>
                    <Num className={cn(form.announcement.length > 200 && 'text-destructive')}>{form.announcement.length}/200</Num>
                  </span>
                }
              >
                <Textarea
                  id="announcement"
                  rows={2}
                  value={form.announcement}
                  onChange={(e) => update((d) => void (d.announcement = e.target.value))}
                  className="min-h-0 resize-y"
                />
              </Field>
            </div>
          </Section>

          <Section id="shipping" title="Shipping and tax" description="What customers pay for delivery.">
            <div className="grid items-start gap-4 sm:grid-cols-2">
              <Field label="Flat shipping fee" htmlFor="ship-flat" error={err('shipping.flat')} hint="Charged on orders below the free shipping amount.">
                <MoneyInput id="ship-flat" value={form.shipping.flat} onChange={(v) => update((d) => void (d.shipping.flat = v))} />
              </Field>
              <Field
                label="Free shipping from"
                htmlFor="ship-free"
                error={err('shipping.freeThreshold')}
                hint="Orders at or above this amount (after discounts) ship free."
              >
                <MoneyInput id="ship-free" value={form.shipping.freeThreshold} onChange={(v) => update((d) => void (d.shipping.freeThreshold = v))} />
              </Field>
              <Field label="Carrier label" htmlFor="ship-carrier" error={err('shipping.carrier')} hint='Shown at checkout, for example "Tracked courier".'>
                <TextInput
                  id="ship-carrier"
                  value={form.shipping.carrier}
                  maxLength={60}
                  onChange={(e) => update((d) => void (d.shipping.carrier = e.target.value))}
                />
              </Field>
              <Field
                label="Same-day cutoff"
                htmlFor="ship-cutoff"
                error={err('shipping.cutoff')}
                hint='Orders paid before this time ship the same day, for example "2pm".'
              >
                <TextInput
                  id="ship-cutoff"
                  value={form.shipping.cutoff}
                  maxLength={30}
                  onChange={(e) => update((d) => void (d.shipping.cutoff = e.target.value))}
                />
              </Field>
              <Field label="Tax" htmlFor="tax" error={err('taxPct')} hint="Added on top of the order. Set 0 if you do not charge tax. Up to 30%.">
                <NumberInput id="tax" min={0} max={30} step="0.1" suffix="%" value={form.taxPct} onChange={(v) => update((d) => void (d.taxPct = v))} />
              </Field>
            </div>
          </Section>

          <Section
            id="pricing"
            title="Volume pricing"
            description="Discounts that grow with quantity. Each step applies once a customer buys at least that many units of the same product (all sizes count together)."
          >
            <div className="grid gap-6 xl:grid-cols-2">
              <LadderEditor
                title="Quantity tiers"
                hint="Used in the normal shop. A customer buying 5 vials of one compound gets the 5-unit discount on that compound."
                path="tiers"
                rows={form.tiers}
                errors={errors}
                onChange={(rows) => update((d) => void (d.tiers = rows))}
              />
              <LadderEditor
                title="Wholesale tiers"
                hint="Used on the bulk order page. The first step is also the minimum quantity for a bulk order."
                path="wholesale"
                rows={form.wholesale}
                errors={errors}
                onChange={(rows) => update((d) => void (d.wholesale = rows))}
              />
            </div>
            <p className="mt-4 text-xs text-muted-foreground">
              Steps are sorted from smallest to largest when you save. Coupon codes cannot be combined with bulk or box pricing.
            </p>
          </Section>

          <Section id="box" title="Build a Box" description="A monthly box where the customer picks a fixed number of compounds at a set discount.">
            <div className="grid items-start gap-4 sm:grid-cols-3">
              <Field label="Compounds per box" htmlFor="box-slots" error={err('box.slots')} hint="1 to 8.">
                <NumberInput id="box-slots" min={1} max={8} step={1} value={form.box.slots} onChange={(v) => update((d) => void (d.box.slots = v))} />
              </Field>
              <Field label="Box discount" htmlFor="box-pct" error={err('box.pct')} hint="Off the normal price of every item in the box.">
                <NumberInput id="box-pct" min={0} max={90} step={1} suffix="%" value={form.box.pct} onChange={(v) => update((d) => void (d.box.pct = v))} />
              </Field>
              <Field label="Commitment" htmlFor="box-commit" error={err('box.commitMonths')} hint="Minimum number of monthly boxes, 1 to 24.">
                <NumberInput
                  id="box-commit"
                  min={1}
                  max={24}
                  step={1}
                  suffix="months"
                  className="[&_input]:pr-16"
                  value={form.box.commitMonths}
                  onChange={(v) => update((d) => void (d.box.commitMonths = v))}
                />
              </Field>
            </div>
          </Section>

          <Section
            id="partners"
            title="Partner program"
            description="Defaults for new partners. You can change the commission rate for each partner on their page."
          >
            <div className="grid items-start gap-4 sm:grid-cols-2">
              <Field
                label="Default commission"
                htmlFor="aff-rate"
                error={err('affiliate.defaultRate')}
                info="The share of each order's net sales a partner earns when a customer buys through their link or code."
                hint="0 to 60%."
              >
                <NumberInput
                  id="aff-rate"
                  min={0}
                  max={60}
                  step={1}
                  suffix="%"
                  value={form.affiliate.defaultRate}
                  onChange={(v) => update((d) => void (d.affiliate.defaultRate = v))}
                />
              </Field>
              <Field
                label="Link tracking window"
                htmlFor="aff-cookie"
                error={err('affiliate.cookieDays')}
                info="How long after clicking a partner's link a purchase still counts for that partner."
                hint="1 to 365 days."
              >
                <NumberInput
                  id="aff-cookie"
                  min={1}
                  max={365}
                  step={1}
                  suffix="days"
                  value={form.affiliate.cookieDays}
                  onChange={(v) => update((d) => void (d.affiliate.cookieDays = v))}
                />
              </Field>
              <Field
                label="Partner code discount"
                htmlFor="aff-coupon"
                error={err('affiliate.couponPct')}
                hint="What shoppers save when they enter a partner's code. 0 to 50%."
              >
                <NumberInput
                  id="aff-coupon"
                  min={0}
                  max={50}
                  step={1}
                  suffix="%"
                  value={form.affiliate.couponPct}
                  onChange={(v) => update((d) => void (d.affiliate.couponPct = v))}
                />
              </Field>
              <Field
                label="Minimum payout"
                htmlFor="aff-min"
                error={err('affiliate.minPayout')}
                hint="Partners can request a payout once their approved balance reaches this."
              >
                <MoneyInput id="aff-min" value={form.affiliate.minPayout} onChange={(v) => update((d) => void (d.affiliate.minPayout = v))} />
              </Field>
            </div>
          </Section>

          <Section
            id="points"
            title="Points"
            description="Customers earn points on what they spend and redeem them as a discount. 1 point is worth 1 sen, so 100 points = RM1."
          >
            <div className="space-y-5">
              <div>
                <p className="text-[13px] font-medium">Points per RM1 spent</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {form.features.membership
                    ? 'Earned on the order after discounts, by membership level. Decimals are fine. Bulk orders always earn at the Member rate.'
                    : 'Earned on the order after discounts. Decimals are fine. The membership program is off, so everyone earns this base rate.'}
                </p>
                <div className={cn('mt-3 grid items-start gap-4', form.features.membership ? 'grid-cols-2 sm:grid-cols-4' : 'sm:grid-cols-2')}>
                  {(form.features.membership ? TIERS : (['MEMBER'] as Tier[])).map((t) => (
                    <Field key={t} label={form.features.membership ? TIER_LABEL[t] : 'Base rate'} htmlFor={`pts-${t}`} error={err(`points.perDollar.${t}`)}>
                      <NumberInput
                        id={`pts-${t}`}
                        min={0}
                        step="0.5"
                        suffix="pts"
                        value={form.points.perDollar[t]}
                        onChange={(v) => update((d) => void (d.points.perDollar[t] = v))}
                      />
                    </Field>
                  ))}
                </div>
              </div>
              <div className="grid items-start gap-4 sm:grid-cols-2">
                <Field
                  label="Bonus when spending at least"
                  htmlFor="pts-bonus-at"
                  error={err('points.bonusThreshold')}
                  hint="Orders at or above this amount get the bonus points below."
                >
                  <MoneyInput id="pts-bonus-at" value={form.points.bonusThreshold} onChange={(v) => update((d) => void (d.points.bonusThreshold = v))} />
                </Field>
                <Field label="Bonus points" htmlFor="pts-bonus" error={err('points.bonusPoints')}>
                  <NumberInput
                    id="pts-bonus"
                    min={0}
                    step={1}
                    suffix="pts"
                    value={form.points.bonusPoints}
                    onChange={(v) => update((d) => void (d.points.bonusPoints = v))}
                  />
                </Field>
                <Field
                  label="Most of an order paid with points"
                  htmlFor="pts-max"
                  error={err('points.maxRedeemPct')}
                  hint="0 to 100% of the order after discounts."
                >
                  <NumberInput
                    id="pts-max"
                    min={0}
                    max={100}
                    step={1}
                    suffix="%"
                    value={form.points.maxRedeemPct}
                    onChange={(v) => update((d) => void (d.points.maxRedeemPct = v))}
                  />
                </Field>
                <Field label="Points expire after" htmlFor="pts-exp" error={err('points.expiryMonths')} hint="1 to 60 months.">
                  <NumberInput
                    id="pts-exp"
                    min={1}
                    max={60}
                    step={1}
                    suffix="months"
                    className="[&_input]:pr-16"
                    value={form.points.expiryMonths}
                    onChange={(v) => update((d) => void (d.points.expiryMonths = v))}
                  />
                </Field>
                {form.features.membership && (
                  <Field
                    label="Founder yearly bonus"
                    htmlFor="pts-founder"
                    error={err('points.founderYearlyBonus')}
                    hint="Points Founder members receive each year."
                  >
                    <NumberInput
                      id="pts-founder"
                      min={0}
                      step={1}
                      suffix="pts"
                      value={form.points.founderYearlyBonus}
                      onChange={(v) => update((d) => void (d.points.founderYearlyBonus = v))}
                    />
                  </Field>
                )}
              </div>
            </div>
          </Section>

          {form.features.membership ? (
            <Section id="membership" title="Membership prices" description="What customers pay to join each paid membership level.">
              <div className="divide-y rounded-lg border">
                {PAID_TIERS.map((t) => (
                  <div key={t} className="grid gap-3 p-3 sm:grid-cols-[120px_1fr_1fr] sm:items-start">
                    <p className="pt-2 text-sm font-medium">{TIER_LABEL[t]}</p>
                    <Field label="Monthly" htmlFor={`mem-${t}-m`} error={err(`membership.${t}.monthly`)}>
                      <MoneyInput id={`mem-${t}-m`} value={form.membership[t].monthly} onChange={(v) => update((d) => void (d.membership[t].monthly = v))} />
                    </Field>
                    <Field label="Yearly" htmlFor={`mem-${t}-y`} error={err(`membership.${t}.yearly`)}>
                      <MoneyInput id={`mem-${t}-y`} value={form.membership[t].yearly} onChange={(v) => update((d) => void (d.membership[t].yearly = v))} />
                    </Field>
                  </div>
                ))}
              </div>
            </Section>
          ) : (
            <div
              id="membership"
              className="scroll-mt-20 flex flex-col gap-3 rounded-xl border border-dashed px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="font-display text-lg font-semibold tracking-wide uppercase">Membership prices</p>
                <p className="text-xs text-muted-foreground">
                  Hidden while the membership program is off. Saved prices are kept for when you switch it back on.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => document.getElementById('programs')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              >
                Program switch
              </Button>
            </div>
          )}

          <Section
            id="payments"
            title="Payment methods"
            description="Choose how customers can pay. Manual methods put the order on hold until you mark it paid."
          >
            <div className="space-y-4">
              {form.paymentMethods.map((m, i) => (
                <PaymentMethodCard
                  key={m.id}
                  method={m}
                  gateway={m.type === 'gateway' ? gateway : null}
                  errors={errors}
                  onChange={(patch) => update((d) => void Object.assign(d.paymentMethods[i], patch))}
                />
              ))}
              {!form.paymentMethods.some((m) => m.enabled) && (
                <p className="flex items-center gap-1.5 text-xs text-warning" role="alert">
                  <WarningCircleIcon className="size-3.5" />
                  No payment method is switched on, so customers cannot check out.
                </p>
              )}
            </div>
          </Section>
        </div>
      </div>

      {dirty && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-4 py-3 backdrop-blur-xl md:sticky md:bottom-4 md:mt-6 md:rounded-xl md:border md:px-4 lg:ml-[214px]">
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 truncate text-sm">
              <span className="mr-2 inline-block size-2 rounded-full bg-gold align-middle" aria-hidden />
              You have unsaved changes
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="ghost" onClick={discard} disabled={saving}>
                Discard
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: ReactNode }) {
  return (
    <div id={id} className="scroll-mt-20">
      <Panel title={title} description={description}>
        {children}
      </Panel>
    </div>
  )
}

function LadderEditor({
  title,
  hint,
  path,
  rows,
  errors,
  onChange,
}: {
  title: string
  hint: string
  path: string
  rows: LadderRow[]
  errors: Errors
  onChange: (rows: LadderRow[]) => void
}) {
  const set = (key: string, patch: Partial<LadderRow>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const add = () => {
    const last = rows[rows.length - 1]
    const nextMin = last ? String((Number(last.min) || 0) + 5) : '3'
    const nextPct = last ? String(Math.min(90, (Number(last.pct) || 0) + 5)) : '10'
    onChange([...rows, { key: `r${++rowSeq}`, min: nextMin, pct: nextPct }])
  }
  return (
    <div className="min-w-0">
      <p className="text-[13px] font-medium">{title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      <div className="mt-3 space-y-2">
        {rows.length === 0 && (
          <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">No steps. Everything sells at full price.</p>
        )}
        {rows.map((r) => {
          const eMin = errors[`${path}.${r.key}.min`]
          const ePct = errors[`${path}.${r.key}.pct`]
          return (
            <div key={r.key}>
              <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-surface px-3 py-2 text-sm">
                <span className="text-muted-foreground">Buy at least</span>
                <NumberInput
                  aria-label="Minimum units"
                  min={1}
                  step={1}
                  value={r.min}
                  onChange={(v) => set(r.key, { min: v })}
                  className="w-20"
                  aria-invalid={!!eMin}
                />
                <span className="text-muted-foreground">units, get</span>
                <NumberInput
                  aria-label="Percent off"
                  min={0}
                  max={90}
                  step={1}
                  suffix="%"
                  value={r.pct}
                  onChange={(v) => set(r.key, { pct: v })}
                  className="w-24"
                  aria-invalid={!!ePct}
                />
                <span className="text-muted-foreground">off</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="ml-auto text-muted-foreground hover:text-destructive"
                  aria-label="Remove step"
                  onClick={() => onChange(rows.filter((x) => x.key !== r.key))}
                >
                  <TrashIcon />
                </Button>
              </div>
              {(eMin || ePct) && (
                <p className="mt-1 flex items-center gap-1 text-xs text-destructive" role="alert">
                  <WarningCircleIcon className="size-3.5 shrink-0" />
                  {eMin ? `Units: ${eMin}` : `Discount: ${ePct}`}
                </p>
              )}
            </div>
          )
        })}
      </div>
      <Button type="button" variant="outline" size="sm" className="mt-2" onClick={add} disabled={rows.length >= MAX_LADDER}>
        <PlusIcon />
        Add step
      </Button>
      {rows.length >= MAX_LADDER && <span className="ml-2 text-xs text-muted-foreground">Up to {MAX_LADDER} steps</span>}
    </div>
  )
}

function PaymentMethodCard({
  method,
  gateway,
  errors,
  onChange,
}: {
  method: PaymentMethodSetting
  gateway: SettingsResponse['gateway'] | null
  errors: Errors
  onChange: (patch: Partial<PaymentMethodSetting>) => void
}) {
  const switchId = `pm-${method.id}-on`
  return (
    <div className={cn('rounded-lg border p-3 sm:p-4', method.enabled ? 'bg-card' : 'bg-surface')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium">{method.label || method.id}</p>
            <Pill tone="muted" dot={false}>
              {method.type === 'gateway' ? 'Online payment' : 'Manual'}
            </Pill>
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {method.type === 'gateway'
              ? 'Customers pay online and the order is marked paid automatically.'
              : 'Customers pay you directly. You confirm the payment and mark the order paid.'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <label htmlFor={switchId} className="text-xs text-muted-foreground">
            {method.enabled ? 'On' : 'Off'}
          </label>
          <Switch id={switchId} checked={method.enabled} onCheckedChange={(v) => onChange({ enabled: v })} />
        </div>
      </div>

      {gateway && (
        <div className="mt-3 rounded-lg border bg-surface p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{gateway.provider}</span>
            <Pill tone={gateway.configured ? 'success' : 'destructive'}>{gateway.configured ? 'Connected' : 'Not set up'}</Pill>
            <Pill tone={gateway.sandbox ? 'warning' : 'success'}>{gateway.sandbox ? 'Test mode (sandbox)' : 'Live'}</Pill>
          </div>
          {!gateway.configured && <p className="mt-2 text-xs text-destructive">Online payments will not work until the API keys are added on the server.</p>}
          {gateway.configured && gateway.sandbox && (
            <p className="mt-2 text-xs text-muted-foreground">Test mode: no real money moves. Switch the server to live keys before launch.</p>
          )}
          <div className="mt-3">
            <p className="text-xs text-muted-foreground">Callback URL (paste this into your {gateway.provider} account if asked)</p>
            <div className="mt-1 flex min-w-0 items-center gap-1 rounded-md border bg-background pl-3">
              <code className="min-w-0 flex-1 truncate font-mono text-xs">{gateway.callbackUrl}</code>
              <CopyButton text={gateway.callbackUrl} label="Copy callback URL" />
            </div>
          </div>
          <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
            <LockKeyIcon className="mt-px size-3.5 shrink-0" />
            API keys are stored in the server .env file, not here, so they never appear in the browser.
          </p>
        </div>
      )}

      <div className="mt-3 grid gap-3">
        <Field label="Name shown at checkout" htmlFor={`pm-${method.id}-label`} error={errors[`pm.${method.id}.label`] ?? null}>
          <TextInput id={`pm-${method.id}-label`} value={method.label} maxLength={60} onChange={(e) => onChange({ label: e.target.value })} />
        </Field>
        <Field
          label="Instructions"
          htmlFor={`pm-${method.id}-instr`}
          error={errors[`pm.${method.id}.instructions`] ?? null}
          hint={
            method.type === 'gateway'
              ? 'Shown before the customer is sent to pay.'
              : 'Shown to the customer after they place the order. Include your account details and ask them to use the order number as the reference.'
          }
        >
          <Textarea
            id={`pm-${method.id}-instr`}
            rows={method.type === 'gateway' ? 2 : 5}
            value={method.instructions}
            onChange={(e) => onChange({ instructions: e.target.value })}
            className="min-h-0 resize-y"
          />
        </Field>
      </div>
    </div>
  )
}

function SettingsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[190px_minmax(0,1fr)]">
        <div className="hidden space-y-2 lg:block">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-7 w-full" />
          ))}
        </div>
        <div className="space-y-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  )
}
