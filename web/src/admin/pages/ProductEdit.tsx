import {
  ArrowSquareOutIcon,
  CertificateIcon,
  CircleNotchIcon,
  ImageSquareIcon,
  PlusIcon,
  StarIcon,
  TrashIcon,
  UploadSimpleIcon,
  WarningCircleIcon,
  XIcon,
} from '@phosphor-icons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react'
import { Link, useBlocker, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { Purity } from '@/components/brand/bits'
import { ProductImage } from '@/components/brand/ProductImage'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ApiError, api, errorMessage } from '@/lib/api'
import { date, money, num, relative } from '@/lib/format'
import { cn } from '@/lib/utils'
import {
  ConfirmDialog,
  DefRow,
  ErrorState,
  Field,
  MoneyInput,
  Num,
  NumberInput,
  PageHeader,
  Panel,
  ProductStatusBadge,
  TextInput,
} from '../components/kit'
import { useAdminCategories } from '../lib/queries'
import type { AdminCategory, AdminProduct, ProductForm, ProductStatus } from '../lib/types'
import { PRODUCT_STATUS, centsToInput, slugify, toCents, useInvalidateAdmin } from '../lib/utils'

// ---------- Draft model ----------

type VariantDraft = {
  key: string
  id?: string
  label: string
  sku: string
  price: string
  cost: string
  stock: string
  active: boolean
  /** SKU follows the product slug and size label until the owner types their own. */
  skuAuto: boolean
}

type Draft = {
  name: string
  slug: string
  tagline: string
  description: string
  form: ProductForm
  categoryId: string | null
  status: ProductStatus
  featured: boolean
  boxEligible: boolean
  sortOrder: string
  image: string | null
  gallery: string[]
  purity: string
  casNumber: string
  molecularFormula: string
  molecularWeight: string
  sequence: string
  storage: string
  variants: VariantDraft[]
}

type Errors = Record<string, string>

const MAX_GALLERY = 12
const MAX_UPLOAD_BYTES = 15 * 1024 * 1024
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const FORMS: { value: ProductForm; label: string }[] = [
  { value: 'VIAL', label: 'Vial' },
  { value: 'MIST', label: 'Nasal mist' },
  { value: 'SUPPLY', label: 'Supply / accessory' },
]
const NO_CATEGORY = '__none'

let keySeq = 0
const newKey = () => `new-${++keySeq}`

function autoSku(slug: string, label: string) {
  const base = slug.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 14)
  const size = label.replace(/[^a-z0-9]/gi, '').toUpperCase()
  if (!base || !size) return ''
  return `KY-${base}-${size}`
}

const emptyVariant = (slug: string): VariantDraft => ({
  key: newKey(),
  label: '',
  sku: autoSku(slug, ''),
  price: '',
  cost: '',
  stock: '0',
  active: true,
  skuAuto: true,
})

function emptyDraft(): Draft {
  return {
    name: '',
    slug: '',
    tagline: '',
    description: '',
    form: 'VIAL',
    categoryId: null,
    status: 'DRAFT',
    featured: false,
    boxEligible: true,
    sortOrder: '0',
    image: null,
    gallery: [],
    purity: '',
    casNumber: '',
    molecularFormula: '',
    molecularWeight: '',
    sequence: '',
    storage: '',
    variants: [{ ...emptyVariant(''), key: 'new-initial' }],
  }
}

function fromProduct(p: AdminProduct): Draft {
  return {
    name: p.name,
    slug: p.slug,
    tagline: p.tagline ?? '',
    description: p.description ?? '',
    form: p.form,
    categoryId: p.categoryId,
    status: p.status,
    featured: p.featured,
    boxEligible: p.boxEligible,
    sortOrder: String(p.sortOrder ?? 0),
    image: p.image,
    gallery: p.gallery ?? [],
    purity: p.purity === null || p.purity === undefined ? '' : String(p.purity),
    casNumber: p.casNumber ?? '',
    molecularFormula: p.molecularFormula ?? '',
    molecularWeight: p.molecularWeight ?? '',
    sequence: p.sequence ?? '',
    storage: p.storage ?? '',
    variants: [...p.variants]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((v) => ({
        key: v.id,
        id: v.id,
        label: v.label,
        sku: v.sku,
        price: centsToInput(v.priceCents),
        cost: centsToInput(v.costCents),
        stock: String(v.stock),
        active: v.active,
        skuAuto: false,
      })),
  }
}

/** Keeps auto SKUs in step with the slug and size labels. */
function syncSkus(d: Draft): Draft {
  if (!d.variants.some((v) => v.skuAuto)) return d
  return { ...d, variants: d.variants.map((v) => (v.skuAuto ? { ...v, sku: autoSku(d.slug, v.label) } : v)) }
}

const isInt = (s: string) => /^\d+$/.test(s.trim())

function validate(d: Draft): Errors {
  const e: Errors = {}
  if (!d.name.trim()) e.name = 'Give the product a name'
  if (!d.slug.trim()) e.slug = 'Add a web address'
  else if (!SLUG_RE.test(d.slug.trim())) e.slug = 'Use lowercase letters, numbers and single dashes only'
  if (d.purity.trim() !== '') {
    const n = Number(d.purity)
    if (!Number.isFinite(n) || n < 0 || n > 100) e.purity = 'Enter a number between 0 and 100'
  }
  if (!/^-?\d+$/.test(d.sortOrder.trim() || '0')) e.sortOrder = 'Use a whole number'
  if (d.variants.length === 0) e.variants = 'Add at least one size'
  const seen = new Map<string, string>()
  for (const v of d.variants) {
    if (!v.label.trim()) e[`${v.key}.label`] = 'Add a size label'
    const sku = v.sku.trim().toUpperCase()
    if (!sku) e[`${v.key}.sku`] = 'Add a SKU'
    else if (seen.has(sku)) e[`${v.key}.sku`] = 'Used by another size'
    else seen.set(sku, v.key)
    if (toCents(v.price) === null) e[`${v.key}.price`] = 'Enter a price, e.g. 129.00'
    if (v.cost.trim() !== '' && toCents(v.cost) === null) e[`${v.key}.cost`] = 'Enter a cost, e.g. 30.00'
    if (!isInt(v.stock || '0')) e[`${v.key}.stock`] = 'Whole number'
  }
  return e
}

