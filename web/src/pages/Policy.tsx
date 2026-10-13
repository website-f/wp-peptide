import { FileTextIcon } from '@phosphor-icons/react'
import { useEffect, useMemo } from 'react'
import { Link, NavLink, useParams } from 'react-router'
import { buildPolicies, policyVars } from '@/components/account/policyContent'
import { EmptyState } from '@/components/brand/bits'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { date } from '@/lib/format'
import { useSettings } from '@/lib/queries'
import { cn } from '@/lib/utils'

export default function Policy() {
  const { slug } = useParams()
  const settings = useSettings()
  const policies = useMemo(() => buildPolicies(policyVars(settings.data)), [settings.data])
  const doc = policies.find((p) => p.slug === slug)

  useEffect(() => {
    if (doc) document.title = `${doc.title} | KYVO Labs`
  }, [doc])

  if (!doc)
    return (
      <div className="container-x py-16 md:py-24">
        <EmptyState
          icon={<FileTextIcon />}
          title="Policy not found"
          body="That page does not exist. These are the policies we publish:"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {policies.map((p) => (
                <Button key={p.slug} asChild variant="outline" className="h-11">
                  <Link to={`/policies/${p.slug}`}>{p.short}</Link>
                </Button>
              ))}
            </div>
          }
        />
      </div>
    )

  return (
    <div className="pb-20">
      {/* Mobile policy switcher */}
      <nav aria-label="Policies" className="sticky top-16 z-30 border-b bg-background/85 backdrop-blur-xl lg:hidden">
        <ul className="scrollbar-none container-x flex gap-1.5 overflow-x-auto py-2.5">
          {policies.map((p) => (
            <li key={p.slug} className="shrink-0">
              <NavLink
                to={`/policies/${p.slug}`}
                className={({ isActive }) =>
                  cn(
                    'inline-flex h-11 items-center rounded-md px-3.5 text-sm font-medium whitespace-nowrap transition-colors',
                    isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )
                }
              >
                {p.short}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="container-x grid gap-10 pt-10 md:pt-14 lg:grid-cols-[240px_minmax(0,1fr)] lg:gap-16">
        <aside className="hidden lg:block">
          <nav aria-label="Policies" className="sticky top-28">
            <p className="font-display text-sm font-semibold tracking-[0.14em] text-muted-foreground uppercase">Policies</p>
            <ul className="mt-3 grid gap-0.5 border-l">
              {policies.map((p) => {
                const active = p.slug === doc.slug
                return (
                  <li key={p.slug}>
                    <Link
                      to={`/policies/${p.slug}`}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        '-ml-px flex min-h-10 items-center border-l-2 pl-4 text-sm transition-colors',
                        active ? 'border-gold font-medium text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
                      )}
                    >
                      {p.title}
                    </Link>
                    {active && (
                      <ul className="mb-2 grid gap-0.5 pl-4">
                        {doc.sections.map((s) => (
                          <li key={s.id}>
                            <a href={`#${s.id}`} className="block py-1 pl-3 text-[13px] text-muted-foreground transition-colors hover:text-gold-ink">
                              {s.heading}
                            </a>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
          </nav>
        </aside>

        <article className="min-w-0 max-w-[68ch]">
          <header>
            <h1 className="display text-5xl sm:text-6xl md:text-7xl">{doc.title}</h1>
            <p className="mt-3 font-mono text-xs text-muted-foreground uppercase">Last updated {date(`${doc.updated}T00:00:00`)}</p>
            <p className="mt-6 text-lg leading-relaxed text-muted-foreground">{doc.intro}</p>
          </header>

          {settings.isPending ? (
            <div className="mt-10 grid gap-3" aria-busy aria-label="Loading policy">
              <Skeleton className="h-7 w-1/2" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-11/12" />
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="mt-6 h-7 w-2/5" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ) : (
            <>
              {settings.isError && (
                <p role="status" className="mt-6 rounded-md border bg-surface px-4 py-3 text-sm text-muted-foreground">
                  Some store figures could not be loaded, so they are described in general terms below. Refresh to try again.
                </p>
              )}
              <div className="mt-4">
                {doc.sections.map((s, i) => (
                  <section key={s.id} id={s.id} aria-labelledby={`${s.id}-h`} className="scroll-mt-32 border-t pt-8 mt-8 first:mt-6 first:border-t-0 first:pt-0">
                    <h2 id={`${s.id}-h`} className="flex items-baseline gap-3 font-display text-3xl font-semibold uppercase">
                      <span className="font-mono text-xs font-normal text-gold-ink tabular-nums">{String(i + 1).padStart(2, '0')}</span>
                      {s.heading}
                    </h2>
                    <div className="mt-3 grid gap-4 text-[15px] leading-relaxed text-foreground/85 [&_a]:text-gold-ink [&_a]:underline [&_a]:underline-offset-2 [&_li]:pl-1 [&_strong]:font-medium [&_strong]:text-foreground [&_ul]:grid [&_ul]:list-disc [&_ul]:gap-2 [&_ul]:pl-5 [&_ul]:marker:text-gold-ink">
                      {s.body}
                    </div>
                  </section>
                ))}
              </div>
            </>
          )}

          <footer className="mt-14 rounded-xl border bg-surface/60 p-5 text-sm text-muted-foreground">
            Questions about this policy?{' '}
            {settings.data ? (
              <a href={`mailto:${settings.data.supportEmail}`} className="text-gold-ink underline underline-offset-2">
                {settings.data.supportEmail}
              </a>
            ) : (
              <Link to="/contact" className="text-gold-ink underline underline-offset-2">
                Contact us
              </Link>
            )}
          </footer>
        </article>
      </div>
    </div>
  )
}
