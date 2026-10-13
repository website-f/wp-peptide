import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { ArrowCounterClockwiseIcon, CheckIcon, DownloadSimpleIcon, EnvelopeSimpleIcon, PaperPlaneTiltIcon, TrayIcon, UsersIcon } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { EmptyState } from '@/components/brand/bits'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { api, errorMessage } from '@/lib/api'
import { date, num, relative } from '@/lib/format'
import { cn } from '@/lib/utils'
import { CopyButton, ErrorState, Num, PageHeader, Panel, Pill, RowsSkeleton, SearchInput, Segmented } from '../components/kit'
import type { ContactMessage, Subscriber } from '../lib/types'
import { useInvalidateAdmin } from '../lib/utils'

type Tab = 'messages' | 'subscribers'
type Filter = 'open' | 'handled' | 'all'

export default function Inbox() {
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'subscribers' ? 'subscribers' : 'messages'

  const messages = useQuery({ queryKey: ['admin', 'messages'], queryFn: () => api.get<ContactMessage[]>('/api/admin/messages') })
  const subscribers = useQuery({ queryKey: ['admin', 'subscribers'], queryFn: () => api.get<Subscriber[]>('/api/admin/subscribers') })

  const unhandled = messages.data?.filter((m) => !m.handled).length ?? 0

  return (
    <div className="space-y-6">
      <PageHeader title="Inbox" description="Messages sent through the contact form, and people who joined the newsletter." />

      <Tabs
        value={tab}
        onValueChange={(v) => {
          const next = new URLSearchParams(params)
          if (v === 'messages') next.delete('tab')
          else next.set('tab', v)
          setParams(next, { replace: true })
        }}
        className="gap-4"
      >
        <TabsList className="h-9">
          <TabsTrigger value="messages" className="px-3">
            <EnvelopeSimpleIcon />
            Messages
            {unhandled > 0 && <span className="rounded-md bg-gold/15 px-1.5 font-mono text-[11px] text-gold-ink tabular-nums">{num(unhandled)}</span>}
          </TabsTrigger>
          <TabsTrigger value="subscribers" className="px-3">
            <UsersIcon />
            Newsletter
            {subscribers.data && <span className="font-mono text-[11px] text-muted-foreground tabular-nums">{num(subscribers.data.length)}</span>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="messages">
          <Messages q={messages} unhandled={unhandled} />
        </TabsContent>
        <TabsContent value="subscribers">
          <Subscribers q={subscribers} />
        </TabsContent>
      </Tabs>
    </div>
  )
}

function Messages({ q, unhandled }: { q: UseQueryResult<ContactMessage[]>; unhandled: number }) {
  const [filter, setFilter] = useState<Filter>('open')
  const all = q.data ?? []
  const rows = all.filter((m) => (filter === 'all' ? true : filter === 'open' ? !m.handled : m.handled))

  return (
    <div className="space-y-4">
      <Segmented
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'open', label: 'Needs reply', count: unhandled },
          { value: 'handled', label: 'Handled', count: all.length - unhandled },
          { value: 'all', label: 'All', count: all.length },
        ]}
      />
      {q.isError ? (
        <ErrorState error={q.error} onRetry={() => q.refetch()} />
      ) : q.isPending ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<TrayIcon />}
          title={filter === 'open' ? 'All caught up' : 'No messages'}
          body={
            filter === 'open'
              ? 'Every message has been handled. New ones from the contact form show up here.'
              : 'Messages from the contact form on the shop show up here.'
          }
          action={
            filter === 'open' && all.length > 0 ? (
              <Button variant="outline" size="sm" onClick={() => setFilter('all')}>
                See all messages
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="space-y-3">
          {rows.map((m) => (
            <MessageCard key={m.id} m={m} />
          ))}
        </div>
      )}
    </div>
  )
}

