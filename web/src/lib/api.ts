export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message)
  }
}

type Body = Record<string, unknown> | unknown[] | FormData | undefined

async function request<T>(method: string, url: string, body?: Body): Promise<T> {
  const init: RequestInit = { method, credentials: 'same-origin', headers: {} }
  if (body instanceof FormData) init.body = body
  else if (body !== undefined) {
    init.body = JSON.stringify(body)
    ;(init.headers as Record<string, string>)['content-type'] = 'application/json'
  }
  let res: Response
  try {
    res = await fetch(url, init)
  } catch {
    throw new ApiError(0, 'Could not reach the server. Check your connection and try again.')
  }
  const text = await res.text()
  const data = text ? safeJson(text) : null
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error ?? `Request failed (${res.status})`
    throw new ApiError(res.status, msg, (data as { details?: unknown } | null)?.details)
  }
  return data as T
}

function safeJson(t: string) {
  try {
    return JSON.parse(t)
  } catch {
    return t
  }
}

function qs(params?: Record<string, string | number | boolean | undefined | null>) {
  if (!params) return ''
  const s = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') s.set(k, String(v))
  const out = s.toString()
  return out ? `?${out}` : ''
}

export const api = {
  get: <T>(url: string, params?: Record<string, string | number | boolean | undefined | null>) => request<T>('GET', url + qs(params)),
  post: <T>(url: string, body?: Body) => request<T>('POST', url, body ?? {}),
  put: <T>(url: string, body?: Body) => request<T>('PUT', url, body ?? {}),
  patch: <T>(url: string, body?: Body) => request<T>('PATCH', url, body ?? {}),
  del: <T>(url: string) => request<T>('DELETE', url),
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : 'Something went wrong')
