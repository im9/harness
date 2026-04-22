import { Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth'
import Dashboard from './routes/Dashboard'
import Login from './routes/Login'
import ProtectedRoute from './routes/ProtectedRoute'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<Dashboard />} />
        </Route>
      </Routes>
    </AuthProvider>
  )
}
