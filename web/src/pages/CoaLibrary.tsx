import { CheckCircleIcon, MagnifyingGlassIcon, SealCheckIcon } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ProductImage } from '@/components/brand/ProductImage'
import { EmptyState, PageHeader } from '@/components/brand/bits'
import { ResearchDisclaimer } from '@/components/layout/SiteFooter'
import { CoaSheet } from '@/components/product/CoaSheet'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { date } from '@/lib/format'
import { useCoas } from '@/lib/queries'
import type { Coa } from '@/lib/types'

const GUIDE = [
  { k: 'Purity', d: 'HPLC-UV separates the sample and reports the share that is the target peptide. We release lots at 99% or higher.' },
  { k: 'Identity', d: 'LC-MS confirms the molecular mass matches the expected sequence, so the vial contains what the label says.' },
  { k: 'Labeled vs measured', d: 'The lab weighs the actual peptide content in the vial and compares it with the label. Overfill is normal.' },
  { k: 'Safety screens', d: 'Endotoxin, microbial and heavy-metal panels must all pass before a lot is released for sale.' },
]

export default function CoaLibrary() {
  const [params, setParams] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const [debounced, setDebounced] = useState(q)
  const [open, setOpen] = useState<Coa | null>(null)

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(q.trim())
      setParams(q.trim() ? { q: q.trim() } : {}, { replace: true })
    }, 250)
    return () => clearTimeout(t)
  }, [q, setParams])

  const coas = useCoas(debounced || undefined)

  return (
    <>
      <PageHeader title="COA library" intro="Every KYVO lot is tested by an independent ISO/IEC 17025 laboratory before it ships. Search a compound or the lot number printed on your vial.">
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
            placeholder="Try the short name, like BPC or NAD, or a lot number"
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
        ) : coas.data && coas.data.length > 0 ? (
          <>
            <p className="mb-5 font-mono text-xs text-muted-foreground">{coas.data.length} certificates</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {coas.data.map((c) => (
                <article key={c.id} className="flex flex-col rounded-xl border bg-card p-5">
                  <div className="flex items-center gap-3">
                    <ProductImage src={c.product?.image} alt={c.product?.name ?? ''} sizes="48px" className="size-12 shrink-0 rounded-lg" />
                    <div className="min-w-0">
                      <Link to={`/shop/${c.product?.slug}`} className="block truncate font-display text-xl leading-none font-semibold uppercase hover:text-gold-ink">
                        {c.product?.name}
                      </Link>
                      <p className="mt-1 font-mono text-[12px] text-muted-foreground">Lot {c.lotNumber}</p>
                    </div>
                  </div>
                  <div className="mt-5 flex items-end justify-between gap-3">
                    <div>
                      <p className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">HPLC purity</p>
                      <p className="display mt-1 text-5xl">{c.purity.toFixed(2)}%</p>
                    </div>
                    {c.labeledAmount && c.measuredAmount && (
                      <div className="text-right font-mono text-[12px]">
                        <p className="text-muted-foreground">Labeled {c.labeledAmount}</p>
                        <p>Measured {c.measuredAmount}</p>
                      </div>
                    )}
                  </div>
                  <ul className="mt-4 flex flex-wrap gap-1.5">
                    {[
                      ['Identity', c.identity],
                      ['Endotoxin', c.endotoxin],
                      ['Microbial', c.microbial],
                    ].map(([k, v]) => (
                      <li key={k} className="inline-flex items-center gap-1 rounded-md bg-surface px-2 py-1 text-[11.5px]">
                        <CheckCircleIcon weight="fill" className="size-3.5 text-success" /> {k} {/pass|confirm/i.test(v) ? 'passed' : v}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto flex items-center justify-between gap-3 border-t pt-4 text-[12px] text-muted-foreground">
                    <span>
                      Tested {date(c.testedAt)}, {c.assays} assays
                    </span>
                    <Button size="sm" variant="outline" onClick={() => setOpen(c)}>
                      View certificate
                    </Button>
                  </div>
                </article>
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

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-[calc(100%-2rem)] border-0 bg-transparent p-0 shadow-none sm:max-w-lg">
          <DialogTitle className="sr-only">Certificate for lot {open?.lotNumber}</DialogTitle>
          {open && <CoaSheet coa={open} productName={open.product?.name ?? ''} />}
        </DialogContent>
      </Dialog>
      <ResearchDisclaimer />
    </>
  )
}
