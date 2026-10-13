/**
 * Admin account bootstrap and recovery. No admin credentials ever live in .env.
 *
 *   seedAdminOnce()            run by the seeder on every container start, but only acts the
 *                              very first time (a marker row in Setting makes it a one-shot).
 *   npx tsx prisma/admin.ts reset [email]
 *                              recovery: issues a new one-time password for an admin account.
 *
 * Generated passwords are printed once to stdout (`docker compose logs api`) and must be
 * replaced at first sign-in (mustChangePassword).
 */
import { randomInt } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const MARKER = 'bootstrap.adminSeeded'
const DEFAULT_EMAIL = 'admin@kyvo.local'

// Unambiguous alphabet: no 0/O, 1/l/I.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
function oneTimePassword() {
  const chunk = () => Array.from({ length: 5 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')
  return `${chunk()}-${chunk()}-${chunk()}`
}

function banner(title: string, email: string, password: string) {
  const lines = [
    title,
    '',
    `  Email:    ${email}`,
    `  Password: ${password}`,
    '',
    'Sign in at /admin. You will be asked to set your own',
    'email and password straight away. This is shown only once.',
  ]
  const width = Math.max(...lines.map((l) => l.length)) + 4
  const bar = '='.repeat(width)
  console.log(`\n${bar}\n${lines.map((l) => `| ${l.padEnd(width - 4)} |`).join('\n')}\n${bar}\n`)
}

export async function seedAdminOnce(db: PrismaClient) {
  if (await db.setting.findUnique({ where: { key: MARKER } })) return
  const existing = await db.user.findFirst({ where: { role: 'ADMIN' } })
  if (existing) {
    // Installs created before the one-shot seeder: never create a second admin.
    await db.setting.create({ data: { key: MARKER, value: { at: new Date().toISOString(), adopted: existing.email } } })
    return
  }
  const password = oneTimePassword()
  await db.$transaction([
    db.user.create({
      data: { email: DEFAULT_EMAIL, name: 'Store admin', role: 'ADMIN', mustChangePassword: true, passwordHash: await bcrypt.hash(password, 11) },
    }),
    db.setting.create({ data: { key: MARKER, value: { at: new Date().toISOString(), email: DEFAULT_EMAIL } } }),
  ])
  banner('KYVO admin account created (first start only)', DEFAULT_EMAIL, password)
}

async function reset(email?: string) {
  const db = new PrismaClient()
  try {
    const admin = email
      ? await db.user.findUnique({ where: { email: email.toLowerCase() } })
      : await db.user.findFirst({ where: { role: 'ADMIN' }, orderBy: { createdAt: 'asc' } })
    if (!admin || admin.role !== 'ADMIN') {
      console.error(email ? `No admin account with email ${email}` : 'No admin account found')
      process.exitCode = 1
      return
    }
    const password = oneTimePassword()
    await db.user.update({ where: { id: admin.id }, data: { passwordHash: await bcrypt.hash(password, 11), mustChangePassword: true } })
    banner('KYVO admin password reset', admin.email, password)
  } finally {
    await db.$disconnect()
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [cmd, email] = process.argv.slice(2)
  if (cmd === 'reset') await reset(email)
  else console.log('Usage: npx tsx prisma/admin.ts reset [email]')
}
