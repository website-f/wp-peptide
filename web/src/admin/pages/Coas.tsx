import {
  ArrowSquareOutIcon,
  CertificateIcon,
  EyeIcon,
  CircleNotchIcon,
  FileImageIcon,
  FilePdfIcon,
  PencilSimpleIcon,
  PlusIcon,
  TrashIcon,
  UploadSimpleIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { EmptyState, Purity } from '@/components/brand/bits'
import { ProductImage } from '@/components/brand/ProductImage'
import { CoaViewer } from '@/components/product/CoaViewer'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api, errorMessage } from '@/lib/api'
import { date } from '@/lib/format'
import type { Coa } from '@/lib/types'
import { cn } from '@/lib/utils'
import { ConfirmDialog, ErrorState, Field, Num, NumberInput, PageHeader, Panel, Pill, RowsSkeleton, SearchInput, TextInput } from '../components/kit'
import type { AdminCoa, AdminProduct } from '../lib/types'
import { isoDay, useInvalidateAdmin } from '../lib/utils'

const ALL = 'all'
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024

type CoaForm = {
  productId: string
  lotNumber: string
  documentTitle: string
  mfgDate: string
  retestDate: string
  variantLabel: string
  purity: string
  labeledAmount: string
  measuredAmount: string
  identity: string
  endotoxin: string
  microbial: string
  heavyMetals: string
  appearance: string
  lab: string
  assays: string
  testedAt: string
  /** Legacy original-file link (admin only). New uploads become view-only pages. */
  fileUrl: string | null
  pages: string[]
}

/** Defaults mirror coaSchema in api/src/routes/admin/catalog.ts. */
const blankForm = (productId = ''): CoaForm => ({
  productId,
  lotNumber: '',
  documentTitle: '',
  mfgDate: '',
  retestDate: '',
  variantLabel: '',
  purity: '',
  labeledAmount: '',
  measuredAmount: '',
  identity: 'Conforms (HPLC, MS)',
  endotoxin: 'Conforms',
  microbial: 'Conforms',
  heavyMetals: '',
  appearance: 'White powder',
  lab: 'Manufacturer batch QC',
  assays: '13',
  testedAt: isoDay(new Date()),
  fileUrl: null,
  pages: [],
})

const fromCoa = (c: AdminCoa): CoaForm => ({
  productId: c.product.id,
  lotNumber: c.lotNumber,
  documentTitle: c.documentTitle ?? '',
  mfgDate: c.mfgDate?.slice(0, 10) ?? '',
  retestDate: c.retestDate?.slice(0, 10) ?? '',
  variantLabel: c.variantLabel ?? '',
  purity: String(c.purity),
  labeledAmount: c.labeledAmount ?? '',
  measuredAmount: c.measuredAmount ?? '',
  identity: c.identity,
  endotoxin: c.endotoxin,
  microbial: c.microbial,
  heavyMetals: c.heavyMetals,
  appearance: c.appearance,
  lab: c.lab,
  assays: String(c.assays),
  // Stored as midnight UTC, so the date part is the tested day.
  testedAt: c.testedAt.slice(0, 10),
  fileUrl: c.fileUrl,
  pages: c.pages,
})

const orNull = (s: string) => (s.trim() === '' ? null : s.trim())

function validate(f: CoaForm) {
  const e: Record<string, string> = {}
  if (!f.productId) e.productId = 'Choose the product this certificate is for'
  if (!f.lotNumber.trim()) e.lotNumber = 'Add the lot or batch number'
  const p = Number(f.purity)
  if (f.purity.trim() === '' || !Number.isFinite(p) || p < 0 || p > 100) e.purity = 'Enter a purity between 0 and 100'
  const a = Number(f.assays)
  if (!Number.isInteger(a) || a < 1 || a > 30) e.assays = 'Use a whole number from 1 to 30'
  if (!f.testedAt) e.testedAt = 'Pick the report date'
  if (f.mfgDate && f.retestDate && f.retestDate <= f.mfgDate) e.retestDate = 'The retest date comes after the manufacture date'
  return e
}

