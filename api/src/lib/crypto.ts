import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'
import { env } from './env.js'

// Secrets kept in the database (payment gateway keys) are sealed with AES-256-GCM.
// The key never touches the database: it is derived from DATA_ENCRYPTION_KEY in the
// server environment, so a leaked database dump or backup alone cannot reveal them.
//
// Format: "v1.<iv>.<tag>.<ciphertext>" (base64url). Each value is bound to its field name
// (additional authenticated data), so a ciphertext copied into another field fails to open.

const VERSION = 'v1'
let key: Buffer | null = null

function dataKey() {
  key ??= Buffer.from(hkdfSync('sha256', env.dataEncryptionKey, 'kyvo', 'kyvo:settings-secrets:v1', 32))
  return key
}

export function seal(plain: string, field: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', dataKey(), iv)
  cipher.setAAD(Buffer.from(field))
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return [VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ct.toString('base64url')].join('.')
}

/** Returns null when the value cannot be opened (wrong DATA_ENCRYPTION_KEY, tampered, or wrong field). */
export function open(sealed: string, field: string): string | null {
  const [v, iv, tag, ct] = sealed.split('.')
  if (v !== VERSION || !iv || !tag || !ct) return null
  try {
    const decipher = createDecipheriv('aes-256-gcm', dataKey(), Buffer.from(iv, 'base64url'))
    decipher.setAAD(Buffer.from(field))
    decipher.setAuthTag(Buffer.from(tag, 'base64url'))
    return Buffer.concat([decipher.update(Buffer.from(ct, 'base64url')), decipher.final()]).toString('utf8')
  } catch {
    return null
  }
}
