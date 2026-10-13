import { ListIcon, MoonIcon, ShoppingBagIcon, SunIcon, UserCircleIcon, XIcon } from '@phosphor-icons/react'
import { useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router'
import { Logo } from '@/components/brand/Logo'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { cartCount, useCart } from '@/lib/cart'
import { useFeatures, useMe, useSettings } from '@/lib/queries'
import { useTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'

export const NAV = [
  { to: '/shop', label: 'Products' },
  { to: '/build-a-box', label: 'Build a Box' },
  { to: '/bulk', label: 'Bulk Orders' },
  { to: '/coa-library', label: 'COA Library' },
  { to: '/membership', label: 'Membership' },
  { to: '/partners', label: 'Partner Program' },
  { to: '/contact', label: 'Contact' },
]

export function AnnouncementBar() {
  const { data } = useSettings()
  if (!data?.announcement) return <div className="h-9 bg-gold/90" aria-hidden />
  return (
    <div className="bg-gold text-primary-foreground">
      <p className="container-x flex min-h-9 items-center justify-center py-2 text-center text-[11.5px] leading-snug font-medium tracking-wide sm:text-[13px]">
        {data.announcement}
      </p>
    </div>
  )
}

export function SiteHeader() {
  const [menu, setMenu] = useState(false)
  const items = useCart((s) => s.items)
  const setOpen = useCart((s) => s.setOpen)
  const { data: me } = useMe()
  const { theme, toggle } = useTheme()
  const location = useLocation()
  const count = cartCount(items)
  const features = useFeatures()
  const nav = NAV.filter((n) => n.to !== '/membership' || features.membership)
  const user = me?.user

  return (
    <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/70">
      <div className="container-x flex h-16 items-center gap-4">
        <Button variant="ghost" size="icon" className="-ml-2 lg:hidden" onClick={() => setMenu(true)} aria-label="Open menu">
          <ListIcon className="size-6" />
        </Button>
        <Logo />
        <nav className="ml-6 hidden flex-1 items-center gap-0.5 lg:flex" aria-label="Main">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                cn(
                  'rounded-md px-2.5 py-2 font-display text-[15px] font-medium tracking-[0.04em] whitespace-nowrap text-muted-foreground uppercase transition-colors hover:text-foreground xl:px-3',
                  isActive && 'text-gold-ink',
                  n.to === '/contact' && 'hidden xl:block',
                )
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={toggle} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>
            {theme === 'dark' ? <SunIcon className="size-5" /> : <MoonIcon className="size-5" />}
          </Button>
          <Button variant="ghost" size="icon" asChild>
            <Link to={user ? (user.role === 'ADMIN' ? '/admin' : '/account') : '/login'} state={{ from: location.pathname }} aria-label={user ? 'Your account' : 'Sign in'}>
              <UserCircleIcon className="size-6" />
            </Link>
          </Button>
          <Button variant="ghost" size="icon" className="relative -mr-2" onClick={() => setOpen(true)} aria-label={`Cart, ${count} items`}>
            <ShoppingBagIcon className="size-6" />
            {count > 0 && (
              <span className="absolute top-1 right-1 grid min-w-[18px] place-items-center rounded-full bg-gold px-1 font-mono text-[10px] leading-[18px] font-semibold text-primary-foreground">
                {count > 99 ? '99+' : count}
              </span>
            )}
          </Button>
        </div>
      </div>

      <Sheet open={menu} onOpenChange={setMenu}>
        <SheetContent side="left" className="gap-0 p-0 data-[side=left]:w-[86vw] data-[side=left]:max-w-sm" showCloseButton={false}>
          <div className="flex h-16 items-center justify-between border-b px-4">
            <SheetTitle asChild>
              <div>
                <Logo to={null} />
              </div>
            </SheetTitle>
            <Button variant="ghost" size="icon" onClick={() => setMenu(false)} aria-label="Close menu">
              <XIcon className="size-5" />
            </Button>
          </div>
          <nav className="flex flex-col p-2" aria-label="Mobile">
            {[{ to: '/', label: 'Home' }, ...nav].map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
                end={n.to === '/'}
                onClick={() => setMenu(false)}
                className={({ isActive }) =>
                  cn('rounded-md px-3 py-3 font-display text-2xl font-semibold tracking-wide uppercase', isActive ? 'text-gold-ink' : 'text-foreground')
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-auto grid gap-2 border-t p-4">
            {user ? (
              <Button asChild variant="outline" size="lg" onClick={() => setMenu(false)}>
                <Link to={user.role === 'ADMIN' ? '/admin' : '/account'}>{user.role === 'ADMIN' ? 'Admin panel' : 'My account'}</Link>
              </Button>
            ) : (
              <Button asChild size="lg" onClick={() => setMenu(false)}>
                <Link to="/login">Sign in</Link>
              </Button>
            )}
            {me?.affiliate && (
              <Button asChild variant="ghost" onClick={() => setMenu(false)}>
                <Link to="/partners/dashboard">Partner dashboard</Link>
              </Button>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </header>
  )
}