const orNull = (s: string) => (s.trim() === '' ? null : s.trim())

function toPayload(d: Draft) {
  return {
    name: d.name.trim(),
    slug: d.slug.trim(),
    tagline: d.tagline.trim(),
    description: d.description.trim(),
    image: d.image,
    gallery: d.gallery,
    categoryId: d.categoryId,
    form: d.form,
    status: d.status,
    featured: d.featured,
    boxEligible: d.boxEligible,
    purity: d.purity.trim() === '' ? null : Number(d.purity),
    casNumber: orNull(d.casNumber),
    molecularFormula: orNull(d.molecularFormula),
    molecularWeight: orNull(d.molecularWeight),
    sequence: orNull(d.sequence),
    storage: orNull(d.storage),
    sortOrder: parseInt(d.sortOrder, 10) || 0,
    variants: d.variants.map((v, i) => ({
      id: v.id,
      label: v.label.trim(),
      sku: v.sku.trim().toUpperCase(),
      priceCents: toCents(v.price) ?? 0,
      costCents: toCents(v.cost) ?? 0,
      stock: parseInt(v.stock, 10) || 0,
      active: v.active,
      sortOrder: i,
    })),
  }
}

/** Gross margin as a percentage of the selling price, or null when there is no price yet. */
function marginPct(price: string, cost: string) {
  const p = toCents(price)
  if (!p) return null
  const c = toCents(cost) ?? 0
  return ((p - c) / p) * 100
}

const marginTone = (m: number) => (m >= 40 ? 'text-success' : m >= 15 ? 'text-warning' : 'text-destructive')

/** Turns API messages like "variants.0.sku: ..." into owner friendly text. */
function friendlyApiError(e: unknown) {
  if (e instanceof ApiError && e.status === 409)
    return 'That web address or one of the SKUs is already used by another product. Change it and save again.'
  return errorMessage(e)
}

async function uploadImage(file: File) {
  const fd = new FormData()
  fd.append('file', file)
  const r = await api.post<{ image: string }>('/api/admin/uploads/image', fd)
  return r.image
}

// ---------- Page ----------

export default function ProductEdit() {
  const { id } = useParams()
  const query = useQuery({
    queryKey: ['admin', 'product', id],
    queryFn: () => api.get<AdminProduct>(`/api/admin/products/${id}`),
    enabled: !!id,
    refetchOnWindowFocus: false,
  })

  if (id && query.isError)
    return (
      <div>
        <PageHeader title="Product" back={{ to: '/admin/products', label: 'Products' }} />
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      </div>
    )
  if (id && !query.data) return <EditSkeleton />
  return <Editor key={id ?? 'new'} product={id ? query.data : undefined} />
}

function EditSkeleton() {
  return (
    <div>
      <div className="mb-6 space-y-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
        </div>
        <div className="space-y-6">
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </div>
    </div>
  )
}

