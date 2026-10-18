import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { useSeo } from '@/lib/seo'

export default function NotFound() {
  useSeo({ title: 'Page not found', noindex: true })
  return (
    <section className="container-x flex min-h-[60dvh] flex-col justify-center py-20">
      <p className="font-mono text-sm text-gold-ink">404</p>
      <h1 className="display mt-3 text-6xl sm:text-7xl">Page not found.</h1>
      <p className="mt-4 max-w-md text-muted-foreground">The link may be old, or the page has moved.</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Button asChild size="lg">
          <Link to="/shop">Shop compounds</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link to="/">Home</Link>
        </Button>
      </div>
    </section>
  )
}
