import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth-context'

export default function Dashboard() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = async () => {
    await logout()
    navigate('/login', { replace: true })
  }

  return (
    <main>
      <h1>harness</h1>
      <p>
        Signed in as <strong>{user?.username}</strong>
      </p>
      <button type="button" onClick={handleLogout}>
        Sign out
      </button>
    </main>
  )
}
