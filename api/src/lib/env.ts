function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback
  if (v === undefined || v === '') throw new Error(`Missing required env var ${name}`)
  return v
}

const trimSlash = (s: string) => (s.endsWith('/') ? s.slice(0, -1) : s)

const isProd =process.env.NODE_ENV === 'production'

export const env = {
  isProd,
  port: Number(process.env.PORT ?? 8601),
  databaseUrl: req('DATABASE_URL'),
  // Fail closed in production: a default signing secret would let anyone mint admin sessions.
  jwtSecret: isProd ? req('JWT_SECRET') : req('JWT_SECRET', 'dev-only-insecure-secret'),
  cookieSecure: (process.env.COOKIE_SECURE ?? (isProd ? 'true' : 'false')) === 'true',
  uploadDir: process.env.UPLOAD_DIR ?? './uploads',
  publicUrl: trimSlash(process.env.PUBLIC_URL ?? 'http://localhost:5173'),
  // Where ToyyibPay can reach us server-to-server for payment callbacks.
  apiPublicUrl: trimSlash(process.env.API_PUBLIC_URL ?? process.env.PUBLIC_URL ?? 'http://localhost:8601'),
  toyyib: {
    baseUrl: trimSlash(process.env.TOYYIBPAY_BASE_URL ?? 'https://dev.toyyibpay.com'),
    secretKey: process.env.TOYYIBPAY_SECRET_KEY ?? '',
    categoryCode: process.env.TOYYIBPAY_CATEGORY_CODE ?? '',
  },
  // Licensed add-ons. Off unless explicitly enabled for this installation; the
  // store admin cannot see or switch these on from the panel.
  enableMembership: process.env.ENABLE_MEMBERSHIP === 'true',
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.SMTP_FROM ?? '',
  },
}
