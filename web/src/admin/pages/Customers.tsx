import { HandshakeIcon, ShieldCheckIcon, UsersIcon } from '@phosphor-icons/react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { EmptyState } from '@/components/brand/bits'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/lib/api'
import { date, money, num, relative } from '@/lib/format'
import {
  AffiliateStatusBadge,
  ErrorState,
  Num,
  PageHeader,
  Pager,
  Panel,
  Pill,
  RowsSkeleton,
  SearchInput,
  TierBadge,
} from '../components/kit'
import { useLicensed } from '../lib/queries'
import type { CustomerRow, Paged, Tier } from '../lib/types'
import { TIER_LABEL, useDebounced } from '../lib/utils'

const PAGE_SIZE = 20
const TIERS: Tier[] = ['MEMBER', 'INSIDER', 'VIP', 'FOUNDER']

function AdminChip() {
  return (
    <Pill tone="gold" dot={false} className="gap-1">
      <ShieldCheckIcon className="size-3" weight="fill" />
      Admin
    </Pill>
  )
}

function PartnerChip({ partner }: { partner: NonNullable<CustomerRow['partner']> }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <HandshakeIcon className="size-3.5 text-muted-foreground" aria-label="Partner" />
      <AffiliateStatusBadge status={partner.status} />
    </span>
  )
}

