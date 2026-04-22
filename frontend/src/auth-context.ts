// Auth context + hook + types. Split from the AuthProvider component so the
// provider file exports only a component — a requirement of Vite's Fast
// Refresh (eslint: react-refresh/only-export-components).

import { createContext, useContext } from 'react'

export type User = { username: string }
export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated'

export type AuthContextValue = {
  user: User | null
  status: AuthStatus
  login: (username: string, password: string, totpCode: string) => Promise<void>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

export class LoginError extends Error {
  // status lets the Login form distinguish 401 (show "invalid credentials")
  // from 500/network errors (show the actual detail so the user/dev can see
  // what went wrong — a bare "invalid credentials" for a schema error would
  // hide the real failure).
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}
