import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../auth-context'

export default function ProtectedRoute() {
  const { status } = useAuth()
  // Render nothing during the initial /api/me probe so that users with a
  // valid session do not see a flash of the login redirect before the probe
  // resolves. Once status is known, either render the protected subtree or
  // redirect to /login.
  if (status === 'loading') return null
  if (status === 'unauthenticated') return <Navigate to="/login" replace />
  return <Outlet />
}
