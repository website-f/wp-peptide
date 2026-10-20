function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback
  if (v === undefined || v === '') throw new Error(`Missing required env var ${name}`)
  return v
}

const trimSlash = (s: string) => (s.endsWith('/') ? s.slice(0, -1) : s)

const isProd = process.env.NODE_ENV === 'production'

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
  // Seals payment-gateway keys stored in the database (lib/crypto.ts). Fail closed in production.
  // Changing it makes stored keys unreadable: they then have to be entered again in Admin > Settings.
  dataEncryptionKey: isProd ? req('DATA_ENCRYPTION_KEY') : req('DATA_ENCRYPTION_KEY', 'dev-only-insecure-data-key'),
  // Legacy: ToyyibPay keys used to live here. They are imported once into Admin > Settings
  // (encrypted) when no gateway has been set up there yet, and are ignored after that.
  legacyToyyib: {
    baseUrl: trimSlash(process.env.TOYYIBPAY_BASE_URL ?? ''),
    secretKey: process.env.TOYYIBPAY_SECRET_KEY ?? '',
    categoryCode: process.env.TOYYIBPAY_CATEGORY_CODE ?? '',
  },
  // First-party apps using "Sign in with KYVO" (the dose tracker). Blank client id = not connected.
  apps: [
    {
      name: process.env.TRACKER_NAME ?? 'KYVO Tracker',
      clientId: process.env.TRACKER_CLIENT_ID ?? '',
      clientSecret: process.env.TRACKER_CLIENT_SECRET ?? '',
      redirectUris: (process.env.TRACKER_REDIRECT_URIS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
      appUrl: trimSlash(process.env.TRACKER_APP_URL ?? ''),
      webhookUrl: process.env.TRACKER_WEBHOOK_URL ?? '',
      webhookSecret: process.env.TRACKER_WEBHOOK_SECRET ?? '',
    },
  ].filter((a) => a.clientId && a.clientSecret),
  // Licensed add-ons. Off unless explicitly enabled for this installation; the
  // store admin cannot see or switch these on from the panel.
  enableMembership: process.env.ENABLE_MEMBERSHIP === 'true',
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.SMTP_FROM ?? '',
    // Only for a local mail server with a self-signed certificate. Production verifies TLS.
    tlsRejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== 'false',
  },
}
