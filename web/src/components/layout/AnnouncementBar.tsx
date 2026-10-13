import { ArrowRightIcon, XIcon } from '@phosphor-icons/react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { useSettings } from '@/lib/queries'
import type { Settings } from '@/lib/types'
import { cn } from '@/lib/utils'

// Everything about this strip (on/off, messages, links, schedule, style, rotation,
// dismiss) is set in Admin > Settings > Top banner. The server only sends live messages.

const STYLE: Record<Settings['banner']['style'], string> = {
  gold: 'bg-gold text-primary-foreground',
  dark: 'border-b bg-surface text-foreground [&_a]:text-gold-ink',
  subtle: 'border-b bg-gold/10 text-foreground [&_a]:text-gold-ink',
}

const DISMISS_KEY = 'kyvo-banner-dismissed'

/** A fingerprint of the current messages: a dismissed banner comes back when the admin changes it. */
const fingerprint = (msgs: { id: string; text: string }[]) => msgs.map((m) => `${m.id}:${m.text}`).join('|')

function readDismissed() {
  try {
    return localStorage.getItem(DISMISS_KEY)
  } catch {
    return null
  }
}

export function AnnouncementBar() {
  const { data } = useSettings()
  const reduce = useReducedMotion()
  const banner = data?.banner
  const messages = useMemo(() => banner?.messages ?? [], [banner])
  const print = fingerprint(messages)
  const [dismissed, setDismissed] = useState<string | null>(readDismissed)
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)

  const rotate = banner && banner.rotateSeconds > 0 && messages.length > 1
  useEffect(() => {
    setIndex(0)
  }, [print])
  useEffect(() => {
    if (!rotate || paused) return
    const t = setInterval(() => setIndex((i) => (i + 1) % messages.length), banner.rotateSeconds * 1000)
    return () => clearInterval(t)
  }, [rotate, paused, messages.length, banner?.rotateSeconds])

  if (!banner || messages.length === 0) return null
  if (banner.dismissible && dismissed === print) return null

  const m = messages[Math.min(index, messages.length - 1)]
  const external = /^https:\/\//.test(m.linkUrl)
  const link = m.linkUrl ? (
    external ? (
      <a href={m.linkUrl} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-1 font-semibold whitespace-nowrap underline underline-offset-2">
        {m.linkLabel || 'Learn more'} <ArrowRightIcon className="size-3" />
      </a>
    ) : (
      <Link to={m.linkUrl} className="ml-2 inline-flex items-center gap-1 font-semibold whitespace-nowrap underline underline-offset-2">
        {m.linkLabel || 'Learn more'} <ArrowRightIcon className="size-3" />
      </Link>
    )
  ) : null

  return (
    <div
      className={cn('relative', STYLE[banner.style])}
      role="region"
      aria-label="Store announcement"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className={cn('container-x flex min-h-9 items-center justify-center py-2', banner.dismissible && 'pr-10')}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={m.id + index}
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={{ duration: 0.25 }}
            className="text-center text-[11.5px] leading-snug font-medium tracking-wide sm:text-[13px]"
            aria-live={rotate ? 'polite' : undefined}
          >
            {m.text}
            {link}
          </motion.p>
        </AnimatePresence>
      </div>
      {rotate && (
        <div className="absolute top-1/2 left-3 hidden -translate-y-1/2 gap-1 sm:flex" aria-hidden>
          {messages.map((x, i) => (
            <span key={x.id} className={cn('size-1.5 rounded-full bg-current transition-opacity', i === index ? 'opacity-90' : 'opacity-30')} />
          ))}
        </div>
      )}
      {banner.dismissible && (
        <button
          type="button"
          onClick={() => {
            setDismissed(print)
            try {
              localStorage.setItem(DISMISS_KEY, print)
            } catch {
              /* storage blocked: hidden until reload */
            }
          }}
          className="absolute top-1/2 right-2 grid size-8 -translate-y-1/2 place-items-center rounded-md opacity-80 hover:opacity-100"
          aria-label="Close announcement"
        >
          <XIcon className="size-4" />
        </button>
      )}
    </div>
  )
}
