import { ArrowSquareOutIcon, CheckCircleIcon, SealCheckIcon } from '@phosphor-icons/react'
import { date } from '@/lib/format'
import type { Coa } from '@/lib/types'
import { cn } from '@/lib/utils'

function passed(v: string) {
  return /pass|confirm|conform/i.test(v)
}

/** A rendered certificate of analysis built from lot data (no screenshots). */
export function CoaSheet({ coa, productName, className, compact = false }: { coa: Coa; productName: string; className?: string; compact?: boolean }) {
  const rows: [string, string][] = [
    ['Purity (HPLC-UV)', `${coa.purity.toFixed(2)}%`],
    ['Identity', coa.identity],
    ...(coa.labeledAmount ? [['Content, labeled', coa.labeledAmount] as [string, string]] : []),
    ...(coa.measuredAmount ? [['Content, measured', coa.measuredAmount] as [string, string]] : []),
    ['Endotoxin', coa.endotoxin],
    ['Microbial', coa.microbial],
    ...(!compact ? [['Heavy metals', coa.heavyMetals] as [string, string]] : []),
    ['Appearance', coa.appearance],
  ]
  return (
    <div className={cn('rounded-xl border bg-card p-5 text-card-foreground shadow-[0_24px_60px_-30px_rgb(0_0_0/0.6)] sm:p-6', className)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] tracking-[0.22em] text-muted-foreground uppercase">Certificate of analysis</p>
          <p className="mt-1.5 font-display text-2xl leading-none font-semibold uppercase">{productName}</p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            Lot {coa.lotNumber}
            {coa.variantLabel ? `, ${coa.variantLabel}` : ''}
          </p>
        </div>
        <SealCheckIcon weight="duotone" className="size-10 shrink-0 text-gold-ink" aria-hidden />
      </div>
      <div className="gold-rule my-4" />
      <dl className="grid gap-y-2 text-[13px]">
        {rows.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[1fr_auto] items-baseline gap-3">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="flex items-center gap-1.5 text-right font-mono text-[12.5px]">
              {passed(v) && <CheckCircleIcon weight="fill" className="size-3.5 text-success" aria-hidden />}
              {v}
            </dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-[11px] text-muted-foreground">
        <span>
          {coa.lab}, tested {date(coa.testedAt)}, {coa.assays} assays
        </span>
        {coa.fileUrl && (
          <a href={coa.fileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-gold-ink hover:underline">
            Original <ArrowSquareOutIcon className="size-3" />
          </a>
        )}
      </div>
    </div>
  )
}
