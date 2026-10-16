import { ReceiptIcon } from '@phosphor-icons/react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { EmptyState } from '@/components/brand/bits'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/lib/api'
import { date, moneyExact, plural, relative } from '@/lib/format'
import { cn } from '@/lib/utils'
import { ErrorState, Num, OrderStatusBadge, PageHeader, Pager, Panel, Pill, RowsSkeleton, SearchInput, Segmented } from '../components/kit'
import { ArchiveButton, BulkBar, SelectBox, useArchive, useSelection } from '../components/bulk'
import type { OrderKind, OrderList, OrderStatus } from '../lib/types'
import { useLicensed } from '../lib/queries'
import { kindLabel, orderKinds, paymentLabel, useDebounced } from '../lib/utils'

type Filter = 'ALL' | 'PENDING_PAYMENT' | 'OPEN' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'REFUNDED'

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'ALL', label: 'All' },
  { value: 'PENDING_PAYMENT', label: 'Awaiting payment' },
  { value: 'OPEN', label: 'To fulfil' },
  { value: 'SHIPPED', label: 'Shipped' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'REFUNDED', label: 'Refunded' },
]

const HINT: Partial<Record<Filter, string>> = {
  PENDING_PAYMENT: 'Customers have placed these but not paid. Stock is held for them. Cancel old ones to release stock.',
  OPEN: 'Paid orders waiting to be packed and shipped. Oldest first is a good habit.',
  SHIPPED: 'With the courier. Mark as delivered once the customer has received it, which also approves partner commission.',
}

const PAGE_SIZE = 25

function countFor(f: Filter, counts: Partial<Record<OrderStatus, number>>) {
  const c = (s: OrderStatus) => counts[s] ?? 0
  if (f === 'ALL') return Object.values(counts).reduce((a, b) => a + (b ?? 0), 0)
  if (f === 'OPEN') return c('PAID') + c('PROCESSING')
  return c(f)
}