function Editor({ product }: { product?: AdminProduct }) {
  const isNew = !product
  const navigate = useNavigate()
  const qc = useQueryClient()
  const invalidate = useInvalidateAdmin()
  const categories = useAdminCategories()

  const [initial, setInitial] = useState<Draft>(() => (product ? fromProduct(product) : emptyDraft()))
  const [draft, setDraft] = useState<Draft>(initial)
  const [saved, setSaved] = useState<AdminProduct | undefined>(product)
  const [slugManual, setSlugManual] = useState(!isNew)
  const [errors, setErrors] = useState<Errors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(initial), [draft, initial])

  // ---- Leave protection ----
  const skipBlock = useRef(false)
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  const blocker = useBlocker(
    useCallback(
      ({ currentLocation, nextLocation }: { currentLocation: { pathname: string }; nextLocation: { pathname: string } }) =>
        dirtyRef.current && !skipBlock.current && currentLocation.pathname !== nextLocation.pathname,
      [],
    ),
  )
  const proceeding = useRef(false)
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  // ---- Draft helpers ----
  const patch = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }))
  const clearError = (...keys: string[]) =>
    setErrors((e) => {
      if (!keys.some((k) => k in e)) return e
      const next = { ...e }
      for (const k of keys) delete next[k]
      return next
    })

  const setName = (name: string) => {
    setDraft((d) => syncSkus({ ...d, name, slug: slugManual ? d.slug : slugify(name) }))
    clearError('name', ...(slugManual ? [] : ['slug']))
  }
  const setSlug = (raw: string) => {
    setSlugManual(true)
    const slug = raw.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
    setDraft((d) => syncSkus({ ...d, slug }))
    clearError('slug')
  }
  const patchVariant = (key: string, p: Partial<VariantDraft>) => {
    setDraft((d) => syncSkus({ ...d, variants: d.variants.map((v) => (v.key === key ? { ...v, ...p } : v)) }))
    clearError(...Object.keys(p).map((k) => `${key}.${k}`), ...(p.sku !== undefined || p.label !== undefined ? [`${key}.sku`] : []))
  }
  const addVariant = () => {
    setDraft((d) => ({ ...d, variants: [...d.variants, emptyVariant(d.slug)] }))
    clearError('variants')
  }
  const removeVariant = (key: string) => setDraft((d) => ({ ...d, variants: d.variants.filter((v) => v.key !== key) }))

  // ---- Save ----
  const save = useMutation({
    mutationFn: (d: Draft) =>
      isNew ? api.post<AdminProduct>('/api/admin/products', toPayload(d)) : api.put<AdminProduct>(`/api/admin/products/${saved!.id}`, toPayload(d)),
    onSuccess: (p) => {
      qc.setQueryData(['admin', 'product', p.id], p)
      invalidate()
      if (isNew) {
        toast.success('Product created')
        skipBlock.current = true
        navigate(`/admin/products/${p.id}`, { replace: true })
        return
      }
      const next = fromProduct(p)
      setSaved(p)
      setInitial(next)
      setDraft(next)
      setErrors({})
      toast.success('Product saved')
    },
    onError: (e) => {
      const msg = friendlyApiError(e)
      setServerError(msg)
      const field = msg.split(':')[0]
      if (field === 'name' || field === 'slug') setErrors((er) => ({ ...er, [field]: msg.slice(field.length + 1).trim() }))
      toast.error(msg)
    },
  })

  const scrollToFirstError = () =>
    requestAnimationFrame(() => {
      const el = formRef.current?.querySelector('[role="alert"]')
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    })

  const onSubmit = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (save.isPending) return
    setServerError(null)
    const errs = validate(draft)
    setErrors(errs)
    if (Object.keys(errs).length > 0) {
      toast.error('Some fields need attention before saving')
      scrollToFirstError()
      return
    }
    save.mutate(draft)
  }

  const discard = () => {
    setDraft(initial)
    setErrors({})
    setServerError(null)
    setSlugManual(!isNew)
  }

  const remove = async () => {
    const r = await api.del<{ archived?: boolean; deleted?: boolean }>(`/api/admin/products/${saved!.id}`)
    skipBlock.current = true
    invalidate()
    if (r.archived) toast.success('Product archived. It is hidden from the store and kept for order history.')
    else toast.success('Product deleted')
    navigate('/admin/products')
  }

  const title = isNew ? 'New product' : saved?.name || 'Product'

  return (
    <div>
      <PageHeader
        title={title}
        back={{ to: '/admin/products', label: 'Products' }}
        meta={
          saved ? (
            <>
              <ProductStatusBadge status={saved.status} />
              <Num className="truncate text-xs">/shop/{saved.slug}</Num>
              <span className="text-xs">Last saved {relative(saved.updatedAt)}</span>
            </>
          ) : (
            <span>Fill in the basics and at least one size. Save as a draft until it is ready to sell.</span>
          )
        }
        actions={
          saved ? (
            <>
              {saved.status === 'ACTIVE' && (
                <Button variant="outline" asChild>
                  <a href={`/shop/${saved.slug}`} target="_blank" rel="noreferrer">
                    <ArrowSquareOutIcon />
                    View in store
                  </a>
                </Button>
              )}
              <Button variant="destructive" onClick={() => setConfirmDelete(true)}>
                <TrashIcon />
                Delete
              </Button>
            </>
          ) : undefined
        }
      />

      <form ref={formRef} onSubmit={onSubmit} noValidate>
        {serverError && (
          <div className="mb-6 flex items-start gap-2.5 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm" role="alert">
            <WarningCircleIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div className="min-w-0">
              <p className="font-medium text-destructive">The product was not saved</p>
              <p className="mt-0.5 break-words text-muted-foreground">{serverError}</p>
            </div>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] xl:grid-cols-[minmax(0,1fr)_360px]">
          {/* ---------- Main column ---------- */}
          <div className="min-w-0 space-y-6">
            <Panel title="Basics">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Name" htmlFor="p-name" error={errors.name} className="sm:col-span-2">
                  <TextInput
                    id="p-name"
                    value={draft.name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. BPC-157"
                    maxLength={120}
                    aria-invalid={!!errors.name}
                  />
                </Field>
                <Field
                  label="Web address"
                  htmlFor="p-slug"
                  error={errors.slug}
                  className="sm:col-span-2"
                  hint={
                    isNew && !slugManual
                      ? 'Filled in from the name. Edit it if you want a different link.'
                      : 'Changing this breaks links people have already shared.'
                  }
                >
                  <div className="flex min-w-0 items-center rounded-md border border-input bg-background/60 focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30">
                    <span className="shrink-0 pl-3 font-mono text-xs text-muted-foreground">/shop/</span>
                    <input
                      id="p-slug"
                      value={draft.slug}
                      onChange={(e) => setSlug(e.target.value)}
                      placeholder="bpc-157"
                      maxLength={80}
                      aria-invalid={!!errors.slug}
                      autoComplete="off"
                      spellCheck={false}
                      className="h-9 min-w-0 flex-1 bg-transparent pr-3 pl-0.5 font-mono text-sm outline-none placeholder:text-muted-foreground"
                    />
                  </div>
                </Field>
                <Field label="Tagline" htmlFor="p-tagline" optional hint="One short line shown under the name on product cards." className="sm:col-span-2">
                  <TextInput
                    id="p-tagline"
                    value={draft.tagline}
                    onChange={(e) => patch({ tagline: e.target.value })}
                    placeholder="e.g. Tissue repair research peptide"
                    maxLength={200}
                  />
                </Field>
                <Field label="Description" htmlFor="p-desc" optional hint="Shown on the product page. Leave a blank line between paragraphs." className="sm:col-span-2">
                  <Textarea
                    id="p-desc"
                    value={draft.description}
                    onChange={(e) => patch({ description: e.target.value })}
                    rows={6}
                    maxLength={10000}
                    className="min-h-32"
                  />
                </Field>
                <Field label="Product type" htmlFor="p-form" className="content-start">
                  <Select value={draft.form} onValueChange={(v) => patch({ form: v as ProductForm })}>
                    <SelectTrigger id="p-form" className="w-full data-[size=default]:h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {FORMS.map((f) => (
                        <SelectItem key={f.value} value={f.value}>
                          {f.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <CategoryField
                  value={draft.categoryId}
                  onChange={(categoryId) => patch({ categoryId })}
                  categories={categories.data ?? []}
                  loading={categories.isPending}
                />
              </div>
            </Panel>

            <ImagesPanel draft={draft} setDraft={setDraft} />

            <Panel
              title="Sizes and prices"
              description="Each size is a separate option customers can pick, with its own price, SKU and stock."
              action={
                <Button type="button" size="sm" variant="outline" onClick={addVariant}>
                  <PlusIcon weight="bold" />
                  Add size
                </Button>
              }
            >
              <VariantsEditor
                variants={draft.variants}
                errors={errors}
                onPatch={patchVariant}
                onRemove={removeVariant}
                existingIds={new Set(saved?.variants.map((v) => v.id) ?? [])}
              />
              {errors.variants && (
                <p className="mt-3 flex items-center gap-1 text-xs text-destructive" role="alert">
                  <WarningCircleIcon className="size-3.5" />
                  {errors.variants}
                </p>
              )}
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                <p className="max-w-[60ch] text-xs leading-snug text-muted-foreground">
                  Cost is what you pay per unit. Used for profit reports, never shown to customers.
                </p>
                <Button type="button" size="sm" variant="ghost" onClick={addVariant}>
                  <PlusIcon weight="bold" />
                  Add size
                </Button>
              </div>
            </Panel>

            <Panel title="Lab data" description="Shown on the product page under the specifications. Leave blank anything that does not apply.">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Purity" htmlFor="p-purity" optional error={errors.purity} hint="Usually the figure from the latest certificate.">
                  <NumberInput
                    id="p-purity"
                    value={draft.purity}
                    onChange={(v) => {
                      patch({ purity: v })
                      clearError('purity')
                    }}
                    suffix="%"
                    step="0.01"
                    min={0}
                    max={100}
                    placeholder="99.50"
                    aria-invalid={!!errors.purity}
                  />
                </Field>
                <Field label="CAS number" htmlFor="p-cas" optional>
                  <TextInput
                    id="p-cas"
                    value={draft.casNumber}
                    onChange={(e) => patch({ casNumber: e.target.value })}
                    placeholder="137525-51-0"
                    maxLength={60}
                    className="font-mono"
                  />
                </Field>
                <Field label="Molecular formula" htmlFor="p-formula" optional>
                  <TextInput
                    id="p-formula"
                    value={draft.molecularFormula}
                    onChange={(e) => patch({ molecularFormula: e.target.value })}
                    placeholder="C62H98N16O22"
                    maxLength={120}
                    className="font-mono"
                  />
                </Field>
                <Field label="Molecular weight" htmlFor="p-weight" optional>
                  <TextInput
                    id="p-weight"
                    value={draft.molecularWeight}
                    onChange={(e) => patch({ molecularWeight: e.target.value })}
                    placeholder="1419.5 g/mol"
                    maxLength={60}
                    className="font-mono"
                  />
                </Field>
                <Field label="Sequence" htmlFor="p-seq" optional className="sm:col-span-2">
                  <Textarea
                    id="p-seq"
                    value={draft.sequence}
                    onChange={(e) => patch({ sequence: e.target.value })}
                    rows={2}
                    maxLength={500}
                    className="min-h-16 font-mono text-xs md:text-xs"
                    placeholder="Gly-Glu-Pro-Pro-Pro-Gly-Lys-Pro-Ala-Asp..."
                  />
                </Field>
                <Field label="Storage" htmlFor="p-storage" optional className="sm:col-span-2">
                  <TextInput
                    id="p-storage"
                    value={draft.storage}
                    onChange={(e) => patch({ storage: e.target.value })}
                    placeholder="Store at -20°C, protected from light."
                    maxLength={300}
                  />
                </Field>
              </div>
            </Panel>
          </div>

          {/* ---------- Side column ---------- */}
          <div className="min-w-0 space-y-6">
            <Panel title="Visibility">
              <div className="grid gap-4">
                <Field label="Status" htmlFor="p-status" hint={PRODUCT_STATUS[draft.status].help}>
                  <Select value={draft.status} onValueChange={(v) => patch({ status: v as ProductStatus })}>
                    <SelectTrigger id="p-status" className="w-full data-[size=default]:h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(PRODUCT_STATUS) as ProductStatus[]).map((s) => (
                        <SelectItem key={s} value={s}>
                          {PRODUCT_STATUS[s].label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <SwitchRow
                  id="p-featured"
                  label="Featured"
                  hint="Shown in the Popular section on the home page."
                  checked={draft.featured}
                  onChange={(featured) => patch({ featured })}
                />
                <SwitchRow
                  id="p-box"
                  label="Build a Box"
                  hint="Customers can pick it when building a monthly box."
                  checked={draft.boxEligible}
                  onChange={(boxEligible) => patch({ boxEligible })}
                />
                <Field label="Sort order" htmlFor="p-sort" error={errors.sortOrder} hint="Lower numbers show first in the shop.">
                  <NumberInput
                    id="p-sort"
                    value={draft.sortOrder}
                    onChange={(v) => {
                      patch({ sortOrder: v })
                      clearError('sortOrder')
                    }}
                    step="1"
                    aria-invalid={!!errors.sortOrder}
                  />
                </Field>
              </div>
            </Panel>

            <SummaryPanel draft={draft} saved={saved} />

            {saved && <CertificatesPanel product={saved} />}
          </div>
        </div>

        {/* ---------- Save bar ---------- */}
        <div className="h-20 md:hidden" aria-hidden />
        <div
          className={cn(
            'fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)] backdrop-blur',
            'md:sticky md:inset-x-auto md:-mx-6 md:mt-8 md:-mb-6 md:px-6 md:pb-3 lg:-mx-8 lg:-mb-8 lg:px-8',
          )}
        >
          <div className="flex items-center justify-between gap-3">
            <p className="hidden min-w-0 items-center gap-2 text-sm text-muted-foreground sm:flex">
              <span className={cn('size-2 shrink-0 rounded-full', dirty ? 'bg-warning' : isNew ? 'bg-muted-foreground/50' : 'bg-success')} aria-hidden />
              <span className="truncate">{dirty ? 'You have unsaved changes' : isNew ? 'Not saved yet' : 'All changes saved'}</span>
            </p>
            <div className="flex flex-1 items-center justify-end gap-2 sm:flex-none">
              <Button
                type="button"
                variant="outline"
                className="flex-1 sm:flex-none"
                disabled={!dirty || save.isPending}
                onClick={() => setConfirmDiscard(true)}
              >
                Discard changes
              </Button>
              <Button type="submit" className="flex-1 sm:flex-none" disabled={save.isPending || (!isNew && !dirty)}>
                {save.isPending && <CircleNotchIcon className="animate-spin" />}
                {save.isPending ? 'Saving...' : 'Save product'}
              </Button>
            </div>
          </div>
        </div>
      </form>

      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        title="Discard changes?"
        description={isNew ? 'Everything you entered for this new product will be cleared.' : 'Your edits since the last save will be lost.'}
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        onConfirm={discard}
      />

      {saved && (
        <ConfirmDialog
          open={confirmDelete}
          onOpenChange={setConfirmDelete}
          title="Delete this product?"
          description="Products with past orders are archived (hidden from the store, kept for order history). Products never ordered are deleted permanently."
          confirmLabel="Delete product"
          onConfirm={remove}
        />
      )}

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onOpenChange={(o) => {
          if (!o && !proceeding.current && blocker.state === 'blocked') blocker.reset()
          proceeding.current = false
        }}
        title="Leave without saving?"
        description="You have changes that are not saved yet. If you leave now they will be lost."
        confirmLabel="Leave page"
        cancelLabel="Stay and save"
        onConfirm={() => {
          proceeding.current = true
          blocker.proceed?.()
        }}
      />
    </div>
  )
}

// ---------- Basics: category ----------

function CategoryField({
  value,
  onChange,
  categories,
  loading,
}: {
  value: string | null
  onChange: (id: string | null) => void
  categories: AdminCategory[]
  loading: boolean
}) {
  const qc = useQueryClient()
  const invalidate = useInvalidateAdmin()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const create = useMutation({
    mutationFn: (n: string) =>
      api.post<AdminCategory>('/api/admin/categories', {
        name: n,
        slug: slugify(n),
        sortOrder: categories.reduce((m, c) => Math.max(m, c.sortOrder), 0) + 1,
      }),
    onSuccess: (c) => {
      qc.setQueryData<AdminCategory[]>(['admin', 'categories'], (old) => [...(old ?? []), { ...c, _count: { products: 0 } }])
      invalidate()
      onChange(c.id)
      toast.success(`Category "${c.name}" added`)
      setName('')
      setOpen(false)
    },
    onError: (e) => {
      const msg = e instanceof ApiError && e.status === 409 ? 'A category with this name already exists' : errorMessage(e)
      setError(msg)
      toast.error(msg)
    },
  })

  const submit = () => {
    const n = name.trim()
    if (!n) return setError('Type a name')
    if (!slugify(n)) return setError('Use at least one letter or number')
    setError(null)
    create.mutate(n)
  }

  return (
    <div className="grid min-w-0 content-start gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="p-category" className="text-[13px] font-medium">
          Category
        </Label>
        <Popover
          open={open}
          onOpenChange={(o) => {
            setOpen(o)
            if (!o) setError(null)
          }}
        >
          <PopoverTrigger asChild>
            <button type="button" className="inline-flex items-center gap-1 rounded-md text-xs font-medium text-gold-ink hover:underline">
              <PlusIcon className="size-3" weight="bold" />
              Add category
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-72 p-3">
            <div className="grid gap-2">
              <Label htmlFor="new-cat" className="text-[13px] font-medium">
                New category
              </Label>
              <TextInput
                id="new-cat"
                value={name}
                autoFocus
                maxLength={60}
                placeholder="e.g. Cognitive research"
                onChange={(e) => {
                  setName(e.target.value)
                  setError(null)
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    submit()
                  }
                }}
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
              <div className="flex justify-end gap-2">
                <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" size="sm" onClick={submit} disabled={create.isPending}>
                  {create.isPending ? 'Adding...' : 'Add and select'}
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
      <Select value={value ?? NO_CATEGORY} onValueChange={(v) => onChange(v === NO_CATEGORY ? null : v)} disabled={loading}>
        <SelectTrigger id="p-category" className="w-full data-[size=default]:h-9">
          <SelectValue placeholder={loading ? 'Loading...' : 'No category'} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_CATEGORY}>No category</SelectItem>
          {categories.length > 0 && <SelectSeparator />}
          {categories.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs leading-snug text-muted-foreground">Used for the filters in the shop.</p>
    </div>
  )
}

// ---------- Images ----------

function ImagesPanel({ draft, setDraft }: { draft: Draft; setDraft: React.Dispatch<React.SetStateAction<Draft>> }) {
  const [mainUploading, setMainUploading] = useState(false)
  const [galleryPending, setGalleryPending] = useState(0)
  const [dragTarget, setDragTarget] = useState<'main' | 'gallery' | null>(null)
  const mainInput = useRef<HTMLInputElement>(null)
  const galleryInput = useRef<HTMLInputElement>(null)

  const screen = (files: File[]) => {
    const ok: File[] = []
    for (const f of files) {
      if (!f.type.startsWith('image/')) toast.error(`${f.name} is not an image`)
      else if (f.size > MAX_UPLOAD_BYTES) toast.error(`${f.name} is larger than 15 MB`)
      else ok.push(f)
    }
    return ok
  }

  const uploadMain = async (files: File[]) => {
    const [file] = screen(files)
    if (!file) return
    setMainUploading(true)
    try {
      const image = await uploadImage(file)
      setDraft((d) => ({ ...d, image }))
      toast.success('Main photo uploaded')
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setMainUploading(false)
    }
  }

  const uploadGallery = async (files: File[]) => {
    const ok = screen(files)
    const room = MAX_GALLERY - draft.gallery.length - galleryPending
    if (ok.length === 0) return
    if (room <= 0) {
      toast.error(`You can add up to ${MAX_GALLERY} extra photos`)
      return
    }
    const batch = ok.slice(0, room)
    if (ok.length > room) toast.error(`Only ${room} more ${room === 1 ? 'photo fits' : 'photos fit'}. The rest were skipped.`)
    setGalleryPending((n) => n + batch.length)
    let done = 0
    for (const f of batch) {
      try {
        const image = await uploadImage(f)
        // With no main photo yet, the first upload becomes the main photo.
        setDraft((d) => (d.image ? { ...d, gallery: [...d.gallery, image].slice(0, MAX_GALLERY) } : { ...d, image }))
        done++
      } catch (e) {
        toast.error(`${f.name}: ${errorMessage(e)}`)
      } finally {
        setGalleryPending((n) => n - 1)
      }
    }
    if (done > 0) toast.success(done === 1 ? 'Photo uploaded' : `${done} photos uploaded`)
  }

  const dropProps = (target: 'main' | 'gallery', onFiles: (f: File[]) => void) => ({
    onDragOver: (e: DragEvent) => {
      if (!e.dataTransfer.types.includes('Files')) return
      e.preventDefault()
      setDragTarget(target)
    },
    onDragLeave: () => setDragTarget((t) => (t === target ? null : t)),
    onDrop: (e: DragEvent) => {
      e.preventDefault()
      setDragTarget(null)
      onFiles(Array.from(e.dataTransfer.files))
    },
  })

  const setAsMain = (i: number) =>
    setDraft((d) => {
      const g = [...d.gallery]
      const next = g[i]
      if (d.image) g[i] = d.image
      else g.splice(i, 1)
      return { ...d, image: next, gallery: g }
    })
  const removeGallery = (i: number) => setDraft((d) => ({ ...d, gallery: d.gallery.filter((_, j) => j !== i) }))

  const galleryFull = draft.gallery.length + galleryPending >= MAX_GALLERY

  return (
    <Panel title="Photos" description="Square photos work best. We create web-optimised sizes automatically.">
      <input
        ref={mainInput}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          void uploadMain(Array.from(e.target.files ?? []))
          e.target.value = ''
        }}
      />
      <input
        ref={galleryInput}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          void uploadGallery(Array.from(e.target.files ?? []))
          e.target.value = ''
        }}
      />
      <div className="grid gap-5 sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)]">
        {/* Main photo */}
        <div className="min-w-0">
          <p className="mb-1.5 text-[13px] font-medium">Main photo</p>
          <div {...dropProps('main', uploadMain)} className="relative">
            {mainUploading ? (
              <UploadingTile className="aspect-square w-full max-w-[240px] rounded-lg sm:max-w-none" />
            ) : draft.image ? (
              <div className="w-full max-w-[240px] sm:max-w-none">
                <ProductImage
                  src={draft.image}
                  alt="Main product photo"
                  sizes="240px"
                  className={cn('aspect-square w-full rounded-lg border', dragTarget === 'main' && 'ring-2 ring-gold')}
                />
                <div className="mt-2 flex gap-2">
                  <Button type="button" size="sm" variant="outline" className="flex-1" onClick={() => mainInput.current?.click()}>
                    <UploadSimpleIcon />
                    Replace
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label="Remove main photo"
                    onClick={() => setDraft((d) => ({ ...d, image: null }))}
                  >
                    <TrashIcon />
                    Remove
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => mainInput.current?.click()}
                className={cn(
                  'flex aspect-square w-full max-w-[240px] flex-col items-center justify-center gap-2 rounded-lg border border-dashed bg-surface/50 px-4 text-center text-muted-foreground transition-colors hover:border-gold/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring sm:max-w-none',
                  dragTarget === 'main' && 'border-gold bg-gold/10',
                )}
              >
                <ImageSquareIcon className="size-8" weight="thin" />
                <span className="text-sm font-medium text-foreground">Add main photo</span>
                <span className="text-xs">Click or drop an image. Up to 15 MB.</span>
              </button>
            )}
          </div>
        </div>

        {/* Gallery */}
        <div className="min-w-0">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="text-[13px] font-medium">More photos</p>
            <Num className="text-xs text-muted-foreground">
              {draft.gallery.length}/{MAX_GALLERY}
            </Num>
          </div>
          <div
            {...dropProps('gallery', uploadGallery)}
            className={cn('grid grid-cols-3 gap-2 rounded-lg sm:grid-cols-4', dragTarget === 'gallery' && 'ring-2 ring-gold ring-offset-4 ring-offset-card')}
          >
            {draft.gallery.map((src, i) => (
              <div key={`${src}-${i}`} className="group relative min-w-0">
                <ProductImage src={src} alt={`Extra photo ${i + 1}`} sizes="120px" className="aspect-square w-full rounded-md border" />
                <div className="absolute inset-x-1 bottom-1 flex justify-between gap-1">
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="secondary"
                    className="bg-background/85 backdrop-blur"
                    title="Set as main photo"
                    aria-label="Set as main photo"
                    onClick={() => setAsMain(i)}
                  >
                    <StarIcon />
                  </Button>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="secondary"
                    className="bg-background/85 backdrop-blur hover:text-destructive"
                    title="Remove photo"
                    aria-label="Remove photo"
                    onClick={() => removeGallery(i)}
                  >
                    <XIcon />
                  </Button>
                </div>
              </div>
            ))}
            {Array.from({ length: galleryPending }).map((_, i) => (
              <UploadingTile key={`pending-${i}`} className="aspect-square w-full rounded-md" />
            ))}
            {!galleryFull && (
              <button
                type="button"
                onClick={() => galleryInput.current?.click()}
                className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed bg-surface/50 text-xs text-muted-foreground transition-colors hover:border-gold/40 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <PlusIcon className="size-5" />
                Add photos
              </button>
            )}
          </div>
          <p className="mt-2 text-xs leading-snug text-muted-foreground">
            Shown in the photo carousel on the product page. Use the star to make a photo the main one.
          </p>
        </div>
      </div>
    </Panel>
  )
}

