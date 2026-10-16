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

/**
 * Checkbox selection.
 * - Client-side lists (everything loaded): rows that leave the list (search, filter) are deselected.
 * - Paged lists (`paged`): the selection survives page changes, so "Select all N" can cover every
 *   page; it is cleared when `resetKey` (the filter/search) changes.
 */
export function useSelection(visibleIds: string[], opts: { paged?: boolean; resetKey?: string } = {}) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const key = visibleIds.join(',')
  useEffect(() => {
    if (opts.paged) return
    setSelected((cur) => {
      const keep = new Set([...cur].filter((id) => visibleIds.includes(id)))
      return keep.size === cur.size ? cur : keep
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, opts.paged])
  useEffect(() => {
    if (opts.paged) setSelected(new Set())
  }, [opts.paged, opts.resetKey])
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
      /** Header checkbox: selects or clears the rows on screen. */
      toggleAll: () =>
        setSelected((cur) => {
          const next = new Set(cur)
          if (all) visibleIds.forEach((id) => next.delete(id))
          else visibleIds.forEach((id) => next.add(id))
          return next
        }),
      selectIds: (ids: string[]) => setSelected(new Set(ids)),
      clear: () => setSelected(new Set()),
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, key])
}
export type Selection = ReturnType<typeof useSelection>

/**
 * Gmail-style "select everything": after the header checkbox selects a page, offer to select every
 * item that matches the current filter (fetched from the server), and show when that is the case.
 */
export function SelectAllBanner({ sel, visibleCount, total, noun, fetchIds }: { sel: Selection; visibleCount: number; total: number; noun: string; fetchIds: () => Promise<string[]> }) {
  const [loading, setLoading] = useState(false)
  if (total <= visibleCount || !sel.count) return null
  const everything = sel.count >= total
  if (!everything && !sel.all) return null
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-b bg-gold/10 px-4 py-2 text-center text-sm" role="status">
      {everything ? (
        <>
          <span>
            All <b className="tabular-nums">{num(sel.count)}</b> {noun} are selected.
          </span>
          <button type="button" className="font-medium text-gold-ink underline-offset-4 hover:underline" onClick={sel.clear}>
            Clear selection
          </button>
        </>
      ) : (
        <>
          <span>
            All <b className="tabular-nums">{num(visibleCount)}</b> {noun} on this page are selected.
          </span>
          <button
            type="button"
            disabled={loading}
            className="inline-flex items-center gap-1 font-medium text-gold-ink underline-offset-4 hover:underline"
            onClick={async () => {
              setLoading(true)
              try {
                sel.selectIds(await fetchIds())
              } catch (e) {
                toast.error(errorMessage(e))
              } finally {
                setLoading(false)
              }
            }}
          >
            {loading && <CircleNotchIcon className="size-3.5 animate-spin" />}
            Select all {num(total)} {noun}
          </button>
        </>
      )}
    </div>
  )
}

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
