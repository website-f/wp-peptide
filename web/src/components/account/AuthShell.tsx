import type { ReactNode } from 'react'
import { Logo } from '@/components/brand/Logo'

/** Centered narrow card on a quiet marble-ish backdrop, shared by sign in and register. */
export function AuthShell({ title, intro, children, footer }: { title: string; intro?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="relative isolate overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,color-mix(in_oklch,var(--gold)_12%,transparent),transparent_60%)]"
      />
      <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-px gold-rule" />
      <div className="mx-auto flex w-full max-w-[440px] flex-col px-4 py-12 sm:py-20">
        <div className="mb-8 flex justify-center">
          <Logo />
        </div>
        <div className="rounded-xl border bg-card/90 p-5 shadow-[0_30px_80px_-40px_color-mix(in_oklch,var(--foreground)_35%,transparent)] backdrop-blur-sm sm:p-8">
          <h1 className="display text-4xl sm:text-5xl">{title}</h1>
          {intro && <p className="mt-2.5 text-sm text-muted-foreground">{intro}</p>}
          <div className="mt-7">{children}</div>
        </div>
        {footer && <div className="mt-6 text-center text-sm text-muted-foreground">{footer}</div>}
      </div>
    </div>
  )
}
