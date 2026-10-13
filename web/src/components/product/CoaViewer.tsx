import { MagnifyingGlassMinusIcon, MagnifyingGlassPlusIcon, SealCheckIcon, XIcon } from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { CoaSheet, pct } from '@/components/product/CoaSheet'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { date } from '@/lib/format'
import type { Coa } from '@/lib/types'
import { cn } from '@/lib/utils'

const ZOOMS = [1, 1.5, 2, 3]

export function docLabel(c: Coa) {
  return c.documentTitle ?? `Lot ${c.lotNumber}`
}

/**
 * View-only certificate viewer. Pages are served as images (never a PDF), with no
 * download or print control; right-click, drag, long-press save and Ctrl+S/P are blocked.
 * A blend product passes several documents and gets one tab per compound.
 */
export function CoaViewer({
  docs,
  productName,
  open,
  onOpenChange,
  initial = 0,
}: {
  docs: Coa[]
  productName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  initial?: number
}) {
  const [active, setActive] = useState(initial)
  const [zoom, setZoom] = useState(0)
  const [page, setPage] = useState(1)
  const scroller = useRef<HTMLDivElement>(null)
  const doc = docs[Math.min(active, docs.length - 1)]

  useEffect(() => {
    if (open) {
      setActive(initial)
      setZoom(0)
    }
  }, [open, initial])

  useEffect(() => {
    setPage(1)
    scroller.current?.scrollTo({ top: 0, left: 0 })
  }, [active])

  // "Page x of y": the page covering the middle of the viewport wins.
  useEffect(() => {
    const root = scroller.current
    if (!open || !root || !doc?.pages.length) return
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setPage(Number((e.target as HTMLElement).dataset.page))
      },
      { root, rootMargin: '-50% 0px -50% 0px' },
    )
    root.querySelectorAll('[data-page]').forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [open, doc])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ['s', 'p'].includes(e.key.toLowerCase())) {
        e.preventDefault()
        toast.info('Certificates are view-only. Contact us if your institution needs a certified copy.')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!doc) return null
  const scale = ZOOMS[zoom]
  const facts = [
    ['Batch', doc.lotNumber],
    doc.mfgDate && ['Manufactured', date(doc.mfgDate)],
    doc.retestDate && ['Retest by', date(doc.retestDate)],
    ['HPLC purity', `${pct(doc.purity)}%`],
  ].filter(Boolean) as [string, string][]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        onContextMenu={(e) => e.preventDefault()}
        className={cn(
          'flex flex-col gap-0 overflow-hidden bg-background p-0 sm:max-w-none',
          'max-sm:inset-0 max-sm:h-dvh max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:ring-0',
          'sm:h-[min(94dvh,1180px)] sm:w-[min(980px,calc(100%-3rem))]',
        )}
      >
        <header className="border-b bg-card px-4 pt-3 pb-3 sm:px-5">
          <div className="flex items-start gap-3">
            <SealCheckIcon weight="duotone" className="mt-0.5 hidden size-9 shrink-0 text-gold-ink sm:block" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[10px] tracking-[0.22em] text-muted-foreground uppercase">Certificate of analysis</p>
              <DialogTitle className="mt-1 truncate font-display text-xl leading-none font-semibold uppercase sm:text-2xl">
                {productName}
                {docs.length > 1 || (doc.documentTitle && doc.documentTitle !== productName) ? (
                  <span className="text-muted-foreground"> / {docLabel(doc)}</span>
                ) : null}
              </DialogTitle>
              <DialogDescription className="sr-only">
                View-only certificate of analysis for batch {doc.lotNumber}, {doc.pages.length || 1} page(s).
              </DialogDescription>
            </div>
            {doc.pages.length > 0 && (
              <div className="hidden items-center rounded-lg border bg-background sm:flex" role="group" aria-label="Zoom">
                <Button variant="ghost" size="icon-sm" disabled={zoom === 0} onClick={() => setZoom((z) => z - 1)} aria-label="Zoom out">
                  <MagnifyingGlassMinusIcon />
                </Button>
                <button type="button" onClick={() => setZoom(0)} className="w-12 text-center font-mono text-xs tabular-nums" aria-label="Fit to width">
                  {Math.round(scale * 100)}%
                </button>
                <Button variant="ghost" size="icon-sm" disabled={zoom === ZOOMS.length - 1} onClick={() => setZoom((z) => z + 1)} aria-label="Zoom in">
                  <MagnifyingGlassPlusIcon />
                </Button>
              </div>
            )}
            <DialogClose asChild>
              <Button variant="ghost" size="icon" className="-mt-1 -mr-2 shrink-0" aria-label="Close">
                <XIcon className="size-5" />
              </Button>
            </DialogClose>
          </div>

          {docs.length > 1 && (
            <div className="scrollbar-none -mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 sm:-mx-5 sm:px-5" role="tablist" aria-label="Certificates">
              {docs.map((d, i) => (
                <button
                  key={d.id}
                  type="button"
                  role="tab"
                  aria-selected={i === active}
                  onClick={() => setActive(i)}
                  className={cn(
                    'shrink-0 rounded-lg border px-3 py-1.5 text-left transition-colors',
                    i === active ? 'border-gold/60 bg-gold/10 text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )}
                >
                  <span className="block text-[13px] leading-tight font-medium">{docLabel(d)}</span>
                  <span className="block font-mono text-[10.5px] leading-tight opacity-75">{pct(d.purity)}% HPLC</span>
                </button>
              ))}
            </div>
          )}

          <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12px]">
            {facts.map(([k, v]) => (
              <div key={k} className="flex gap-1.5">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="font-mono">{v}</dd>
              </div>
            ))}
          </dl>
        </header>

        <div ref={scroller} className="relative min-h-0 flex-1 overflow-auto overscroll-contain bg-muted/60" data-coa-pages>
          {doc.pages.length > 0 ? (
            <div className="mx-auto p-3 sm:p-6" style={{ width: `${scale * 100}%`, maxWidth: scale === 1 ? 900 : undefined }}>
              <div className="grid gap-3 sm:gap-5">
                {doc.pages.map((base, i) => (
                  <CoaPage key={base} base={base} index={i} total={doc.pages.length} sharp={scale > 1} />
                ))}
              </div>
              <p className="mt-4 text-center text-[11.5px] text-muted-foreground">
                View-only copy. Contact us if your institution needs a certified copy of batch {doc.lotNumber}.
              </p>
            </div>
          ) : (
            <div className="mx-auto max-w-lg p-4 sm:p-8">
              <CoaSheet coa={doc} productName={productName} />
            </div>
          )}
        </div>

        {doc.pages.length > 1 && (
          <p className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-foreground/85 px-3 py-1 font-mono text-[11px] text-background tabular-nums shadow-lg">
            Page {page} of {doc.pages.length}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}

function CoaPage({ base, index, total, sharp }: { base: string; index: number; total: number; sharp: boolean }) {
  const [loaded, setLoaded] = useState(false)
  // Phones get the 900 px page; desktop and any zoom get 1700 px.
  const sizes = sharp ? '1700px' : '(max-width: 640px) 100vw, 900px'
  return (
    <div data-page={index + 1} className="relative aspect-[1/1.414] overflow-hidden rounded-sm bg-white shadow-[0_10px_40px_-18px_rgb(0_0_0/0.45)] select-none">
      {!loaded && <div className="absolute inset-0 animate-pulse bg-neutral-100" aria-hidden />}
      <picture>
        <source type="image/avif" srcSet={`${base}-900.avif 900w, ${base}-1700.avif 1700w`} sizes={sizes} />
        <source type="image/webp" srcSet={`${base}-900.webp 900w, ${base}-1700.webp 1700w`} sizes={sizes} />
        <img
          src={`${base}-900.webp`}
          alt={`Certificate page ${index + 1} of ${total}`}
          loading={index === 0 ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
          onLoad={() => setLoaded(true)}
          className={cn('pointer-events-none size-full object-contain transition-opacity duration-300 [-webkit-touch-callout:none]', loaded ? 'opacity-100' : 'opacity-0')}
        />
      </picture>
      {/* Shield: long-press and right-click land here, not on the image. */}
      <div className="absolute inset-0" aria-hidden onContextMenu={(e) => e.preventDefault()} onDragStart={(e) => e.preventDefault()} />
    </div>
  )
}