export default function Orders() {
  const [params, setParams] = useSearchParams()
  const navigate = useNavigate()
  const status = (FILTERS.some((f) => f.value === params.get('status')) ? params.get('status') : 'ALL') as Filter
  const licensed = useLicensed()
  const kinds = orderKinds(licensed.membership)
  const rawKind = params.get('kind') as OrderKind | null
  const kind: OrderKind | 'ALL' = rawKind && kinds.includes(rawKind) ? rawKind : 'ALL'
  const page = Math.max(1, Number(params.get('page')) || 1)
  const issue = params.get('issue') === 'payment' ? 'payment' : undefined
  const [search, setSearch] = useState(params.get('q') ?? '')
  const q = useDebounced(search.trim(), 300)

  function update(next: Record<string, string | null>) {
    const p = new URLSearchParams(params)
    for (const [k, v] of Object.entries(next)) {
      if (v === null || v === '' || v === 'ALL') p.delete(k)
      else p.set(k, v)
    }
    if (!('page' in next)) p.delete('page')
    setParams(p, { replace: true })
  }

  useEffect(() => {
    if ((params.get('q') ?? '') !== q) update({ q })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q])

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['admin', 'orders', { status, kind, q, page, issue }],
    queryFn: () =>
      api.get<OrderList>('/api/admin/orders', {
        status: status === 'ALL' ? undefined : status,
        kind: kind === 'ALL' ? undefined : kind,
        q: q || undefined,
        issue,
        page,
        pageSize: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  })

  const filtered = Boolean(q) || kind !== 'ALL'
  const sel = useSelection(data?.rows.map((o) => o.id) ?? [])
  const archive = useArchive('orders', sel.clear)

  return (
    <div className="space-y-4">
      <PageHeader title="Orders" description="Every order placed in the store. Click an order to update its status, add tracking or refund it." />

      <Segmented
        value={status}
        onChange={(v) => update({ status: v })}
        options={FILTERS.map((f) => ({ ...f, count: data ? countFor(f.value, data.counts) : undefined }))}
      />

      {HINT[status] && <p className="text-sm text-muted-foreground">{HINT[status]}</p>}
      {issue && (
        <p className="flex flex-wrap items-center gap-2 rounded-md border border-warning/40 bg-warning/5 px-3 py-2 text-sm">
          Showing orders with a payment issue: an extra payment to refund, or a bill paid short.
          <button type="button" className="text-gold-ink hover:underline" onClick={() => update({ issue: null })}>
            Show all orders
          </button>
        </p>
      )}

      <Panel flush>
        <div className="flex flex-col gap-2 border-b p-3 sm:flex-row sm:items-center">
          <SearchInput value={search} onChange={setSearch} placeholder="Search order number, name, email or tracking" className="flex-1" />
          <Select value={kind} onValueChange={(v) => update({ kind: v })}>
            <SelectTrigger className="w-full data-[size=default]:h-9 sm:w-44" aria-label="Order type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="end">
              <SelectItem value="ALL">All order types</SelectItem>
              {kinds.map((k) => (
                <SelectItem key={k} value={k}>
                  {kindLabel(k, licensed.membership)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {error && !data ? (
          <div className="p-4">
            <ErrorState error={error} onRetry={() => refetch()} />
          </div>
        ) : isLoading || !data ? (
          <RowsSkeleton rows={8} cols={6} />
        ) : data.rows.length === 0 ? (
          <div className="p-4">
            <EmptyState
              icon={<ReceiptIcon />}
              title={filtered ? 'No matching orders' : 'No orders here'}
              body={filtered ? 'Try a different search or order type.' : 'Orders in this status will show up here.'}
              action={
                filtered || status !== 'ALL' ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearch('')
                      setParams(new URLSearchParams(), { replace: true })
                    }}
                  >
                    Show all orders
                  </Button>
                ) : undefined
              }
            />
          </div>
        ) : (
          <div className={isFetching ? 'opacity-70 transition-opacity' : 'transition-opacity'}>
            {/* Phone: stacked cards */}
            <ul className="divide-y md:hidden">
              {data.rows.map((o) => (
                <li key={o.id} className={cn('flex items-start gap-3 pl-4', sel.has(o.id) && 'bg-gold/5')}>
                  <SelectBox className="pt-3.5" checked={sel.has(o.id)} onChange={() => sel.toggle(o.id)} label={`Select order ${o.number}`} />
                  <Link to={`/admin/orders/${o.id}`} className="block min-w-0 flex-1 py-3 pr-4 active:bg-muted/50">
                    <div className="flex items-center justify-between gap-3">
                      <Num className="text-sm font-medium">{o.number}</Num>
                      <Num className="text-sm font-medium">{moneyExact(o.totalCents)}</Num>
                    </div>
                    <div className="mt-1 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                      <span className="truncate">{o.name}</span>
                      <span className="shrink-0">{relative(o.createdAt)}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <OrderStatusBadge status={o.status} />
                      {o.kind !== 'STANDARD' && <Pill dot={false}>{kindLabel(o.kind, licensed.membership)}</Pill>}
                      {o.partner && (
                        <Pill tone="gold" dot={false}>
                          via {o.partner}
                        </Pill>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>

            {/* Tablet and up: table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-10 pl-4">
                      <SelectBox checked={sel.all} indeterminate={sel.some} onChange={sel.toggleAll} label="Select all orders on this page" />
                    </TableHead>
                    <TableHead className="text-xs text-muted-foreground">Order</TableHead>
                    <TableHead className="text-xs text-muted-foreground">Placed</TableHead>
                    <TableHead className="text-xs text-muted-foreground">Customer</TableHead>
                    <TableHead className="text-xs text-muted-foreground">Status</TableHead>
                    <TableHead className="hidden text-xs text-muted-foreground lg:table-cell">Type</TableHead>
                    <TableHead className="hidden text-xs text-muted-foreground xl:table-cell">Payment</TableHead>
                    <TableHead className="pr-4 text-right text-xs text-muted-foreground">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((o) => (
                    <TableRow key={o.id} className={cn('cursor-pointer', sel.has(o.id) && 'bg-gold/5')} onClick={() => navigate(`/admin/orders/${o.id}`)}>
                      <TableCell className="w-10 pl-4">
                        <SelectBox checked={sel.has(o.id)} onChange={() => sel.toggle(o.id)} label={`Select order ${o.number}`} />
                      </TableCell>
                      <TableCell>
                        <Link
                          to={`/admin/orders/${o.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="font-mono font-medium tabular-nums hover:text-gold-ink"
                        >
                          {o.number}
                        </Link>
                        <p className="text-xs text-muted-foreground">{plural(o.itemCount, 'item')}</p>
                      </TableCell>
                      <TableCell>
                        <p>{date(o.createdAt)}</p>
                        <p className="text-xs text-muted-foreground">{relative(o.createdAt)}</p>
                      </TableCell>
                      <TableCell className="max-w-56">
                        <p className="truncate">{o.name}</p>
                        <p className="truncate text-xs text-muted-foreground">{o.email}</p>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-1">
                          <OrderStatusBadge status={o.status} />
                          {o.partner && <span className="text-[11px] text-muted-foreground">Partner: {o.partner}</span>}
                        </div>
                      </TableCell>
                      <TableCell className="hidden text-muted-foreground lg:table-cell">{kindLabel(o.kind, licensed.membership)}</TableCell>
                      <TableCell className="hidden text-muted-foreground xl:table-cell">{paymentLabel(o.paymentMethod)}</TableCell>
                      <TableCell className="pr-4 text-right">
                        <Num className="font-medium">{moneyExact(o.totalCents)}</Num>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <div className="border-t">
              <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={(p) => update({ page: String(p) })} />
            </div>
          </div>
        )}
      </Panel>
      <BulkBar count={sel.count} noun={sel.count === 1 ? 'order' : 'orders'} onClear={sel.clear}>
        <ArchiveButton onClick={() => archive.ask(sel.ids)} />
      </BulkBar>
      {archive.dialog}
    </div>
  )
}
