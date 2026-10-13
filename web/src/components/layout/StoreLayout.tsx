import { Suspense, useEffect } from 'react'
import { Outlet, ScrollRestoration } from 'react-router'
import { AgeGate } from './AgeGate'
import { CartDrawer } from './CartDrawer'
import { SiteFooter } from './SiteFooter'
import { AnnouncementBar } from './AnnouncementBar'
import { SiteHeader } from './SiteHeader'
import { captureReferral } from '@/lib/referral'
import { useSettings } from '@/lib/queries'

export function PageFallback() {
  return (
    <div className="container-x py-24" aria-busy>
      <div className="h-14 w-2/3 max-w-lg animate-pulse rounded-md bg-muted" />
      <div className="mt-4 h-5 w-1/2 max-w-sm animate-pulse rounded-md bg-muted" />
      <div className="mt-12 grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="aspect-square animate-pulse rounded-xl bg-muted" />
        ))}
      </div>
    </div>
  )
}

export function StoreLayout() {
  useSettings()
  useEffect(() => {
    void captureReferral()
  }, [])
  return (
    <div className="grain flex min-h-[100dvh] flex-col">
      <a href="#main" className="sr-only z-50 rounded-md bg-gold px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Skip to content
      </a>
      <AnnouncementBar />
      <SiteHeader />
      <main id="main" className="flex-1">
        <Suspense fallback={<PageFallback />}>
          <Outlet />
        </Suspense>
      </main>
      <SiteFooter />
      <CartDrawer />
      <AgeGate />
      <ScrollRestoration />
    </div>
  )
}
