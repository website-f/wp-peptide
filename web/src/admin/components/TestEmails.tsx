import { CircleNotchIcon, PaperPlaneTiltIcon } from '@phosphor-icons/react'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { api, errorMessage } from '@/lib/api'
import { Field, TextInput } from './kit'

const GROUPS = [
  { id: 'orders', label: 'Order emails', note: '7: received, paid, packed, shipped, delivered, cancelled, refunded' },
  { id: 'account', label: 'Account emails', note: '2: password reset, password changed' },
  { id: 'partners', label: 'Partner emails', note: '6: received, approved, declined, paused, bank changed, payout sent' },
  { id: 'team', label: 'Team alerts', note: '5: paid order, application, payout request, contact message, payment issue' },
] as const
type Group = (typeof GROUPS)[number]['id']

/** Sends every email template with sample data, so the team can see exactly what customers get. */
export function TestEmails({ defaultTo }: { defaultTo: string }) {
  const [to, setTo] = useState(defaultTo)
  const [groups, setGroups] = useState<Group[]>(['orders'])
  const [error, setError] = useState<string | null>(null)
  const send = useMutation({
    mutationFn: () => api.post<{ queued: number; seconds: number }>('/api/admin/notifications/test', { to: to.trim(), groups }),
    onSuccess: (r) => toast.success(`Sending ${r.queued} test emails to ${to.trim()}${r.seconds ? ` over about ${r.seconds} seconds` : ''}. Subjects start with [Test].`),
    onError: (e) => setError(errorMessage(e)),
  })
  return (
    <div className="rounded-lg border bg-surface p-3 sm:p-4">
      <p className="font-medium">Send test emails</p>
      <p className="mt-0.5 text-xs text-muted-foreground">Every template with sample data, sent a few seconds apart. Use it to check the design and that mail lands in the inbox.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <Field label="Send to" htmlFor="test-to" error={error}>
          <TextInput
            id="test-to"
            type="email"
            value={to}
            onChange={(e) => {
              setTo(e.target.value)
              setError(null)
            }}
          />
        </Field>
        <Button
          type="button"
          disabled={send.isPending || !groups.length}
          onClick={() => {
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to.trim())) return setError('Enter a valid email address')
            send.mutate()
          }}
        >
          {send.isPending ? <CircleNotchIcon className="animate-spin" /> : <PaperPlaneTiltIcon />}
          Send test emails
        </Button>
      </div>
      <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
        {GROUPS.map((g) => (
          <label key={g.id} htmlFor={`tg-${g.id}`} className="flex cursor-pointer items-start gap-2.5 text-sm">
            <Checkbox
              id={`tg-${g.id}`}
              checked={groups.includes(g.id)}
              onCheckedChange={(v) => setGroups((cur) => (v ? [...cur, g.id] : cur.filter((x) => x !== g.id)))}
              className="mt-0.5"
            />
            <span>
              <span className="font-medium">{g.label}</span>
              <span className="block text-xs text-muted-foreground">{g.note}</span>
            </span>
          </label>
        ))}
      </div>
    </div>
  )
}
