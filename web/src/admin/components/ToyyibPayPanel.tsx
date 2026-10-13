import { CheckCircleIcon, CircleNotchIcon, EyeIcon, EyeSlashIcon, LockKeyIcon, PlugsConnectedIcon, ShieldCheckIcon, WarningCircleIcon, XCircleIcon } from '@phosphor-icons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { api, errorMessage } from '@/lib/api'
import { date } from '@/lib/format'
import { cn } from '@/lib/utils'
import { CopyButton, Field, Pill, TextInput } from './kit'
import type { GatewayEnvStatus, GatewayStatus, PayEnv } from '../lib/types'

const ENV_LABEL: Record<PayEnv, string> = { sandbox: 'Sandbox', production: 'Production' }
const ENV_HOST: Record<PayEnv, string> = { sandbox: 'dev.toyyibpay.com', production: 'toyyibpay.com' }

type Confirm = {
  title: string
  description: ReactNode
  confirmLabel: string
  danger?: boolean
  /** Something on the checklist is not ready; the confirm button stays disabled. */
  blocked?: boolean
  run: (password: string) => Promise<unknown>
}

/**
 * ToyyibPay keys and live/test mode. Keys are encrypted on the server and only the
 * category code and last 4 characters of the secret come back. Every change asks for the
 * admin's password and is applied immediately (not part of the Save changes bar).
 */
