// Shared fetch wrapper.
// - Sends `credentials: 'include'` so the httpOnly auth cookies are attached.
// - On a 401 from a non-auth endpoint, transparently POSTs /api/auth/refresh
//   and retries the original request once. If refresh fails, the original 401
//   is returned so the caller can treat it as a terminal "re-login required".
//
// Refresh is skipped for `/api/auth/*` itself: a 401 from /auth/refresh or
// /auth/login is already the terminal signal, and recursively refreshing
// would turn a login typo into an infinite loop.

export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const withCreds: RequestInit = { ...init, credentials: 'include' }
  const url = typeof input === 'string' ? input : input.toString()
  const isAuthEndpoint = url.includes('/api/auth/')

  const res = await fetch(input, withCreds)
  if (res.status !== 401 || isAuthEndpoint) return res

  const refresh = await fetch('/api/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  })
  if (!refresh.ok) return res

  return fetch(input, withCreds)
}
