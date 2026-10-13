import { useQuery } from '@tanstack/react-query'
import { InfoIcon, PencilSimpleIcon, PlusIcon, TicketIcon, TrashIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { EmptyState } from '@/components/brand/bits'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { api, errorMessage } from '@/lib/api'
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
  Segmented,
  TextInput,
} from '../components/kit'
import type { Coupon } from '../lib/types'
import { centsToInput, isoDay, toCents, useInvalidateAdmin } from '../lib/utils'

type Body = Pick<Coupon, 'code' | 'type' | 'value' | 'minSubtotal' | 'maxUses' | 'active' | 'description'> & { expiresAt: string | null }

const bodyOf = (c: Coupon): Body => ({
  code: c.code,
  type: c.type,
  value: c.value,
  minSubtotal: c.minSubtotal,
  maxUses: c.maxUses,
  expiresAt: c.expiresAt,
  active: c.active,
  description: c.description,
})

const discountText = (c: Pick<Coupon, 'type' | 'value'>) => (c.type === 'PERCENT' ? `${c.value}% off` : `${money(c.value)} off`)
const isExpired = (c: Coupon) => !!c.expiresAt && new Date(c.expiresAt).getTime() < Date.now()
const usedUp = (c: Coupon) => c.maxUses !== null && c.uses >= c.maxUses

