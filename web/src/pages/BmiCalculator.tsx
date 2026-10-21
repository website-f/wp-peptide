import { ArrowCounterClockwiseIcon, FlaskIcon, InfoIcon, RulerIcon, ScalesIcon, SparkleIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { EmptyState, PageHeader } from '@/components/brand/bits'
import { ProductCard, ProductCardSkeleton } from '@/components/product/ProductCard'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import type { ProductCard as Card } from '@/lib/types'
import { cn } from '@/lib/utils'
import { useSeo } from '@/lib/seo'

type Units = 'metric' | 'imperial'
type Scale = 'asian' | 'who'
type Suggested = Card & { bmiMin: number | null; bmiMax: number | null }

// Malaysian Clinical Practice Guidelines (Asian cut-offs) and the WHO international cut-offs.
const SCALES: Record<Scale, { label: string; bands: { max: number; key: Band }[] }> = {
  asian: {
    label: 'Asian (Malaysia)',
    bands: [
      { max: 18.5, key: 'under' },
      { max: 23, key: 'healthy' },
      { max: 27.5, key: 'over' },
      { max: Infinity, key: 'obese' },
    ],
  },
  who: {
    label: 'WHO international',
    bands: [
      { max: 18.5, key: 'under' },
      { max: 25, key: 'healthy' },
      { max: 30, key: 'over' },
      { max: Infinity, key: 'obese' },
    ],
  },
}
type Band = 'under' | 'healthy' | 'over' | 'obese'
const BAND: Record<Band, { label: string; tone: string; bar: string; note: string }> = {
  under: { label: 'Underweight', tone: 'text-sky-500', bar: 'bg-sky-500', note: 'Below the healthy range for your height.' },
  healthy: { label: 'Healthy weight', tone: 'text-emerald-500', bar: 'bg-emerald-500', note: 'Within the healthy range for your height.' },
  over: { label: 'Overweight', tone: 'text-amber-500', bar: 'bg-amber-500', note: 'Above the healthy range for your height.' },
  obese: { label: 'Obese', tone: 'text-rose-500', bar: 'bg-rose-500', note: 'Well above the healthy range for your height.' },
}

const GAUGE_MIN = 15
const GAUGE_MAX = 40
const KEY = 'kyvo-bmi'

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<{ units: Units; scale: Scale }>
  } catch {
    return {}
  }
}