function UploadingTile({ className }: { className?: string }) {
  return (
    <div className={cn('relative grid place-items-center overflow-hidden border bg-surface', className)} role="status">
      <Skeleton className="absolute inset-0 rounded-none" />
      <span className="relative flex flex-col items-center gap-1 text-xs text-muted-foreground">
        <CircleNotchIcon className="size-5 animate-spin" />
        Uploading
      </span>
    </div>
  )
}

// ---------- Sizes ----------

const ROW_GRID =
  '@min-[40rem]:grid-cols-[minmax(0,0.8fr)_minmax(0,1.3fr)_minmax(0,1.1fr)_minmax(0,1.1fr)_minmax(0,0.6fr)_3rem_2.5rem_2rem] @min-[40rem]:items-start @min-[40rem]:gap-1.5'

function VariantsEditor({
  variants,
  errors,
  onPatch,
  onRemove,
  existingIds,
}: {
  variants: VariantDraft[]
  errors: Errors
  onPatch: (key: string, p: Partial<VariantDraft>) => void
  onRemove: (key: string) => void
  existingIds: Set<string>
}) {
  const head = 'text-xs font-medium text-muted-foreground'
  return (
    <div className="@container">
      <div className={cn('hidden px-0.5 pb-2 @min-[40rem]:grid', ROW_GRID)}>
        <span className={head}>Size</span>
        <span className={head}>SKU</span>
        <span className={head}>Price</span>
        <span className={cn(head, 'flex items-center gap-1')}>Cost</span>
        <span className={head}>Stock</span>
        <span className={cn(head, 'text-right')}>Margin</span>
        <span className={cn(head, 'text-center')}>On sale</span>
        <span className="sr-only">Remove</span>
      </div>
      <div className="grid gap-3 @min-[40rem]:gap-2">
        {variants.map((v, i) => (
          <VariantRow
            key={v.key}
            v={v}
            index={i}
            errors={errors}
            canRemove={variants.length > 1}
            existing={!!v.id && existingIds.has(v.id)}
            onPatch={(p) => onPatch(v.key, p)}
            onRemove={() => onRemove(v.key)}
          />
        ))}
      </div>
    </div>
  )
}