export default function Coupons() {
  const invalidate = useInvalidateAdmin()
  const q = useQuery({ queryKey: ['admin', 'coupons'], queryFn: () => api.get<Coupon[]>('/api/admin/coupons') })
  const [editing, setEditing] = useState<Coupon | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Coupon | null>(null)
  const [toggling, setToggling] = useState<string | null>(null)

  async function toggle(c: Coupon, active: boolean) {
    setToggling(c.id)
    try {
      await api.put(`/api/admin/coupons/${c.id}`, { ...bodyOf(c), active })
      await invalidate()
      toast.success(active ? `${c.code} is on` : `${c.code} is off`)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setToggling(null)
    }
  }

  const rows = q.data ?? []

  return (
    <div className="space-y-6">
      <PageHeader
        title="Coupons"
        description="Discount codes customers type at checkout. Codes work on normal shop orders only, not on bulk or Build a Box orders."
        actions={
          <Button onClick={() => setEditing('new')}>
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
          . Each approved partner has their own code that gives shoppers a discount and credits the partner.
        </p>
      </div>

      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.isPending ? (
        <Panel flush>
          <RowsSkeleton rows={4} cols={6} />
        </Panel>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<TicketIcon />}
          title="No coupons yet"
          body="Create a code for a promotion, a newsletter or a first-order welcome discount."
          action={
            <Button onClick={() => setEditing('new')}>
              <PlusIcon />
              Create a coupon
            </Button>
          }
        />
      ) : (
        <Panel flush>
          <div className="divide-y md:hidden">
            {rows.map((c) => (
              <div key={c.id} className={cn('px-4 py-3', !c.active && 'opacity-70')}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <Num className="truncate font-medium">{c.code}</Num>
                      <CopyButton text={c.code} label={`Copy ${c.code}`} />
                    </div>
                    <p className="text-sm font-medium text-gold-ink">{discountText(c)}</p>
                  </div>
                  <Switch
                    checked={c.active}
                    disabled={toggling === c.id}
                    onCheckedChange={(v) => toggle(c, v)}
                    aria-label={c.active ? `Turn off ${c.code}` : `Turn on ${c.code}`}
                  />
                </div>
                {c.description && <p className="mt-1 text-sm text-muted-foreground">{c.description}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    Min spend <Num className="text-foreground">{c.minSubtotal ? money(c.minSubtotal) : 'none'}</Num>
                  </span>
                  <span>
                    Used <Num className="text-foreground">{num(c.uses)}</Num>
                    {c.maxUses !== null && (
                      <>
                        {' '}
                        of <Num className="text-foreground">{num(c.maxUses)}</Num>
                      </>
                    )}
                  </span>
                  <span>{c.expiresAt ? `Ends ${date(c.expiresAt)}` : 'No end date'}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusPills c={c} />
                  <div className="ml-auto flex items-center gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(c)} aria-label={`Edit ${c.code}`}>
                      <PencilSimpleIcon />
                      Edit
                    </Button>
                    <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" onClick={() => setDeleting(c)} aria-label={`Delete ${c.code}`}>
                      <TrashIcon />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-4 text-xs font-medium text-muted-foreground">Code</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Discount</TableHead>
                  <TableHead className="text-right text-xs font-medium text-muted-foreground">Min spend</TableHead>
                  <TableHead className="text-right text-xs font-medium text-muted-foreground">Used</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Ends</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Status</TableHead>
                  <TableHead className="pr-4 text-right text-xs font-medium text-muted-foreground">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => (
                  <TableRow key={c.id} className="cursor-pointer" onClick={() => setEditing(c)}>
                    <TableCell className="max-w-72 pl-4">
                      <div className="flex items-center gap-1">
                        <Num className="font-medium">{c.code}</Num>
                        <span onClick={(e) => e.stopPropagation()}>
                          <CopyButton text={c.code} label={`Copy ${c.code}`} />
                        </span>
                      </div>
                      {c.description && <p className="truncate text-xs text-muted-foreground">{c.description}</p>}
                    </TableCell>
                    <TableCell className="font-medium text-gold-ink">{discountText(c)}</TableCell>
                    <TableCell className="text-right">
                      {c.minSubtotal ? <Num>{money(c.minSubtotal)}</Num> : <span className="text-muted-foreground">None</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <Num>{num(c.uses)}</Num>
                      <span className="text-muted-foreground"> / {c.maxUses === null ? 'no limit' : <Num>{num(c.maxUses)}</Num>}</span>
                    </TableCell>
                    <TableCell>{c.expiresAt ? <Num className={cn(isExpired(c) && 'text-muted-foreground')}>{date(c.expiresAt)}</Num> : <span className="text-muted-foreground">Never</span>}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                        <Switch
                          size="sm"
                          checked={c.active}
                          disabled={toggling === c.id}
                          onCheckedChange={(v) => toggle(c, v)}
                          aria-label={c.active ? `Turn off ${c.code}` : `Turn on ${c.code}`}
                        />
                        <StatusPills c={c} />
                      </div>
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        <Button variant="ghost" size="icon-sm" onClick={() => setEditing(c)} aria-label={`Edit ${c.code}`}>
                          <PencilSimpleIcon />
                        </Button>
                        <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" onClick={() => setDeleting(c)} aria-label={`Delete ${c.code}`}>
                          <TrashIcon />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Panel>
      )}

      <CouponDialog
        coupon={editing}
        onClose={() => setEditing(null)}
        onSaved={async () => {
          await invalidate()
        }}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete coupon?"
        description={
          deleting
            ? `${deleting.code} will stop working straight away. Past orders that used it keep their discount. To pause a code instead, switch it off.`
            : undefined
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

function StatusPills({ c }: { c: Coupon }) {
  if (isExpired(c)) return <Pill tone="muted">Expired</Pill>
  if (usedUp(c)) return <Pill tone="muted">Used up</Pill>
  return c.active ? <Pill tone="success">Active</Pill> : <Pill tone="muted">Off</Pill>
}

interface Draft {
  code: string
  type: 'PERCENT' | 'FIXED'
  percent: string
  amount: string
  minSpend: string
  maxUses: string
  expires: string
  active: boolean
  description: string
}

const emptyDraft: Draft = { code: '', type: 'PERCENT', percent: '10', amount: '', minSpend: '0.00', maxUses: '', expires: '', active: true, description: '' }

function draftOf(c: Coupon): Draft {
  return {
    code: c.code,
    type: c.type,
    percent: c.type === 'PERCENT' ? String(c.value) : '10',
    amount: c.type === 'FIXED' ? centsToInput(c.value) : '',
    minSpend: centsToInput(c.minSubtotal),
    maxUses: c.maxUses === null ? '' : String(c.maxUses),
    expires: c.expiresAt ? isoDay(c.expiresAt) : '',
    active: c.active,
    description: c.description ?? '',
  }
}

function CouponDialog({ coupon, onClose, onSaved }: { coupon: Coupon | 'new' | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const open = coupon !== null
  const existing = coupon && coupon !== 'new' ? coupon : null
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [errors, setErrors] = useState<Partial<Record<keyof Draft, string>>>({})
  const [apiError, setApiError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [lastOpened, setLastOpened] = useState<Coupon | 'new' | null>(null)

  // Reset the form each time the dialog opens for a different coupon.
  if (coupon !== lastOpened) {
    setLastOpened(coupon)
    if (coupon) {
      setDraft(coupon === 'new' ? emptyDraft : draftOf(coupon))
      setErrors({})
      setApiError(null)
    }
  }

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    setDraft((d) => ({ ...d, [k]: v }))
    if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined }))
  }

  function build(): Body | null {
    const e: Partial<Record<keyof Draft, string>> = {}
    const code = draft.code.trim().toUpperCase()
    if (!/^[A-Z0-9_-]{3,24}$/.test(code)) e.code = 'Use 3 to 24 letters, numbers, dashes or underscores'

    let value = 0
    if (draft.type === 'PERCENT') {
      const n = Number(draft.percent)
      if (draft.percent.trim() === '' || !Number.isInteger(n) || n < 1 || n > 100) e.percent = 'Enter a whole number from 1 to 100'
      else value = n
    } else {
      const c = toCents(draft.amount)
      if (c === null || c < 1) e.amount = 'Enter an amount, for example 50.00'
      else value = c
    }

    const minSubtotal = draft.minSpend.trim() === '' ? 0 : toCents(draft.minSpend)
    if (minSubtotal === null) e.minSpend = 'Enter an amount, or leave 0 for no minimum'

    let maxUses: number | null = null
    if (draft.maxUses.trim() !== '') {
      const n = Number(draft.maxUses)
      if (!Number.isInteger(n) || n < 1) e.maxUses = 'Enter a whole number of 1 or more, or leave blank'
      else maxUses = n
    }

    if (draft.description.length > 200) e.description = 'Keep it under 200 characters'

    setErrors(e)
    if (Object.keys(e).length) return null
    return {
      code,
      type: draft.type,
      value,
      minSubtotal: minSubtotal ?? 0,
      maxUses,
      // End of the chosen day, local time, so the code works for the whole day.
      expiresAt: draft.expires ? new Date(`${draft.expires}T23:59:59`).toISOString() : null,
      active: draft.active,
      description: draft.description.trim() || null,
    }
  }

  async function submit() {
    setApiError(null)
    const body = build()
    if (!body) return
    setSaving(true)
    try {
      if (existing) await api.put(`/api/admin/coupons/${existing.id}`, body)
      else await api.post('/api/admin/coupons', body)
      await onSaved()
      toast.success(existing ? `${body.code} saved` : `${body.code} created`)
      onClose()
    } catch (e) {
      setApiError(errorMessage(e))
      toast.error(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  const minCents = toCents(draft.minSpend) ?? 0
  const preview =
    draft.type === 'PERCENT'
      ? draft.percent && Number(draft.percent) > 0
        ? `${Number(draft.percent)}% off`
        : null
      : toCents(draft.amount)
        ? `${money(toCents(draft.amount))} off`
        : null

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-display text-xl font-semibold tracking-wide uppercase">{existing ? 'Edit coupon' : 'New coupon'}</DialogTitle>
          <DialogDescription>
            {preview ? (
              <>
                Customers who enter this code get <span className="font-medium text-foreground">{preview}</span>
                {minCents > 0 ? ` on orders of ${money(minCents)} or more` : ''}.
              </>
            ) : (
              'Set the code and how much it takes off.'
            )}
          </DialogDescription>
        </DialogHeader>

        <form
          id="coupon-form"
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            submit()
          }}
        >
          {apiError && (
            <p role="alert" className="flex items-start gap-1.5 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              <WarningCircleIcon className="mt-0.5 size-4 shrink-0" />
              {apiError}
            </p>
          )}

          <Field label="Code" htmlFor="c-code" error={errors.code} hint="What customers type. Letters and numbers, saved in capitals.">
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

          <div className="grid items-start gap-4 sm:grid-cols-2">
            <Field label="Discount type">
              <Segmented
                value={draft.type}
                onChange={(v) => set('type', v)}
                options={[
                  { value: 'PERCENT', label: 'Percent off' },
                  { value: 'FIXED', label: 'Fixed amount' },
                ]}
              />
            </Field>
            {draft.type === 'PERCENT' ? (
              <Field label="Percent off" htmlFor="c-pct" error={errors.percent}>
                <NumberInput id="c-pct" min={1} max={100} step={1} suffix="%" value={draft.percent} onChange={(v) => set('percent', v)} />
              </Field>
            ) : (
              <Field label="Amount off" htmlFor="c-amt" error={errors.amount} hint="Never more than the order itself.">
                <MoneyInput id="c-amt" value={draft.amount} onChange={(v) => set('amount', v)} />
              </Field>
            )}
          </div>

          <div className="grid items-start gap-4 sm:grid-cols-2">
            <Field label="Minimum spend" htmlFor="c-min" error={errors.minSpend} hint="After volume discounts. 0 means no minimum.">
              <MoneyInput id="c-min" value={draft.minSpend} onChange={(v) => set('minSpend', v)} />
            </Field>
            <Field label="Usage limit" htmlFor="c-max" optional error={errors.maxUses} hint="Total uses across all customers. Blank means unlimited.">
              <NumberInput id="c-max" min={1} step={1} placeholder="Unlimited" value={draft.maxUses} onChange={(v) => set('maxUses', v)} />
            </Field>
          </div>

          <Field label="Ends on" htmlFor="c-exp" optional hint="The code works until the end of this day. Blank means it never expires.">
            <div className="flex items-center gap-2">
              <TextInput id="c-exp" type="date" value={draft.expires} onChange={(e) => set('expires', e.target.value)} className="min-w-0 flex-1 font-mono" />
              {draft.expires && (
                <Button type="button" variant="ghost" size="sm" onClick={() => set('expires', '')}>
                  Clear
                </Button>
              )}
            </div>
          </Field>

          <Field
            label="Note"
            htmlFor="c-desc"
            optional
            error={errors.description}
            hint={
              <span className="flex justify-between gap-3">
                <span>For your reference, for example where you shared the code.</span>
                <Num>{draft.description.length}/200</Num>
              </span>
            }
          >
            <Textarea id="c-desc" rows={2} value={draft.description} onChange={(e) => set('description', e.target.value)} className="min-h-0 resize-y" />
          </Field>

          <label htmlFor="c-active" className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border bg-surface px-3 py-2.5">
            <span>
              <span className="block text-sm font-medium">Active</span>
              <span className="block text-xs text-muted-foreground">Switch off to pause the code without deleting it.</span>
            </span>
            <Switch id="c-active" checked={draft.active} onCheckedChange={(v) => set('active', v)} />
          </label>

          {existing && existing.uses > 0 && (
            <p className="text-xs text-muted-foreground">
              Used <Num>{num(existing.uses)}</Num> {existing.uses === 1 ? 'time' : 'times'} so far.
            </p>
          )}
        </form>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="coupon-form" disabled={saving}>
            {saving ? 'Saving...' : existing ? 'Save coupon' : 'Create coupon'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
