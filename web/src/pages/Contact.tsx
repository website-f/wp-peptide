import { CheckCircleIcon, ClockIcon, EnvelopeSimpleIcon, SealCheckIcon, SpinnerIcon } from '@phosphor-icons/react'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { PageHeader } from '@/components/brand/bits'
import { Field } from '@/components/checkout/Fields'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { api, errorMessage } from '@/lib/api'
import { useMe, useSettings } from '@/lib/queries'
import { useSeo } from '@/lib/seo'

const TOPICS = ['Order', 'Certificate / COA', 'Bulk or invoicing', 'Partner program', 'Build a Box', 'Other']

export default function Contact() {
  useSeo({ title: 'Contact us', description: 'Questions about an order, a certificate or bulk pricing? Send KYVO Labs a message.' })
  const { data: s } = useSettings()
  const { data: me } = useMe()
  const [f, setF] = useState({ name: me?.user?.name ?? '', email: me?.user?.email ?? '', topic: 'Order', orderRef: '', message: '' })
  const send = useMutation({ mutationFn: () => api.post('/api/contact', { ...f, orderRef: f.orderRef || undefined }) })

  return (
    <>
      <PageHeader title="Contact us" intro="One inbox, answered by the people who test, pack and ship your order." />
      <section className="container-x grid gap-10 pb-20 lg:grid-cols-[1.3fr_1fr] lg:gap-16">
        <div className="rounded-xl border bg-card p-5 sm:p-8">
          {send.isSuccess ? (
            <div className="py-10 text-center">
              <CheckCircleIcon weight="fill" className="mx-auto size-12 text-success" />
              <p className="mt-4 font-display text-3xl font-semibold uppercase">Message received</p>
              <p className="mt-2 text-muted-foreground">We reply within one business day, usually sooner.</p>
              <Button asChild variant="outline" className="mt-6">
                <Link to="/shop">Back to the shop</Link>
              </Button>
            </div>
          ) : (
            <form
              className="grid gap-5 sm:grid-cols-2"
              onSubmit={(e) => {
                e.preventDefault()
                send.mutate()
              }}
            >
              <Field id="c-name" label="Name">
                <Input id="c-name" required autoComplete="name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
              </Field>
              <Field id="c-email" label="Email">
                <Input id="c-email" type="email" required autoComplete="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
              </Field>
              <Field id="c-topic" label="Topic">
                <Select value={f.topic} onValueChange={(v) => setF({ ...f, topic: v })}>
                  <SelectTrigger id="c-topic" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TOPICS.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field id="c-order" label="Order number (optional)">
                <Input id="c-order" placeholder="KY10421" className="font-mono" value={f.orderRef} onChange={(e) => setF({ ...f, orderRef: e.target.value })} />
              </Field>
              <Field id="c-msg" label="Message" className="sm:col-span-2" hint="Please do not ask for dosing or usage advice. We supply research materials only.">
                <Textarea id="c-msg" required minLength={5} rows={6} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />
              </Field>
              {send.isError && <p className="text-sm text-destructive sm:col-span-2">{errorMessage(send.error)}</p>}
              <Button type="submit" size="lg" className="sm:col-span-2" disabled={send.isPending}>
                {send.isPending && <SpinnerIcon className="animate-spin" />} Send message
              </Button>
            </form>
          )}
        </div>
        <aside className="grid content-start gap-6">
          {[
            { icon: EnvelopeSimpleIcon, k: 'Email', v: s?.supportEmail ?? '', href: `mailto:${s?.supportEmail}` },
            { icon: ClockIcon, k: 'Response time', v: 'Within one business day, Monday to Friday' },
            { icon: SealCheckIcon, k: 'Certificates', v: 'Most COA questions are answered in the COA library', href: '/coa-library' },
          ].map((x) => (
            <div key={x.k} className="flex gap-4">
              <span className="grid size-11 shrink-0 place-items-center rounded-full bg-gold/10 text-gold-ink">
                <x.icon className="size-5" />
              </span>
              <div>
                <p className="font-display text-xl font-semibold uppercase">{x.k}</p>
                {x.href ? (
                  x.href.startsWith('/') ? (
                    <Link to={x.href} className="text-muted-foreground hover:text-gold-ink">
                      {x.v}
                    </Link>
                  ) : (
                    <a href={x.href} className="text-gold-ink hover:underline">
                      {x.v}
                    </a>
                  )
                ) : (
                  <p className="text-muted-foreground">{x.v}</p>
                )}
              </div>
            </div>
          ))}
        </aside>
      </section>
    </>
  )
}