function CellError({ msg }: { msg?: string }) {
  if (!msg) return null
  return (
    <p className="mt-1 text-[11px] leading-tight text-destructive" role="alert">
      {msg}
    </p>
  )
}

function Cell({ label, htmlFor, children, className }: { label: string; htmlFor: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-muted-foreground @min-[40rem]:sr-only">
        {label}
      </label>
      {children}
    </div>
  )
}

function VariantRow({
  v,
  index,
  errors,
  canRemove,
  existing,
  onPatch,
  onRemove,
}: {
  v: VariantDraft
  index: number
  errors: Errors
  canRemove: boolean
  existing: boolean
  onPatch: (p: Partial<VariantDraft>) => void
  onRemove: () => void
}) {
  const id = (f: string) => `v-${v.key}-${f}`
  const err = (f: string) => errors[`${v.key}.${f}`]
  const m = marginPct(v.price, v.cost)
  return (
    <div
      className={cn(
        'grid grid-cols-2 gap-3 rounded-lg border bg-surface/40 p-3 @min-[40rem]:rounded-none @min-[40rem]:border-0 @min-[40rem]:bg-transparent @min-[40rem]:p-0',
        ROW_GRID,
        !v.active && 'opacity-70',
      )}
    >
      <p className="col-span-2 -mb-1 text-xs font-medium text-muted-foreground @min-[40rem]:hidden">Size {index + 1}</p>
      <Cell label="Size" htmlFor={id('label')}>
        <TextInput
          id={id('label')}
          value={v.label}
          onChange={(e) => onPatch({ label: e.target.value })}
          placeholder="10mg"
          maxLength={40}
          aria-invalid={!!err('label')}
        />
        <CellError msg={err('label')} />
      </Cell>
      <Cell label="SKU" htmlFor={id('sku')}>
        <TextInput
          id={id('sku')}
          value={v.sku}
          onChange={(e) => onPatch({ sku: e.target.value.toUpperCase(), skuAuto: false })}
          placeholder="KY-NAME-10MG"
          maxLength={60}
          spellCheck={false}
          autoComplete="off"
          className="font-mono text-xs md:text-xs"
          aria-invalid={!!err('sku')}
        />
        <CellError msg={err('sku')} />
      </Cell>
      <Cell label="Price" htmlFor={id('price')}>
        <MoneyInput id={id('price')} value={v.price} onChange={(price) => onPatch({ price })} placeholder="0.00" aria-invalid={!!err('price')} />
        <CellError msg={err('price')} />
      </Cell>
      <Cell label="Cost" htmlFor={id('cost')}>
        <MoneyInput id={id('cost')} value={v.cost} onChange={(cost) => onPatch({ cost })} placeholder="0.00" aria-invalid={!!err('cost')} />
        <CellError msg={err('cost')} />
      </Cell>
      <Cell label="Stock" htmlFor={id('stock')}>
        <NumberInput
          id={id('stock')}
          value={v.stock}
          onChange={(stock) => onPatch({ stock })}
          min={0}
          step="1"
          inputMode="numeric"
          aria-invalid={!!err('stock')}
          className={cn(v.active && isInt(v.stock || '0') && Number(v.stock) <= 5 && '[&_input]:text-warning')}
        />
        <CellError msg={err('stock')} />
      </Cell>
      <div className="col-span-2 flex items-center justify-between gap-3 border-t pt-3 @min-[40rem]:contents">
        <div className="flex items-center gap-1.5 text-xs @min-[40rem]:h-9 @min-[40rem]:justify-end">
          <span className="text-muted-foreground @min-[40rem]:sr-only">Margin</span>
          {m === null ? (
            <Num className="text-muted-foreground">-</Num>
          ) : (
            <Num className={cn('font-medium', marginTone(m))}>{m.toFixed(0)}%</Num>
          )}
        </div>
        <div className="flex items-center gap-3 @min-[40rem]:contents">
          <div className="flex items-center gap-2 @min-[40rem]:h-9 @min-[40rem]:justify-center">
            <Switch id={id('active')} checked={v.active} onCheckedChange={(active) => onPatch({ active })} aria-label="On sale" />
            <label htmlFor={id('active')} className="text-xs text-muted-foreground @min-[40rem]:sr-only">
              On sale
            </label>
          </div>
          <div className="@min-[40rem]:flex @min-[40rem]:h-9 @min-[40rem]:items-center @min-[40rem]:justify-end">
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              className="text-muted-foreground hover:text-destructive"
              disabled={!canRemove}
              onClick={onRemove}
              aria-label={`Remove size ${v.label || index + 1}`}
              title={
                !canRemove
                  ? 'A product needs at least one size'
                  : existing
                    ? 'Remove size. If it was ordered before, it is hidden instead of deleted.'
                    : 'Remove size'
              }
            >
              <TrashIcon />
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function SwitchRow({ id, label, hint, checked, onChange }: { id: string; label: string; hint: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <Label htmlFor={id} className="text-[13px] font-medium">
          {label}
        </Label>
        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{hint}</p>
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} className="mt-0.5" />
    </div>
  )
}

// ---------- Side cards ----------

function SummaryPanel({ draft, saved }: { draft: Draft; saved?: AdminProduct }) {
  const active = draft.variants.filter((v) => v.active)
  const prices = active.map((v) => toCents(v.price)).filter((c): c is number => c !== null && c > 0)
  const stock = active.reduce((a, v) => a + (isInt(v.stock || '0') ? Number(v.stock || 0) : 0), 0)
  const margins = active.map((v) => marginPct(v.price, v.cost)).filter((m): m is number => m !== null)
  const avgMargin = margins.length ? margins.reduce((a, b) => a + b, 0) / margins.length : null
  const min = prices.length ? Math.min(...prices) : null
  const max = prices.length ? Math.max(...prices) : null
  const low = active.filter((v) => isInt(v.stock || '0') && Number(v.stock || 0) <= 5)
  return (
    <Panel title="Summary">
      <dl className="divide-y divide-border/60">
        <DefRow label="Sizes on sale">
          <Num>
            {active.length} of {draft.variants.length}
          </Num>
        </DefRow>
        <DefRow label="Price">
          {min === null ? <span className="text-muted-foreground">Not set</span> : <Num>{min === max ? money(min) : `${money(min)} - ${money(max)}`}</Num>}
        </DefRow>
        <DefRow label="In stock">
          <span className="inline-flex items-center gap-1.5">
            {active.length > 0 && stock === 0 ? (
              <span className="text-xs text-destructive">Out of stock</span>
            ) : low.length > 0 ? (
              <span className="text-xs text-warning">Low</span>
            ) : null}
            <Num>{num(stock)}</Num>
          </span>
        </DefRow>
        <DefRow label="Average margin" info="Price minus cost, as a share of the price. Averaged across sizes on sale, before discounts and shipping.">
          {avgMargin === null ? <span className="text-muted-foreground">-</span> : <Num className={marginTone(avgMargin)}>{avgMargin.toFixed(0)}%</Num>}
        </DefRow>
        {saved && (
          <>
            <DefRow label="Created">{date(saved.createdAt)}</DefRow>
            <DefRow label="Last saved">{date(saved.updatedAt, true)}</DefRow>
          </>
        )}
      </dl>
    </Panel>
  )
}

function CertificatesPanel({ product }: { product: AdminProduct }) {
  const coas = product.coas ?? []
  return (
    <Panel
      title="Certificates"
      description="Lab reports shown on the product page."
      flush
      action={
        <Button type="button" size="sm" variant="outline" asChild>
          <Link to={`/admin/coas?product=${product.id}`}>Manage</Link>
        </Button>
      }
    >
      {coas.length === 0 ? (
        <div className="flex flex-col items-center px-4 py-8 text-center">
          <CertificateIcon className="size-6 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">No certificates for this product yet.</p>
          <Button type="button" size="sm" variant="outline" className="mt-3" asChild>
            <Link to={`/admin/coas?product=${product.id}&new=1`}>
              <PlusIcon weight="bold" />
              Add certificate
            </Link>
          </Button>
        </div>
      ) : (
        <ul className="divide-y">
          {coas.slice(0, 6).map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              <div className="min-w-0">
                <Num className="block truncate text-sm">{c.lotNumber}</Num>
                <p className="truncate text-xs text-muted-foreground">
                  {c.variantLabel ? `${c.variantLabel}, ` : ''}tested {date(c.testedAt)}
                </p>
              </div>
              <Purity value={c.purity} className="shrink-0" />
            </li>
          ))}
          {coas.length > 6 && (
            <li className="px-4 py-2.5 text-xs text-muted-foreground">
              <Link to={`/admin/coas?product=${product.id}`} className="text-gold-ink hover:underline">
                See all {coas.length} certificates
              </Link>
            </li>
          )}
        </ul>
      )}
    </Panel>
  )
}