export function ToyyibPayPanel({ initial }: { initial: GatewayStatus }) {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['admin', 'gateway'], queryFn: () => api.get<GatewayStatus>('/api/admin/payments/toyyibpay'), initialData: initial })
  const g = q.data
  const [editing, setEditing] = useState<PayEnv | null>(null)
  const [confirm, setConfirm] = useState<Confirm | null>(null)

  const apply = (status: GatewayStatus) => {
    qc.setQueryData(['admin', 'gateway'], status)
    void qc.invalidateQueries({ queryKey: ['admin', 'settings'] })
  }

  const test = useMutation({
    mutationFn: (e: PayEnv) => api.post<{ ok: boolean; categoryName?: string; error?: string; status: GatewayStatus }>(`/api/admin/payments/toyyibpay/${e}/test`),
    onSuccess: (r, e) => {
      apply(r.status)
      if (r.ok) toast.success(`${ENV_LABEL[e]} keys work. ToyyibPay category: ${r.categoryName}`)
      else toast.error(r.error ?? 'ToyyibPay did not accept these keys')
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  const switchTo = (mode: PayEnv) => {
    if (mode === g.mode) return
    const target = g[mode]
    const live = mode === 'production'
    const keysOk = Boolean(target.configured && target.readable && target.verifiedAt)
    setConfirm({
      blocked: live ? !keysOk || Boolean(g.productionBlocker) : !(target.configured && target.readable),
      title: live ? 'Start taking real payments?' : 'Switch to test payments?',
      danger: !live,
      confirmLabel: live ? 'Go live' : 'Switch to sandbox',
      description: live ? (
        <div className="space-y-3">
          <Checklist
            items={[
              { ok: keysOk, label: 'Production keys saved and verified with ToyyibPay' },
              { ok: !g.productionBlocker, label: g.productionBlocker ?? 'Site runs on https and ToyyibPay can reach the callback' },
            ]}
          />
          <p>New payments go to your live ToyyibPay account and customers are charged real money. Orders already waiting on a sandbox bill can still finish there.</p>
          <p className="text-muted-foreground">Tip: place one small real order and refund it to confirm everything end to end.</p>
        </div>
      ) : (
        <p>New payments go to the ToyyibPay sandbox. No real money moves, so do not do this while real customers are ordering.</p>
      ),
      run: async (password) => apply((await api.put<{ status: GatewayStatus }>('/api/admin/payments/toyyibpay-mode', { mode, password })).status),
    })
  }

  const remove = (e: PayEnv) =>
    setConfirm({
      title: `Remove ${ENV_LABEL[e].toLowerCase()} keys?`,
      danger: true,
      confirmLabel: 'Remove keys',
      description: <p>The encrypted keys are deleted. Orders still waiting on a {ENV_LABEL[e].toLowerCase()} bill can no longer be checked automatically.</p>,
      run: async (password) => apply((await api.post<{ status: GatewayStatus }>(`/api/admin/payments/toyyibpay/${e}/remove`, { password })).status),
    })

  return (
    <div className="space-y-5">
      {/* ---------- Mode ---------- */}
      <div
        className={cn(
          'rounded-lg border p-3 sm:p-4',
          !g.ready ? 'border-destructive/40 bg-destructive/5' : g.mode === 'production' ? 'border-success/40 bg-success/5' : 'border-warning/40 bg-warning/5',
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Payments currently go to</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-2 font-medium">
              {g.mode === 'production' ? 'Production: real money' : 'Sandbox: test payments only'}
              {!g.ready && <Pill tone="destructive">Not working</Pill>}
            </p>
          </div>
          <div role="radiogroup" aria-label="ToyyibPay mode" className="inline-flex rounded-md border bg-background p-1">
            {(['sandbox', 'production'] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={g.mode === m}
                onClick={() => switchTo(m)}
                className={cn(
                  'h-8 rounded-[5px] px-3 text-[13px] font-medium transition-colors',
                  g.mode === m
                    ? m === 'production'
                      ? 'bg-success text-background shadow-sm'
                      : 'bg-card text-foreground shadow-sm ring-1 ring-border'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {ENV_LABEL[m]}
              </button>
            ))}
          </div>
        </div>
        {!g.ready && (
          <p className="mt-2 flex items-start gap-1.5 text-xs text-destructive" role="alert">
            <WarningCircleIcon className="mt-px size-3.5 shrink-0" />
            Online payment is hidden from customers until {ENV_LABEL[g.mode].toLowerCase()} keys are added below.
          </p>
        )}
      </div>

      {/* ---------- Keys ---------- */}
      <div className="grid gap-4 xl:grid-cols-2">
        {(['sandbox', 'production'] as const).map((e) =>
          editing === e ? (
            <KeysForm
              key={e}
              env={e}
              current={g[e]}
              onCancel={() => setEditing(null)}
              onSubmit={(categoryCode, secretKey) =>
                setConfirm({
                  title: `Save ${ENV_LABEL[e].toLowerCase()} keys`,
                  confirmLabel: 'Verify and save',
                  description: <p>The keys are checked with ToyyibPay ({ENV_HOST[e]}) first, then stored encrypted.</p>,
                  run: async (password) => {
                    const r = await api.put<{ categoryName: string; status: GatewayStatus }>(`/api/admin/payments/toyyibpay/${e}`, {
                      categoryCode,
                      ...(secretKey ? { secretKey } : {}),
                      password,
                    })
                    apply(r.status)
                    setEditing(null)
                    toast.success(`Verified with ToyyibPay: category "${r.categoryName}"`)
                  },
                })
              }
            />
          ) : (
            <KeysCard
              key={e}
              env={e}
              s={g[e]}
              inUse={g.mode === e}
              testing={test.isPending && test.variables === e}
              onEdit={() => setEditing(e)}
              onTest={() => test.mutate(e)}
              onRemove={() => remove(e)}
            />
          ),
        )}
      </div>

      {/* ---------- Addresses ---------- */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="text-xs text-muted-foreground">Callback URL (ToyyibPay confirms payments here)</p>
          <div className="mt-1 flex min-w-0 items-center gap-1 rounded-md border bg-background pl-3">
            <code className="min-w-0 flex-1 truncate font-mono text-xs">{g.callbackUrl}</code>
            <CopyButton text={g.callbackUrl} label="Copy callback URL" />
          </div>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Customers return to</p>
          <p className="mt-1 truncate rounded-md border bg-surface px-3 py-2 font-mono text-xs text-muted-foreground">{g.returnUrl}</p>
        </div>
      </div>
      {g.productionBlocker && (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <WarningCircleIcon className="mt-px size-3.5 shrink-0 text-warning" />
          Live payments cannot be switched on from this server: {g.productionBlocker}.
        </p>
      )}

      {/* ---------- Change log ---------- */}
      {g.log.length > 0 && (
        <details className="group rounded-lg border">
          <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-medium select-none">
            Change history <span className="font-normal text-muted-foreground">({g.log.length})</span>
          </summary>
          <ul className="divide-y border-t text-[13px]">
            {g.log.map((l, i) => (
              <li key={i} className="grid gap-0.5 px-3 py-2 sm:grid-cols-[10rem_1fr] sm:gap-3">
                <span className="font-mono text-xs text-muted-foreground">{date(l.at, true)}</span>
                <span className="min-w-0">
                  {l.action} <span className="text-muted-foreground">by {l.by}</span>
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <LockKeyIcon className="mt-px size-3.5 shrink-0" />
        Keys are encrypted (AES-256) before they are stored and are never shown in full again. Changing keys or mode needs your password.
      </p>

      <PasswordDialog confirm={confirm} onClose={() => setConfirm(null)} />
    </div>
  )
}

function Checklist({ items }: { items: { ok: boolean; label: string }[] }) {
  return (
    <ul className="space-y-1.5">
      {items.map((it) => (
        <li key={it.label} className="flex items-start gap-2">
          {it.ok ? <CheckCircleIcon weight="fill" className="mt-0.5 size-4 shrink-0 text-success" /> : <XCircleIcon weight="fill" className="mt-0.5 size-4 shrink-0 text-destructive" />}
          <span className={cn(!it.ok && 'text-destructive')}>{it.label}</span>
        </li>
      ))}
    </ul>
  )
}

function KeysCard({
  env,
  s,
  inUse,
  testing,
  onEdit,
  onTest,
  onRemove,
}: {
  env: PayEnv
  s: GatewayEnvStatus
  inUse: boolean
  testing: boolean
  onEdit: () => void
  onTest: () => void
  onRemove: () => void
}) {
  const state = !s.configured ? 'none' : !s.readable ? 'unreadable' : s.verifiedAt ? 'verified' : 'unverified'
  return (
    <div className={cn('flex flex-col rounded-lg border p-3 sm:p-4', inUse ? 'bg-card ring-1 ring-gold/30' : 'bg-surface')} data-testid={`keys-${env}`}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium">{ENV_LABEL[env]} keys</p>
        {inUse && <Pill tone="gold">In use</Pill>}
        {state === 'verified' && <Pill tone="success">Verified</Pill>}
        {state === 'unverified' && <Pill tone="warning">Not verified yet</Pill>}
        {state === 'unreadable' && <Pill tone="destructive">Enter again</Pill>}
        {state === 'none' && <Pill tone="muted">Not added</Pill>}
      </div>
      {state === 'none' ? (
        <p className="mt-2 text-[13px] text-muted-foreground">
          From your {env === 'production' ? 'live' : 'sandbox'} ToyyibPay account at <span className="font-mono">{ENV_HOST[env]}</span>: the User Secret Key and the code of
          the category bills should go to.
        </p>
      ) : state === 'unreadable' ? (
        <p className="mt-2 text-[13px] text-destructive">The saved keys cannot be read on this server (its encryption key changed). Enter them again.</p>
      ) : (
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[13px]">
          <dt className="text-muted-foreground">Category</dt>
          <dd className="min-w-0 truncate">
            <span className="font-mono">{s.categoryCode}</span>
            {s.categoryName && <span className="text-muted-foreground"> ({s.categoryName})</span>}
          </dd>
          <dt className="text-muted-foreground">Secret key</dt>
          <dd className="font-mono">•••• •••• {s.secretHint}</dd>
          <dt className="text-muted-foreground">Verified</dt>
          <dd>{s.verifiedAt ? date(s.verifiedAt, true) : 'Not yet'}</dd>
          <dt className="text-muted-foreground">Changed</dt>
          <dd className="min-w-0 truncate">
            {s.updatedAt ? date(s.updatedAt, true) : ''} <span className="text-muted-foreground">by {s.updatedBy}</span>
          </dd>
        </dl>
      )}
      <div className="mt-auto flex flex-wrap gap-2 pt-4">
        {state !== 'none' && state !== 'unreadable' && (
          <Button type="button" size="sm" variant="outline" onClick={onTest} disabled={testing}>
            {testing ? <CircleNotchIcon className="animate-spin" /> : <PlugsConnectedIcon />}
            Test connection
          </Button>
        )}
        <Button type="button" size="sm" variant={state === 'none' || state === 'unreadable' ? 'default' : 'ghost'} onClick={onEdit}>
          {state === 'none' || state === 'unreadable' ? 'Add keys' : 'Change keys'}
        </Button>
        {s.configured && !inUse && (
          <Button type="button" size="sm" variant="ghost" className="hover:text-destructive" onClick={onRemove}>
            Remove
          </Button>
        )}
      </div>
    </div>
  )
}

function KeysForm({
  env,
  current,
  onCancel,
  onSubmit,
}: {
  env: PayEnv
  current: GatewayEnvStatus
  onCancel: () => void
  onSubmit: (categoryCode: string, secretKey: string) => void
}) {
  const keep = Boolean(current.configured && current.readable)
  const [categoryCode, setCategoryCode] = useState(current.categoryCode ?? '')
  const [secretKey, setSecretKey] = useState('')
  const [show, setShow] = useState(false)
  const [errors, setErrors] = useState<{ categoryCode?: string; secretKey?: string }>({})
  const submit = (e: FormEvent) => {
    e.preventDefault()
    const next: typeof errors = {}
    if (!/^[A-Za-z0-9]{3,40}$/.test(categoryCode.trim())) next.categoryCode = 'Category codes are 3 to 40 letters and numbers'
    if (!keep && !secretKey.trim()) next.secretKey = 'Enter the secret key'
    else if (secretKey.trim() && !/^[A-Za-z0-9-]{8,80}$/.test(secretKey.trim())) next.secretKey = 'Secret keys are letters, numbers and dashes'
    setErrors(next)
    if (!Object.keys(next).length) onSubmit(categoryCode.trim(), secretKey.trim())
  }
  return (
    <form onSubmit={submit} noValidate className="rounded-lg border bg-card p-3 ring-1 ring-gold/30 sm:p-4" data-testid={`keys-form-${env}`}>
      <p className="font-medium">{ENV_LABEL[env]} keys</p>
      <p className="mt-1 text-xs text-muted-foreground">
        From your {env === 'production' ? 'live' : 'sandbox'} ToyyibPay account at <span className="font-mono">{ENV_HOST[env]}</span>.
      </p>
      <div className="mt-4 grid gap-4">
        <Field label="Category code" htmlFor={`tp-${env}-cat`} error={errors.categoryCode}>
          <TextInput
            id={`tp-${env}-cat`}
            value={categoryCode}
            onChange={(ev) => setCategoryCode(ev.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
            aria-invalid={!!errors.categoryCode}
          />
        </Field>
        <Field label="User secret key" htmlFor={`tp-${env}-key`} error={errors.secretKey} hint={keep ? `Leave blank to keep the saved key (ending ${current.secretHint}).` : undefined}>
          <div className="relative">
            <TextInput
              id={`tp-${env}-key`}
              type={show ? 'text' : 'password'}
              value={secretKey}
              onChange={(ev) => setSecretKey(ev.target.value)}
              autoComplete="new-password"
              spellCheck={false}
              placeholder={keep ? '•••• •••• ' + current.secretHint : ''}
              className="pr-10 font-mono"
              aria-invalid={!!errors.secretKey}
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              aria-label={show ? 'Hide secret key' : 'Show secret key'}
            >
              {show ? <EyeSlashIcon className="size-4" /> : <EyeIcon className="size-4" />}
            </button>
          </div>
        </Field>
      </div>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm">
          <ShieldCheckIcon /> Verify and save
        </Button>
      </div>
    </form>
  )
}

function PasswordDialog({ confirm, onClose }: { confirm: Confirm | null; onClose: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const close = () => {
    if (pending) return
    setPassword('')
    setError(null)
    onClose()
  }
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!confirm || pending) return
    if (!password) return setError('Enter your password to confirm')
    setPending(true)
    setError(null)
    try {
      await confirm.run(password)
      setPending(false)
      setPassword('')
      onClose()
    } catch (err) {
      setPending(false)
      setError(errorMessage(err))
    }
  }
  return (
    <Dialog open={!!confirm} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-semibold tracking-wide uppercase">{confirm?.title}</DialogTitle>
            <DialogDescription asChild>
              <div className="text-left text-sm text-foreground">{confirm?.description}</div>
            </DialogDescription>
          </DialogHeader>
          <div className="mt-4">
            <Field label="Your admin password" htmlFor="tp-confirm-pw" error={error}>
              <TextInput id="tp-confirm-pw" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
            </Field>
          </div>
          <DialogFooter className="mt-5">
            <Button type="button" variant="outline" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" variant={confirm?.danger ? 'destructive' : 'default'} disabled={pending || confirm?.blocked}>
              {pending && <CircleNotchIcon className="animate-spin" />}
              {pending ? 'Checking...' : confirm?.confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
