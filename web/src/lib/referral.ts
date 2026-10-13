import { api } from './api'

const KEY = 'kyvo-ref'

interface Stored {
  code: string
  expires: number
}

function read(): Stored | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const v = JSON.parse(raw) as Stored
    if (!v.code || v.expires < Date.now()) {
      localStorage.removeItem(KEY)
      return null
    }
    return v
  } catch {
    return null
  }
}

/** Partner code from a ?ref= link, kept for the store's attribution window. */
export function getRefCode(): string | null {
  return read()?.code ?? null
}

/**
 * Call once on load. Picks up ?ref=CODE, logs the click, and remembers the code.
 * Last click wins, matching how most partner programs attribute.
 */
export async function captureReferral() {
  const url = new URL(window.location.href)
  const code = url.searchParams.get('ref')?.trim().toLowerCase()
  if (!code || !/^[a-z0-9]{2,40}$/.test(code)) return
  url.searchParams.delete('ref')
  window.history.replaceState(null, '', url.pathname + (url.search ? url.search : '') + url.hash)
  try {
    const r = await api.post<{ ok: boolean; cookieDays?: number }>('/api/ref/click', {
      code,
      landing: url.pathname,
      referrer: document.referrer.slice(0, 300) || undefined,
    })
    if (r.ok) localStorage.setItem(KEY, JSON.stringify({ code, expires: Date.now() + (r.cookieDays ?? 30) * 86400_000 }))
  } catch {
    /* attribution is best effort */
  }
}
