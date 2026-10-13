import { CheckCircleIcon, FileTextIcon, SealCheckIcon } from '@phosphor-icons/react'
import { Button } from '@/components/ui/button'
import { date } from '@/lib/format'
import type { Coa } from '@/lib/types'
import { cn } from '@/lib/utils'

function passed(v: string) {
  return /pass|confirm|conform|not detected/i.test(v)
}

/** 99.20 -> "99.2", 99.47 -> "99.47" (matches how certificates print purity). */
export function pct(n: number) {
  return String(Number(n.toFixed(2)))
}

/** Certificate summary built from the batch data. Empty values = not on the certificate, so not shown. */
export function CoaSheet({
  coa,
  productName,
  className,
  compact = false,
  onView,
}: {
  coa: Coa
  productName: string
  className?: string
  compact?: boolean
  onView?: () => void
}) {
  const rows = (
    [
      ['Purity (HPLC)', `${pct(coa.purity)}%`],
      ['Identity', coa.identity],
      ['Content, labeled', coa.labeledAmount],
      ['Content, measured', coa.measuredAmount],
      ['Endotoxin', coa.endotoxin],
      ['Microbial', coa.microbial],
      ['Heavy metals', compact ? '' : coa.heavyMetals],
      ['Appearance', coa.appearance],
    ] as [string, string | null][]
  ).filter((r): r is [string, string] => !!r[1])
  const title = coa.documentTitle && coa.documentTitle !== productName ? coa.documentTitle : null
  return (
    <div className={cn('rounded-xl border bg-card p-5 text-card-foreground shadow-[0_24px_60px_-30px_rgb(0_0_0/0.6)] sm:p-6', className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-[10px] tracking-[0.22em] text-muted-foreground uppercase">Certificate of analysis</p>
          <p className="mt-1.5 font-display text-2xl leading-none font-semibold uppercase">{productName}</p>
          {title && <p className="mt-1 text-sm font-medium text-gold-ink">{title}</p>}
          <p className="mt-1 font-mono text-xs break-all text-muted-foreground">
            {coa.pages.length ? 'Batch' : 'Lot'} {coa.lotNumber}
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
      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t pt-3 text-[11px] text-muted-foreground">
        <span>
          {coa.mfgDate ? `Manufactured ${date(coa.mfgDate)}` : `${coa.lab}, tested ${date(coa.testedAt)}`}, {coa.assays} tests
        </span>
        {onView && (
          <Button size="sm" variant="outline" onClick={onView}>
            <FileTextIcon /> {coa.pages.length ? 'View certificate' : 'View summary'}
          </Button>
        )}
      </div>
    </div>
  )
}
