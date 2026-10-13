import { ArrowDownIcon, ArrowRightIcon, ArrowUpIcon, CopyIcon, EyeIcon, PlusIcon, TrashIcon, XIcon } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import type { BannerSettings } from '../lib/types'

// Admin editor for the top-of-page banner: on/off, style, rotation, dismiss,
// and up to 10 messages each with an optional link and schedule.

export const MAX_BANNER_MESSAGES = 10
export const BANNER_TEXT_MAX = 160

export interface BannerRow {
  key: string
  id: string
  text: string
  linkUrl: string
  linkLabel: string
  enabled: boolean
  /** datetime-local value in the admin's own time zone, '' = none */
  startsAt: string
  endsAt: string
}

export interface BannerForm {
  enabled: boolean
  style: BannerSettings['style']
  rotateSeconds: string
  dismissible: boolean
  messages: BannerRow[]
}

let seq = 0
const newKey = () => `b${++seq}`
const newId = () => `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

/** ISO (UTC) to a datetime-local input value in local time. */
function isoToLocal(iso: string | null) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
const localToIso = (v: string) => (v ? new Date(v).toISOString() : null)

export function bannerToForm(b: BannerSettings): BannerForm {
  return {
    enabled: b.enabled,
    style: b.style,
    rotateSeconds: String(b.rotateSeconds),
    dismissible: b.dismissible,
    messages: b.messages.map((m) => ({ ...m, key: newKey(), startsAt: isoToLocal(m.startsAt), endsAt: isoToLocal(m.endsAt) })),
  }
}

const LINK_RE = /^(\/(?!\/)\S*|https:\/\/\S+)$/

/** Validates the banner form into the API shape, writing problems into `errors` under banner.* keys. */
export function validateBanner(f: BannerForm, errors: Record<string, string>): BannerSettings {
  const rotate = Number(f.rotateSeconds.trim())
  if (f.rotateSeconds.trim() === '' || !Number.isInteger(rotate) || rotate < 0 || rotate > 60) errors['banner.rotateSeconds'] = 'Use a whole number from 0 to 60'
  if (f.messages.length > MAX_BANNER_MESSAGES) errors['banner.messages'] = `Up to ${MAX_BANNER_MESSAGES} messages`
  if (f.enabled && !f.messages.some((m) => m.enabled && m.text.trim())) errors['banner.messages'] = 'Add at least one message that is switched on, or turn the banner off'
  const messages = f.messages.map((m, i) => {
    const k = `banner.messages.${i}`
    const text = m.text.trim()
    if (!text) errors[`${k}.text`] = 'Write the message'
    else if (text.length > BANNER_TEXT_MAX) errors[`${k}.text`] = `Keep it under ${BANNER_TEXT_MAX} characters so it fits on a phone`
    const linkUrl = m.linkUrl.trim()
    if (linkUrl && !LINK_RE.test(linkUrl)) errors[`${k}.linkUrl`] = 'Use a page path like /shop or a full https:// link'
    if (m.linkLabel.trim() && !linkUrl) errors[`${k}.linkUrl`] = 'Add a link for this button text'
    if (m.linkLabel.trim().length > 30) errors[`${k}.linkLabel`] = 'Keep it under 30 characters'
    if (m.startsAt && m.endsAt && new Date(m.startsAt) >= new Date(m.endsAt)) errors[`${k}.endsAt`] = 'The end must be after the start'
    return {
      id: m.id,
      text,
      linkUrl,
      linkLabel: m.linkLabel.trim(),
      enabled: m.enabled,
      startsAt: localToIso(m.startsAt),
      endsAt: localToIso(m.endsAt),
    }
  })
  return { enabled: f.enabled, style: f.style, rotateSeconds: rotate, dismissible: f.dismissible, messages }
}

type MsgState = 'live' | 'scheduled' | 'ended' | 'off'
function stateOf(m: BannerRow, now: number): MsgState {
  if (!m.enabled) return 'off'
  if (m.startsAt && new Date(m.startsAt).getTime() > now) return 'scheduled'
  if (m.endsAt && new Date(m.endsAt).getTime() <= now) return 'ended'
  return 'live'
}
const STATE_LABEL: Record<MsgState, string> = { live: 'Showing now', scheduled: 'Scheduled', ended: 'Ended', off: 'Off' }
const STATE_TONE: Record<MsgState, string> = {
  live: 'border-success/40 bg-success/10 text-success',
  scheduled: 'border-gold/40 bg-gold/10 text-gold-ink',
  ended: 'border-border bg-muted text-muted-foreground',
  off: 'border-border bg-muted text-muted-foreground',
}

const PREVIEW_STYLE: Record<BannerSettings['style'], string> = {
  gold: 'bg-gold text-primary-foreground',
  dark: 'border bg-surface text-foreground',
  subtle: 'border bg-gold/10 text-foreground',
}
const STYLES: { value: BannerSettings['style']; label: string }[] = [
  { value: 'gold', label: 'Gold' },
  { value: 'dark', label: 'Dark' },
  { value: 'subtle', label: 'Subtle' },
]

export function BannerEditor({
  value,
  onChange,
  errors,
}: {
  value: BannerForm
  onChange: (fn: (b: BannerForm) => void) => void
  errors: Record<string, string>
}) {
  const now = Date.now()
  const live = value.enabled ? value.messages.filter((m) => stateOf(m, now) === 'live' && m.text.trim()) : []
  const [preview, setPreview] = useState(0)
  const rotate = Number(value.rotateSeconds)
  useEffect(() => {
    setPreview(0)
    if (live.length < 2 || !(rotate > 0)) return
    const t = setInterval(() => setPreview((i) => (i + 1) % live.length), rotate * 1000)
    return () => clearInterval(t)
  }, [live.length, rotate])
  const shown = live[Math.min(preview, live.length - 1)]
  const err = (k: string) => errors[k]
  const move = (i: number, dir: -1 | 1) =>
    onChange((b) => {
      const j = i + dir
      if (j < 0 || j >= b.messages.length) return
      ;[b.messages[i], b.messages[j]] = [b.messages[j], b.messages[i]]
    })

  return (
    <div className="grid gap-5">
      {/* Live preview, exactly what shoppers see right now */}
      <div>
        <p className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <EyeIcon className="size-3.5" /> Preview, as shoppers see it now
        </p>
        {shown ? (
          <div className={cn('relative flex min-h-9 items-center justify-center rounded-md px-10 py-2 text-center text-[13px] font-medium', PREVIEW_STYLE[value.style])}>
            <span>
              {shown.text.trim()}
              {shown.linkUrl.trim() && (
                <span className={cn('ml-2 inline-flex items-center gap-1 font-semibold underline underline-offset-2', value.style !== 'gold' && 'text-gold-ink')}>
                  {shown.linkLabel.trim() || 'Learn more'} <ArrowRightIcon className="size-3" />
                </span>
              )}
            </span>
            {value.dismissible && <XIcon className="absolute right-3 size-4 opacity-70" aria-hidden />}
          </div>
        ) : (
          <p className="rounded-md border border-dashed px-3 py-2.5 text-center text-sm text-muted-foreground">
            {value.enabled ? 'No message is showing right now, so the banner is hidden.' : 'The banner is off and hidden from the shop.'}
          </p>
        )}
        {live.length > 1 && (
          <p className="mt-1.5 text-xs text-muted-foreground">
            {rotate > 0 ? `${live.length} messages rotate every ${rotate} seconds.` : `${live.length} messages are live, but rotation is off so only the first shows.`}
          </p>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="grid gap-1.5">
          <span className="text-sm font-medium">Style</span>
          <div className="grid grid-cols-3 gap-1 rounded-md border p-1" role="radiogroup" aria-label="Banner style">
            {STYLES.map((s) => (
              <button
                key={s.value}
                type="button"
                role="radio"
                aria-checked={value.style === s.value}
                onClick={() => onChange((b) => void (b.style = s.value))}
                className={cn('h-8 rounded-[5px] text-sm transition-colors', value.style === s.value ? 'bg-gold text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <label className="grid gap-1.5" htmlFor="banner-rotate">
          <span className="text-sm font-medium">Seconds per message</span>
          <Input id="banner-rotate" inputMode="numeric" className="font-mono" value={value.rotateSeconds} onChange={(e) => onChange((b) => void (b.rotateSeconds = e.target.value))} aria-invalid={!!err('banner.rotateSeconds')} />
          <span className={cn('text-xs', err('banner.rotateSeconds') ? 'text-destructive' : 'text-muted-foreground')}>{err('banner.rotateSeconds') ?? 'With several messages. 0 shows only the first.'}</span>
        </label>
        <label htmlFor="banner-dismiss" className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border bg-surface px-3 py-2.5">
          <span>
            <span className="block text-sm font-medium">Shoppers can close it</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">It comes back when you change the messages.</span>
          </span>
          <Switch id="banner-dismiss" checked={value.dismissible} onCheckedChange={(v) => onChange((b) => void (b.dismissible = v))} className="mt-0.5" />
        </label>
      </div>

      <div className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium">
            Messages <span className="font-mono text-xs text-muted-foreground">{value.messages.length}/{MAX_BANNER_MESSAGES}</span>
          </p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={value.messages.length >= MAX_BANNER_MESSAGES}
            onClick={() =>
              onChange((b) => void b.messages.push({ key: newKey(), id: newId(), text: '', linkUrl: '', linkLabel: '', enabled: true, startsAt: '', endsAt: '' }))
            }
          >
            <PlusIcon /> Add message
          </Button>
        </div>
        {err('banner.messages') && (
          <p role="alert" className="text-xs text-destructive">
            {err('banner.messages')}
          </p>
        )}
        {value.messages.length === 0 && <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">No messages yet. Add one to show the banner.</p>}
        <ol className="grid gap-3">
          {value.messages.map((m, i) => {
            const k = `banner.messages.${i}`
            const st = stateOf(m, now)
            return (
              <li key={m.key} className="rounded-xl border bg-card p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">#{i + 1}</span>
                    <span className={cn('inline-flex h-6 items-center rounded-md border px-2 text-xs font-medium', STATE_TONE[st])}>{STATE_LABEL[st]}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <label className="mr-2 flex items-center gap-2 text-xs text-muted-foreground" htmlFor={`${k}-on`}>
                      On
                      <Switch id={`${k}-on`} checked={m.enabled} onCheckedChange={(v) => onChange((b) => void (b.messages[i].enabled = v))} />
                    </label>
                    <Button type="button" size="icon-sm" variant="ghost" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                      <ArrowUpIcon />
                    </Button>
                    <Button type="button" size="icon-sm" variant="ghost" aria-label="Move down" disabled={i === value.messages.length - 1} onClick={() => move(i, 1)}>
                      <ArrowDownIcon />
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      aria-label="Duplicate message"
                      disabled={value.messages.length >= MAX_BANNER_MESSAGES}
                      onClick={() => onChange((b) => void b.messages.splice(i + 1, 0, { ...b.messages[i], key: newKey(), id: newId() }))}
                    >
                      <CopyIcon />
                    </Button>
                    <Button type="button" size="icon-sm" variant="ghost" aria-label="Delete message" onClick={() => onChange((b) => void b.messages.splice(i, 1))}>
                      <TrashIcon className="text-destructive" />
                    </Button>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1.5 sm:col-span-2" htmlFor={`${k}-text`}>
                    <span className="flex justify-between text-sm font-medium">
                      Message
                      <span className={cn('font-mono text-xs', m.text.length > BANNER_TEXT_MAX ? 'text-destructive' : 'text-muted-foreground')}>
                        {m.text.length}/{BANNER_TEXT_MAX}
                      </span>
                    </span>
                    <Input id={`${k}-text`} value={m.text} placeholder="Free tracked shipping over RM800" onChange={(e) => onChange((b) => void (b.messages[i].text = e.target.value))} aria-invalid={!!err(`${k}.text`)} />
                    {err(`${k}.text`) && <span className="text-xs text-destructive">{err(`${k}.text`)}</span>}
                  </label>
                  <label className="grid gap-1.5" htmlFor={`${k}-link`}>
                    <span className="text-sm font-medium">
                      Link <span className="text-xs font-normal text-muted-foreground">optional</span>
                    </span>
                    <Input id={`${k}-link`} value={m.linkUrl} placeholder="/shop or https://..." className="font-mono" onChange={(e) => onChange((b) => void (b.messages[i].linkUrl = e.target.value))} aria-invalid={!!err(`${k}.linkUrl`)} />
                    <span className={cn('text-xs', err(`${k}.linkUrl`) ? 'text-destructive' : 'text-muted-foreground')}>{err(`${k}.linkUrl`) ?? 'A page on this site like /bulk, or a full https:// address.'}</span>
                  </label>
                  <label className="grid gap-1.5" htmlFor={`${k}-label`}>
                    <span className="text-sm font-medium">
                      Link text <span className="text-xs font-normal text-muted-foreground">optional</span>
                    </span>
                    <Input id={`${k}-label`} value={m.linkLabel} placeholder="Shop now" maxLength={40} onChange={(e) => onChange((b) => void (b.messages[i].linkLabel = e.target.value))} aria-invalid={!!err(`${k}.linkLabel`)} />
                    <span className={cn('text-xs', err(`${k}.linkLabel`) ? 'text-destructive' : 'text-muted-foreground')}>{err(`${k}.linkLabel`) ?? 'Defaults to "Learn more".'}</span>
                  </label>
                  <label className="grid gap-1.5" htmlFor={`${k}-start`}>
                    <span className="text-sm font-medium">
                      Show from <span className="text-xs font-normal text-muted-foreground">optional</span>
                    </span>
                    <Input id={`${k}-start`} type="datetime-local" value={m.startsAt} onChange={(e) => onChange((b) => void (b.messages[i].startsAt = e.target.value))} />
                  </label>
                  <label className="grid gap-1.5" htmlFor={`${k}-end`}>
                    <span className="text-sm font-medium">
                      Show until <span className="text-xs font-normal text-muted-foreground">optional</span>
                    </span>
                    <Input id={`${k}-end`} type="datetime-local" value={m.endsAt} onChange={(e) => onChange((b) => void (b.messages[i].endsAt = e.target.value))} aria-invalid={!!err(`${k}.endsAt`)} />
                    {err(`${k}.endsAt`) && <span className="text-xs text-destructive">{err(`${k}.endsAt`)}</span>}
                  </label>
                </div>
              </li>
            )
          })}
        </ol>
        <p className="text-xs text-muted-foreground">Messages show in this order. Times use your computer&apos;s time zone.</p>
      </div>
    </div>
  )
}