export default function Customers() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  // Tiers only exist while the membership add-on is licensed and switched on.
  const { membershipOn: membership } = useLicensed()
  const tierParam = params.get('tier')
  const tier = membership && TIERS.includes(tierParam as Tier) ? (tierParam as Tier) : null
  const page = Math.max(1, Number(params.get('page')) || 1)

  const [search, setSearch] = useState(q)
  const debounced = useDebounced(search.trim(), 300)

  // Keep the box in step when the URL changes from outside (back button).
  useEffect(() => {
    if (q !== debounced) setSearch(q)
  }, [q])

  useEffect(() => {
    if (debounced === q) return
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (debounced) next.set('q', debounced)
        else next.delete('q')
        next.delete('page')
        return next
      },
      { replace: true },
    )
  }, [debounced])

  const update = (key: string, value: string | null) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value) next.set(key, value)
      else next.delete(key)
      if (key !== 'page') next.delete('page')
      return next
    })

  const query = useQuery({
    queryKey: ['admin', 'customers', { q, tier, page }],
    queryFn: () => api.get<Paged<CustomerRow>>('/api/admin/customers', { q, tier, page, pageSize: PAGE_SIZE }),
    placeholderData: keepPreviousData,
  })

  const rows = query.data?.rows ?? []
  const filtered = Boolean(q || tier)

  return (
    <div>
      <PageHeader
        title="Customers"
        description={
          membership
            ? 'Everyone with an account. Open a customer to change their membership tier, adjust points or give admin access.'
            : 'Everyone with an account. Open a customer to adjust points or give admin access.'
        }
      />

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder="Search name, email or phone" className="sm:max-w-sm sm:flex-1" />
        {membership && (
        <Select value={tier ?? 'ALL'} onValueChange={(v) => update('tier', v === 'ALL' ? null : v)}>
          <SelectTrigger className="w-full data-[size=default]:h-9 sm:w-44" aria-label="Filter by tier">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All tiers</SelectItem>
            {TIERS.map((t) => (
              <SelectItem key={t} value={t}>
                {TIER_LABEL[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        )}
        {query.data && (
          <p className="text-sm text-muted-foreground sm:ml-auto">
            <Num>{num(query.data.total)}</Num> {query.data.total === 1 ? 'customer' : 'customers'}
          </p>
        )}
      </div>

      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : query.isPending ? (
        <Panel flush>
          <RowsSkeleton rows={8} cols={6} />
        </Panel>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<UsersIcon />}
          title={filtered ? 'No matches' : 'No customers yet'}
          body={filtered ? membership ? 'Nobody matches this search or tier. Try a different spelling or clear the filters.' : 'Nobody matches this search. Try a different spelling or clear the search.' : 'Customers appear here once they create an account or place an order.'}
          action={
            filtered ? (
              <Button
                variant="outline"
                onClick={() => {
                  setSearch('')
                  setParams({})
                }}
              >
                Clear filters
              </Button>
            ) : undefined
          }
        />
      ) : (
        <Panel flush className={query.isPlaceholderData ? 'opacity-70 transition-opacity' : undefined}>
          {/* Phone: stacked cards */}
          <ul className="divide-y md:hidden">
            {rows.map((c) => (
              <li key={c.id}>
                <Link to={`/admin/customers/${c.id}`} className="block px-4 py-3.5 transition-colors hover:bg-muted/40">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{c.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{c.email}</p>
                    </div>
                    <Num className="shrink-0 text-sm font-medium">{money(c.spentCents)}</Num>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {membership && <TierBadge tier={c.tier} />}
                    {c.role === 'ADMIN' && <AdminChip />}
                    {c.partner && <PartnerChip partner={c.partner} />}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span>
                      <Num className="text-foreground">{num(c.orders)}</Num> {c.orders === 1 ? 'order' : 'orders'}
                    </span>
                    <span>
                      <Num className="text-foreground">{num(c.pointsBalance)}</Num> pts
                    </span>
                    <span>{c.lastOrderAt ? `Last order ${relative(c.lastOrderAt)}` : 'No orders yet'}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {/* Desktop: table */}
          <div className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="pl-4 text-xs font-medium text-muted-foreground">Customer</TableHead>
                  {membership && <TableHead className="text-xs font-medium text-muted-foreground">Tier</TableHead>}
                  <TableHead className="text-right text-xs font-medium text-muted-foreground">Orders</TableHead>
                  <TableHead className="text-right text-xs font-medium text-muted-foreground">Spent</TableHead>
                  <TableHead className="text-right text-xs font-medium text-muted-foreground">Points</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Joined</TableHead>
                  <TableHead className="text-xs font-medium text-muted-foreground">Last order</TableHead>
                  <TableHead className="pr-4 text-xs font-medium text-muted-foreground">Partner</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => (
                  <TableRow key={c.id} className="cursor-pointer" onClick={() => navigate(`/admin/customers/${c.id}`)}>
                    <TableCell className="max-w-72 pl-4">
                      <div className="flex min-w-0 items-center gap-2">
                        <Link
                          to={`/admin/customers/${c.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="truncate font-medium hover:underline"
                        >
                          {c.name}
                        </Link>
                        {c.role === 'ADMIN' && <AdminChip />}
                      </div>
                      <p className="truncate text-xs text-muted-foreground">{c.email}</p>
                    </TableCell>
                    {membership && (
                      <TableCell>
                        <TierBadge tier={c.tier} />
                      </TableCell>
                    )}
                    <TableCell className="text-right">
                      <Num>{num(c.orders)}</Num>
                    </TableCell>
                    <TableCell className="text-right">
                      <Num>{money(c.spentCents)}</Num>
                    </TableCell>
                    <TableCell className="text-right">
                      <Num className={c.pointsBalance ? undefined : 'text-muted-foreground'}>{num(c.pointsBalance)}</Num>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{date(c.createdAt)}</TableCell>
                    <TableCell className="text-muted-foreground">{c.lastOrderAt ? relative(c.lastOrderAt) : 'Never'}</TableCell>
                    <TableCell className="pr-4">{c.partner ? <PartnerChip partner={c.partner} /> : <span className="text-muted-foreground">-</span>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="border-t">
            <Pager page={page} pageSize={PAGE_SIZE} total={query.data?.total ?? 0} onPage={(p) => update('page', p > 1 ? String(p) : null)} />
          </div>
        </Panel>
      )}
    </div>
  )
}
