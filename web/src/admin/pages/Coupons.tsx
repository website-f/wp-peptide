import {
  CheckIcon,
  CopySimpleIcon,
  DotsThreeIcon,
  InfoIcon,
  PauseIcon,
  PencilSimpleIcon,
  PlayIcon,
  PlusIcon,
  TicketIcon,
  TrashIcon,
  WarningCircleIcon,
  XIcon,
} from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { EmptyState } from '@/components/brand/bits'
import { ProductImage } from '@/components/brand/ProductImage'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { ApiError, api, errorMessage } from '@/lib/api'
import { date, money, num } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  ConfirmDialog,
  CopyButton,
  ErrorState,
  Field,
  MoneyInput,
  Num,
  NumberInput,
  PageHeader,
  Panel,
  Pill,
  RowsSkeleton,
  SearchInput,
  Segmented,
  TableWrap,
  TextInput,
} from '../components/kit'
import { useAdminCategories, useAdminProducts, useAdminSettings } from '../lib/queries'
import type { AdminCategory, AdminProduct, Coupon, CouponMode, CouponType } from '../lib/types'
import { centsToInput, isoDay, toCents, useInvalidateAdmin } from '../lib/utils'
import type { Tone } from '../lib/utils'

// ---------- Rules shared by the list and the editor ----------

const MODES: { value: CouponMode; label: string; short: string }[] = [
  { value: 'standard', label: 'Shop orders', short: 'shop orders' },
  { value: 'wholesale', label: 'Bulk orders', short: 'bulk orders' },
  { value: 'box', label: 'Build a Box', short: 'Build a Box' },
]

type Body = Omit<Coupon, 'id' | 'uses' | 'createdAt' | 'paidOrders' | 'discountGivenCents' | 'salesCents'>

const bodyOf = (c: Coupon): Body => ({
  code: c.code,
  type: c.type,
  value: c.value,
  minSubtotal: c.minSubtotal,
  maxDiscountCents: c.maxDiscountCents,
  maxUses: c.maxUses,
  maxUsesPerCustomer: c.maxUsesPerCustomer,
  startsAt: c.startsAt,
  expiresAt: c.expiresAt,
  active: c.active,
  firstOrderOnly: c.firstOrderOnly,
  stackWithTiers: c.stackWithTiers,
  modes: c.modes,
  productIds: c.productIds,
  categoryIds: c.categoryIds,
  description: c.description,
})

type Status = 'active' | 'scheduled' | 'paused' | 'expired' | 'usedup'
const STATUS: Record<Status, { label: string; tone: Tone; help: string }> = {
  active: { label: 'Active', tone: 'success', help: 'Customers can use it now.' },
  scheduled: { label: 'Scheduled', tone: 'gold', help: 'Starts working on its start date.' },
  paused: { label: 'Paused', tone: 'warning', help: 'Switched off. Turn it on to let customers use it again.' },
  expired: { label: 'Expired', tone: 'muted', help: 'Its end date has passed.' },
  usedup: { label: 'Used up', tone: 'muted', help: 'It has reached its total use limit.' },
}

function statusOf(c: Pick<Coupon, 'active' | 'startsAt' | 'expiresAt' | 'maxUses' | 'uses'>, now = Date.now()): Status {
  if (c.expiresAt && new Date(c.expiresAt).getTime() < now) return 'expired'
  if (c.maxUses !== null && c.uses >= c.maxUses) return 'usedup'
  if (!c.active) return 'paused'
  if (c.startsAt && new Date(c.startsAt).getTime() > now) return 'scheduled'
  return 'active'
}

interface Names {
  products: Map<string, string>
  categories: Map<string, string>
}

