import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LogOut } from 'lucide-react'
import { useAuth } from '@/auth-context'
import ThemeToggle from '@/components/ThemeToggle'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n'
import { cn } from '@/lib/utils'

export default function AppShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { t } = useTranslation()

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="bg-background text-foreground flex h-dvh flex-col">
      <header className="border-border bg-background border-b">
        <div className="mx-auto flex h-14 w-full max-w-screen-2xl items-center gap-6 px-4">
          {/* Product name "harness" stays verbatim per ADR 009 — proper
              noun, not translated. */}
          <Link to="/" className="text-sm font-semibold tracking-tight">
            harness
          </Link>
          <nav
            aria-label={t('appShell.navAriaLabel')}
            className="flex items-center gap-4 text-sm"
          >
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                cn(
                  'transition-colors',
                  isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                )
              }
            >
              {t('appShell.nav.dashboard')}
            </NavLink>
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                cn(
                  'transition-colors',
                  isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                )
              }
            >
              {t('appShell.nav.settings')}
            </NavLink>
            <NavLink
              to="/help"
              className={({ isActive }) =>
                cn(
                  'transition-colors',
                  isActive ? 'text-foreground' : 'text-muted-foreground hover:text-foreground',
                )
              }
            >
              {t('appShell.nav.help')}
            </NavLink>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            {user && (
              <span
                aria-label={t('appShell.signedInAs', { username: user.username })}
                className="bg-muted flex size-7 items-center justify-center rounded-full text-xs font-medium"
              >
                {user.username.slice(0, 1).toUpperCase()}
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut />
              {t('appShell.signOut')}
            </Button>
          </div>
        </div>
      </header>
      {/* Dashboard is the hero viewport (ADR 004): the primary chart
          must fill the space below the nav. Route content owns its own
          scroll — this shell gives it a fixed-height flex container
          rather than a page-scrolling wrapper. */}
      <main className="flex min-h-0 flex-1 flex-col">
        <div className="mx-auto flex h-full w-full max-w-screen-2xl min-h-0 flex-col px-4 py-4">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
