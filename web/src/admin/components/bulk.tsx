import { ArchiveIcon, ArrowCounterClockwiseIcon, CircleNotchIcon, XIcon } from '@phosphor-icons/react'
import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { api, errorMessage } from '@/lib/api'
import { num } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ConfirmDialog } from './kit'

export type ArchiveType = 'orders' | 'products' | 'customers' | 'coupons' | 'coas' | 'messages'

export const ARCHIVE_LABEL: Record<ArchiveType, { one: string; many: string; effect: string }> = {
  orders: {
    one: 'order',
    many: 'orders',
    effect: 'They leave the order list, dashboard and finance reports. Unpaid orders are cancelled first and the customer is told. Customers can still open their own order link.',
  },
  products: { one: 'product', many: 'products', effect: 'They disappear from the shop and the product list and can no longer be bought. Past orders keep showing them.' },
  customers: { one: 'customer', many: 'customers', effect: 'They are signed out and cannot sign in. Their orders stay. Admins, partners and customers with an active box are skipped.' },
  coupons: { one: 'coupon', many: 'coupons', effect: 'The codes stop working at checkout.' },
  coas: { one: 'certificate', many: 'certificates', effect: 'They disappear from product pages and the COA library.' },
  messages: { one: 'message', many: 'messages', effect: 'They leave the inbox.' },
}

/** Checkbox selection over the rows currently on screen. Rows that leave the list are deselected. */
export function useSelection(visibleIds: string[]) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const key = visibleIds.join(',')
  useEffect(() => {
    setSelected((cur) => {
      const keep = new Set([...cur].filter((id) => visibleIds.includes(id)))
      return keep.size === cur.size ? cur : keep
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])
  return useMemo(() => {
    const all = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id))
    const some = !all && visibleIds.some((id) => selected.has(id))
    return {
      ids: [...selected],
      count: selected.size,
      has: (id: string) => selected.has(id),
      toggle: (id: string) =>
        setSelected((cur) => {
          const next = new Set(cur)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return next
        }),
      all,
      some,
      toggleAll: () => setSelected(all ? new Set() : new Set(visibleIds)),
      clear: () => setSelected(new Set()),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, key])
}
export type Selection = ReturnType<typeof useSelection>

/** Row / header checkbox that never triggers the row's own click. */
export function SelectBox({ checked, indeterminate, onChange, label, className }: { checked: boolean; indeterminate?: boolean; onChange: () => void; label: string; className?: string }) {
  return (
    <span className={cn('inline-flex', className)} onClick={(e) => e.stopPropagation()}>
      <Checkbox checked={indeterminate ? 'indeterminate' : checked} onCheckedChange={() => onChange()} aria-label={label} className="size-[18px]" />
    </span>
  )
}

/** Sticky action bar shown while rows are selected. */
export function BulkBar({ count, noun, onClear, children }: { count: number; noun: string; onClear: () => void; children: ReactNode }) {
  if (!count) return null
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-4 py-3 backdrop-blur-xl md:sticky md:bottom-4 md:mt-4 md:rounded-xl md:border md:shadow-lg" role="region" aria-label="Bulk actions">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">
          <span className="mr-2 inline-block size-2 rounded-full bg-gold align-middle" aria-hidden />
          <b className="tabular-nums">{num(count)}</b> {noun} selected
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {children}
          <Button variant="ghost" size="sm" onClick={onClear}>
            <XIcon /> Clear
          </Button>
        </div>
      </div>
    </div>
  )
}

type BulkResult = { done: number; skipped: { id: string; label: string; reason: string }[] }

function report(verb: string, type: ArchiveType, r: BulkResult) {
  const l = ARCHIVE_LABEL[type]
  if (r.done) toast.success(`${verb} ${num(r.done)} ${r.done === 1 ? l.one : l.many}`)
  if (r.skipped.length) {
    const lines = r.skipped.slice(0, 4).map((s) => `${s.label}: ${s.reason}`)
    if (r.skipped.length > 4) lines.push(`and ${r.skipped.length - 4} more`)
    toast.warning(`${num(r.skipped.length)} not archived`, { description: lines.join('\n'), duration: 12000 })
  }
}

