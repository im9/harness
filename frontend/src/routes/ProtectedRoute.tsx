import { Navigate, Outlet } from 'react-router-dom'
import { Skeleton } from '@/components/ui/skeleton'
import { useAuth } from '../auth-context'

export default function ProtectedRoute() {
  const { status } = useAuth()

  if (status === 'loading') {
    // Centered skeleton bar with role="status" + accessible name so assistive
    // tech announces the in-flight probe; the silent `return null` we had
    // before looked to screen-reader users like a broken page. The probe is
    // usually sub-second so a minimal pulse (no layout shift on resolve) is
    // enough.
    return (
      <div
        role="status"
        aria-label="Checking session"
        className="flex min-h-dvh items-center justify-center px-4"
      >
        <Skeleton className="h-8 w-48" />
      </div>
    )
  }
  if (status === 'unauthenticated') return <Navigate to="/login" replace />
  return <Outlet />
}
