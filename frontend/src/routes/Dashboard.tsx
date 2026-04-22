import { useAuth } from '../auth-context'

export default function Dashboard() {
  const { user } = useAuth()

  return (
    <p>
      Signed in as <strong>{user?.username}</strong>
    </p>
  )
}
