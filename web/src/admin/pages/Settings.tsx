import {
  CalculatorIcon,
  LockKeyIcon,
  PlusIcon,
  TrashIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react'
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useBlocker } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ApiError, api, errorMessage } from '@/lib/api'
import { currencySymbol, date, money, num } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ConfirmDialog, ErrorState, Field, MoneyInput, Num, NumberInput, PageHeader, Panel, Pill, TextInput } from '../components/kit'
import { BannerEditor, bannerToForm, validateBanner, type BannerForm } from '../components/BannerEditor'
import { ToyyibPayPanel } from '../components/ToyyibPayPanel'
import { useAdminProducts, useAdminSettings } from '../lib/queries'
import type { CountBy, PaymentMethodSetting, SettingsResponse, StoreSettings, Tier } from '../lib/types'
import { TIER_LABEL, centsToInput, toCents } from '../lib/utils'

type PaidTier = Exclude<Tier, 'MEMBER'>
const ALL_TIERS: Tier[] = ['MEMBER', 'INSIDER', 'VIP', 'FOUNDER']
const PAID_TIERS: PaidTier[] = ['INSIDER', 'VIP', 'FOUNDER']
/** Matches the API ladder limit. */
const MAX_LADDER = 8

interface LadderRow {
  key: string
  min: string
  pct: string
}

/** Editable copy of the settings. Numbers are kept as text so typing "12." or clearing a field works. */
interface Form {
  storeName: string
  supportEmail: string
  banner: BannerForm
  shipping: { flat: string; freeThreshold: string; carrier: string; cutoff: string }
  taxPct: string
  tierPricing: { enabled: boolean; countBy: CountBy; hintWithinUnits: string }
  tiers: LadderRow[]
  bulk: { enabled: boolean; countBy: CountBy; freeShipping: boolean; earnPoints: boolean; maxUnitsPerOrder: string }
  wholesale: LadderRow[]
  box: { enabled: boolean; slots: string; pct: string; commitMonths: string; freeShipping: boolean; earnPoints: boolean; includedItem: string }
  affiliate: {
    defaultRate: string
    cookieDays: string
    couponPct: string
    minPayout: string
    codeDiscountOnBulk: boolean
    codeDiscountOnBox: boolean
    codeStacksWithTiers: boolean
    commissionOnBulk: boolean
    commissionOnBox: boolean
  }
  discounts: { pointsWithCodes: boolean }
  orders: { online: string; manual: string }
  inventory: { lowStock: string }
  points: {
    value100: string
    /** Only the tiers the server sent (the base rate alone unless membership is licensed). */
    perDollar: Partial<Record<Tier, string>>
    bonusThreshold: string
    bonusPoints: string
    maxRedeemPct: string
    expiryMonths: string
    /** Null when the server did not send it (membership not licensed). */
    founderYearlyBonus: string | null
  }
  /** Licensed add-on only. Null when the server did not send it. */
  features: { membership: boolean } | null
  membership: Record<PaidTier, { monthly: string; yearly: string }> | null
  paymentMethods: PaymentMethodSetting[]
  onlinePayment: StoreSettings['onlinePayment']
  notifications: StoreSettings['notifications']
}

type Payload = Partial<Omit<StoreSettings, 'currency'>>
type Errors = Record<string, string>

let rowSeq = 0
const ladderRows = (l: { min: number; pct: number }[]): LadderRow[] => l.map((r) => ({ key: `r${++rowSeq}`, min: String(r.min), pct: String(r.pct) }))

function toForm(s: StoreSettings): Form {
  const tiersSent = ALL_TIERS.filter((t) => s.points.perDollar[t] !== undefined)
  return {
    storeName: s.storeName,
    supportEmail: s.supportEmail,
    banner: bannerToForm(s.banner),
    shipping: {
      flat: centsToInput(s.shipping.flatCents),
      freeThreshold: centsToInput(s.shipping.freeThresholdCents),
      carrier: s.shipping.carrier,
      cutoff: s.shipping.cutoff,
    },
    taxPct: String(s.taxPct),
    tierPricing: { enabled: s.tierPricing.enabled, countBy: s.tierPricing.countBy, hintWithinUnits: String(s.tierPricing.hintWithinUnits) },
    tiers: ladderRows(s.tiers),
    bulk: {
      enabled: s.bulk.enabled,
      countBy: s.bulk.countBy,
      freeShipping: s.bulk.freeShipping,
      earnPoints: s.bulk.earnPoints,
      maxUnitsPerOrder: String(s.bulk.maxUnitsPerOrder),
    },
    wholesale: ladderRows(s.wholesale),
    box: {
      enabled: s.box.enabled,
      slots: String(s.box.slots),
      pct: String(s.box.pct),
      commitMonths: String(s.box.commitMonths),
      freeShipping: s.box.freeShipping,
      earnPoints: s.box.earnPoints,
      includedItem: s.box.includedItem,
    },
    affiliate: {
      defaultRate: String(s.affiliate.defaultRate),
      cookieDays: String(s.affiliate.cookieDays),
      couponPct: String(s.affiliate.couponPct),
      minPayout: centsToInput(s.affiliate.minPayoutCents),
      codeDiscountOnBulk: s.affiliate.codeDiscountOnBulk,
      codeDiscountOnBox: s.affiliate.codeDiscountOnBox,
      codeStacksWithTiers: s.affiliate.codeStacksWithTiers,
      commissionOnBulk: s.affiliate.commissionOnBulk,
      commissionOnBox: s.affiliate.commissionOnBox,
    },
    discounts: { pointsWithCodes: s.discounts.pointsWithCodes },
    orders: { online: String(s.orders.unpaidExpiryDaysOnline), manual: String(s.orders.unpaidExpiryDaysManual) },
    inventory: { lowStock: String(s.inventory.lowStockThreshold) },
    points: {
      value100: centsToInput(s.points.valueCentsPer100),
      perDollar: Object.fromEntries(tiersSent.map((t) => [t, String(s.points.perDollar[t])])),
      bonusThreshold: centsToInput(s.points.bonusThresholdCents),
      bonusPoints: String(s.points.bonusPoints),
      maxRedeemPct: String(s.points.maxRedeemPct),
      expiryMonths: String(s.points.expiryMonths),
      founderYearlyBonus: s.points.founderYearlyBonus === undefined ? null : String(s.points.founderYearlyBonus),
    },
    features: s.features ? { membership: Boolean(s.features.membership) } : null,
    membership: s.membership
      ? (Object.fromEntries(
          PAID_TIERS.map((t) => [t, { monthly: centsToInput(s.membership![t].monthlyCents), yearly: centsToInput(s.membership![t].yearlyCents) }]),
        ) as Record<PaidTier, { monthly: string; yearly: string }>)
      : null,
    paymentMethods: s.paymentMethods.map((m) => ({ ...m })),
    onlinePayment: { channel: s.onlinePayment?.channel ?? 'both', feesPaidBy: s.onlinePayment?.feesPaidBy ?? 'store' },
    notifications: { ...{ staffEmail: '', orderPaid: true, partnerApplication: true, payoutRequest: true, contactMessage: true, paymentIssue: true }, ...s.notifications },
  }
}

/**
 * Mirrors the zod settingsSchema in api/src/routes/admin/store.ts so mistakes show before saving.
 * Error keys use the API field paths, so server-side errors land on the same fields.
 */