const listText = (items: string[]) => (items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`)

/** One plain-language sentence describing everything a code does. */
function summarize(c: Body, names: Names): string {
  const amt = (cents: number) => money(cents, { whole: cents % 100 === 0 })
  const parts: string[] = []
  let scope = ''
  if (c.type !== 'FREE_SHIPPING' && (c.productIds.length || c.categoryIds.length)) {
    scope = listText([
      ...(c.productIds.length === 1 ? [names.products.get(c.productIds[0]) ?? '1 product'] : c.productIds.length ? [`${c.productIds.length} products`] : []),
      ...(c.categoryIds.length === 1
        ? [names.categories.get(c.categoryIds[0]) ?? '1 category']
        : c.categoryIds.length
          ? [`${c.categoryIds.length} categories`]
          : []),
    ])
  }
  if (c.type === 'FREE_SHIPPING') parts.push('Free shipping')
  else if (c.type === 'PERCENT') parts.push(`${c.value}% off${scope ? ` ${scope}` : ''}${c.maxDiscountCents ? ` up to ${amt(c.maxDiscountCents)}` : ''}`)
  else parts.push(`${amt(c.value)} off${scope ? ` ${scope}` : ''}`)

  if (c.minSubtotal > 0) parts.push(`min spend ${amt(c.minSubtotal)}`)
  if (c.modes.length && c.modes.length < MODES.length) {
    parts.push(`${listText(MODES.filter((m) => c.modes.includes(m.value)).map((m) => m.short))} only`)
  }
  if (c.type !== 'FREE_SHIPPING' && !c.stackWithTiers) parts.push('not on items already discounted')
  if (c.firstOrderOnly) parts.push('first order only')
  if (c.maxUsesPerCustomer) parts.push(`${num(c.maxUsesPerCustomer)} ${c.maxUsesPerCustomer === 1 ? 'use' : 'uses'} per customer`)
  if (c.maxUses) parts.push(`${num(c.maxUses)} ${c.maxUses === 1 ? 'use' : 'uses'} total`)
  if (c.startsAt && new Date(c.startsAt).getTime() > Date.now()) parts.push(`starts ${date(c.startsAt)}`)
  if (c.expiresAt) parts.push(`${new Date(c.expiresAt).getTime() < Date.now() ? 'ended' : 'ends'} ${date(c.expiresAt)}`)
  return parts.join(', ')
}

function useNames(products: AdminProduct[] | undefined, categories: AdminCategory[] | undefined): Names {
  return useMemo(
    () => ({
      products: new Map((products ?? []).map((p) => [p.id, p.name])),
      categories: new Map((categories ?? []).map((c) => [c.id, c.name])),
    }),
    [products, categories],
  )
}

// ---------- Page ----------

type Filter = 'all' | Status
type Editing = { mode: 'edit'; coupon: Coupon } | { mode: 'new'; from?: Coupon } | null

export default function Coupons() {
  const invalidate = useInvalidateAdmin()
  const q = useQuery({ queryKey: ['admin', 'coupons'], queryFn: () => api.get<Coupon[]>('/api/admin/coupons') })
  const products = useAdminProducts()
  const categories = useAdminCategories()
  const names = useNames(products.data, categories.data)
  const [editing, setEditing] = useState<Editing>(null)
  const [deleting, setDeleting] = useState<Coupon | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')

  async function toggle(c: Coupon, active: boolean) {
    setToggling(c.id)
    try {
      await api.put(`/api/admin/coupons/${c.id}`, { ...bodyOf(c), active })
      await invalidate()
      toast.success(active ? `${c.code} is on` : `${c.code} is paused`)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setToggling(null)
    }
  }

  const all = useMemo(() => q.data ?? [], [q.data])
  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: all.length, active: 0, scheduled: 0, paused: 0, expired: 0, usedup: 0 }
    for (const x of all) c[statusOf(x)]++
    return c
  }, [all])
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase()
    return all.filter(
      (c) => (filter === 'all' || statusOf(c) === filter) && (!term || c.code.toLowerCase().includes(term) || (c.description ?? '').toLowerCase().includes(term)),
    )
  }, [all, filter, search])

  const actions = (c: Coupon) => ({
    edit: () => setEditing({ mode: 'edit', coupon: c }),
    duplicate: () => setEditing({ mode: 'new', from: c }),
    remove: () => setDeleting(c),
  })

  return (
    <div className="space-y-6">
      <PageHeader
        title="Coupons"
        description="Discount codes customers type at checkout. Set what each code takes off, where it works, who can use it and for how long."
        actions={
          <Button onClick={() => setEditing({ mode: 'new' })}>
            <PlusIcon />
            New coupon
          </Button>
        }
      />

      <div className="flex items-start gap-2 rounded-xl border bg-surface px-4 py-3 text-sm">
        <InfoIcon className="mt-0.5 size-4 shrink-0 text-gold-ink" />
        <p className="text-muted-foreground">
          Partner codes are managed under{' '}
          <Link to="/admin/partners" className="font-medium text-foreground underline-offset-4 hover:underline">
            Partners
          </Link>
          , and their discount rules are in{' '}
          <Link to="/admin/settings#partners" className="font-medium text-foreground underline-offset-4 hover:underline">
            Settings
          </Link>
          . A shopper can use one code per order.
        </p>
      </div>

      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.isPending ? (
        <Panel flush>
          <RowsSkeleton rows={4} cols={6} />
        </Panel>
      ) : all.length === 0 ? (
        <EmptyState
          icon={<TicketIcon />}
          title="No coupons yet"
          body="Create a code for a promotion, a newsletter or a first-order welcome discount."
          action={
            <Button onClick={() => setEditing({ mode: 'new' })}>
              <PlusIcon />
              Create a coupon
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <Segmented
              value={filter}
              onChange={setFilter}
              options={[
                { value: 'all', label: 'All', count: counts.all },
                { value: 'active', label: 'Active', count: counts.active },
                { value: 'scheduled', label: 'Scheduled', count: counts.scheduled },
                { value: 'paused', label: 'Paused', count: counts.paused },
                { value: 'expired', label: 'Expired', count: counts.expired },
                { value: 'usedup', label: 'Used up', count: counts.usedup },
              ]}
            />
            <SearchInput value={search} onChange={setSearch} placeholder="Search code or note" className="md:w-64" />
          </div>

          <Panel flush>
            {rows.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <p className="font-medium">No coupons match</p>
                <p className="mt-1 text-sm text-muted-foreground">Try a different search or status.</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => {
                    setFilter('all')
                    setSearch('')
                  }}
                >
                  Show all coupons
                </Button>
              </div>
            ) : (
              <>
                {/* Phone: cards */}
                <ul className="divide-y lg:hidden">
                  {rows.map((c) => {
                    const st = statusOf(c)
                    const a = actions(c)
                    return (
                      <li key={c.id} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Num className="truncate font-medium">{c.code}</Num>
                              <CopyButton text={c.code} label={`Copy ${c.code}`} />
                              <Pill tone={STATUS[st].tone}>{STATUS[st].label}</Pill>
                            </div>
                            <p className="mt-0.5 text-sm text-gold-ink">{summarize(bodyOf(c), names)}</p>
                            {c.description && <p className="mt-0.5 text-xs text-muted-foreground">{c.description}</p>}
                          </div>
                          <RowMenu c={c} busy={toggling === c.id} onToggle={(v) => toggle(c, v)} {...a} />
                        </div>
                        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-4">
                          <Stat label="Uses">
                            <Uses c={c} />
                          </Stat>
                          <Stat label="Paid orders">{num(c.paidOrders)}</Stat>
                          <Stat label="Discount given">{money(c.discountGivenCents)}</Stat>
                          <Stat label="Sales">{money(c.salesCents)}</Stat>
                        </dl>
                      </li>
                    )
                  })}
                </ul>

                {/* Desktop: table */}
                <TableWrap className="hidden lg:block">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead className="pl-4 text-xs font-medium text-muted-foreground">Code</TableHead>
                        <TableHead className="text-xs font-medium text-muted-foreground">Rule</TableHead>
                        <TableHead className="text-xs font-medium text-muted-foreground">Status</TableHead>
                        <TableHead className="text-right text-xs font-medium text-muted-foreground">Uses</TableHead>
                        <TableHead className="text-right text-xs font-medium text-muted-foreground">Paid orders</TableHead>
                        <TableHead className="text-right text-xs font-medium text-muted-foreground">Discount given</TableHead>
                        <TableHead className="text-right text-xs font-medium text-muted-foreground">Sales</TableHead>
                        <TableHead className="pr-4 text-right text-xs font-medium text-muted-foreground">
                          <span className="sr-only">Actions</span>
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((c) => {
                        const st = statusOf(c)
                        const a = actions(c)
                        return (
                          <TableRow key={c.id} className="cursor-pointer" onClick={a.edit}>
                            <TableCell className="max-w-56 pl-4 align-top">
                              <div className="flex items-center gap-1">
                                <Num className="font-medium">{c.code}</Num>
                                <span onClick={(e) => e.stopPropagation()}>
                                  <CopyButton text={c.code} label={`Copy ${c.code}`} />
                                </span>
                              </div>
                              {c.description && <p className="truncate text-xs text-muted-foreground">{c.description}</p>}
                            </TableCell>
                            <TableCell className="max-w-96 align-top text-sm whitespace-normal">{summarize(bodyOf(c), names)}</TableCell>
                            <TableCell className="align-top">
                              <Pill tone={STATUS[st].tone}>{STATUS[st].label}</Pill>
                            </TableCell>
                            <TableCell className="text-right align-top">
                              <Uses c={c} />
                            </TableCell>
                            <TableCell className="text-right align-top">
                              <Num>{num(c.paidOrders)}</Num>
                            </TableCell>
                            <TableCell className="text-right align-top">
                              <Num>{money(c.discountGivenCents)}</Num>
                            </TableCell>
                            <TableCell className="text-right align-top">
                              <Num>{money(c.salesCents)}</Num>
                            </TableCell>
                            <TableCell className="pr-4 text-right align-top" onClick={(e) => e.stopPropagation()}>
                              <RowMenu c={c} busy={toggling === c.id} onToggle={(v) => toggle(c, v)} {...a} />
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </TableWrap>
              </>
            )}
          </Panel>
          <p className="text-xs text-muted-foreground">
            Uses count orders placed with the code. A use is given back when an order is cancelled or refunded. Paid orders, discount given and sales count paid orders only.
          </p>
        </div>
      )}

      <CouponSheet
        editing={editing}
        names={names}
        products={products.data ?? []}
        categories={categories.data ?? []}
        onClose={() => setEditing(null)}
        onSaved={invalidate}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete coupon?"
        description={
          deleting ? `${deleting.code} will stop working straight away. Past orders that used it keep their discount. To stop it for now instead, pause it.` : undefined
        }
        confirmLabel="Delete coupon"
        onConfirm={async () => {
          if (!deleting) return
          await api.del(`/api/admin/coupons/${deleting.id}`)
          await invalidate()
          toast.success(`${deleting.code} deleted`)
        }}
      />
    </div>
  )
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt>{label}</dt>
      <dd className="font-mono text-foreground tabular-nums">{children}</dd>
    </div>
  )
}

function Uses({ c }: { c: Coupon }) {
  return (
    <span className="font-mono tabular-nums">
      {num(c.uses)}
      <span className="text-muted-foreground"> / {c.maxUses === null ? 'no limit' : num(c.maxUses)}</span>
    </span>
  )
}

function RowMenu({
  c,
  busy,
  onToggle,
  edit,
  duplicate,
  remove,
}: {
  c: Coupon
  busy: boolean
  onToggle: (v: boolean) => void
  edit: () => void
  duplicate: () => void
  remove: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${c.code}`} disabled={busy}>
          <DotsThreeIcon weight="bold" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuItem onSelect={edit}>
          <PencilSimpleIcon /> Edit
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={duplicate}>
          <CopySimpleIcon /> Duplicate
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onToggle(!c.active)}>
          {c.active ? (
            <>
              <PauseIcon /> Pause
            </>
          ) : (
            <>
              <PlayIcon /> Turn on
            </>
          )}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={remove}>
          <TrashIcon /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ---------- Editor ----------

