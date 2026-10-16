import {
  ArrowSquareOutIcon,
  CertificateIcon,
  ChartLineUpIcon,
  GearSixIcon,
  ArchiveIcon,
  HandshakeIcon,
  ListIcon,
  MoonIcon,
  PackageIcon,
  ReceiptIcon,
  SignOutIcon,
  SquaresFourIcon,
  SunIcon,
  TagIcon,
  TrayIcon,
  UserCircleIcon,
  UsersThreeIcon,
  CubeIcon,
} from '@phosphor-icons/react'
import { useQueryClient } from '@tanstack/react-query'
import { Suspense, useEffect, useState, type ComponentType } from 'react'
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Logo } from '@/components/brand/Logo'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { api, errorMessage } from '@/lib/api'
import { useMe, useSettings } from '@/lib/queries'
import { useTheme } from '@/lib/theme'
import { cn } from '@/lib/utils'
import { FirstSignInSetup, MyAccountDialog } from './components/AccountSecurity'
import { PageSkeleton } from './components/kit'
import { useAdminQueue } from './lib/queries'
import type { Queue } from './lib/types'

type NavItem = {
  to: string
  label: string
  icon: ComponentType<{ className?: string; weight?: 'regular' | 'fill' | 'duotone' }>
  end?: boolean
  badge?: (q: Queue) => number
  badgeLabel?: string
}

