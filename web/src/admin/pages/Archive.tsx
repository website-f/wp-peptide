import { ArchiveIcon, ArrowCounterClockwiseIcon, ArrowSquareOutIcon } from '@phosphor-icons/react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { EmptyState } from '@/components/brand/bits'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api, errorMessage } from '@/lib/api'
import { date, relative } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ARCHIVE_LABEL, BulkBar, RestoreButton, SelectBox, restoreItems, useSelection, type ArchiveType } from '../components/bulk'
import { ErrorState, PageHeader, Panel, RowsSkeleton, SearchInput, Segmented } from '../components/kit'
import { useDebounced } from '../lib/utils'

type Row = { id: string; title: string; detail: string; deletedAt: string; deletedBy: string | null; href: string | null }
type Resp = { rows: Row[]; counts: Record<ArchiveType, number> }

const TABS: { value: ArchiveType; label: string }[] = [
  { value: 'orders', label: 'Orders' },
  { value: 'products', label: 'Products' },
  { value: 'customers', label: 'Customers' },
  { value: 'coupons', label: 'Coupons' },
  { value: 'coas', label: 'Certificates' },
  { value: 'messages', label: 'Messages' },
]

/** Everything archived (soft-deleted) from the admin, restorable one by one or in bulk. */
export default function Archive() {
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const type = (TABS.some((t) => t.value === params.get('type')) ? params.get('type') : 'orders') as ArchiveType
  const [search, setSearch] = useState('')
  const q = useDebounced(search.trim(), 300)
  const [busy, setBusy] = useState(false)

  const query = useQuery({
    queryKey: ['admin', 'archive', type, q],
    queryFn: () => api.get<Resp>(`/api/admin/archive/${type}`, { q: q || undefined }),
    placeholderData: keepPreviousData,
  })
  const rows = query.data?.rows ?? []
  const sel = useSelection(rows.map((r) => r.id))
  const l = ARCHIVE_LABEL[type]

  async function restore(ids: string[]) {
    setBusy(true)
    try {
      await restoreItems(type, ids)
      sel.clear()
      await qc.invalidateQueries({ queryKey: ['admin'] })
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Archive" description="Everything deleted from the admin is kept here. Restore it any time and it goes back exactly as it was." />

      <Segmented
        value={type}
        onChange={(v) => {
          setSearch('')
          setParams(v === 'orders' ? {} : { type: v }, { replace: true })
        }}
        options={TABS.map((t) => ({ ...t, count: query.data?.counts[t.value] }))}
      />

      <Panel flush>
        <div className="flex flex-col gap-2 border-b p-3 sm:flex-row sm:items-center">
          <SearchInput value={search} onChange={setSearch} placeholder={`Search archived ${l.many}`} className="flex-1" />
        </div>

        {query.isError && !query.data ? (
          <div className="p-4">
            <ErrorState error={query.error} onRetry={() => query.refetch()} />
          </div>
        ) : query.isPending ? (
          <RowsSkeleton rows={6} cols={4} />
        ) : rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<ArchiveIcon />}
              title={q ? `No archived ${l.many} match` : `No archived ${l.many}`}
              body={q ? 'Try a different search.' : `${l.many[0].toUpperCase()}${l.many.slice(1)} you delete show up here so you can restore them.`}
            />
          </div>
        ) : (
          <div className={cn(query.isPlaceholderData && 'opacity-70 transition-opacity')}>
            {/* Phone */}
            <ul className="divide-y md:hidden">
              {rows.map((r) => (
                <li key={r.id} className={cn('flex items-start gap-3 px-4 py-3', sel.has(r.id) && 'bg-gold/5')}>
                  <SelectBox className="pt-0.5" checked={sel.has(r.id)} onChange={() => sel.toggle(r.id)} label={`Select ${r.title}`} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.title}</p>
                    <p className="truncate text-xs text-muted-foreground">{r.detail}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Archived {relative(r.deletedAt)}
                      {r.deletedBy ? ` by ${r.deletedBy}` : ''}
                    </p>
                    <div className="mt-2 flex gap-2">
                      <Button size="sm" variant="outline" disabled={busy} onClick={() => restore([r.id])}>
                        <ArrowCounterClockwiseIcon /> Restore
                      </Button>
                      {r.href && (
                        <Button asChild size="sm" variant="ghost">
                          <Link to={r.href}>
                            <ArrowSquareOutIcon /> Open
                          </Link>
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {/* Tablet and up */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-10 pl-4">
                      <SelectBox checked={sel.all} indeterminate={sel.some} onChange={sel.toggleAll} label={`Select all archived ${l.many}`} />
                    </TableHead>
                    <TableHead className="text-xs text-muted-foreground">{l.one[0].toUpperCase() + l.one.slice(1)}</TableHead>
                    <TableHead className="text-xs text-muted-foreground">Archived</TableHead>
                    <TableHead className="w-48 pr-4">
                      <span className="sr-only">Actions</span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.id} className={cn(sel.has(r.id) && 'bg-gold/5')}>
                      <TableCell className="w-10 pl-4">
                        <SelectBox checked={sel.has(r.id)} onChange={() => sel.toggle(r.id)} label={`Select ${r.title}`} />
                      </TableCell>
                      <TableCell className="max-w-0">
                        <p className="truncate font-medium">{r.title}</p>
                        <p className="truncate text-xs text-muted-foreground">{r.detail}</p>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        <p>{date(r.deletedAt, true)}</p>
                        {r.deletedBy && <p className="text-xs text-muted-foreground">by {r.deletedBy}</p>}
                      </TableCell>
                      <TableCell className="pr-4">
                        <div className="flex justify-end gap-1.5">
                          {r.href && (
                            <Button asChild size="sm" variant="ghost">
                              <Link to={r.href}>
                                <ArrowSquareOutIcon /> Open
                              </Link>
                            </Button>
                          )}
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => restore([r.id])}>
                            <ArrowCounterClockwiseIcon /> Restore
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </Panel>

      <BulkBar count={sel.count} noun={sel.count === 1 ? l.one : l.many} onClear={sel.clear}>
        <RestoreButton pending={busy} onClick={() => restore(sel.ids)} label={`Restore ${sel.count === 1 ? l.one : l.many}`} />
      </BulkBar>
    </div>
  )
}