const num = (s: string) => {
  const n = Number(s.replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? n : null
}

export default function BmiCalculator() {
  useSeo({
    title: 'BMI calculator',
    description: 'Work out your body mass index (BMI) in seconds with Asian (Malaysia) or WHO cut-offs, and see which KYVO products are matched to your BMI range.',
  })
  const saved = useMemo(load, [])
  const reduce = useReducedMotion()
  const [units, setUnits] = useState<Units>(saved.units ?? 'metric')
  const [scale, setScale] = useState<Scale>(saved.scale ?? 'asian')
  const [cm, setCm] = useState('')
  const [kg, setKg] = useState('')
  const [ft, setFt] = useState('')
  const [inch, setInch] = useState('')
  const [lb, setLb] = useState('')

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ units, scale }))
    } catch {
      /* storage blocked */
    }
  }, [units, scale])

  // Switching units carries the numbers over instead of clearing them.
  const switchUnits = (u: Units) => {
    if (u === units) return
    if (u === 'imperial') {
      const h = num(cm)
      const w = num(kg)
      if (h) {
        const totalIn = h / 2.54
        setFt(String(Math.floor(totalIn / 12)))
        setInch(String(Math.round(totalIn % 12)))
      }
      if (w) setLb(String(Math.round(w / 0.45359237)))
    } else {
      const h = (num(ft) ?? 0) * 12 + (num(inch) ?? 0)
      const w = num(lb)
      if (h) setCm(String(Math.round(h * 2.54)))
      if (w) setKg(String(Math.round(w * 0.45359237 * 10) / 10))
    }
    setUnits(u)
  }

  const heightM = units === 'metric' ? (num(cm) ?? 0) / 100 : ((num(ft) ?? 0) * 12 + (num(inch) ?? 0)) * 0.0254
  const weightKg = units === 'metric' ? (num(kg) ?? 0) : (num(lb) ?? 0) * 0.45359237
  const valid = heightM >= 0.9 && heightM <= 2.5 && weightKg >= 20 && weightKg <= 350
  const bmi = valid ? Math.round((weightKg / (heightM * heightM)) * 10) / 10 : null
  const band = bmi !== null ? SCALES[scale].bands.find((b) => bmi < b.max)!.key : null
  const healthy = SCALES[scale].bands[1]
  const range = valid ? [18.5 * heightM * heightM, (healthy.max - 0.1) * heightM * heightM] : null
  const touched = Boolean(cm || kg || ft || inch || lb)

  const suggestions = useQuery({
    queryKey: ['bmi-suggestions', bmi],
    queryFn: () => api.get<{ bmi: number; products: Suggested[] }>('/api/bmi/suggestions', { bmi: bmi! }),
    enabled: bmi !== null && bmi >= 10 && bmi <= 80,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  })

  const reset = () => {
    setCm('')
    setKg('')
    setFt('')
    setInch('')
    setLb('')
  }

  const marker = bmi !== null ? Math.min(100, Math.max(0, ((bmi - GAUGE_MIN) / (GAUGE_MAX - GAUGE_MIN)) * 100)) : null
  const pct = (v: number) => ((Math.min(GAUGE_MAX, v) - GAUGE_MIN) / (GAUGE_MAX - GAUGE_MIN)) * 100
  const segments = SCALES[scale].bands.map((b, i, all) => {
    const from = i === 0 ? GAUGE_MIN : all[i - 1].max
    return { key: b.key, left: pct(from), width: pct(b.max) - pct(from) }
  })

  return (
    <>
      <PageHeader title="BMI calculator" intro="Enter your height and weight to see your body mass index, where it sits on the scale, and the products matched to your range." />

      <section className="container-x grid gap-6 pb-12 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-10">
        {/* ---------- Inputs ---------- */}
        <div className="h-fit min-w-0 rounded-xl border bg-card p-5 sm:p-7 lg:sticky lg:top-24">
          <div className="flex items-center justify-between gap-3">
            <p className="font-display text-2xl font-semibold uppercase">Your details</p>
            {touched && (
              <Button variant="ghost" size="sm" onClick={reset} className="-mr-2 text-muted-foreground">
                <ArrowCounterClockwiseIcon /> Reset
              </Button>
            )}
          </div>

          <Toggle
            className="mt-5"
            label="Units"
            value={units}
            onChange={switchUnits}
            options={[
              { value: 'metric', label: 'Metric (cm, kg)' },
              { value: 'imperial', label: 'Imperial (ft, lb)' },
            ]}
          />

          <div className="mt-5 grid gap-5 [&>*]:min-w-0">
            {units === 'metric' ? (
              <>
                <Measure id="bmi-cm" label="Height" icon={<RulerIcon />} value={cm} onChange={setCm} suffix="cm" placeholder="165" />
                <Measure id="bmi-kg" label="Weight" icon={<ScalesIcon />} value={kg} onChange={setKg} suffix="kg" placeholder="68" step="0.1" />
              </>
            ) : (
              <>
                <div>
                  <span className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
                    <RulerIcon className="size-4 text-gold-ink" aria-hidden /> Height
                  </span>
                  <div className="grid grid-cols-2 gap-3 [&>*]:min-w-0">
                    <Measure id="bmi-ft" label="Feet" hideLabel value={ft} onChange={setFt} suffix="ft" placeholder="5" />
                    <Measure id="bmi-in" label="Inches" hideLabel value={inch} onChange={setInch} suffix="in" placeholder="5" />
                  </div>
                </div>
                <Measure id="bmi-lb" label="Weight" icon={<ScalesIcon />} value={lb} onChange={setLb} suffix="lb" placeholder="150" />
              </>
            )}
          </div>

          <Toggle
            className="mt-6"
            label="Cut-offs"
            value={scale}
            onChange={setScale}
            options={[
              { value: 'asian', label: 'Asian (Malaysia)' },
              { value: 'who', label: 'WHO' },
            ]}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            {scale === 'asian'
              ? 'Malaysian guidelines use lower cut-offs for Asian adults: healthy is 18.5 to 22.9.'
              : 'The international scale: healthy is 18.5 to 24.9.'}
          </p>
          {touched && !valid && <p className="mt-4 text-sm text-warning">Enter a height and weight in a normal adult range to see your BMI.</p>}
        </div>

        {/* ---------- Result ---------- */}
        <div className="min-w-0" aria-live="polite">
          <div className="relative overflow-hidden rounded-xl border bg-card p-5 sm:p-8">
            <div aria-hidden className="absolute inset-x-0 top-0 gold-rule" />
            {bmi === null || band === null ? (
              <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
                <span className="grid size-14 shrink-0 place-items-center rounded-full bg-gold/10 text-gold-ink">
                  <SparkleIcon className="size-7" weight="fill" />
                </span>
                <div>
                  <p className="font-display text-3xl font-semibold uppercase">Your BMI appears here</p>
                  <p className="mt-1 text-sm text-muted-foreground">It updates as you type. Nothing you enter is saved or sent anywhere except to look up matching products.</p>
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
                  <div>
                    <p className="font-mono text-[11px] tracking-[0.2em] text-muted-foreground uppercase">Your BMI</p>
                    <motion.p
                      key={bmi}
                      initial={reduce ? false : { opacity: 0.4, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="font-display text-7xl leading-none font-semibold tabular-nums sm:text-8xl"
                    >
                      {bmi.toFixed(1)}
                    </motion.p>
                  </div>
                  <div className="pb-1 sm:text-right">
                    <p className={cn('font-display text-3xl font-semibold uppercase', BAND[band].tone)}>{BAND[band].label}</p>
                    <p className="text-sm text-muted-foreground">{BAND[band].note}</p>
                  </div>
                </div>

                {/* Gauge */}
                <div className="mt-8">
                  <div className="relative h-3 rounded-full bg-muted">
                    {segments.map((s) => (
                      <span
                        key={s.key}
                        className={cn('absolute inset-y-0 opacity-80 first:rounded-l-full last:rounded-r-full', BAND[s.key].bar)}
                        style={{ left: `${s.left}%`, width: `${s.width}%` }}
                      />
                    ))}
                    {marker !== null && (
                      <motion.span
                        className="absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-background bg-foreground shadow-lg"
                        initial={false}
                        animate={{ left: `${marker}%` }}
                        transition={{ type: 'spring', bounce: 0.25, duration: reduce ? 0 : 0.6 }}
                      />
                    )}
                  </div>
                  <div className="relative mt-2 h-4 font-mono text-[11px] text-muted-foreground">
                    {SCALES[scale].bands.slice(0, 3).map((b) => (
                      <span key={b.max} className="absolute -translate-x-1/2" style={{ left: `${pct(b.max)}%` }}>
                        {b.max}
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
                    {SCALES[scale].bands.map((b) => (
                      <span key={b.key} className={cn('inline-flex items-center gap-1.5', b.key === band && 'font-medium text-foreground')}>
                        <span className={cn('size-2 rounded-full', BAND[b.key].bar)} />
                        {BAND[b.key].label}
                      </span>
                    ))}
                  </div>
                </div>

                {range && (
                  <dl className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 [&>*:first-child]:col-span-2 sm:[&>*:first-child]:col-span-1">
                    <Stat label="Healthy weight for your height" value={units === 'metric' ? `${range[0].toFixed(0)}–${range[1].toFixed(0)} kg` : `${(range[0] / 0.45359237).toFixed(0)}–${(range[1] / 0.45359237).toFixed(0)} lb`} />
                    <Stat label="Height" value={units === 'metric' ? `${Math.round(heightM * 100)} cm` : `${ft || 0} ft ${inch || 0} in`} />
                    <Stat label="Weight" value={units === 'metric' ? `${Math.round(weightKg * 10) / 10} kg` : `${Math.round(weightKg / 0.45359237)} lb`} />
                  </dl>
                )}
              </>
            )}
          </div>
          <p className="mt-3 flex items-start gap-2 px-1 text-xs leading-relaxed text-muted-foreground">
            <InfoIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden />
            BMI is a quick screening number for adults. It does not measure body fat directly and does not account for muscle, age, sex or ethnicity
            beyond the cut-offs chosen. It is not a diagnosis.
          </p>
        </div>
      </section>

      {/* ---------- Suggestions ---------- */}
      <section className="container-x pb-20" aria-labelledby="bmi-suggestions">
        <div className="flex flex-wrap items-end justify-between gap-3 border-t pt-10">
          <div>
            <h2 id="bmi-suggestions" className="display text-4xl sm:text-5xl">
              Matched to your BMI
            </h2>
            <p className="mt-2 max-w-[60ch] text-muted-foreground">
              {bmi === null
                ? 'Enter your details above to see products matched to your BMI range.'
                : `Products set up for a BMI of ${bmi.toFixed(1)}.`}
            </p>
          </div>
          {bmi !== null && suggestions.data && suggestions.data.products.length > 0 && (
            <p className="font-mono text-xs text-muted-foreground">
              {suggestions.data.products.length} match{suggestions.data.products.length === 1 ? '' : 'es'}
            </p>
          )}
        </div>

        <div className="mt-8">
          {bmi === null ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-10 opacity-40 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-6" aria-hidden>
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className={cn(i > 1 && 'hidden md:block', i > 2 && 'md:hidden lg:block')}>
                  <ProductCardSkeleton />
                </div>
              ))}
            </div>
          ) : suggestions.isPending ? (
            <div className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-6">
              {Array.from({ length: 4 }, (_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          ) : suggestions.data && suggestions.data.products.length > 0 ? (
              <div className={cn('grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 lg:grid-cols-4 lg:gap-x-6', suggestions.isFetching && 'opacity-70 transition-opacity')}>
                {suggestions.data.products.map((p, i) => (
                  <div key={p.id} className="min-w-0">
                    <ProductCard product={p} index={i} />
                    <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                      BMI {p.bmiMin ?? 'up to'}
                      {p.bmiMin !== null && p.bmiMax !== null ? `–${p.bmiMax}` : p.bmiMax !== null ? ` ${p.bmiMax}` : '+'}
                    </p>
                  </div>
                ))}
              </div>
          ) : (
            <EmptyState
              icon={<FlaskIcon />}
              title="No matches for this BMI"
              body="None of our products are set up for this BMI range yet. Browse the full range or ask us for help."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <Button asChild>
                    <Link to="/shop">Browse products</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link to="/contact">Contact us</Link>
                  </Button>
                </div>
              }
            />
          )}
        </div>
      </section>
    </>
  )
}

function Toggle<T extends string>({ label, value, onChange, options, className }: { label: string; value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; className?: string }) {
  return (
    <div className={className}>
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <div role="radiogroup" aria-label={label} className="grid rounded-lg border bg-muted/50 p-1" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            onClick={() => onChange(o.value)}
            className={cn(
              'min-h-10 rounded-md px-2 text-sm font-medium transition-colors',
              o.value === value ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function Measure({
  id,
  label,
  icon,
  value,
  onChange,
  suffix,
  placeholder,
  step = '1',
  hideLabel,
}: {
  id: string
  label: string
  icon?: ReactNode
  value: string
  onChange: (v: string) => void
  suffix: string
  placeholder: string
  step?: string
  hideLabel?: boolean
}) {
  return (
    <div>
      <label htmlFor={id} className={cn('mb-1.5 flex items-center gap-1.5 text-sm font-medium', hideLabel && 'sr-only')}>
        {icon && <span className="text-gold-ink [&_svg]:size-4" aria-hidden>{icon}</span>}
        {label}
      </label>
      <div className="flex h-14 items-center rounded-lg border bg-background px-4 transition-shadow focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/40">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          min={0}
          step={step}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="w-full min-w-0 flex-1 bg-transparent font-mono text-2xl tabular-nums outline-none placeholder:text-muted-foreground/40 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <span className="ml-2 text-sm text-muted-foreground">{suffix}</span>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/60 px-4 py-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-mono text-lg font-medium tabular-nums">{value}</dd>
    </div>
  )
}
