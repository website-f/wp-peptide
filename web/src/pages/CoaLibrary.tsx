import { CheckCircleIcon, FileTextIcon, MagnifyingGlassIcon, SealCheckIcon } from '@phosphor-icons/react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ProductImage } from '@/components/brand/ProductImage'
import { EmptyState, PageHeader } from '@/components/brand/bits'
import { ResearchDisclaimer } from '@/components/layout/SiteFooter'
import { pct } from '@/components/product/CoaSheet'
import { CoaViewer, docLabel } from '@/components/product/CoaViewer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { groupByProduct, lotWord, viewerOrder } from '@/lib/coa'
import { date, plural } from '@/lib/format'
import { useCoas } from '@/lib/queries'
import type { Coa } from '@/lib/types'
import { useSeo } from '@/lib/seo'

const GUIDE = [
  { k: 'Purity (HPLC)', d: 'HPLC separates the sample and reports the share that is the target compound. Every batch we list is above 99%.' },
  { k: 'Identity', d: 'Mass spectrometry, and on most certificates HPLC retention and amino-acid analysis, confirm the compound matches its expected structure.' },
  { k: 'Batch and dates', d: 'The batch number ties the certificate to the material in your vial. The manufacture and retest dates show how fresh the batch is.' },
  { k: 'Safety screens', d: 'Endotoxin, microbial and heavy-metal results are shown where the certificate includes them. Open the certificate for the full panel.' },
]

export default function CoaLibrary() {
  useSeo({ title: 'COA library', description: 'Read the certificate of analysis for every KYVO batch online: HPLC purity, identity tests and the full lab report, free and view-only.' })
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const [debounced, setDebounced] = useState(q)
  const [open, setOpen] = useState<{ docs: Coa[]; name: string } | null>(null)

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(q.trim())
      setParams(q.trim() ? { q: q.trim() } : {}, { replace: true })
    }, 250)
    return () => clearTimeout(t)
  }, [q, setParams])

  const coas = useCoas(debounced || undefined)
  const groups = useMemo(
    () =>
      groupByProduct(coas.data ?? []).map((g) => {
        const { current, history } = viewerOrder(g.docs, g.product.name)
        return { ...g, current, docs: [...current, ...history] }
      }),
    [coas.data],
  )

  return (
    <>
      <PageHeader title="COA library" intro="Every batch we sell has its certificate of analysis here, view-only and in full. Search a compound or the batch number printed on your vial.">
        <div className="relative mt-8 max-w-xl">
          <MagnifyingGlassIcon className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-muted-foreground" />
          <label htmlFor="coa-search" className="sr-only">
            Search certificates
          </label>
          <Input
            id="coa-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Try a short name like BPC or NAD, or a batch number"
            className="h-14 pl-12 text-base"
          />
        </div>
      </PageHeader>

      <section className="container-x pb-16">
        {coas.isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-64 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : groups.length > 0 ? (
          <>
            <p className="mb-5 font-mono text-xs text-muted-foreground">
              {plural(coas.data?.length ?? 0, 'certificate')} across {plural(groups.length, 'product')}
            </p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {groups.map((g) => (
                <CoaCard key={g.product.slug} product={g.product} docs={g.docs} current={g.current} onView={() => setOpen({ docs: g.docs, name: g.product.name })} />
              ))}
            </div>
          </>
        ) : (
          <EmptyState
            icon={<SealCheckIcon />}
            title="No certificates found"
            body="Check the lot number on your vial label, or search the compound's short name."
            action={
              <Button variant="outline" onClick={() => setQ('')}>
                Show all certificates
              </Button>
            }
          />
        )}
      </section>

      <section className="border-t bg-surface">
        <div className="container-x py-16 md:py-20">
          <h2 className="display text-4xl sm:text-5xl">Reading a certificate</h2>
          <dl className="mt-10 grid gap-x-10 gap-y-8 md:grid-cols-2">
            {GUIDE.map((g) => (
              <div key={g.k} className="border-l-2 border-gold/50 pl-5">
                <dt className="font-display text-2xl font-semibold uppercase">{g.k}</dt>
                <dd className="mt-2 max-w-[52ch] text-muted-foreground">{g.d}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <CoaViewer docs={open?.docs ?? []} productName={open?.name ?? ''} open={!!open} onOpenChange={(o) => !o && setOpen(null)} />
      <ResearchDisclaimer />
    </>
  )
}

function CoaCard({ product, docs, current, onView }: { product: NonNullable<Coa['product']>; docs: Coa[]; current: Coa[]; onView: () => void }) {
  const lead = current[0]
  const checks = [
    ['Identity', lead.identity],
    ['Endotoxin', lead.endotoxin],
    ['Microbial', lead.microbial],
  ].filter(([, v]) => v)
  return (
    <article className="flex flex-col rounded-xl border bg-card p-5">
      <div className="flex items-center gap-3">
        <ProductImage src={product.image} alt={product.name} sizes="48px" className="size-12 shrink-0 rounded-lg" />
        <div className="min-w-0">
          <Link to={`/shop/${product.slug}`} className="block truncate font-display text-xl leading-none font-semibold uppercase hover:text-gold-ink">
            {product.name}
          </Link>
          <p className="mt-1 truncate font-mono text-[12px] text-muted-foreground">
            {current.length > 1 ? `${current.length} certificates, one per compound` : `${lotWord(lead)} ${lead.lotNumber}`}
          </p>
        </div>
      </div>
      {current.length > 1 ? (
        <ul className="mt-5 grid gap-2">
          {current.map((d) => (
            <li key={d.id} className="flex items-baseline justify-between gap-3 rounded-lg bg-surface px-3 py-2">
              <span className="min-w-0">
                <span className="block truncate text-[13.5px] font-medium">{docLabel(d)}</span>
                <span className="block truncate font-mono text-[11px] text-muted-foreground">
                  {lotWord(d)} {d.lotNumber}
                </span>
              </span>
              <span className="shrink-0 font-mono text-lg text-gold-ink">{pct(d.purity)}%</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-5 flex items-end justify-between gap-3">
          <div>
            <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">HPLC purity</p>
            <p className="display mt-1 text-5xl">{pct(lead.purity)}%</p>
          </div>
          {lead.labeledAmount && lead.measuredAmount && (
            <div className="text-right font-mono text-[12px]">
              <p className="text-muted-foreground">Labeled {lead.labeledAmount}</p>
              <p>Measured {lead.measuredAmount}</p>
            </div>
          )}
        </div>
      )}
      <ul className="mt-4 flex flex-wrap gap-1.5">
        {checks.map(([k, v]) => (
          <li key={k} className="inline-flex items-center gap-1 rounded-md bg-surface px-2 py-1 text-[11.5px]">
            <CheckCircleIcon weight="fill" className="size-3.5 text-success" /> {k} {/pass|confirm|conform/i.test(v) ? 'passed' : v}
          </li>
        ))}
      </ul>
      <div className="mt-auto flex items-center justify-between gap-3 border-t pt-4 text-[12px] text-muted-foreground">
        <span>{lead.mfgDate ? `Made ${date(lead.mfgDate)}` : `Tested ${date(lead.testedAt)}`}</span>
        <Button size="sm" variant="outline" onClick={onView}>
          <FileTextIcon /> {docs.length > 1 ? `View ${docs.length} certificates` : 'View certificate'}
        </Button>
      </div>
    </article>
  )
}
