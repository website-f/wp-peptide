import { CheckCircleIcon, EnvelopeSimpleIcon } from '@phosphor-icons/react'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { Logo } from '@/components/brand/Logo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, errorMessage } from '@/lib/api'
import { useSettings } from '@/lib/queries'

const QUICK = [
  { to: '/account', label: 'My account' },
  { to: '/checkout', label: 'Shopping cart' },
  { to: '/points', label: 'KYVO Points' },
  { to: '/about', label: 'About us' },
  { to: '/faq', label: 'FAQ' },
  { to: '/login?next=/partners/dashboard', label: 'Partner login' },
  { to: '/partners#apply', label: 'Partner signup' },
]
const INFO = [
  { to: '/policies/privacy', label: 'Privacy policy' },
  { to: '/policies/refunds', label: 'Refund policy' },
  { to: '/policies/shipping', label: 'Shipping policy' },
  { to: '/policies/terms', label: 'Terms and conditions' },
  { to: '/policies/research-use', label: 'Research use only' },
]

export function ResearchDisclaimer() {
  return (
    <section className="border-y bg-surface">
      <p className="container-x py-6 text-center text-[13px] leading-relaxed text-muted-foreground md:text-sm">
        All products are sold for laboratory, in vitro research use only. Not for human or veterinary use, and not for use in food, drugs,
        cosmetics or medical devices. By ordering you confirm you are a qualified researcher purchasing for in vitro use in a laboratory setting.
      </p>
    </section>
  )
}

function Newsletter() {
  const [email, setEmail] = useState('')
  const m = useMutation({ mutationFn: () => api.post('/api/newsletter', { email }) })
  if (m.isSuccess) {
    return (
      <p className="flex items-center gap-2 text-sm text-success">
        <CheckCircleIcon weight="fill" className="size-5" /> You are on the list.
      </p>
    )
  }
  return (
    <form
      className="grid gap-2"
      onSubmit={(e) => {
        e.preventDefault()
        m.mutate()
      }}
    >
      <Label htmlFor="newsletter" className="sr-only">
        Email address
      </Label>
      <div className="flex gap-2">
        <Input id="newsletter" type="email" required autoComplete="email" placeholder="you@lab.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Button type="submit" disabled={m.isPending} className="h-11 shrink-0">
          Join
        </Button>
      </div>
      {m.isError && <p className="text-sm text-destructive">{errorMessage(m.error)}</p>}
    </form>
  )
}

export function SiteFooter() {
  const { data: s } = useSettings()
  return (
    <footer className="bg-background">
      <div className="container-x grid gap-10 py-14 md:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1.3fr] lg:gap-8">
        <div>
          <Logo />
          <p className="mt-4 max-w-xs text-sm text-muted-foreground">
            Research peptides and amino acid derivatives, independently tested to above 99% purity, for the research community.
          </p>
          {s && (
            <a href={`mailto:${s.supportEmail}`} className="mt-4 inline-flex items-center gap-2 text-sm text-gold-ink hover:underline">
              <EnvelopeSimpleIcon className="size-4" />
              {s.supportEmail}
            </a>
          )}
        </div>
        <FooterCol title="Quick links" links={QUICK} />
        <FooterCol title="Information" links={INFO} />
        <div>
          <h3 className="font-display text-lg font-semibold tracking-wide uppercase">Newsletter</h3>
          <p className="mt-2 mb-3 text-sm text-muted-foreground">New lots, restocks and offers. No spam.</p>
          <Newsletter />
        </div>
      </div>
      <div className="border-t">
        <div className="container-x flex flex-col items-center justify-between gap-4 py-6 text-[13px] text-muted-foreground sm:flex-row">
          <p>© {new Date().getFullYear()} KYVO Labs. All rights reserved.</p>
          <div className="flex items-center gap-2" aria-label="Accepted payments">
            {['FPX', 'Visa', 'Mastercard', 'DuitNow'].map((p) => (
              <span key={p} className="rounded-md border px-2 py-1 font-mono text-[10px] tracking-wider uppercase">
                {p}
              </span>
            ))}
          </div>
        </div>
        <p className="container-x pb-8 text-[11px] leading-relaxed text-muted-foreground/80">
          Statements on this website have not been evaluated by any drug regulatory authority. Products and information provided by KYVO Labs are not
          intended to diagnose, treat, cure or prevent any disease. KYVO Labs is a research chemical supplier, not a pharmacy or compounding facility.
          All products are sold for research, laboratory or analytical purposes only and are not for human consumption.
        </p>
      </div>
    </footer>
  )
}

function FooterCol({ title, links }: { title: string; links: { to: string; label: string }[] }) {
  return (
    <div>
      <h3 className="font-display text-lg font-semibold tracking-wide uppercase">{title}</h3>
      <ul className="mt-3 grid gap-2.5 text-sm">
        {links.map((l) => (
          <li key={l.to}>
            <Link to={l.to} className="text-muted-foreground transition-colors hover:text-foreground">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