/** "Archive" with a confirmation dialog. Returns a trigger function and the dialog element to render. */
export function useArchive(type: ArchiveType, onDone?: () => void) {
  const qc = useQueryClient()
  const [ids, setIds] = useState<string[] | null>(null)
  const l = ARCHIVE_LABEL[type]
  const n = ids?.length ?? 0
  const dialog = (
    <ConfirmDialog
      open={!!ids}
      onOpenChange={(o) => !o && setIds(null)}
      title={`Archive ${n === 1 ? `this ${l.one}` : `${num(n)} ${l.many}`}?`}
      description={`${l.effect} You can restore ${n === 1 ? 'it' : 'them'} any time from Archive.`}
      confirmLabel={`Archive ${n === 1 ? l.one : `${num(n)} ${l.many}`}`}
      cancelLabel="Cancel"
      onConfirm={async () => {
        const r = await api.post<BulkResult>(`/api/admin/archive/${type}`, { ids })
        report('Archived', type, r)
        await qc.invalidateQueries({ queryKey: ['admin'] })
        onDone?.()
      }}
    />
  )
  return { ask: (list: string[]) => list.length && setIds(list), dialog }
}

export async function restoreItems(type: ArchiveType, ids: string[]) {
  const r = await api.post<BulkResult>(`/api/admin/restore/${type}`, { ids })
  report('Restored', type, r)
  return r
}

/** Bulk bar buttons shared by every list. */
export function ArchiveButton({ onClick, pending }: { onClick: () => void; pending?: boolean }) {
  return (
    <Button size="sm" variant="destructive" onClick={onClick} disabled={pending}>
      {pending ? <CircleNotchIcon className="animate-spin" /> : <ArchiveIcon />} Archive
    </Button>
  )
}
export function RestoreButton({ onClick, pending, label = 'Restore' }: { onClick: () => void; pending?: boolean; label?: string }) {
  return (
    <Button size="sm" onClick={onClick} disabled={pending}>
      {pending ? <CircleNotchIcon className="animate-spin" /> : <ArrowCounterClockwiseIcon />} {label}
    </Button>
  )
}

/** "Archive" button for a detail page. `after` runs once archived (e.g. go back to the list). */
export function ArchiveOneButton({ type, id, after }: { type: ArchiveType; id: string; after?: () => void }) {
  const archive = useArchive(type, after)
  return (
    <>
      <Button variant="outline" size="sm" className="hover:text-destructive" onClick={() => archive.ask([id])}>
        <ArchiveIcon /> Archive
      </Button>
      {archive.dialog}
    </>
  )
}

/** Banner on a detail page when the record is archived, with a one-click restore. */
export function ArchivedNotice({ type, id, deletedAt, deletedBy }: { type: ArchiveType; id: string; deletedAt: string; deletedBy?: string | null }) {
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const l = ARCHIVE_LABEL[type]
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 text-sm" role="status">
      <p className="flex items-center gap-2">
        <ArchiveIcon className="size-4 shrink-0 text-warning" />
        This {l.one} was archived on {new Date(deletedAt).toLocaleString('en-MY', { dateStyle: 'medium', timeStyle: 'short' })}
        {deletedBy ? ` by ${deletedBy}` : ''}. It is hidden from lists and reports.
      </p>
      <Button
        size="sm"
        disabled={busy}
        onClick={async () => {
          setBusy(true)
          try {
            await restoreItems(type, [id])
            await qc.invalidateQueries({ queryKey: ['admin'] })
          } catch (e) {
            toast.error(errorMessage(e))
          } finally {
            setBusy(false)
          }
        }}
      >
        {busy ? <CircleNotchIcon className="animate-spin" /> : <ArrowCounterClockwiseIcon />} Restore {l.one}
      </Button>
    </div>
  )
}