function validate(f: Form): { payload: Payload | null; errors: Errors } {
  const errors: Errors = {}
  const range = (min: number, max?: number) => (max !== undefined ? `Must be between ${num(min)} and ${num(max)}` : `Must be ${num(min)} or more`)

  const int = (path: string, v: string, min: number, max?: number) => {
    const t = v.trim()
    const n = Number(t)
    if (t === '' || !Number.isFinite(n)) errors[path] = 'Enter a number'
    else if (!Number.isInteger(n)) errors[path] = 'Use a whole number'
    else if (n < min || (max !== undefined && n > max)) errors[path] = range(min, max)
    return n
  }
  const dec = (path: string, v: string, min: number, max?: number) => {
    const t = v.trim()
    const n = Number(t)
    if (t === '' || !Number.isFinite(n)) errors[path] = 'Enter a number'
    else if (n < min || (max !== undefined && n > max)) errors[path] = range(min, max)
    return n
  }
  const cents = (path: string, v: string, max?: number) => {
    const c = toCents(v)
    if (c === null) errors[path] = 'Enter an amount, for example 15.00'
    else if (max !== undefined && c > max) errors[path] = `Must be ${money(max)} or less`
    return c ?? 0
  }
  const text = (path: string, v: string, max: number, required = false) => {
    if (required && !v.trim()) errors[path] = 'Required'
    else if (v.length > max) errors[path] = `Keep it under ${max} characters`
    return required ? v.trim() : v
  }
  const ladder = (path: string, rows: LadderRow[], needOne: boolean) => {
    if (rows.length > MAX_LADDER) errors[path] = `At most ${MAX_LADDER} steps`
    if (needOne && rows.length === 0) errors[path] = 'Add at least one step'
    const out = rows.map((r, i) => ({ min: int(`${path}.${i}.min`, r.min, 1, 100000), pct: int(`${path}.${i}.pct`, r.pct, 0, 90) }))
    // Steps must go up: each one needs more units than the step above it.
    for (let i = 1; i < out.length; i++) {
      const k = `${path}.${i}.min`
      if (errors[k] || errors[`${path}.${i - 1}.min`]) continue
      if (out[i].min === out[i - 1].min) errors[k] = 'Two steps use the same quantity'
      else if (out[i].min < out[i - 1].min) errors[k] = `Needs more than ${num(out[i - 1].min)} units, the step above`
    }
    return out
  }

  const email = f.supportEmail.trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.supportEmail = 'Enter a valid email address'
  const staffEmail = f.notifications.staffEmail.trim()
  if (staffEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(staffEmail)) errors['notifications.staffEmail'] = 'Enter a valid email address, or leave it empty'

  const wholesale = ladder('wholesale', f.wholesale, true)
  const maxUnits = int('bulk.maxUnitsPerOrder', f.bulk.maxUnitsPerOrder, 0, 100000)
  if (!errors['bulk.maxUnitsPerOrder'] && maxUnits > 0 && wholesale[0] && maxUnits < wholesale[0].min) {
    errors['bulk.maxUnitsPerOrder'] = `Must be at least ${num(wholesale[0].min)}, the smallest bulk order, or 0 for no limit`
  }

  const perDollar = Object.fromEntries(
    (Object.keys(f.points.perDollar) as Tier[]).map((t) => [t, dec(`points.perDollar.${t}`, f.points.perDollar[t] ?? '', 0, 1000)]),
  ) as StoreSettings['points']['perDollar']

  const payload: Payload = {
    storeName: text('storeName', f.storeName, 40, true),
    supportEmail: email,
    banner: validateBanner(f.banner, errors),
    shipping: {
      flatCents: cents('shipping.flatCents', f.shipping.flat),
      freeThresholdCents: cents('shipping.freeThresholdCents', f.shipping.freeThreshold),
      carrier: text('shipping.carrier', f.shipping.carrier, 60),
      cutoff: text('shipping.cutoff', f.shipping.cutoff, 30),
    },
    taxPct: dec('taxPct', f.taxPct, 0, 30),
    tierPricing: {
      enabled: f.tierPricing.enabled,
      countBy: f.tierPricing.countBy,
      hintWithinUnits: int('tierPricing.hintWithinUnits', f.tierPricing.hintWithinUnits, 0, 20),
    },
    tiers: ladder('tiers', f.tiers, false),
    bulk: {
      enabled: f.bulk.enabled,
      countBy: f.bulk.countBy,
      freeShipping: f.bulk.freeShipping,
      earnPoints: f.bulk.earnPoints,
      maxUnitsPerOrder: maxUnits,
    },
    wholesale,
    box: {
      enabled: f.box.enabled,
      slots: int('box.slots', f.box.slots, 1, 12),
      pct: int('box.pct', f.box.pct, 0, 90),
      commitMonths: int('box.commitMonths', f.box.commitMonths, 1, 24),
      freeShipping: f.box.freeShipping,
      earnPoints: f.box.earnPoints,
      includedItem: text('box.includedItem', f.box.includedItem.trim(), 80),
    },
    affiliate: {
      defaultRate: int('affiliate.defaultRate', f.affiliate.defaultRate, 0, 60),
      cookieDays: int('affiliate.cookieDays', f.affiliate.cookieDays, 1, 365),
      couponPct: int('affiliate.couponPct', f.affiliate.couponPct, 0, 50),
      minPayoutCents: cents('affiliate.minPayoutCents', f.affiliate.minPayout),
      codeDiscountOnBulk: f.affiliate.codeDiscountOnBulk,
      codeDiscountOnBox: f.affiliate.codeDiscountOnBox,
      codeStacksWithTiers: f.affiliate.codeStacksWithTiers,
      commissionOnBulk: f.affiliate.commissionOnBulk,
      commissionOnBox: f.affiliate.commissionOnBox,
    },
    discounts: { pointsWithCodes: f.discounts.pointsWithCodes },
    orders: {
      unpaidExpiryDaysOnline: int('orders.unpaidExpiryDaysOnline', f.orders.online, 1, 100),
      unpaidExpiryDaysManual: int('orders.unpaidExpiryDaysManual', f.orders.manual, 1, 60),
    },
    inventory: { lowStockThreshold: int('inventory.lowStockThreshold', f.inventory.lowStock, 0, 10000) },
    points: {
      valueCentsPer100: cents('points.valueCentsPer100', f.points.value100, 100000),
      perDollar,
      bonusThresholdCents: cents('points.bonusThresholdCents', f.points.bonusThreshold),
      bonusPoints: int('points.bonusPoints', f.points.bonusPoints, 0),
      maxRedeemPct: int('points.maxRedeemPct', f.points.maxRedeemPct, 0, 100),
      expiryMonths: int('points.expiryMonths', f.points.expiryMonths, 1, 60),
      ...(f.points.founderYearlyBonus !== null ? { founderYearlyBonus: int('points.founderYearlyBonus', f.points.founderYearlyBonus, 0) } : {}),
    },
    paymentMethods: f.paymentMethods.map((m, i) => ({
      id: m.id,
      type: m.type,
      enabled: m.enabled,
      label: text(`paymentMethods.${i}.label`, m.label, 60, true),
      instructions: text(`paymentMethods.${i}.instructions`, m.instructions, 1500),
    })),
    onlinePayment: { channel: f.onlinePayment.channel, feesPaidBy: f.onlinePayment.feesPaidBy },
    notifications: { ...f.notifications, staffEmail },
  }
  // Licensed add-on groups are only ever sent when the server sent them.
  if (f.features) payload.features = { membership: f.features.membership }
  if (f.membership) {
    const m = f.membership
    payload.membership = Object.fromEntries(
      PAID_TIERS.map((t) => [t, { monthlyCents: cents(`membership.${t}.monthlyCents`, m[t].monthly), yearlyCents: cents(`membership.${t}.yearlyCents`, m[t].yearly) }]),
    ) as StoreSettings['membership']
  }
  return { payload: Object.keys(errors).length ? null : payload, errors }
}

type SectionId = 'store' | 'notifications' | 'banner' | 'shipping' | 'quantity' | 'bulk' | 'box' | 'partners' | 'points' | 'orders' | 'payments' | 'gateway' | 'membership'

const SECTIONS: { id: SectionId; label: string; licensed?: true }[] = [
  { id: 'store', label: 'Store' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'banner', label: 'Top banner' },
  { id: 'shipping', label: 'Shipping and tax' },
  { id: 'quantity', label: 'Quantity discounts' },
  { id: 'bulk', label: 'Bulk orders' },
  { id: 'box', label: 'Build a Box' },
  { id: 'partners', label: 'Partner program' },
  { id: 'points', label: 'Points' },
  { id: 'orders', label: 'Orders and stock' },
  { id: 'payments', label: 'Payment methods' },
  { id: 'gateway', label: 'ToyyibPay' },
  { id: 'membership', label: 'Membership', licensed: true },
]

/** Old links (#pricing, #programs) keep working. */
const HASH_ALIAS: Record<string, SectionId> = { pricing: 'quantity', programs: 'membership', wholesale: 'bulk', affiliate: 'partners' }

