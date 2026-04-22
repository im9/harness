// AuthProvider: owns session state and exposes it via AuthContext.
//
// Transport: httpOnly cookies (ADR 001 §Token strategy). JS never reads or
// writes tokens; it only makes credentialed requests and observes status
// codes. Membership in "authenticated" is decided by the server's response
// to /api/me, not by a JS-side boolean that could drift from reality.

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  AuthContext,
  LoginError,
  type AuthContextValue,
  type AuthStatus,
  type User,
} from './auth-context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')

  useEffect(() => {
    let cancelled = false
    const probe = async () => {
      try {
        // Direct fetch (not apiFetch): a 401 on the mount probe means "no
        // session", a normal state — not something to refresh. Using apiFetch
        // would add a refresh attempt on every page load for logged-out users.
        const res = await fetch('/api/me', { credentials: 'include' })
        if (cancelled) return
        if (res.ok) {
          const data = (await res.json()) as { username: string }
          setUser({ username: data.username })
          setStatus('authenticated')
        } else {
          setUser(null)
          setStatus('unauthenticated')
        }
      } catch {
        if (!cancelled) {
          setUser(null)
          setStatus('unauthenticated')
        }
      }
    }
    void probe()
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(
    async (username: string, password: string, totpCode: string) => {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, totp_code: totpCode }),
      })
      if (!res.ok) {
        let detail = 'login failed'
        try {
          const body = (await res.json()) as { detail?: string }
          if (body.detail) detail = body.detail
        } catch {
          // Non-JSON or empty body (e.g. a proxy 502) — fall back to the
          // generic message rather than crashing on parse.
        }
        throw new LoginError(res.status, detail)
      }
      const data = (await res.json()) as { username: string }
      setUser({ username: data.username })
      setStatus('authenticated')
    },
    [],
  )

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    } catch {
      // Swallow transport errors: logout must always clear local state so
      // the user is never trapped in "authenticated" by a flaky connection.
    }
    setUser(null)
    setStatus('unauthenticated')
  }, [])

  const value: AuthContextValue = { user, status, login, logout }
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