function mailtoFor(m: ContactMessage) {
  const subject = `Re: ${m.topic}${m.orderRef ? ` (order ${m.orderRef})` : ''}`
  const quoted = m.message
    .split('\n')
    .map((l) => `> ${l}`)
    .join('\n')
  const body = `Hi ${m.name.split(' ')[0]},\n\n\n\nOn ${date(m.createdAt, true)}, ${m.name} wrote:\n${quoted}`
  return `mailto:${encodeURIComponent(m.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

function MessageCard({ m }: { m: ContactMessage }) {
  const invalidate = useInvalidateAdmin()
  const [busy, setBusy] = useState(false)

  async function setHandled(handled: boolean) {
    setBusy(true)
    try {
      await api.patch(`/api/admin/messages/${m.id}`, { handled })
      await invalidate()
      toast.success(handled ? 'Marked as handled' : 'Moved back to needs reply')
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <article className={cn('min-w-0 rounded-xl border bg-card', !m.handled && 'border-gold/30')}>
      <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 pt-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {!m.handled && <span className="size-2 shrink-0 rounded-full bg-gold" aria-label="Needs reply" />}
            <p className="truncate font-medium">{m.name}</p>
            <Pill tone="neutral" dot={false}>
              {m.topic}
            </Pill>
            {m.handled && <Pill tone="success">Handled</Pill>}
          </div>
          <div className="mt-0.5 flex min-w-0 items-center gap-1 text-sm text-muted-foreground">
            <a href={`mailto:${m.email}`} className="truncate hover:text-foreground hover:underline">
              {m.email}
            </a>
            <CopyButton text={m.email} label="Copy email" className="size-6" />
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 text-xs text-muted-foreground">
          <time dateTime={m.createdAt} title={date(m.createdAt, true)}>
            {relative(m.createdAt)}
          </time>
          {m.orderRef && (
            <Link to={`/admin/orders?q=${encodeURIComponent(m.orderRef)}`} className="rounded-md border px-1.5 py-0.5 font-mono text-foreground tabular-nums hover:bg-muted">
              {m.orderRef}
            </Link>
          )}
        </div>
      </header>
      <p className="px-4 py-3 text-sm leading-relaxed break-words whitespace-pre-wrap">{m.message}</p>
      <footer className="flex flex-wrap items-center gap-2 border-t px-4 py-2.5">
        <Button asChild size="sm" variant={m.handled ? 'outline' : 'default'}>
          <a href={mailtoFor(m)}>
            <PaperPlaneTiltIcon />
            Reply by email
          </a>
        </Button>
        {m.handled ? (
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => setHandled(false)}>
            <ArrowCounterClockwiseIcon />
            Mark as not handled
          </Button>
        ) : (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => setHandled(true)}>
            <CheckIcon />
            Mark handled
          </Button>
        )}
      </footer>
    </article>
  )
}

function Subscribers({ q }: { q: UseQueryResult<Subscriber[]> }) {
  const [search, setSearch] = useState('')
  const all = useMemo(() => q.data ?? [], [q.data])
  const rows = useMemo(() => {
    const t = search.trim().toLowerCase()
    return t ? all.filter((s) => s.email.toLowerCase().includes(t)) : all
  }, [all, search])

  return (
    <Panel
      title="Newsletter"
      description={q.data ? `${num(all.length)} ${all.length === 1 ? 'person has' : 'people have'} signed up` : 'People who signed up for emails'}
      action={
        all.length > 0 ? (
          <Button asChild variant="outline" size="sm">
            <a href="/api/admin/subscribers.csv" target="_blank" rel="noreferrer">
              <DownloadSimpleIcon />
              Export CSV
            </a>
          </Button>
        ) : undefined
      }
      flush
    >
      {q.isError ? (
        <div className="p-4">
          <ErrorState error={q.error} onRetry={() => q.refetch()} />
        </div>
      ) : q.isPending ? (
        <RowsSkeleton rows={5} cols={2} />
      ) : all.length === 0 ? (
        <div className="p-4">
          <EmptyState icon={<UsersIcon />} title="No subscribers yet" body="People who join the newsletter from the shop footer show up here. Export them as a CSV for your email tool." />
        </div>
      ) : (
        <>
          <div className="border-b p-3">
            <SearchInput value={search} onChange={setSearch} placeholder="Search emails" className="sm:max-w-xs" />
          </div>
          {rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">No emails match "{search}".</p>
          ) : (
            <ul className="divide-y">
              {rows.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="flex min-w-0 items-center gap-1">
                    <a href={`mailto:${s.email}`} className="truncate text-sm hover:underline">
                      {s.email}
                    </a>
                    <CopyButton text={s.email} label="Copy email" className="size-6 shrink-0" />
                  </div>
                  <Num className="shrink-0 text-xs text-muted-foreground">{date(s.createdAt)}</Num>
                </li>
              ))}
            </ul>
          )}
          {search && rows.length > 0 && (
            <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">
              Showing <Num>{num(rows.length)}</Num> of <Num>{num(all.length)}</Num>
            </p>
          )}
        </>
      )}
    </Panel>
  )
}