interface Draft {
  code: string
  type: CouponType
  percent: string
  amount: string
  cap: string
  minSpend: string
  firstOrderOnly: boolean
  stackWithTiers: boolean
  maxUses: string
  maxUsesPerCustomer: string
  startDate: string
  startTime: string
  endDate: string
  endTime: string
  modes: CouponMode[]
  scope: 'all' | 'selected'
  productIds: string[]
  categoryIds: string[]
  active: boolean
  description: string
}

type DraftErrors = Partial<Record<keyof Draft, string>>

const emptyDraft: Draft = {
  code: '',
  type: 'PERCENT',
  percent: '10',
  amount: '',
  cap: '',
  minSpend: '0.00',
  firstOrderOnly: false,
  stackWithTiers: true,
  maxUses: '',
  maxUsesPerCustomer: '',
  startDate: '',
  startTime: '00:00',
  endDate: '',
  endTime: '23:59',
  modes: ['standard'],
  scope: 'all',
  productIds: [],
  categoryIds: [],
  active: true,
  description: '',
}

const hhmm = (d: string | null) => {
  if (!d) return ''
  const x = new Date(d)
  return `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`
}

function draftOf(c: Coupon): Draft {
  return {
    code: c.code,
    type: c.type,
    percent: c.type === 'PERCENT' ? String(c.value) : '10',
    amount: c.type === 'FIXED' ? centsToInput(c.value) : '',
    cap: c.maxDiscountCents ? centsToInput(c.maxDiscountCents) : '',
    minSpend: centsToInput(c.minSubtotal),
    firstOrderOnly: c.firstOrderOnly,
    stackWithTiers: c.stackWithTiers,
    maxUses: c.maxUses === null ? '' : String(c.maxUses),
    maxUsesPerCustomer: c.maxUsesPerCustomer === null ? '' : String(c.maxUsesPerCustomer),
    startDate: isoDay(c.startsAt),
    startTime: hhmm(c.startsAt) || '00:00',
    endDate: isoDay(c.expiresAt),
    endTime: hhmm(c.expiresAt) || '23:59',
    modes: [...c.modes],
    scope: c.productIds.length || c.categoryIds.length ? 'selected' : 'all',
    productIds: [...c.productIds],
    categoryIds: [...c.categoryIds],
    active: c.active,
    description: c.description ?? '',
  }
}

