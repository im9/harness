import { Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth'
import AppShell from './components/AppShell'
import ErrorBoundary from './components/ErrorBoundary'
import { SettingsProvider } from './lib/settings-provider'
import Dashboard from './routes/Dashboard'
import Login from './routes/Login'
import NotFound from './routes/NotFound'
import ProtectedRoute from './routes/ProtectedRoute'
import Settings from './routes/Settings'

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route element={<ProtectedRoute />}>
            <Route
              element={
                <SettingsProvider>
                  <AppShell />
                </SettingsProvider>
              }
            >
              <Route path="/" element={<Dashboard />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Route>
        </Routes>
      </AuthProvider>
    </ErrorBoundary>
  )
}
