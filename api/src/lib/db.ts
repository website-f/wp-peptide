import { PrismaClient } from '@prisma/client'

export const db = new PrismaClient()

export async function ensureSequences() {
  await db.$executeRawUnsafe(`CREATE SEQUENCE IF NOT EXISTS kyvo_order_seq START 10421`)
}

export async function nextOrderNumber(): Promise<string> {
  const rows = await db.$queryRaw<{ n: bigint }[]>`SELECT nextval('kyvo_order_seq') AS n`
  return `KY${rows[0].n.toString()}`
}