function toPayload(f: CoaForm) {
  return {
    productId: f.productId,
    lotNumber: f.lotNumber.trim(),
    documentTitle: orNull(f.documentTitle),
    mfgDate: f.mfgDate || null,
    retestDate: f.retestDate || null,
    variantLabel: orNull(f.variantLabel),
    purity: Number(f.purity),
    labeledAmount: orNull(f.labeledAmount),
    measuredAmount: orNull(f.measuredAmount),
    identity: f.identity.trim(),
    endotoxin: f.endotoxin.trim(),
    microbial: f.microbial.trim(),
    heavyMetals: f.heavyMetals.trim(),
    appearance: f.appearance.trim(),
    lab: f.lab.trim(),
    assays: Number(f.assays),
    testedAt: f.testedAt,
    fileUrl: f.fileUrl,
    pages: f.pages,
  }
}

/** "KY-GLP3RT-1026A" style hint, based on the product name and this month. */
function lotHint(name: string | undefined) {
  if (!name) return 'e.g. KY-BPC157-1026A'
  const base = name.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 10)
  const d = new Date()
  return `e.g. KY-${base}-${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getFullYear()).slice(2)}A`
}

const isPdf = (url: string) => url.toLowerCase().endsWith('.pdf')

/** The storefront viewer's shape, from a saved row. */
const asViewerDoc = (c: AdminCoa): Coa => ({ ...c, product: undefined })

type DialogState = { open: boolean; coa: AdminCoa | null; productId?: string; key: number }

