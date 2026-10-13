import type { FastifyInstance, FastifyRequest } from 'fastify'
import type { User } from '@prisma/client'
import { z } from 'zod'
import { verifyPassword } from '../../lib/auth.js'
import { gatewayStatus, PAY_ENVS, removeCreds, saveCreds, setMode, testCreds, type PayEnv } from '../../lib/gateway.js'
import { HttpError, parse } from '../../lib/http.js'

// ToyyibPay keys and live/test mode. Every change that affects where money goes
// asks for the admin's password again, and each one is written to the change log.

const limited = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }
const envParam = z.object({ env: z.enum(PAY_ENVS as [PayEnv, ...PayEnv[]]) })
const password = z.string().min(1, 'Enter your password to confirm').max(200)

const adminOf = (req: FastifyRequest) => (req as unknown as { admin: User }).admin

async function confirmPassword(req: FastifyRequest, pw: string) {
  const admin = adminOf(req)
  if (!(await verifyPassword(pw, admin.passwordHash))) throw new HttpError(403, 'That password is not correct')
  return admin
}

export async function adminPaymentRoutes(app: FastifyInstance) {
  app.get('/payments/toyyibpay', async () => gatewayStatus())

  // Save (verify with ToyyibPay first) the keys for one environment.
  app.put('/payments/toyyibpay/:env', limited, async (req) => {
    const { env } = parse(envParam, req.params)
    const body = parse(
      z.object({
        categoryCode: z.string().trim().min(3, 'Enter the category code').max(40).regex(/^[A-Za-z0-9]+$/, 'Category codes are letters and numbers only'),
        // Blank keeps the saved key.
        secretKey: z.string().trim().max(80).regex(/^[A-Za-z0-9-]*$/, 'Secret keys are letters, numbers and dashes only').optional(),
        password,
      }),
      req.body,
    )
    const admin = await confirmPassword(req, body.password)
    const check = await saveCreds(env, { categoryCode: body.categoryCode, secretKey: body.secretKey }, admin.email)
    return { categoryName: check.categoryName, status: await gatewayStatus() }
  })

  app.post('/payments/toyyibpay/:env/test', limited, async (req) => {
    const { env } = parse(envParam, req.params)
    const check = await testCreds(env, adminOf(req).email)
    return { ...check, status: await gatewayStatus() }
  })

  app.post('/payments/toyyibpay/:env/remove', limited, async (req) => {
    const { env } = parse(envParam, req.params)
    const body = parse(z.object({ password }), req.body)
    const admin = await confirmPassword(req, body.password)
    await removeCreds(env, admin.email)
    return { status: await gatewayStatus() }
  })

  app.put('/payments/toyyibpay-mode', limited, async (req) => {
    const body = parse(z.object({ mode: z.enum(PAY_ENVS as [PayEnv, ...PayEnv[]]), password }), req.body)
    const admin = await confirmPassword(req, body.password)
    await setMode(body.mode, admin.email)
    return { status: await gatewayStatus() }
  })
}