/** Which section an error key (API path) belongs to, for the red dots in the section menu. */
function sectionOf(key: string): SectionId {
  const head = key.split('.')[0]
  const map: Record<string, SectionId> = {
    storeName: 'store',
    supportEmail: 'store',
    banner: 'banner',
    shipping: 'shipping',
    taxPct: 'shipping',
    tierPricing: 'quantity',
    tiers: 'quantity',
    bulk: 'bulk',
    wholesale: 'bulk',
    box: 'box',
    affiliate: 'partners',
    points: 'points',
    discounts: 'points',
    orders: 'orders',
    inventory: 'orders',
    paymentMethods: 'payments',
    onlinePayment: 'payments',
    notifications: 'notifications',
    features: 'membership',
    membership: 'membership',
  }
  if (key.startsWith('points.perDollar.') && !key.endsWith('MEMBER')) return 'membership'
  if (key === 'points.founderYearlyBonus') return 'membership'
  return map[head] ?? 'store'
}

const offPrice = (cents: number, pct: number) => Math.round((cents * (100 - pct)) / 100)
const n0 = (v: string) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

interface Sample {
  name: string
  priceCents: number
}

export default function Settings() {
  const qc = useQueryClient()
  const q = useAdminSettings()
  const products = useAdminProducts()

  const [baseline, setBaseline] = useState<Form | null>(null)
  const [form, setForm] = useState<Form | null>(null)
  const [showErrors, setShowErrors] = useState(false)
  const [serverErrors, setServerErrors] = useState<Errors>({})
  const [apiError, setApiError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [active, setActive] = useState<SectionId>('store')

  const dirty = useMemo(() => !!form && !!baseline && JSON.stringify(form) !== JSON.stringify(baseline), [form, baseline])

  // Load the saved settings once, and again after a refetch as long as nothing is being edited.
  useEffect(() => {
    if (!q.data) return
    if (form && dirty) return
    const f = toForm(q.data.settings)
    setBaseline(f)
    setForm(structuredClone(f))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data])

  const licensed = q.data?.licensed?.membership === true
  const sections = useMemo(() => SECTIONS.filter((s) => !s.licensed || (licensed && form?.membership)), [licensed, form?.membership])

  const scrollTo = useCallback((id: string, smooth = true) => {
    document.getElementById(id)?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' })
  }, [])

  // Jump to a section when linked with a hash, e.g. /admin/settings#box.
  const loaded = !!form
  useEffect(() => {
    if (!loaded || !window.location.hash) return
    const h = window.location.hash.slice(1)
    scrollTo(HASH_ALIAS[h] ?? h, false)
  }, [loaded, scrollTo])

  // Highlight the section being read in the menu.
  useEffect(() => {
    if (!loaded) return
    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => {
        let current: SectionId = sections[0]?.id ?? 'store'
        for (const s of sections) {
          const el = document.getElementById(s.id)
          if (el && el.getBoundingClientRect().top <= 140) current = s.id
        }
        // At the very bottom, the last section is the one in view.
        if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) current = sections[sections.length - 1]?.id ?? current
        setActive(current)
      })
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
    }
  }, [loaded, sections])

  // Warn before closing the tab, and before leaving the page inside the panel, with unsaved edits.
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  const blocker = useBlocker(
    useCallback(
      ({ currentLocation, nextLocation }: { currentLocation: { pathname: string }; nextLocation: { pathname: string } }) =>
        dirtyRef.current && currentLocation.pathname !== nextLocation.pathname,
      [],
    ),
  )
  const proceeding = useRef(false)

  const result = useMemo(() => (form ? validate(form) : null), [form])
  const errors: Errors = useMemo(() => ({ ...(showErrors && result ? result.errors : {}), ...serverErrors }), [showErrors, result, serverErrors])
  const err = (path: string) => errors[path] ?? null
  const sectionErrors = useMemo(() => new Set(Object.keys(errors).map(sectionOf)), [errors])
  const errorCount = Object.keys(errors).length

  const update = (fn: (d: Form) => void) => {
    if (Object.keys(serverErrors).length) setServerErrors({})
    setForm((f) => {
      if (!f) return f
      const d = structuredClone(f)
      fn(d)
      return d
    })
  }

  // A real product from the catalogue makes the examples concrete.
  const sample: Sample = useMemo(() => {
    const list = (products.data ?? []).filter((p) => p.status === 'ACTIVE' && p.variants.some((v) => v.active))
    const pick = list.find((p) => p.featured) ?? list[0]
    if (!pick) return { name: 'an item', priceCents: 10000 }
    const v = [...pick.variants].filter((x) => x.active).sort((a, b) => a.sortOrder - b.sortOrder)[0]
    return { name: `${pick.name} ${v.label}`, priceCents: v.priceCents }
  }, [products.data])

  async function save() {
    if (!result || !baseline) return
    setShowErrors(true)
    setApiError(null)
    setServerErrors({})
    if (!result.payload) {
      toast.error('Some fields need fixing before you can save')
      requestAnimationFrame(() => document.querySelector('p[role="alert"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
      return
    }
    // Send only the groups that changed, and only groups the server sent in the first place.
    const before = validate(baseline).payload
    const present = new Set(Object.keys(q.data?.settings ?? {}))
    const body: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(result.payload)) {
      if (!present.has(k)) continue
      if (before && JSON.stringify(before[k as keyof Payload]) === JSON.stringify(v)) continue
      body[k] = v
    }
    if (Object.keys(body).length === 0) {
      discard()
      return
    }
    setSaving(true)
    try {
      const res = await api.put<{ settings: StoreSettings; licensed?: SettingsResponse['licensed'] }>('/api/admin/settings', body)
      const f = toForm(res.settings)
      setBaseline(f)
      setForm(structuredClone(f))
      setShowErrors(false)
      qc.setQueryData<SettingsResponse>(['admin', 'settings'], (old) => (old ? { ...old, settings: res.settings, licensed: res.licensed ?? old.licensed } : old))
      await Promise.all([qc.invalidateQueries({ queryKey: ['admin'] }), qc.invalidateQueries({ queryKey: ['settings'] })])
      toast.success('Settings saved')
    } catch (e) {
      const fieldErrors: Errors = {}
      if (e instanceof ApiError && Array.isArray(e.details)) {
        for (const issue of e.details as { path?: (string | number)[]; message?: string }[]) {
          if (issue.path?.length && issue.message) fieldErrors[issue.path.join('.')] = issue.message
        }
      }
      setServerErrors(fieldErrors)
      setApiError(errorMessage(e))
      toast.error(errorMessage(e))
      if (Object.keys(fieldErrors).length) requestAnimationFrame(() => document.querySelector('p[role="alert"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
    } finally {
      setSaving(false)
    }
  }

  function discard() {
    if (!baseline) return
    setForm(structuredClone(baseline))
    setShowErrors(false)
    setServerErrors({})
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
  const sym = currencySymbol()

  // ---------- Live examples ----------
  const tierSteps = form.tiers.map((r) => ({ min: n0(r.min), pct: n0(r.pct) })).filter((r) => r.min > 0)
  const bulkSteps = form.wholesale.map((r) => ({ min: n0(r.min), pct: n0(r.pct) })).filter((r) => r.min > 0)
  const flat = toCents(form.shipping.flat) ?? 0
  const freeAt = toCents(form.shipping.freeThreshold) ?? 0
  const tax = n0(form.taxPct)
  const exampleOrder = 50000
  const couponPct = n0(form.affiliate.couponPct)
  const rate = n0(form.affiliate.defaultRate)
  const baseRate = n0(form.points.perDollar.MEMBER ?? '0')
  const value100 = toCents(form.points.value100) ?? 0
  const earned = Math.floor((exampleOrder / 100) * baseRate)
  const earnedWorth = Math.floor((earned * value100) / 100)
  const bonusAt = toCents(form.points.bonusThreshold) ?? 0
  const maxPct = n0(form.points.maxRedeemPct)
  const slots = n0(form.box.slots)
  const boxPct = n0(form.box.pct)
  const nudge = tierSteps.length ? Math.max(0, Math.min(n0(form.tierPricing.hintWithinUnits), tierSteps[0].min - 1)) : 0
  const inDays = (d: number) => date(new Date(Date.now() + d * 86400_000))

  return (
    <div className={cn(dirty && 'pb-24 md:pb-0')}>
      <PageHeader
        title="Settings"
        description="Store details, discounts, programs and how customers pay. Every price rule in the shop comes from here. Changes apply as soon as you save."
      />

      {/* Phone and tablet: compact jump menu that stays in reach. */}
      <div className="sticky top-14 z-20 -mx-4 mb-4 border-b bg-background/95 px-4 py-2 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:hidden">
        <Select value={active} onValueChange={(v) => scrollTo(v)}>
          <SelectTrigger className="w-full data-[size=default]:h-9" aria-label="Jump to section">
            <span className="text-xs text-muted-foreground">Section</span>
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            {sections.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                <span className="flex items-center gap-2">
                  {s.label}
                  {sectionErrors.has(s.id) && <span className="size-1.5 rounded-full bg-destructive" aria-label="Has errors" />}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-6 lg:grid-cols-[190px_minmax(0,1fr)]">
        <nav aria-label="Settings sections" className="hidden lg:block">
          <ul className="sticky top-20 space-y-0.5">
            {sections.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  aria-current={active === s.id ? 'true' : undefined}
                  onClick={(e) => {
                    e.preventDefault()
                    scrollTo(s.id)
                  }}
                  className={cn(
                    'flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors',
                    active === s.id ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <span className="flex items-center gap-2">
                    <span className={cn('h-4 w-0.5 rounded-full', active === s.id ? 'bg-gold' : 'bg-transparent')} aria-hidden />
                    {s.label}
                  </span>
                  {sectionErrors.has(s.id) && <span className="size-1.5 rounded-full bg-destructive" aria-label="Has errors" />}
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

          {/* ---------- Store ---------- */}
          <Section id="store" title="Store" description="Basic details shown across the shop and in emails.">
            <div className="grid items-start gap-4 sm:grid-cols-2">
              <Field label="Store name" htmlFor="storeName" error={err('storeName')}>
                <TextInput id="storeName" value={form.storeName} maxLength={40} onChange={(e) => update((d) => void (d.storeName = e.target.value))} />
              </Field>
              <Field label="Support email" htmlFor="supportEmail" error={err('supportEmail')} hint="Customers reply to this address.">
                <TextInput id="supportEmail" type="email" value={form.supportEmail} onChange={(e) => update((d) => void (d.supportEmail = e.target.value))} />
              </Field>
            </div>
          </Section>

          {/* ---------- Top banner ---------- */}
          {/* ---------- Notifications ---------- */}
          <Section id="notifications" title="Notifications" description="Emails sent to your team. Customers and partners always get their own emails (order updates, password resets, partner decisions).">
            <div className="grid gap-4">
              <Field
                label="Send team alerts to"
                htmlFor="staffEmail"
                error={err('notifications.staffEmail')}
                hint={`Leave empty to use the support email (${form.supportEmail || 'not set'}).`}
              >
                <TextInput
                  id="staffEmail"
                  type="email"
                  placeholder={form.supportEmail}
                  value={form.notifications.staffEmail}
                  onChange={(e) => update((d) => void (d.notifications.staffEmail = e.target.value))}
                />
              </Field>
              <div className="grid gap-3">
                {(
                  [
                    ['orderPaid', 'New paid order', 'When an order is paid and ready to pack.'],
                    ['partnerApplication', 'Partner application', 'When someone applies to the partner program.'],
                    ['payoutRequest', 'Payout request', 'When a partner asks to be paid.'],
                    ['contactMessage', 'Contact form message', 'Reply to the email to answer the customer directly.'],
                    ['paymentIssue', 'Payment issue', 'Extra or short payments that need a refund or a check.'],
                  ] as const
                ).map(([k, label, description]) => (
                  <ToggleRow
                    key={k}
                    id={`notify-${k}`}
                    label={label}
                    description={description}
                    checked={form.notifications[k]}
                    onChange={(v) => update((d) => void (d.notifications[k] = v))}
                  />
                ))}
              </div>
            </div>
          </Section>

          <Section
            id="banner"
            title="Top banner"
            description="The strip across the top of every shop page. Change the wording, add links, schedule promotions, rotate several messages, or switch it off."
            toggle={{ id: 'banner-on', label: 'Show the top banner', checked: form.banner.enabled, onChange: (v) => update((d) => void (d.banner.enabled = v)) }}
          >
            <Dimmed off={!form.banner.enabled} note="The banner is off, so shoppers do not see it.">
              <BannerEditor value={form.banner} errors={errors} onChange={(fn) => update((d) => fn(d.banner))} />
            </Dimmed>
          </Section>

          {/* ---------- Shipping and tax ---------- */}
          <Section id="shipping" title="Shipping and tax" description="What customers pay for delivery, and any tax added on top.">
            <div className="grid items-start gap-4 sm:grid-cols-2">
              <Field label="Flat shipping fee" htmlFor="ship-flat" error={err('shipping.flatCents')} hint="Charged on orders below the free shipping amount. 0 means shipping is always free.">
                <MoneyInput id="ship-flat" value={form.shipping.flat} onChange={(v) => update((d) => void (d.shipping.flat = v))} />
              </Field>
              <Field label="Free shipping from" htmlFor="ship-free" error={err('shipping.freeThresholdCents')} hint="Orders at or above this amount, after discounts, ship free.">
                <MoneyInput id="ship-free" value={form.shipping.freeThreshold} onChange={(v) => update((d) => void (d.shipping.freeThreshold = v))} />
              </Field>
              <Field label="Carrier label" htmlFor="ship-carrier" error={err('shipping.carrier')} hint='Shown at checkout, for example "Tracked courier".'>
                <TextInput id="ship-carrier" value={form.shipping.carrier} maxLength={60} onChange={(e) => update((d) => void (d.shipping.carrier = e.target.value))} />
              </Field>
              <Field label="Same-day cutoff" htmlFor="ship-cutoff" error={err('shipping.cutoff')} hint='Orders paid before this time ship the same day, for example "2pm".'>
                <TextInput id="ship-cutoff" value={form.shipping.cutoff} maxLength={30} onChange={(e) => update((d) => void (d.shipping.cutoff = e.target.value))} />
              </Field>
              <Field label="Tax" htmlFor="tax" error={err('taxPct')} hint="Added on top of the order. 0 if you do not charge tax. Up to 30%.">
                <NumberInput id="tax" min={0} max={30} step="0.1" suffix="%" value={form.taxPct} onChange={(v) => update((d) => void (d.taxPct = v))} />
              </Field>
            </div>
            <Example>
              {flat === 0 || freeAt === 0 ? (
                <>Every order ships free.</>
              ) : (
                <>
                  An order of <Num>{money(Math.min(30000, freeAt - 100))}</Num> pays <Num>{money(flat)}</Num> shipping. From <Num>{money(freeAt)}</Num> shipping is free.
                </>
              )}
              {tax > 0 && (
                <>
                  {' '}
                  Tax adds <Num>{money(Math.round((30000 * tax) / 100))}</Num> to a <Num>{money(30000)}</Num> order.
                </>
              )}
            </Example>
          </Section>

          {/* ---------- Quantity discounts ---------- */}
          <Section
            id="quantity"
            title="Quantity discounts"
            description="Automatic discounts on normal shop orders that grow with how many units a shopper buys."
            toggle={{
              id: 'tier-on',
              label: 'Quantity discounts',
              checked: form.tierPricing.enabled,
              onChange: (v) => update((d) => void (d.tierPricing.enabled = v)),
            }}
          >
            <Dimmed off={!form.tierPricing.enabled} note="Quantity discounts are off. Every shop order is charged full price.">
              <div className="space-y-5">
                <CountByChoice
                  name="tier-count"
                  value={form.tierPricing.countBy}
                  onChange={(v) => update((d) => void (d.tierPricing.countBy = v))}
                />
                <LadderEditor
                  title="Discount steps"
                  hint="Each step applies once the shopper reaches that many units. Higher steps replace lower ones, they do not add up."
                  path="tiers"
                  rows={form.tiers}
                  errors={errors}
                  emptyText="No steps. Shop orders are charged full price."
                  onChange={(rows) => update((d) => void (d.tiers = rows))}
                />
                <Field
                  label="Show a nudge in the cart"
                  htmlFor="tier-hint"
                  error={err('tierPricing.hintWithinUnits')}
                  info='The cart says "Add 1 more for 35% off" when the shopper is this close to the next step.'
                  hint="When the shopper is this many units or fewer from the next step. 0 turns the nudge off."
                  className="sm:max-w-xs"
                >
                  <NumberInput
                    id="tier-hint"
                    min={0}
                    max={20}
                    step={1}
                    suffix="units"
                    className="[&_input]:pr-14"
                    value={form.tierPricing.hintWithinUnits}
                    onChange={(v) => update((d) => void (d.tierPricing.hintWithinUnits = v))}
                  />
                </Field>
              </div>
              <Example>
                {tierSteps.length === 0 ? (
                  <>Every shop order is charged full price.</>
                ) : (
                  <>
                    With {sample.name} at <Num>{money(sample.priceCents)}</Num>:{' '}
                    {tierSteps.map((t, i) => (
                      <span key={i}>
                        {i > 0 && ', '}
                        buying <Num>{num(t.min)}</Num> pays <Num>{money(offPrice(sample.priceCents, t.pct))}</Num> each
                      </span>
                    ))}
                    .{' '}
                    {form.tierPricing.countBy === 'product'
                      ? 'Different sizes of the same compound count together, other compounds do not.'
                      : 'Every unit in the cart counts, so any mix of compounds reaches a step.'}
                    {nudge > 0 && (
                      <>
                        {' '}
                        With <Num>{num(tierSteps[0].min - nudge)}</Num> in the cart, the cart suggests adding <Num>{num(nudge)}</Num> more for <Num>{tierSteps[0].pct}%</Num> off.
                      </>
                    )}
                  </>
                )}
              </Example>
            </Dimmed>
          </Section>

          {/* ---------- Bulk orders ---------- */}
          <Section
            id="bulk"
            title="Bulk orders"
            description="Bigger orders placed on the bulk order page, with their own discount steps."
            toggle={{ id: 'bulk-on', label: 'Bulk orders', checked: form.bulk.enabled, onChange: (v) => update((d) => void (d.bulk.enabled = v)) }}
          >
            <Dimmed off={!form.bulk.enabled} note="Bulk ordering is off. The bulk order page tells shoppers it is not available.">
              <div className="space-y-5">
                <CountByChoice name="bulk-count" value={form.bulk.countBy} onChange={(v) => update((d) => void (d.bulk.countBy = v))} />
                <LadderEditor
                  title="Bulk discount steps"
                  hint="The first step is also the smallest bulk order allowed."
                  path="wholesale"
                  rows={form.wholesale}
                  errors={errors}
                  emptyText="Add at least one step. The first step sets the minimum bulk quantity."
                  onChange={(rows) => update((d) => void (d.wholesale = rows))}
                />
                <div className="grid gap-3 sm:grid-cols-2">
                  <ToggleRow
                    id="bulk-ship"
                    label="Free shipping on bulk orders"
                    description="When off, the normal shipping fee and free shipping amount apply."
                    checked={form.bulk.freeShipping}
                    onChange={(v) => update((d) => void (d.bulk.freeShipping = v))}
                  />
                  <ToggleRow
                    id="bulk-points"
                    label="Bulk orders earn points"
                    description="At the base points rate."
                    checked={form.bulk.earnPoints}
                    onChange={(v) => update((d) => void (d.bulk.earnPoints = v))}
                  />
                </div>
                <Field
                  label="Most units in one bulk order"
                  htmlFor="bulk-max"
                  error={err('bulk.maxUnitsPerOrder')}
                  hint="Larger orders are asked to contact you. 0 means no limit."
                  className="sm:max-w-xs"
                >
                  <NumberInput
                    id="bulk-max"
                    min={0}
                    step={1}
                    suffix="units"
                    className="[&_input]:pr-14"
                    value={form.bulk.maxUnitsPerOrder}
                    onChange={(v) => update((d) => void (d.bulk.maxUnitsPerOrder = v))}
                  />
                </Field>
              </div>
              <Example>
                {bulkSteps.length === 0 ? (
                  <>Add a step to set the bulk price.</>
                ) : (
                  <>
                    A bulk order of <Num>{num(bulkSteps[0].min)}</Num> {sample.name} costs{' '}
                    <Num>{money(offPrice(sample.priceCents, bulkSteps[0].pct) * bulkSteps[0].min)}</Num> (<Num>{money(offPrice(sample.priceCents, bulkSteps[0].pct))}</Num> each,{' '}
                    <Num>{bulkSteps[0].pct}%</Num> off){form.bulk.freeShipping ? ', shipped free' : ''}.{' '}
                    {form.bulk.countBy === 'product'
                      ? `Bulk pricing starts at ${num(bulkSteps[0].min)} units of one compound, sizes counted together.`
                      : `Bulk pricing starts once the order has ${num(bulkSteps[0].min)} units in total, any mix of compounds.`}
                    {n0(form.bulk.maxUnitsPerOrder) > 0 && ` Orders above ${num(n0(form.bulk.maxUnitsPerOrder))} units are asked to contact you.`}
                  </>
                )}
              </Example>
            </Dimmed>
          </Section>

          {/* ---------- Build a Box ---------- */}
          <Section
            id="box"
            title="Build a Box"
            description="A monthly box where the shopper picks a set number of compounds at a fixed discount."
            toggle={{ id: 'box-on', label: 'Build a Box', checked: form.box.enabled, onChange: (v) => update((d) => void (d.box.enabled = v)) }}
          >
            <Dimmed off={!form.box.enabled} note="Build a Box is off. Shoppers cannot start a new box. Existing boxes keep shipping.">
              <div className="space-y-5">
                <div className="grid items-start gap-4 sm:grid-cols-3">
                  <Field label="Compounds per box" htmlFor="box-slots" error={err('box.slots')} hint="1 to 12.">
                    <NumberInput id="box-slots" min={1} max={12} step={1} value={form.box.slots} onChange={(v) => update((d) => void (d.box.slots = v))} />
                  </Field>
                  <Field label="Box discount" htmlFor="box-pct" error={err('box.pct')} hint="Off the normal price of every item in the box.">
                    <NumberInput id="box-pct" min={0} max={90} step={1} suffix="%" value={form.box.pct} onChange={(v) => update((d) => void (d.box.pct = v))} />
                  </Field>
                  <Field label="Commitment" htmlFor="box-commit" error={err('box.commitMonths')} hint="Fewest monthly boxes, 1 to 24.">
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
                <Field
                  label="Free item in every box"
                  htmlFor="box-item"
                  optional
                  error={err('box.includedItem')}
                  hint='Packed with each box at no charge, for example "Bacteriostatic Water". Leave empty for none.'
                >
                  <TextInput id="box-item" value={form.box.includedItem} maxLength={80} onChange={(e) => update((d) => void (d.box.includedItem = e.target.value))} />
                </Field>
                <div className="grid gap-3 sm:grid-cols-2">
                  <ToggleRow
                    id="box-ship"
                    label="Free shipping on boxes"
                    description="When off, the normal shipping rules apply."
                    checked={form.box.freeShipping}
                    onChange={(v) => update((d) => void (d.box.freeShipping = v))}
                  />
                  <ToggleRow
                    id="box-points"
                    label="Boxes earn points"
                    description="At the base points rate."
                    checked={form.box.earnPoints}
                    onChange={(v) => update((d) => void (d.box.earnPoints = v))}
                  />
                </div>
              </div>
              <Example>
                A box of <Num>{num(slots)}</Num> {sample.name} costs <Num>{money(offPrice(sample.priceCents, boxPct) * slots)}</Num> a month instead of{' '}
                <Num>{money(sample.priceCents * slots)}</Num>, for at least <Num>{num(n0(form.box.commitMonths))}</Num> {n0(form.box.commitMonths) === 1 ? 'month' : 'months'}
                {form.box.includedItem.trim() ? `, with a free ${form.box.includedItem.trim()}` : ''}
                {form.box.freeShipping ? ', shipped free' : ''}.
              </Example>
            </Dimmed>
          </Section>

          {/* ---------- Partner program ---------- */}
          <Section id="partners" title="Partner program" description="How partners earn and what their code gives shoppers. You can change the commission for each partner on their page.">
            <div className="space-y-5">
              <div className="grid items-start gap-4 sm:grid-cols-2">
                <Field
                  label="Default commission"
                  htmlFor="aff-rate"
                  error={err('affiliate.defaultRate')}
                  info="The share of each order a partner earns, after all discounts, when a customer buys through their link or code."
                  hint="For new partners. 0 to 60%."
                >
                  <NumberInput id="aff-rate" min={0} max={60} step={1} suffix="%" value={form.affiliate.defaultRate} onChange={(v) => update((d) => void (d.affiliate.defaultRate = v))} />
                </Field>
                <Field
                  label="Link tracking window"
                  htmlFor="aff-cookie"
                  error={err('affiliate.cookieDays')}
                  info="How long after clicking a partner's link a purchase still counts for that partner."
                  hint="1 to 365 days."
                >
                  <NumberInput id="aff-cookie" min={1} max={365} step={1} suffix="days" value={form.affiliate.cookieDays} onChange={(v) => update((d) => void (d.affiliate.cookieDays = v))} />
                </Field>
                <Field label="Partner code discount" htmlFor="aff-coupon" error={err('affiliate.couponPct')} hint="What shoppers save when they enter a partner's code. 0 to 50%.">
                  <NumberInput id="aff-coupon" min={0} max={50} step={1} suffix="%" value={form.affiliate.couponPct} onChange={(v) => update((d) => void (d.affiliate.couponPct = v))} />
                </Field>
                <Field label="Minimum payout" htmlFor="aff-min" error={err('affiliate.minPayoutCents')} hint="Partners can ask for a payout once their approved balance reaches this.">
                  <MoneyInput id="aff-min" value={form.affiliate.minPayout} onChange={(v) => update((d) => void (d.affiliate.minPayout = v))} />
                </Field>
              </div>

              <div>
                <p className="text-[13px] font-medium">Partner code discount</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Partner codes always discount shop orders. Choose where else they work.</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <ToggleRow
                    id="aff-code-bulk"
                    label="Also on bulk orders"
                    description="The shopper discount applies on top of bulk pricing."
                    checked={form.affiliate.codeDiscountOnBulk}
                    onChange={(v) => update((d) => void (d.affiliate.codeDiscountOnBulk = v))}
                  />
                  <ToggleRow
                    id="aff-code-box"
                    label="Also on Build a Box"
                    description="The shopper discount applies on top of the box discount."
                    checked={form.affiliate.codeDiscountOnBox}
                    onChange={(v) => update((d) => void (d.affiliate.codeDiscountOnBox = v))}
                  />
                  <ToggleRow
                    id="aff-code-stack"
                    label="Combines with quantity discounts"
                    description="When off, the code only discounts items that do not already have a quantity, bulk or box discount."
                    checked={form.affiliate.codeStacksWithTiers}
                    onChange={(v) => update((d) => void (d.affiliate.codeStacksWithTiers = v))}
                    className="sm:col-span-2"
                  />
                </div>
              </div>

              <div>
                <p className="text-[13px] font-medium">Commission</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Partners always earn on shop orders. Choose where else they earn.</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <ToggleRow
                    id="aff-com-bulk"
                    label="Earn on bulk orders"
                    checked={form.affiliate.commissionOnBulk}
                    onChange={(v) => update((d) => void (d.affiliate.commissionOnBulk = v))}
                  />
                  <ToggleRow
                    id="aff-com-box"
                    label="Earn on Build a Box"
                    checked={form.affiliate.commissionOnBox}
                    onChange={(v) => update((d) => void (d.affiliate.commissionOnBox = v))}
                  />
                </div>
              </div>
            </div>
            <Example>
              On a <Num>{money(exampleOrder)}</Num> shop order with a partner code, the shopper saves <Num>{money(Math.round((exampleOrder * couponPct) / 100))}</Num> and the partner
              earns <Num>{money(Math.round(((exampleOrder - Math.round((exampleOrder * couponPct) / 100)) * rate) / 100))}</Num> (<Num>{rate}%</Num> of{' '}
              <Num>{money(exampleOrder - Math.round((exampleOrder * couponPct) / 100))}</Num>).{' '}
              {form.affiliate.commissionOnBulk && form.affiliate.commissionOnBox
                ? 'Bulk orders and boxes earn commission too.'
                : form.affiliate.commissionOnBulk
                  ? 'Bulk orders earn commission too, boxes do not.'
                  : form.affiliate.commissionOnBox
                    ? 'Boxes earn commission too, bulk orders do not.'
                    : 'Bulk orders and boxes do not earn commission.'}
            </Example>
          </Section>

          {/* ---------- Points ---------- */}
          <Section id="points" title="Points" description="Shoppers with an account earn points on what they spend and use them as a discount on shop orders.">
            <div className="space-y-5">
              <div className="grid items-start gap-4 sm:grid-cols-2">
                <Field
                  label="Value of 100 points"
                  htmlFor="pts-value"
                  error={err('points.valueCentsPer100')}
                  hint={`What 100 points take off at checkout. ${sym}1.00 means 1 point is worth 1 sen.`}
                >
                  <MoneyInput id="pts-value" value={form.points.value100} onChange={(v) => update((d) => void (d.points.value100 = v))} />
                </Field>
                <Field
                  label={`Points per ${sym}1 spent`}
                  htmlFor="pts-MEMBER"
                  error={err('points.perDollar.MEMBER')}
                  hint="Earned on the order after discounts. Decimals are fine."
                >
                  <NumberInput
                    id="pts-MEMBER"
                    min={0}
                    step="0.5"
                    suffix="pts"
                    value={form.points.perDollar.MEMBER ?? ''}
                    onChange={(v) => update((d) => void (d.points.perDollar.MEMBER = v))}
                  />
                </Field>
                <Field label="Bonus when spending at least" htmlFor="pts-bonus-at" error={err('points.bonusThresholdCents')} hint="Orders at or above this amount get the bonus points.">
                  <MoneyInput id="pts-bonus-at" value={form.points.bonusThreshold} onChange={(v) => update((d) => void (d.points.bonusThreshold = v))} />
                </Field>
                <Field label="Bonus points" htmlFor="pts-bonus" error={err('points.bonusPoints')} hint="0 for no bonus.">
                  <NumberInput id="pts-bonus" min={0} step={1} suffix="pts" value={form.points.bonusPoints} onChange={(v) => update((d) => void (d.points.bonusPoints = v))} />
                </Field>
                <Field label="Most of an order paid with points" htmlFor="pts-max" error={err('points.maxRedeemPct')} hint="Share of the order after discounts, 0 to 100%. 0 turns redeeming off.">
                  <NumberInput id="pts-max" min={0} max={100} step={1} suffix="%" value={form.points.maxRedeemPct} onChange={(v) => update((d) => void (d.points.maxRedeemPct = v))} />
                </Field>
                <Field label="Points expire after" htmlFor="pts-exp" error={err('points.expiryMonths')} hint="Counted from when they are earned. 1 to 60 months.">
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
              </div>
              <ToggleRow
                id="pts-codes"
                label="Points can be used with a discount code"
                description="When off, a shopper using a discount or partner code cannot also pay with points on the same order."
                checked={form.discounts.pointsWithCodes}
                onChange={(v) => update((d) => void (d.discounts.pointsWithCodes = v))}
              />
            </div>
            <Example>
              A <Num>{money(exampleOrder)}</Num> order earns <Num>{num(earned)}</Num> points, worth <Num>{money(earnedWorth)}</Num> off a later order.
              {n0(form.points.bonusPoints) > 0 && (
                <>
                  {' '}
                  Orders of <Num>{money(bonusAt)}</Num> or more earn <Num>{num(n0(form.points.bonusPoints))}</Num> extra points.
                </>
              )}{' '}
              {maxPct > 0 ? (
                <>
                  On a <Num>{money(exampleOrder)}</Num> order, points can pay up to <Num>{money(Math.floor((exampleOrder * maxPct) / 100))}</Num>.
                </>
              ) : (
                'Points cannot be redeemed right now.'
              )}
            </Example>
          </Section>

          {/* ---------- Orders and stock ---------- */}
          <Section id="orders" title="Orders and stock" description="How long unpaid orders hold stock, and when a size counts as running low.">
            <div className="grid items-start gap-4 sm:grid-cols-3">
              <Field
                label="Unpaid online orders expire after"
                htmlFor="ord-online"
                error={err('orders.unpaidExpiryDaysOnline')}
                info="Also how long the ToyyibPay payment link stays valid."
                hint="Card and FPX orders. 1 to 100 days."
              >
                <NumberInput id="ord-online" min={1} max={100} step={1} suffix="days" value={form.orders.online} onChange={(v) => update((d) => void (d.orders.online = v))} />
              </Field>
              <Field label="Unpaid manual orders expire after" htmlFor="ord-manual" error={err('orders.unpaidExpiryDaysManual')} hint="Bank transfer, DuitNow and crypto. 1 to 60 days.">
                <NumberInput id="ord-manual" min={1} max={60} step={1} suffix="days" value={form.orders.manual} onChange={(v) => update((d) => void (d.orders.manual = v))} />
              </Field>
              <Field
                label="Low stock level"
                htmlFor="inv-low"
                error={err('inventory.lowStockThreshold')}
                info='Sizes at or below this show on the dashboard, and shoppers see "Only a few left".'
                hint="Units left in a size."
              >
                <NumberInput id="inv-low" min={0} step={1} suffix="units" className="[&_input]:pr-14" value={form.inventory.lowStock} onChange={(v) => update((d) => void (d.inventory.lowStock = v))} />
              </Field>
            </div>
            <Example>
              An online order placed now and left unpaid is cancelled on <Num>{inDays(n0(form.orders.online))}</Num>, a manual one on <Num>{inDays(n0(form.orders.manual))}</Num>. Their
              stock goes back on sale. A size with <Num>{num(n0(form.inventory.lowStock))}</Num> or fewer left counts as low stock.
            </Example>
          </Section>

          {/* ---------- Payment methods ---------- */}
          <Section id="payments" title="Payment methods" description="Choose how customers can pay. Manual methods put the order on hold until you mark it paid.">
            <div className="space-y-4">
              {form.paymentMethods.map((m, i) => (
                <PaymentMethodCard
                  key={m.id}
                  method={m}
                  index={i}
                  gateway={m.type === 'gateway' ? gateway : null}
                  online={form.onlinePayment}
                  onOnlineChange={(patch) => update((d) => void Object.assign(d.onlinePayment, patch))}
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

          {/* ---------- ToyyibPay keys and mode (applied immediately, password-confirmed) ---------- */}
          <Section
            id="gateway"
            title="ToyyibPay"
            description="Keys for the ToyyibPay sandbox and your live account, and which one takes payments. Changes here apply straight away, separately from Save changes."
          >
            <ToyyibPayPanel initial={gateway} />
          </Section>

          {/* ---------- Licensed add-on: only rendered when the server sends it ---------- */}
          {licensed && form.features && form.membership && (
            <MembershipSection form={form} errors={errors} update={update} />
          )}
        </div>
      </div>

      {dirty && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-4 py-3 backdrop-blur-xl md:sticky md:bottom-4 md:mt-6 md:rounded-xl md:border md:px-4 lg:ml-[214px]">
          <div className="flex items-center justify-between gap-3">
            <p className="min-w-0 truncate text-sm">
              {errorCount > 0 ? (
                <span className="inline-flex items-center gap-1.5 text-destructive">
                  <WarningCircleIcon className="size-4 shrink-0" />
                  <Num>{num(errorCount)}</Num> {errorCount === 1 ? 'field needs' : 'fields need'} fixing
                </span>
              ) : (
                <>
                  <span className="mr-2 inline-block size-2 rounded-full bg-gold align-middle" aria-hidden />
                  You have unsaved changes
                </>
              )}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <Button variant="ghost" onClick={discard} disabled={saving}>
                Discard
              </Button>
              <Button onClick={save} disabled={saving}>
                {saving ? 'Saving...' : 'Save changes'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onOpenChange={(o) => {
          if (!o && !proceeding.current && blocker.state === 'blocked') blocker.reset()
          proceeding.current = false
        }}
        title="Leave without saving?"
        description="You have settings that are not saved yet. If you leave now they will be lost."
        confirmLabel="Leave page"
        cancelLabel="Stay"
        onConfirm={() => {
          proceeding.current = true
          blocker.proceed?.()
        }}
      />
    </div>
  )
}

// ---------- Building blocks ----------

function Section({
  id,
  title,
  description,
  toggle,
  children,
}: {
  id: string
  title: string
  description?: string
  toggle?: { id: string; label: string; checked: boolean; onChange: (v: boolean) => void }
  children: ReactNode
}) {
  return (
    <div id={id} className="scroll-mt-32 lg:scroll-mt-20">
      <Panel
        title={title}
        description={description}
        action={
          toggle && (
            <label htmlFor={toggle.id} className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <span className="hidden sm:inline">{toggle.checked ? 'On' : 'Off'}</span>
              <Switch id={toggle.id} checked={toggle.checked} onCheckedChange={toggle.onChange} aria-label={toggle.label} />
            </label>
          )
        }
      >
        {children}
      </Panel>
    </div>
  )
}

/** Greys out a switched-off program but keeps it editable, so it can be set up before going live. */
function Dimmed({ off, note, children }: { off: boolean; note: string; children: ReactNode }) {
  return (
    <div>
      {off && (
        <p className="mb-4 flex items-start gap-1.5 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
          <WarningCircleIcon className="mt-px size-3.5 shrink-0" />
          {note} You can still change the settings below.
        </p>
      )}
      <div className={cn(off && 'opacity-60')}>{children}</div>
    </div>
  )
}

function Example({ children }: { children: ReactNode }) {
  return (
    <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-gold/25 bg-gold/[0.05] px-3 py-2.5 text-sm">
      <CalculatorIcon className="mt-0.5 size-4 shrink-0 text-gold-ink" aria-hidden />
      <p className="min-w-0 leading-relaxed">
        <span className="mr-1.5 text-xs font-medium tracking-wide text-gold-ink uppercase">Example</span>
        {children}
      </p>
    </div>
  )
}

function ToggleRow({
  id,
  label,
  description,
  checked,
  onChange,
  className,
}: {
  id: string
  label: string
  description?: string
  checked: boolean
  onChange: (v: boolean) => void
  className?: string
}) {
  return (
    <label htmlFor={id} className={cn('flex cursor-pointer items-start justify-between gap-3 rounded-lg border bg-surface px-3 py-2.5', className)}>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {description && <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{description}</span>}
      </span>
      <Switch id={id} checked={checked} onCheckedChange={onChange} className="mt-0.5" />
    </label>
  )
}

function CountByChoice({ name, value, onChange }: { name: string; value: CountBy; onChange: (v: CountBy) => void }) {
  const options: { value: CountBy; label: string; help: string }[] = [
    { value: 'product', label: 'Per compound', help: 'Units of the same compound count together, across sizes. Each compound gets its own discount.' },
    { value: 'order', label: 'Whole order', help: 'Every unit in the cart counts, any mix of compounds. The whole order gets the same discount.' },
  ]
  return (
    <div>
      <p className="text-[13px] font-medium">How units are counted</p>
      <RadioGroup value={value} onValueChange={(v) => onChange(v as CountBy)} className="mt-2 grid gap-2 sm:grid-cols-2" aria-label="How units are counted">
        {options.map((o) => {
          const id = `${name}-${o.value}`
          return (
            <label
              key={o.value}
              htmlFor={id}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors',
                value === o.value ? 'border-gold/50 bg-gold/[0.05]' : 'bg-surface hover:bg-muted/60',
              )}
            >
              <RadioGroupItem id={id} value={o.value} className="mt-0.5" />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{o.label}</span>
                <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{o.help}</span>
              </span>
            </label>
          )
        })}
      </RadioGroup>
    </div>
  )
}

function FieldError({ children }: { children: ReactNode }) {
  return (
    <p className="mt-1 flex items-start gap-1 text-xs text-destructive" role="alert" data-field-error>
      <WarningCircleIcon className="mt-px size-3.5 shrink-0" />
      {children}
    </p>
  )
}

function LadderEditor({
  title,
  hint,
  path,
  rows,
  errors,
  emptyText,
  onChange,
}: {
  title: string
  hint: string
  path: string
  rows: LadderRow[]
  errors: Errors
  emptyText: string
  onChange: (rows: LadderRow[]) => void
}) {
  const set = (key: string, patch: Partial<LadderRow>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  const add = () => {
    const last = rows[rows.length - 1]
    const nextMin = last ? String((Number(last.min) || 0) + 5) : '3'
    const nextPct = last ? String(Math.min(90, (Number(last.pct) || 0) + 5)) : '10'
    onChange([...rows, { key: `r${++rowSeq}`, min: nextMin, pct: nextPct }])
  }
  const groupError = errors[path]
  // Not an error, but almost always a typo: a bigger order getting a smaller discount.
  const dips = rows.some((r, i) => i > 0 && Number(r.pct) < Number(rows[i - 1].pct))
  return (
    <div className="min-w-0">
      <p className="text-[13px] font-medium">{title}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      <div className="mt-3 space-y-2">
        {rows.length === 0 && <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">{emptyText}</p>}
        {rows.map((r, i) => {
          const eMin = errors[`${path}.${i}.min`]
          const ePct = errors[`${path}.${i}.pct`]
          return (
            <div key={r.key}>
              <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-surface px-3 py-2 text-sm">
                <div className="flex w-full items-center justify-between gap-2 sm:contents">
                  <span className="text-xs text-muted-foreground sm:text-sm">Step {i + 1}: buy at least</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="text-muted-foreground hover:text-destructive sm:order-last sm:ml-auto"
                    aria-label={`Remove step ${i + 1}`}
                    onClick={() => onChange(rows.filter((x) => x.key !== r.key))}
                  >
                    <TrashIcon />
                  </Button>
                </div>
                <NumberInput
                  aria-label={`Step ${i + 1} minimum units`}
                  min={1}
                  step={1}
                  value={r.min}
                  onChange={(v) => set(r.key, { min: v })}
                  className="w-20"
                  aria-invalid={!!eMin}
                />
                <span className="text-muted-foreground">units, get</span>
                <NumberInput
                  aria-label={`Step ${i + 1} percent off`}
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
              </div>
              {(eMin || ePct) && <FieldError>{eMin ? `Units: ${eMin}` : `Discount: ${ePct}`}</FieldError>}
            </div>
          )
        })}
      </div>
      {groupError && <FieldError>{groupError}</FieldError>}
      {dips && !groupError && (
        <p className="mt-1 flex items-start gap-1 text-xs text-warning">
          <WarningCircleIcon className="mt-px size-3.5 shrink-0" />
          A bigger step gives a smaller discount than the one above it. Check this is what you want.
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={add} disabled={rows.length >= MAX_LADDER}>
          <PlusIcon />
          Add step
        </Button>
        <span className="text-xs text-muted-foreground">Up to {MAX_LADDER} steps, from fewest units to most. 0 to 90% off.</span>
      </div>
    </div>
  )
}

function PaymentMethodCard({
  method,
  index,
  gateway,
  online,
  onOnlineChange,
  errors,
  onChange,
}: {
  method: PaymentMethodSetting
  index: number
  gateway: SettingsResponse['gateway'] | null
  online: StoreSettings['onlinePayment']
  onOnlineChange: (patch: Partial<StoreSettings['onlinePayment']>) => void
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
            {method.type === 'gateway' ? 'Customers pay online and the order is marked paid automatically.' : 'Customers pay you directly. You confirm the payment and mark the order paid.'}
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
            <Pill tone={gateway.ready ? 'success' : 'destructive'}>{gateway.ready ? 'Connected' : 'Not set up'}</Pill>
            <Pill tone={gateway.mode === 'production' ? 'success' : 'warning'}>{gateway.mode === 'production' ? 'Live' : 'Test mode (sandbox)'}</Pill>
          </div>
          {!gateway.ready && <p className="mt-2 text-xs text-destructive">Customers cannot choose online payment until keys are added in ToyyibPay below.</p>}
          {gateway.ready && gateway.mode === 'sandbox' && <p className="mt-2 text-xs text-muted-foreground">Test mode: no real money moves. Switch to production in ToyyibPay below before launch.</p>}
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Payment options" htmlFor={`pm-${method.id}-channel`} hint="Card needs to be enabled on your ToyyibPay account.">
              <Select value={online.channel} onValueChange={(v) => onOnlineChange({ channel: v as StoreSettings['onlinePayment']['channel'] })}>
                <SelectTrigger id={`pm-${method.id}-channel`} className="w-full data-[size=default]:h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="both">FPX online banking and card</SelectItem>
                  <SelectItem value="fpx">FPX online banking only</SelectItem>
                  <SelectItem value="card">Card only</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="ToyyibPay fee paid by" htmlFor={`pm-${method.id}-fees`} hint="Customer: the fee is added on the payment page.">
              <Select value={online.feesPaidBy} onValueChange={(v) => onOnlineChange({ feesPaidBy: v as StoreSettings['onlinePayment']['feesPaidBy'] })}>
                <SelectTrigger id={`pm-${method.id}-fees`} className="w-full data-[size=default]:h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="store">The store</SelectItem>
                  <SelectItem value="customer">The customer</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <a href="#gateway" className="mt-3 inline-flex items-center gap-1.5 text-xs text-gold-ink hover:underline">
            <LockKeyIcon className="size-3.5" />
            Keys and live or test mode: ToyyibPay section
          </a>
        </div>
      )}

      <div className="mt-3 grid gap-3">
        <Field label="Name shown at checkout" htmlFor={`pm-${method.id}-label`} error={errors[`paymentMethods.${index}.label`] ?? null}>
          <TextInput id={`pm-${method.id}-label`} value={method.label} maxLength={60} onChange={(e) => onChange({ label: e.target.value })} />
        </Field>
        <Field
          label="Instructions"
          htmlFor={`pm-${method.id}-instr`}
          error={errors[`paymentMethods.${index}.instructions`] ?? null}
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

/**
 * Licensed add-on. Only rendered when the server says this installation is licensed for it
 * AND sends the membership settings. Kept so the add-on can be switched on again later.
 */
function MembershipSection({ form, errors, update }: { form: Form; errors: Errors; update: (fn: (d: Form) => void) => void }) {
  const err = (p: string) => errors[p] ?? null
  if (!form.features || !form.membership) return null
  const membership = form.membership
  const paidRates = PAID_TIERS.filter((t) => form.points.perDollar[t] !== undefined)
  return (
    <Section id="membership" title="Membership" description="Paid membership levels with their own prices and points rates.">
      <div className="space-y-5">
        <ToggleRow
          id="feature-membership"
          label="Membership program"
          description="When off, the Membership page and paid levels are hidden from shoppers and everyone earns the base points rate."
          checked={form.features.membership}
          onChange={(v) => update((d) => void (d.features!.membership = v))}
        />
        <div className="divide-y rounded-lg border">
          {PAID_TIERS.map((t) => (
            <div key={t} className="grid gap-3 p-3 sm:grid-cols-[120px_1fr_1fr] sm:items-start">
              <p className="pt-2 text-sm font-medium">{TIER_LABEL[t]}</p>
              <Field label="Monthly" htmlFor={`mem-${t}-m`} error={err(`membership.${t}.monthlyCents`)}>
                <MoneyInput id={`mem-${t}-m`} value={membership[t].monthly} onChange={(v) => update((d) => void (d.membership![t].monthly = v))} />
              </Field>
              <Field label="Yearly" htmlFor={`mem-${t}-y`} error={err(`membership.${t}.yearlyCents`)}>
                <MoneyInput id={`mem-${t}-y`} value={membership[t].yearly} onChange={(v) => update((d) => void (d.membership![t].yearly = v))} />
              </Field>
            </div>
          ))}
        </div>
        {paidRates.length > 0 && (
          <div className="grid grid-cols-2 items-start gap-4 sm:grid-cols-3">
            {paidRates.map((t) => (
              <Field key={t} label={`${TIER_LABEL[t]} points per ${currencySymbol()}1`} htmlFor={`pts-${t}`} error={err(`points.perDollar.${t}`)}>
                <NumberInput id={`pts-${t}`} min={0} step="0.5" suffix="pts" value={form.points.perDollar[t] ?? ''} onChange={(v) => update((d) => void (d.points.perDollar[t] = v))} />
              </Field>
            ))}
          </div>
        )}
        {form.points.founderYearlyBonus !== null && (
          <Field label={`${TIER_LABEL.FOUNDER} yearly bonus`} htmlFor="pts-founder" error={err('points.founderYearlyBonus')} hint="Points this level receives each year." className="sm:max-w-xs">
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
    </Section>
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
          {Array.from({ length: 9 }).map((_, i) => (
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