export default function Coas() {
  const invalidate = useInvalidateAdmin()
  const [params, setParams] = useSearchParams()
  const productFilter = params.get('product') ?? ALL
  const [q, setQ] = useState('')
  const [dialog, setDialog] = useState<DialogState>({ open: false, coa: null, key: 0 })
  const [deleting, setDeleting] = useState<AdminCoa | null>(null)
  const [preview, setPreview] = useState<AdminCoa | null>(null)

  const coasQuery = useQuery({ queryKey: ['admin', 'coas'], queryFn: () => api.get<AdminCoa[]>('/api/admin/coas') })
  const productsQuery = useQuery({ queryKey: ['admin', 'products'], queryFn: () => api.get<AdminProduct[]>('/api/admin/products') })
  const coas = useMemo(() => coasQuery.data ?? [], [coasQuery.data])
  const products = useMemo(() => [...(productsQuery.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)), [productsQuery.data])

  const openNew = (productId?: string) => setDialog((d) => ({ open: true, coa: null, productId, key: d.key + 1 }))
  const openEdit = (coa: AdminCoa) => setDialog((d) => ({ open: true, coa, key: d.key + 1 }))

  // Deep link from the product editor: /admin/coas?product=ID&new=1
  useEffect(() => {
    if (params.get('new')) {
      openNew(params.get('product') ?? undefined)
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete('new')
          return next
        },
        { replace: true },
      )
    }
  }, [])

  const setProductFilter = (v: string) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (v === ALL) next.delete('product')
        else next.set('product', v)
        return next
      },
      { replace: true },
    )

  const countByProduct = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of coas) m.set(c.product.id, (m.get(c.product.id) ?? 0) + 1)
    return m
  }, [coas])

  const missing = useMemo(() => products.filter((p) => p.status === 'ACTIVE' && p.form !== 'SUPPLY' && !countByProduct.has(p.id)), [products, countByProduct])

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase()
    return coas.filter((c) => {
      if (productFilter !== ALL && c.product.id !== productFilter) return false
      if (!term) return true
      return c.product.name.toLowerCase().includes(term) || c.lotNumber.toLowerCase().includes(term)
    })
  }, [coas, q, productFilter])

  const remove = async () => {
    if (!deleting) return
    await api.del(`/api/admin/coas/${deleting.id}`)
    invalidate()
    toast.success(`Certificate ${deleting.lotNumber} deleted`)
  }

  const filtered = q.trim() !== '' || productFilter !== ALL
  const head = 'text-xs font-medium text-muted-foreground'

  return (
    <div>
      <PageHeader
        title="COA library"
        description="Certificates of analysis from your lab. Each one appears on its product page and in the public COA library, so customers can check the purity of every batch."
        meta={
          missing.length > 0 ? (
            <Pill tone="warning">
              {missing.length} live {missing.length === 1 ? 'product has' : 'products have'} no certificate
            </Pill>
          ) : undefined
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <a href="/coa-library" target="_blank" rel="noreferrer">
                <ArrowSquareOutIcon />
                Public library
              </a>
            </Button>
            <Button onClick={() => openNew(productFilter !== ALL ? productFilter : undefined)}>
              <PlusIcon weight="bold" />
              Add certificate
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput value={q} onChange={setQ} placeholder="Search product or lot number" className="w-full sm:w-72" />
        <Select value={productFilter} onValueChange={setProductFilter}>
          <SelectTrigger className="w-full data-[size=default]:h-9 sm:w-64" aria-label="Filter by product">
            <SelectValue placeholder="All products" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All products</SelectItem>
            <SelectSeparator />
            {products.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                <span className="truncate">{p.name}</span>
                <span className="ml-auto font-mono text-xs text-muted-foreground tabular-nums">{countByProduct.get(p.id) ?? 0}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {coasQuery.isError ? (
        <ErrorState error={coasQuery.error} onRetry={() => coasQuery.refetch()} />
      ) : coasQuery.isPending ? (
        <Panel flush>
          <RowsSkeleton rows={8} cols={6} />
        </Panel>
      ) : coas.length === 0 ? (
        <EmptyState
          icon={<CertificateIcon />}
          title="No certificates yet"
          body="Add the lab report for each batch you sell. Customers see the purity and test results on the product page."
          action={
            <Button onClick={() => openNew()}>
              <PlusIcon weight="bold" />
              Add certificate
            </Button>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<CertificateIcon />}
          title="Nothing matches"
          body={
            productFilter !== ALL && !q.trim()
              ? 'This product has no certificates yet.'
              : filtered
                ? 'No certificates match this search or filter.'
                : undefined
          }
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setQ('')
                  setProductFilter(ALL)
                }}
              >
                Clear filters
              </Button>
              {productFilter !== ALL && (
                <Button onClick={() => openNew(productFilter)}>
                  <PlusIcon weight="bold" />
                  Add certificate
                </Button>
              )}
            </div>
          }
        />
      ) : (
        <>
          {/* Phones */}
          <div className="grid gap-2.5 md:hidden">
            {rows.map((c) => (
              <div key={c.id} className="rounded-xl border bg-card p-3">
                <button type="button" onClick={() => openEdit(c)} className="flex w-full min-w-0 items-start gap-3 text-left">
                  <ProductImage src={c.product.image} alt="" sizes="48px" className="size-12 shrink-0 rounded-md border [&_svg]:size-5" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate font-medium">{c.product.name}</p>
                      <Purity value={c.purity} className="shrink-0" />
                    </div>
                    <Num className="block truncate text-sm">{c.lotNumber}</Num>
                    {c.documentTitle && <p className="truncate text-xs text-gold-ink">{c.documentTitle}</p>}
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {c.variantLabel ? `${c.variantLabel}, ` : ''}tested {date(c.testedAt)}
                    </p>
                  </div>
                </button>
                <div className="mt-3 flex items-center justify-between gap-2 border-t pt-2.5">
                  <PagesLink coa={c} onPreview={() => setPreview(c)} />
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>
                      <PencilSimpleIcon />
                      Edit
                    </Button>
                    <Button size="icon-sm" variant="ghost" className="text-muted-foreground hover:text-destructive" aria-label="Delete certificate" onClick={() => setDeleting(c)}>
                      <TrashIcon />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Tablet and up */}
          <Panel flush className="hidden md:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className={head}>Product</TableHead>
                  <TableHead className={head}>Batch</TableHead>
                  <TableHead className={head}>Size</TableHead>
                  <TableHead className={cn(head, 'text-right')}>Purity</TableHead>
                  <TableHead className={head}>Tested</TableHead>
                  <TableHead className={cn(head, 'hidden xl:table-cell')}>Lab</TableHead>
                  <TableHead className={head}>Certificate</TableHead>
                  <TableHead className="w-20">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => (
                  <TableRow key={c.id} className="cursor-pointer" onClick={() => openEdit(c)}>
                    <TableCell className="max-w-0 min-w-48 py-2.5">
                      <div className="flex min-w-0 items-center gap-3">
                        <ProductImage src={c.product.image} alt="" sizes="36px" className="size-9 shrink-0 rounded-md border [&_svg]:size-4" />
                        <Link
                          to={`/admin/products/${c.product.id}`}
                          onClick={(e) => e.stopPropagation()}
                          className="truncate font-medium hover:text-gold-ink focus-visible:underline"
                        >
                          {c.product.name}
                        </Link>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Num className="text-sm whitespace-nowrap">{c.lotNumber}</Num>
                      {c.documentTitle && <span className="block text-xs text-gold-ink">{c.documentTitle}</span>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{c.variantLabel || <span className="text-muted-foreground">All sizes</span>}</TableCell>
                    <TableCell className="text-right">
                      <Purity value={c.purity} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      <Num className="text-sm">{date(c.testedAt)}</Num>
                    </TableCell>
                    <TableCell className="hidden max-w-48 xl:table-cell">
                      <span className="block truncate text-muted-foreground">{c.lab}</span>
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <PagesLink coa={c} onPreview={() => setPreview(c)} />
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex justify-end gap-0.5">
                        <Button size="icon-sm" variant="ghost" aria-label={`Edit ${c.lotNumber}`} title="Edit" onClick={() => openEdit(c)}>
                          <PencilSimpleIcon />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          className="text-muted-foreground hover:text-destructive"
                          aria-label={`Delete ${c.lotNumber}`}
                          title="Delete"
                          onClick={() => setDeleting(c)}
                        >
                          <TrashIcon />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Panel>
        </>
      )}

      <CoaDialog
        key={dialog.key}
        state={dialog}
        products={products}
        productsLoading={productsQuery.isPending}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
      />

      <CoaViewer
        docs={preview ? [asViewerDoc(preview)] : []}
        productName={preview?.product.name ?? ''}
        open={!!preview}
        onOpenChange={(o) => !o && setPreview(null)}
      />

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this certificate?"
        description={
          deleting
            ? `Lot ${deleting.lotNumber} for ${deleting.product.name} will be removed from the product page and the public COA library. This cannot be undone.`
            : undefined
        }
        confirmLabel="Delete certificate"
        onConfirm={remove}
      />
    </div>
  )
}

function PagesLink({ coa, onPreview }: { coa: AdminCoa; onPreview: () => void }) {
  if (coa.pages.length)
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onPreview()
        }}
        className="inline-flex items-center gap-1.5 rounded-md text-sm whitespace-nowrap text-gold-ink hover:underline"
      >
        <EyeIcon className="size-4" />
        {coa.pages.length} {coa.pages.length === 1 ? 'page' : 'pages'}
      </button>
    )
  if (!coa.fileUrl) return <span className="text-xs whitespace-nowrap text-muted-foreground">Summary only</span>
  // Older uploads kept the original file, which customers no longer see. Re-upload to publish pages.
  const Icon = isPdf(coa.fileUrl) ? FilePdfIcon : FileImageIcon
  return (
    <a
      href={coa.fileUrl}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className="inline-flex items-center gap-1.5 rounded-md text-sm whitespace-nowrap text-muted-foreground hover:underline"
      title="Not shown to customers. Upload it again to publish view-only pages."
    >
      <Icon className="size-4" />
      Old file
    </a>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="grid min-w-0 gap-3">
      <legend className="mb-3 font-mono text-[11px] tracking-[0.16em] text-muted-foreground uppercase">{title}</legend>
      {children}
    </fieldset>
  )
}