const NAV: { group: string; items: NavItem[] }[] = [
  { group: 'Overview', items: [{ to: '/admin', label: 'Dashboard', icon: SquaresFourIcon, end: true }] },
  {
    group: 'Sales',
    items: [
      { to: '/admin/orders', label: 'Orders', icon: ReceiptIcon, badge: (q) => q.toFulfil, badgeLabel: 'to fulfil' },
      { to: '/admin/subscriptions', label: 'Subscriptions', icon: CubeIcon },
      { to: '/admin/coupons', label: 'Coupons', icon: TagIcon },
    ],
  },
  {
    group: 'Catalogue',
    items: [
      { to: '/admin/products', label: 'Products', icon: PackageIcon },
      { to: '/admin/coas', label: 'COA library', icon: CertificateIcon },
    ],
  },
  {
    group: 'People',
    items: [
      { to: '/admin/customers', label: 'Customers', icon: UsersThreeIcon },
      {
        to: '/admin/partners',
        label: 'Partners',
        icon: HandshakeIcon,
        badge: (q) => q.partnerApplications + q.payoutRequests,
        badgeLabel: 'applications and payout requests',
      },
    ],
  },
  { group: 'Money', items: [{ to: '/admin/finance', label: 'Finance', icon: ChartLineUpIcon }] },
  {
    group: 'Store',
    items: [
      { to: '/admin/inbox', label: 'Inbox', icon: TrayIcon, badge: (q) => q.unreadMessages, badgeLabel: 'unread messages' },
      { to: '/admin/settings', label: 'Settings', icon: GearSixIcon },
      { to: '/admin/archive', label: 'Archive', icon: ArchiveIcon },
    ],
  },
]

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { data: queue } = useAdminQueue()
  return (
    <nav aria-label="Admin" className="flex flex-col gap-5 px-3 pb-6">
      {NAV.map((g) => (
        <div key={g.group}>
          <p className="px-2.5 pb-1.5 font-mono text-[10px] tracking-[0.18em] text-muted-foreground/80 uppercase">{g.group}</p>
          <ul className="grid gap-0.5">
            {g.items.map((n) => {
              const count = queue && n.badge ? n.badge(queue) : 0
              const Icon = n.icon
              return (
                <li key={n.to}>
                  <NavLink
                    to={n.to}
                    end={n.end}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'group flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                          : 'text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
                      )
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <Icon className={cn('size-[18px] shrink-0', isActive ? 'text-gold-ink' : 'text-muted-foreground group-hover:text-foreground')} weight={isActive ? 'fill' : 'regular'} />
                        <span className="flex-1 truncate">{n.label}</span>
                        {count > 0 && (
                          <span
                            className="grid h-5 min-w-5 place-items-center rounded-md bg-gold/15 px-1.5 font-mono text-[11px] font-semibold text-gold-ink tabular-nums"
                            aria-label={`${count} ${n.badgeLabel ?? ''}`}
                          >
                            {count > 99 ? '99+' : count}
                          </span>
                        )}
                      </>
                    )}
                  </NavLink>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}

function SidebarBrand() {
  return (
    <div className="flex h-14 items-center gap-2 px-5">
      <Logo to="/admin" compact />
      <span className="rounded-md border border-gold/30 bg-gold/10 px-1.5 py-0.5 font-mono text-[10px] tracking-[0.16em] text-gold-ink uppercase">Admin</span>
    </div>
  )
}

function LayoutSkeleton() {
  return (
    <div className="flex min-h-dvh bg-background">
      <aside className="hidden w-60 shrink-0 border-r bg-sidebar p-4 lg:block">
        <Skeleton className="mb-8 h-7 w-28" />
        {Array.from({ length: 9 }).map((_, i) => (
          <Skeleton key={i} className="mb-2 h-8 w-full" />
        ))}
      </aside>
      <main className="flex-1 p-4 sm:p-6 lg:p-8">
        <PageSkeleton />
      </main>
    </div>
  )
}

export default function AdminLayout() {
  useSettings() // configures currency formatting for money()
  const { data: me, isLoading } = useMe()
  const { theme, toggle } = useTheme()
  const [menu, setMenu] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  const qc = useQueryClient()

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  useEffect(() => {
    const prev = document.title
    document.title = 'KYVO Admin'
    return () => {
      document.title = prev
    }
  }, [])

  if (isLoading) return <LayoutSkeleton />
  const user = me?.user
  if (!user || user.role !== 'ADMIN') return <Navigate to="/login?next=/admin" replace />

  async function signOut() {
    try {
      await api.post('/api/auth/logout')
    } catch (e) {
      toast.error(errorMessage(e))
      return
    }
    await qc.invalidateQueries({ queryKey: ['me'] })
    qc.removeQueries({ queryKey: ['admin'] })
    navigate('/')
  }

  // One-time password still in use: show the setup screen only. No sidebar, no admin queries.
  if (user.mustChangePassword) return <FirstSignInSetup user={user} onSignOut={signOut} />

  return (
    <div className="flex min-h-dvh bg-background">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <SidebarBrand />
        <div className="scrollbar-none flex-1 overflow-y-auto pt-2">
          <SidebarNav />
        </div>
      </aside>

      <Sheet open={menu} onOpenChange={setMenu}>
        <SheetContent side="left" className="w-72 gap-0 border-sidebar-border bg-sidebar p-0">
          <SheetTitle className="sr-only">Admin menu</SheetTitle>
          <SheetDescription className="sr-only">Navigate between admin sections</SheetDescription>
          <SidebarBrand />
          <div className="flex-1 overflow-y-auto pt-2">
            <SidebarNav onNavigate={() => setMenu(false)} />
          </div>
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <Button variant="ghost" size="icon" className="-ml-2 lg:hidden" onClick={() => setMenu(true)} aria-label="Open menu">
            <ListIcon className="size-5" />
          </Button>
          <div className="lg:hidden">
            <Logo to="/admin" compact />
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
              <Link to="/" target="_blank" rel="noreferrer">
                <ArrowSquareOutIcon />
                View store
              </Link>
            </Button>
            <Button variant="ghost" size="icon" onClick={toggle} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}>
              {theme === 'dark' ? <SunIcon className="size-5" /> : <MoonIcon className="size-5" />}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-9 gap-2 px-2" aria-label="Account menu">
                  <span className="grid size-7 place-items-center rounded-md bg-gold/15 font-display text-sm font-semibold text-gold-ink uppercase">
                    {user.name.slice(0, 1)}
                  </span>
                  <span className="hidden max-w-32 truncate text-sm md:inline">{user.name}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="font-normal">
                  <p className="truncate text-sm font-medium">{user.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild className="sm:hidden">
                  <Link to="/" target="_blank" rel="noreferrer">
                    <ArrowSquareOutIcon />
                    View store
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setAccountOpen(true)}>
                  <UserCircleIcon />
                  My account
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={signOut}>
                  <SignOutIcon />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Suspense fallback={<PageSkeleton />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
      <MyAccountDialog user={user} open={accountOpen} onOpenChange={setAccountOpen} />
    </div>
  )
}