/** A code for a copy, still within the 24 character limit. */
const copyCode = (code: string) => `${code.slice(0, 19)}-COPY`

const optionalInt = (v: string) => {
  const t = v.trim()
  if (t === '') return { ok: true, value: null as number | null }
  const n = Number(t)
  return Number.isInteger(n) && n >= 1 ? { ok: true, value: n } : { ok: false, value: null }
}

const whenOf = (d: string, t: string, end: boolean) => (d ? new Date(`${d}T${t || (end ? '23:59' : '00:00')}:${end ? '59' : '00'}`) : null)

/** Turns the draft into an API body, collecting every problem it finds. Partial drafts still give a body for the live summary. */
function build(d: Draft): { body: Body; errors: DraftErrors } {
  const e: DraftErrors = {}
  const code = d.code.trim().toUpperCase()
  if (!/^[A-Z0-9_-]{3,24}$/.test(code)) e.code = 'Use 3 to 24 letters, numbers, dashes or underscores'

  let value = 0
  if (d.type === 'PERCENT') {
    const n = Number(d.percent)
    if (d.percent.trim() === '' || !Number.isInteger(n) || n < 1 || n > 100) e.percent = 'Enter a whole number from 1 to 100'
    else value = n
  } else if (d.type === 'FIXED') {
    const c = toCents(d.amount)
    if (c === null || c < 1) e.amount = 'Enter an amount, for example 50.00'
    else value = c
  }

  let maxDiscountCents: number | null = null
  if (d.type === 'PERCENT' && d.cap.trim() !== '') {
    const c = toCents(d.cap)
    if (c === null || c < 1) e.cap = 'Enter an amount, or leave empty for no cap'
    else maxDiscountCents = c
  }

  const minSubtotal = d.minSpend.trim() === '' ? 0 : toCents(d.minSpend)
  if (minSubtotal === null) e.minSpend = 'Enter an amount, or 0 for no minimum'

  const total = optionalInt(d.maxUses)
  if (!total.ok) e.maxUses = 'Enter a whole number of 1 or more, or leave empty'
  const each = optionalInt(d.maxUsesPerCustomer)
  if (!each.ok) e.maxUsesPerCustomer = 'Enter a whole number of 1 or more, or leave empty'
  else if (total.value && each.value && each.value > total.value) e.maxUsesPerCustomer = 'Cannot be more than the total uses'

  const startsAt = whenOf(d.startDate, d.startTime, false)
  const expiresAt = whenOf(d.endDate, d.endTime, true)
  if (startsAt && expiresAt && expiresAt <= startsAt) e.endDate = 'The end must be after the start'

  if (d.modes.length === 0) e.modes = 'Choose at least one order type'
  const scoped = d.type !== 'FREE_SHIPPING' && d.scope === 'selected'
  if (scoped && d.productIds.length === 0 && d.categoryIds.length === 0) e.scope = 'Pick at least one product or category, or choose Whole order'
  if (d.description.length > 200) e.description = 'Keep it under 200 characters'

  return {
    body: {
      code,
      type: d.type,
      value,
      minSubtotal: minSubtotal ?? 0,
      maxDiscountCents,
      maxUses: total.value,
      maxUsesPerCustomer: each.value,
      startsAt: startsAt ? startsAt.toISOString() : null,
      expiresAt: expiresAt ? expiresAt.toISOString() : null,
      active: d.active,
      firstOrderOnly: d.firstOrderOnly,
      stackWithTiers: d.type === 'FREE_SHIPPING' ? true : d.stackWithTiers,
      modes: MODES.map((m) => m.value).filter((m) => d.modes.includes(m)),
      productIds: scoped ? d.productIds : [],
      categoryIds: scoped ? d.categoryIds : [],
      description: d.description.trim() || null,
    },
    errors: e,
  }
}