function CoaDialog({
  state,
  products,
  productsLoading,
  onOpenChange,
}: {
  state: DialogState
  products: AdminProduct[]
  productsLoading: boolean
  onOpenChange: (open: boolean) => void
}) {
  const invalidate = useInvalidateAdmin()
  const editing = state.coa
  const [form, setForm] = useState<CoaForm>(() => (editing ? fromCoa(editing) : blankForm(state.productId)))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  const product = products.find((p) => p.id === form.productId)
  const sizes = useMemo(() => [...new Set((product?.variants ?? []).map((v) => v.label))], [product])

  const set = (p: Partial<CoaForm>) => {
    setForm((f) => ({ ...f, ...p }))
    const keys = Object.keys(p)
    setErrors((e) => {
      if (!keys.some((k) => k in e)) return e
      const next = { ...e }
      for (const k of keys) delete next[k]
      return next
    })
  }

  const save = useMutation({
    mutationFn: (f: CoaForm) => (editing ? api.put(`/api/admin/coas/${editing.id}`, toPayload(f)) : api.post('/api/admin/coas', toPayload(f))),
    onSuccess: () => {
      invalidate()
      toast.success(editing ? 'Certificate updated' : 'Certificate added')
      onOpenChange(false)
    },
    onError: (e) => {
      const msg = errorMessage(e)
      setServerError(msg)
      toast.error(msg)
    },
  })

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (save.isPending) return
    setServerError(null)
    const errs = validate(form)
    setErrors(errs)
    if (Object.keys(errs).length) {
      requestAnimationFrame(() => formRef.current?.querySelector('[role="alert"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
      return
    }
    save.mutate(form)
  }

  const upload = async (file: File | undefined) => {
    if (!file) return
    if (file.type !== 'application/pdf' && !file.type.startsWith('image/')) {
      toast.error('Upload a PDF or a photo of the certificate')
      return
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error('That file is larger than 15 MB')
      return
    }
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const r = await api.post<{ pages: string[] }>('/api/admin/uploads/certificate', fd)
      set({ pages: r.pages, fileUrl: null })
      toast.success(r.pages.length === 1 ? 'Certificate uploaded (1 page)' : `Certificate uploaded (${r.pages.length} pages)`)
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setUploading(false)
    }
  }

  const busy = save.isPending || uploading

  return (
    <Dialog open={state.open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[90dvh] gap-0 overflow-y-auto p-0 sm:max-w-2xl">
        <form ref={formRef} onSubmit={submit} noValidate>
          <DialogHeader className="border-b px-4 py-4 pr-12 sm:px-5">
            <DialogTitle className="font-display text-xl font-semibold tracking-wide uppercase">
              {editing ? 'Edit certificate' : 'Add certificate'}
            </DialogTitle>
            <DialogDescription>
              {editing ? (
                <>
                  Lot <Num>{editing.lotNumber}</Num> for {editing.product.name}
                </>
              ) : (
                'Copy the figures from the lab report. Most results are prefilled with the usual values.'
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-6 px-4 py-5 sm:px-5">
            {serverError && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm" role="alert">
                <WarningCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
                <span className="min-w-0 break-words">{serverError}</span>
              </div>
            )}

            <Section title="Batch">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Product" htmlFor="coa-product" error={errors.productId} className="sm:col-span-2">
                  <Select value={form.productId || undefined} onValueChange={(productId) => set({ productId })} disabled={productsLoading}>
                    <SelectTrigger id="coa-product" className="w-full data-[size=default]:h-9" aria-invalid={!!errors.productId}>
                      <SelectValue placeholder={productsLoading ? 'Loading products...' : 'Choose a product'} />
                    </SelectTrigger>
                    <SelectContent>
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                          {p.status !== 'ACTIVE' && <span className="text-xs text-muted-foreground">({p.status === 'DRAFT' ? 'Draft' : 'Archived'})</span>}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Batch number" htmlFor="coa-lot" error={errors.lotNumber} hint="The batch code printed on the certificate and vial label.">
                  <TextInput
                    id="coa-lot"
                    value={form.lotNumber}
                    onChange={(e) => set({ lotNumber: e.target.value.toUpperCase() })}
                    placeholder={lotHint(product?.name)}
                    maxLength={60}
                    spellCheck={false}
                    autoComplete="off"
                    className="font-mono"
                    aria-invalid={!!errors.lotNumber}
                  />
                </Field>
                <Field
                  label="Compound"
                  htmlFor="coa-title"
                  optional
                  hint="For blends, add one certificate per compound (e.g. Retatrutide and Cagrilintide)."
                >
                  <TextInput
                    id="coa-title"
                    value={form.documentTitle}
                    onChange={(e) => set({ documentTitle: e.target.value })}
                    placeholder={product?.name ?? 'As printed on the certificate'}
                    maxLength={80}
                  />
                </Field>
                <Field label="Manufactured" htmlFor="coa-mfg" optional>
                  <TextInput id="coa-mfg" type="date" value={form.mfgDate} onChange={(e) => set({ mfgDate: e.target.value })} className="font-mono" />
                </Field>
                <Field label="Retest by" htmlFor="coa-retest" optional error={errors.retestDate}>
                  <TextInput
                    id="coa-retest"
                    type="date"
                    value={form.retestDate}
                    onChange={(e) => set({ retestDate: e.target.value })}
                    className="font-mono"
                    aria-invalid={!!errors.retestDate}
                  />
                </Field>
                <Field label="Report date" htmlFor="coa-date" error={errors.testedAt}>
                  <TextInput
                    id="coa-date"
                    type="date"
                    value={form.testedAt}
                    max={isoDay(new Date())}
                    onChange={(e) => set({ testedAt: e.target.value })}
                    className="font-mono"
                    aria-invalid={!!errors.testedAt}
                  />
                </Field>
                <Field label="Size" htmlFor="coa-size" optional hint="Leave blank if the batch covers every size." className="sm:col-span-2">
                  <TextInput
                    id="coa-size"
                    value={form.variantLabel}
                    onChange={(e) => set({ variantLabel: e.target.value })}
                    list="coa-size-options"
                    placeholder={sizes[0] ? `e.g. ${sizes[0]}` : 'e.g. 10mg'}
                    maxLength={40}
                    autoComplete="off"
                  />
                  <datalist id="coa-size-options">
                    {sizes.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                  {sizes.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {sizes.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => set({ variantLabel: s, ...(form.labeledAmount.trim() ? {} : { labeledAmount: s }) })}
                          className={cn(
                            'h-7 rounded-md border px-2.5 font-mono text-xs tabular-nums transition-colors',
                            form.variantLabel === s ? 'border-gold/40 bg-gold/10 text-gold-ink' : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                          )}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </Field>
              </div>
            </Section>

            <Section title="Results">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Purity" htmlFor="coa-purity" error={errors.purity} info="The HPLC purity figure from the report. Shown as a badge on the product page.">
                  <NumberInput
                    id="coa-purity"
                    value={form.purity}
                    onChange={(purity) => set({ purity })}
                    suffix="%"
                    step="0.01"
                    min={0}
                    max={100}
                    placeholder="99.50"
                    aria-invalid={!!errors.purity}
                  />
                </Field>
                <Field label="Labelled amount" htmlFor="coa-labeled" optional>
                  <TextInput
                    id="coa-labeled"
                    value={form.labeledAmount}
                    onChange={(e) => set({ labeledAmount: e.target.value })}
                    placeholder="10mg"
                    maxLength={40}
                    className="font-mono"
                  />
                </Field>
                <Field label="Measured amount" htmlFor="coa-measured" optional>
                  <TextInput
                    id="coa-measured"
                    value={form.measuredAmount}
                    onChange={(e) => set({ measuredAmount: e.target.value })}
                    placeholder="10.06mg"
                    maxLength={40}
                    className="font-mono"
                  />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Identity" htmlFor="coa-identity">
                  <TextInput id="coa-identity" value={form.identity} onChange={(e) => set({ identity: e.target.value })} maxLength={80} />
                </Field>
                <Field label="Appearance" htmlFor="coa-appearance">
                  <TextInput id="coa-appearance" value={form.appearance} onChange={(e) => set({ appearance: e.target.value })} maxLength={120} />
                </Field>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="Endotoxin" htmlFor="coa-endo">
                  <TextInput id="coa-endo" value={form.endotoxin} onChange={(e) => set({ endotoxin: e.target.value })} maxLength={40} />
                </Field>
                <Field label="Microbial" htmlFor="coa-micro">
                  <TextInput id="coa-micro" value={form.microbial} onChange={(e) => set({ microbial: e.target.value })} maxLength={40} />
                </Field>
                <Field label="Heavy metals" htmlFor="coa-metals">
                  <TextInput id="coa-metals" value={form.heavyMetals} onChange={(e) => set({ heavyMetals: e.target.value })} maxLength={40} />
                </Field>
              </div>
            </Section>

            <Section title="Lab">
              <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
                <Field label="Lab name" htmlFor="coa-lab">
                  <TextInput id="coa-lab" value={form.lab} onChange={(e) => set({ lab: e.target.value })} maxLength={120} />
                </Field>
                <Field label="Number of tests" htmlFor="coa-assays" error={errors.assays}>
                  <NumberInput
                    id="coa-assays"
                    value={form.assays}
                    onChange={(assays) => set({ assays })}
                    min={1}
                    max={30}
                    step="1"
                    inputMode="numeric"
                    aria-invalid={!!errors.assays}
                  />
                </Field>
              </div>

              <div className="grid gap-1.5">
                <p className="text-[13px] font-medium">
                  Certificate <span className="text-xs font-normal text-muted-foreground">(PDF or photo, up to 15 MB)</span>
                </p>
                <input
                  ref={fileInput}
                  type="file"
                  accept="application/pdf,image/*"
                  className="sr-only"
                  tabIndex={-1}
                  onChange={(e) => {
                    void upload(e.target.files?.[0])
                    e.target.value = ''
                  }}
                />
                {uploading ? (
                  <div className="flex h-14 items-center gap-2 rounded-md border bg-surface px-3 text-sm text-muted-foreground" role="status">
                    <CircleNotchIcon className="size-4 animate-spin" />
                    Uploading and preparing pages...
                  </div>
                ) : form.pages.length ? (
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-md border bg-surface p-2.5">
                    <button type="button" onClick={() => setPreviewing(true)} className="flex min-w-0 items-center gap-3 text-left">
                      <span className="flex -space-x-4">
                        {form.pages.slice(0, 3).map((b) => (
                          <img key={b} src={`${b}-900.webp`} alt="" className="h-14 w-10 rounded-sm border bg-white object-cover object-top shadow-sm" />
                        ))}
                      </span>
                      <span className="min-w-0 text-sm">
                        <span className="block text-gold-ink hover:underline">Preview as customers see it</span>
                        <span className="block text-xs text-muted-foreground">{form.pages.length === 1 ? '1 page' : `${form.pages.length} pages`}, view-only</span>
                      </span>
                    </button>
                    <div className="flex gap-1">
                      <Button type="button" size="sm" variant="ghost" onClick={() => fileInput.current?.click()}>
                        Replace
                      </Button>
                      <Button type="button" size="sm" variant="ghost" className="hover:text-destructive" onClick={() => set({ pages: [] })}>
                        Remove
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => fileInput.current?.click()}
                    onDragOver={(e) => {
                      if (e.dataTransfer.types.includes('Files')) e.preventDefault()
                    }}
                    onDrop={(e) => {
                      e.preventDefault()
                      void upload(e.dataTransfer.files[0])
                    }}
                    className="flex min-h-14 items-center justify-center gap-2 rounded-md border border-dashed bg-surface/50 px-3 py-3 text-sm text-muted-foreground transition-colors hover:border-gold/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <UploadSimpleIcon className="size-4" />
                    Upload the certificate
                  </button>
                )}
                {!form.pages.length && form.fileUrl && (
                  <p className="text-xs leading-snug text-muted-foreground">
                    This record has an older file that customers cannot see.{' '}
                    <a href={form.fileUrl} target="_blank" rel="noreferrer" className="text-gold-ink underline">
                      Open it
                    </a>{' '}
                    and upload it again to publish it.
                  </p>
                )}
                <p className="text-xs leading-snug text-muted-foreground">
                  PDFs become compressed page images. Customers view them on the product page and in the COA library, with no download or print button.
                  Leave a result above blank if the certificate does not test it; blank rows are hidden.
                </p>
              </div>
            </Section>
          </div>

          <DialogFooter className="sticky bottom-0 m-0 rounded-b-xl bg-popover/95 backdrop-blur sm:px-5">
            <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              {save.isPending && <CircleNotchIcon className="animate-spin" />}
              {save.isPending ? 'Saving...' : editing ? 'Save changes' : 'Add certificate'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
      <CoaViewer
        docs={[
          {
            ...toPayload(form),
            id: editing?.id ?? 'draft',
            assays: Number(form.assays) || 0,
            purity: Number(form.purity) || 0,
            testedAt: form.testedAt,
          } as Coa,
        ]}
        productName={product?.name ?? 'Certificate'}
        open={previewing}
        onOpenChange={setPreviewing}
      />
    </Dialog>
  )
}