/** Where an API error belongs in the form. */
const API_FIELD: Record<string, keyof Draft> = {
  code: 'code',
  maxDiscountCents: 'cap',
  minSubtotal: 'minSpend',
  maxUses: 'maxUses',
  maxUsesPerCustomer: 'maxUsesPerCustomer',
  startsAt: 'startDate',
  expiresAt: 'endDate',
  modes: 'modes',
  productIds: 'scope',
  categoryIds: 'scope',
  description: 'description',
}

function CouponSheet({
  editing,
  names,
  products,
  categories,
  onClose,
  onSaved,
}: {
  editing: Editing
  names: Names
  products: AdminProduct[]
  categories: AdminCategory[]
  onClose: () => void
  onSaved: () => Promise<unknown>
}) {
  const settings = useAdminSettings().data?.settings
  const open = editing !== null
  const existing = editing?.mode === 'edit' ? editing.coupon : null
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [initial, setInitial] = useState<Draft>(emptyDraft)
  const [errors, setErrors] = useState<DraftErrors>({})
  const [apiError, setApiError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirmClose, setConfirmClose] = useState(false)
  const [lastOpened, setLastOpened] = useState<Editing>(null)

  // Reset the form each time the editor opens.
  if (editing !== lastOpened) {
    setLastOpened(editing)
    if (editing) {
      const d =
        editing.mode === 'edit'
          ? draftOf(editing.coupon)
          : editing.from
            ? { ...draftOf(editing.from), code: copyCode(editing.from.code) }
            : structuredClone(emptyDraft)
      setDraft(d)
      setInitial(d)
      setErrors({})
      setApiError(null)
    }
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)
  const set = <K extends keyof Draft>(k: K, v: Draft[K], alsoClear: (keyof Draft)[] = []) => {
    setDraft((d) => ({ ...d, [k]: v }))
    if (errors[k] || alsoClear.some((x) => errors[x])) setErrors((e) => ({ ...e, [k]: undefined, ...Object.fromEntries(alsoClear.map((x) => [x, undefined])) }))
  }

  const preview = useMemo(() => build(draft).body, [draft])
  const summary = summarize(preview, names)

  function requestClose() {
    if (saving) return
    if (dirty) setConfirmClose(true)
    else onClose()
  }

  async function submit() {
    setApiError(null)
    const { body, errors: e } = build(draft)
    setErrors(e)
    if (Object.keys(e).length) {
      toast.error('Some fields need fixing')
      requestAnimationFrame(() => document.querySelector('#coupon-form p[role="alert"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
      return
    }
    setSaving(true)
    try {
      if (existing) await api.put(`/api/admin/coupons/${existing.id}`, body)
      else await api.post('/api/admin/coupons', body)
      await onSaved()
      toast.success(existing ? `${body.code} saved` : `${body.code} created`)
      onClose()
    } catch (err) {
      const msg = errorMessage(err)
      const fe: DraftErrors = {}
      if (err instanceof ApiError && Array.isArray(err.details)) {
        for (const issue of err.details as { path?: (string | number)[]; message?: string }[]) {
          const k = String(issue.path?.[0] ?? '')
          const field = k === 'value' ? (draft.type === 'FIXED' ? 'amount' : 'percent') : API_FIELD[k]
          if (field && issue.message) fe[field] = issue.message
        }
      }
      if (/code/i.test(msg) && /(already|partner)/i.test(msg)) fe.code = msg
      setErrors(fe)
      setApiError(msg)
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const modeOff = (m: CouponMode) => (m === 'wholesale' && settings && !settings.bulk.enabled) || (m === 'box' && settings && !settings.box.enabled)

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => !o && requestClose()}>
        <SheetContent side="right" className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-xl">
          <SheetHeader className="border-b pr-12">
            <SheetTitle className="font-display text-xl font-semibold tracking-wide uppercase">
              {existing ? `Edit ${existing.code}` : editing?.mode === 'new' && editing.from ? 'Duplicate coupon' : 'New coupon'}
            </SheetTitle>
            <SheetDescription>Every rule for this code. The summary below updates as you type.</SheetDescription>
          </SheetHeader>

          <form
            id="coupon-form"
            className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-4"
            onSubmit={(e) => {
              e.preventDefault()
              submit()
            }}
          >
            <div className="rounded-lg border border-gold/30 bg-gold/[0.06] px-3 py-2.5">
              <p className="text-xs font-medium tracking-wide text-gold-ink uppercase">Summary</p>
              <p className="mt-0.5 text-sm" aria-live="polite">
                {draft.code.trim() ? <Num className="font-medium">{draft.code.trim().toUpperCase()}</Num> : <span className="text-muted-foreground">This code</span>}
                {': '}
                {summary}
                {draft.active ? '.' : '. Paused.'}
              </p>
            </div>

            {apiError && (
              <p role="alert" className="flex items-start gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
                {apiError}
              </p>
            )}

            <Field label="Code" htmlFor="c-code" error={errors.code} hint="What customers type. Letters, numbers, dashes and underscores, saved in capitals.">
              <TextInput
                id="c-code"
                value={draft.code}
                autoFocus={!existing}
                autoComplete="off"
                maxLength={24}
                placeholder="SUMMER15"
                onChange={(e) => set('code', e.target.value.toUpperCase().replace(/\s+/g, ''))}
                className="font-mono uppercase"
              />
            </Field>

            <Group title="Discount">
              <Segmented
                value={draft.type}
                onChange={(v) => set('type', v, ['percent', 'amount', 'cap', 'scope'])}
                options={[
                  { value: 'PERCENT', label: 'Percent' },
                  { value: 'FIXED', label: 'Fixed amount' },
                  { value: 'FREE_SHIPPING', label: 'Free shipping' },
                ]}
              />
              {draft.type === 'PERCENT' && (
                <div className="grid items-start gap-4 sm:grid-cols-2">
                  <Field label="Percent off" htmlFor="c-pct" error={errors.percent}>
                    <NumberInput id="c-pct" min={1} max={100} step={1} suffix="%" value={draft.percent} onChange={(v) => set('percent', v)} />
                  </Field>
                  <Field label="Most it can take off" htmlFor="c-cap" optional error={errors.cap} hint="Caps the discount on big orders. Empty means no cap.">
                    <MoneyInput id="c-cap" placeholder="No cap" value={draft.cap} onChange={(v) => set('cap', v)} />
                  </Field>
                </div>
              )}
              {draft.type === 'FIXED' && (
                <Field label="Amount off" htmlFor="c-amt" error={errors.amount} hint="Never more than the items it applies to." className="sm:max-w-[50%]">
                  <MoneyInput id="c-amt" value={draft.amount} onChange={(v) => set('amount', v)} />
                </Field>
              )}
              {draft.type === 'FREE_SHIPPING' && <p className="text-xs text-muted-foreground">Removes the shipping fee from the whole order. Item prices are not changed.</p>}
            </Group>

            <Group title="Requirements">
              <Field label="Minimum spend" htmlFor="c-min" error={errors.minSpend} hint="Order total after quantity, bulk and box discounts. 0 means no minimum." className="sm:max-w-[50%]">
                <MoneyInput id="c-min" value={draft.minSpend} onChange={(v) => set('minSpend', v)} />
              </Field>
              <Toggle
                id="c-first"
                label="First order only"
                description="Only for shoppers with no earlier order, matched by account or email."
                checked={draft.firstOrderOnly}
                onChange={(v) => set('firstOrderOnly', v)}
              />
              {draft.type !== 'FREE_SHIPPING' && (
                <Toggle
                  id="c-stack"
                  label="Combine with quantity, bulk and box discounts"
                  description="When off, the code only discounts items that do not already have one of those discounts."
                  checked={draft.stackWithTiers}
                  onChange={(v) => set('stackWithTiers', v)}
                />
              )}
            </Group>

            <Group title="Limits">
              <div className="grid items-start gap-4 sm:grid-cols-2">
                <Field label="Total uses" htmlFor="c-max" optional error={errors.maxUses} hint="Across all customers. Empty means unlimited.">
                  <NumberInput id="c-max" min={1} step={1} placeholder="Unlimited" value={draft.maxUses} onChange={(v) => set('maxUses', v, ['maxUsesPerCustomer'])} />
                </Field>
                <Field label="Uses per customer" htmlFor="c-each" optional error={errors.maxUsesPerCustomer} hint="Matched by account or email. Empty means unlimited.">
                  <NumberInput id="c-each" min={1} step={1} placeholder="Unlimited" value={draft.maxUsesPerCustomer} onChange={(v) => set('maxUsesPerCustomer', v)} />
                </Field>
              </div>
              {existing && (
                <p className="text-xs text-muted-foreground">
                  Used <Num>{num(existing.uses)}</Num> {existing.uses === 1 ? 'time' : 'times'} so far. Cancelled and refunded orders give their use back.
                </p>
              )}
            </Group>

            <Group title="Schedule">
              <div className="grid items-start gap-4 sm:grid-cols-2">
                <DateTimeField
                  label="Starts"
                  id="c-start"
                  dateValue={draft.startDate}
                  timeValue={draft.startTime}
                  onDate={(v) => set('startDate', v, ['endDate'])}
                  onTime={(v) => set('startTime', v, ['endDate'])}
                  emptyHint="Empty means it works straight away."
                />
                <DateTimeField
                  label="Ends"
                  id="c-end"
                  dateValue={draft.endDate}
                  timeValue={draft.endTime}
                  onDate={(v) => set('endDate', v)}
                  onTime={(v) => set('endTime', v)}
                  emptyHint="Empty means it never expires."
                  error={errors.endDate}
                />
              </div>
            </Group>

            <Group title="Where it works">
              <div>
                <p className="text-[13px] font-medium">Order types</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  {MODES.map((m) => {
                    const checked = draft.modes.includes(m.value)
                    return (
                      <label
                        key={m.value}
                        className={cn('flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm', checked ? 'border-gold/50 bg-gold/[0.05]' : 'bg-surface')}
                      >
                        <Checkbox
                          checked={checked}
                          className="mt-0.5"
                          onCheckedChange={(v) =>
                            set(
                              'modes',
                              v === true ? [...draft.modes, m.value] : draft.modes.filter((x) => x !== m.value),
                            )
                          }
                        />
                        <span className="min-w-0">
                          <span className="block font-medium">{m.label}</span>
                          {modeOff(m.value) && <span className="block text-xs text-muted-foreground">Off in Settings</span>}
                        </span>
                      </label>
                    )
                  })}
                </div>
                {errors.modes && <InlineError>{errors.modes}</InlineError>}
              </div>

              {draft.type !== 'FREE_SHIPPING' && (
                <div>
                  <p className="text-[13px] font-medium">Items</p>
                  <div className="mt-2">
                    <Segmented
                      value={draft.scope}
                      onChange={(v) => set('scope', v)}
                      options={[
                        { value: 'all', label: 'Whole order' },
                        { value: 'selected', label: 'Selected products or categories' },
                      ]}
                    />
                  </div>
                  {draft.scope === 'all' ? (
                    <p className="mt-2 text-xs text-muted-foreground">The discount applies to every item in the cart.</p>
                  ) : (
                    <div className="mt-3 space-y-4">
                      <p className="text-xs text-muted-foreground">The discount only applies to these items. Other items in the cart pay their normal price.</p>
                      <Picker
                        label="Products"
                        empty="No products match."
                        items={products.map((p) => ({ id: p.id, name: p.name, sub: p.category?.name ?? null, image: p.image, muted: p.status !== 'ACTIVE' }))}
                        selected={draft.productIds}
                        withImages
                        onChange={(ids) => set('productIds', ids, ['scope'])}
                      />
                      <Picker
                        label="Categories"
                        empty="No categories match."
                        items={categories.map((c) => ({ id: c.id, name: c.name, sub: `${num(c._count.products)} ${c._count.products === 1 ? 'product' : 'products'}`, image: null }))}
                        selected={draft.categoryIds}
                        onChange={(ids) => set('categoryIds', ids, ['scope'])}
                      />
                      {errors.scope && <InlineError>{errors.scope}</InlineError>}
                    </div>
                  )}
                </div>
              )}
            </Group>

            <Group title="Status and note">
              <Toggle id="c-active" label="Active" description="Switch off to pause the code without deleting it." checked={draft.active} onChange={(v) => set('active', v)} />
              <Field
                label="Note"
                htmlFor="c-desc"
                optional
                error={errors.description}
                hint={
                  <span className="flex justify-between gap-3">
                    <span>For your team, for example where you shared the code. Customers do not see it.</span>
                    <Num>{draft.description.length}/200</Num>
                  </span>
                }
              >
                <Textarea id="c-desc" rows={2} value={draft.description} onChange={(e) => set('description', e.target.value)} className="min-h-0 resize-y" />
              </Field>
            </Group>
          </form>

          <div className="flex items-center justify-end gap-2 border-t bg-background px-4 py-3">
            <Button type="button" variant="outline" onClick={requestClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" form="coupon-form" disabled={saving}>
              {saving ? 'Saving...' : existing ? 'Save coupon' : 'Create coupon'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      <ConfirmDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title="Discard changes?"
        description="This coupon has changes that are not saved. If you close it now they will be lost."
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        onConfirm={() => {
          onClose()
        }}
      />
    </>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="mb-3 w-full border-b pb-1.5 font-display text-base font-semibold tracking-wide uppercase">{title}</legend>
      {children}
    </fieldset>
  )
}

function Toggle({ id, label, description, checked, onChange }: { id: string; label: string; description?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border bg-surface px-3 py-2.5">
      <span className="min-w-0">
        <span className="block text-sm font-medium">{label}</span>
        {description && <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{description}</span>}
      </span>
      <Switch id={id} checked={checked} onCheckedChange={onChange} className="mt-0.5" />
    </label>
  )
}

function InlineError({ children }: { children: ReactNode }) {
  return (
    <p className="mt-1.5 flex items-start gap-1 text-xs text-destructive" role="alert">
      <WarningCircleIcon className="mt-px size-3.5 shrink-0" />
      {children}
    </p>
  )
}

function DateTimeField({
  label,
  id,
  dateValue,
  timeValue,
  onDate,
  onTime,
  emptyHint,
  error,
}: {
  label: string
  id: string
  dateValue: string
  timeValue: string
  onDate: (v: string) => void
  onTime: (v: string) => void
  emptyHint: string
  error?: string
}) {
  return (
    <Field label={label} htmlFor={id} optional error={error} hint={dateValue ? undefined : emptyHint}>
      <div className="flex min-w-0 items-center gap-2">
        <TextInput id={id} type="date" value={dateValue} onChange={(e) => onDate(e.target.value)} className="min-w-0 flex-1 font-mono tabular-nums" />
        <TextInput
          type="time"
          aria-label={`${label} time`}
          value={timeValue}
          disabled={!dateValue}
          onChange={(e) => onTime(e.target.value)}
          className="w-[6.5rem] shrink-0 font-mono tabular-nums"
        />
        {dateValue && (
          <Button type="button" variant="ghost" size="icon-sm" aria-label={`Clear ${label.toLowerCase()} date`} onClick={() => onDate('')}>
            <XIcon />
          </Button>
        )}
      </div>
    </Field>
  )
}

interface PickItem {
  id: string
  name: string
  sub: string | null
  image: string | null
  muted?: boolean
}

/** Searchable multi-select. Inline (not a popover) so it works well inside the sheet on phones. */
function Picker({
  label,
  items,
  selected,
  onChange,
  empty,
  withImages = false,
}: {
  label: string
  items: PickItem[]
  selected: string[]
  onChange: (ids: string[]) => void
  empty: string
  withImages?: boolean
}) {
  const [q, setQ] = useState('')
  const term = q.trim().toLowerCase()
  const shown = term ? items.filter((i) => i.name.toLowerCase().includes(term) || (i.sub ?? '').toLowerCase().includes(term)) : items
  const chosen = selected.map((id) => items.find((i) => i.id === id) ?? { id, name: 'Removed item', sub: null, image: null })
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])

  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[13px] font-medium">{label}</p>
        <span className="text-xs text-muted-foreground">
          <Num>{num(selected.length)}</Num> selected
        </span>
      </div>
      {chosen.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {chosen.map((i) => (
            <span key={i.id} className="inline-flex max-w-full items-center gap-1 rounded-md border bg-card py-0.5 pr-0.5 pl-2 text-xs">
              <span className="truncate">{i.name}</span>
              <button
                type="button"
                onClick={() => toggle(i.id)}
                aria-label={`Remove ${i.name}`}
                className="grid size-5 place-items-center rounded-[4px] text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <XIcon className="size-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="mt-2 overflow-hidden rounded-lg border">
        <SearchInput value={q} onChange={setQ} placeholder={`Search ${label.toLowerCase()}`} className="[&_input]:rounded-none [&_input]:border-0 [&_input]:border-b" />
        <ul className="max-h-56 overflow-y-auto" role="listbox" aria-multiselectable="true" aria-label={label}>
          {shown.length === 0 ? (
            <li className="px-3 py-4 text-center text-xs text-muted-foreground">{empty}</li>
          ) : (
            shown.map((i) => {
              const on = selected.includes(i.id)
              return (
                <li key={i.id} role="option" aria-selected={on}>
                  <button
                    type="button"
                    onClick={() => toggle(i.id)}
                    className={cn('flex w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/60', on && 'bg-gold/[0.06]')}
                  >
                    <span
                      className={cn('grid size-4 shrink-0 place-items-center rounded-[4px] border', on ? 'border-primary bg-primary text-primary-foreground' : 'border-input')}
                      aria-hidden
                    >
                      {on && <CheckIcon className="size-3" weight="bold" />}
                    </span>
                    {withImages && <ProductImage src={i.image} alt="" sizes="32px" className="size-8 shrink-0 rounded-md border [&_svg]:size-4" />}
                    <span className="min-w-0 flex-1">
                      <span className={cn('block truncate', i.muted && 'text-muted-foreground')}>{i.name}</span>
                      {i.sub && <span className="block truncate text-xs text-muted-foreground">{i.sub}</span>}
                    </span>
                  </button>
                </li>
              )
            })
          )}
        </ul>
      </div>
    </div>
  )
}
