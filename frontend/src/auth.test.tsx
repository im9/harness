import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LoginError, useAuth } from './auth-context'
import { AuthProvider } from './auth'

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>

function mockFetch(): FetchMock {
  const fn = vi.fn() as FetchMock
  vi.stubGlobal('fetch', fn)
  return fn
}

function jsonResponse(status: number, body: unknown = {}): Response {
  // The fetch Response spec forbids a body on 204/205/304; passing one
  // throws in whatwg-fetch.
  const hasBody = status !== 204 && status !== 205 && status !== 304
  return new Response(hasBody ? JSON.stringify(body) : null, {
    status,
    headers: hasBody ? { 'Content-Type': 'application/json' } : {},
  })
}

// Probe exposes the provider's state and a button-per-action surface. Tests
// drive interactions via userEvent clicks instead of reassigning a module-
// level `let` to capture the hook — the react-hooks/globals lint rule
// prohibits the latter because mutating outside-declared variables in render
// breaks component-purity guarantees.
//
// The login button catches any thrown error and stashes its class name in
// the error-name span so tests can assert `LoginError` is the class thrown
// on invalid credentials without needing to reassign anything in render.
function Probe() {
  const { user, status, login, logout } = useAuth()
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="username">{user?.username ?? ''}</span>
      <span data-testid="error-name"></span>
      <button
        onClick={async () => {
          try {
            await login('alice', 'pw', '123456')
          } catch (e) {
            const el = document.querySelector('[data-testid="error-name"]')
            if (el) el.textContent = (e as Error).constructor.name
          }
        }}
      >
        do-login
      </button>
      <button onClick={() => void logout()}>do-logout</button>
    </div>
  )
}

function renderProvider() {
  return render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AuthProvider', () => {
  it('probes /api/me on mount and enters authenticated state on 200', async () => {
    const fetchMock = mockFetch()
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { id: 1, username: 'alice' }))

    renderProvider()

    // Before the probe resolves, the provider is in the 'loading' state —
    // ProtectedRoute relies on this to avoid a flash of the login redirect
    // for users with valid sessions.
    expect(screen.getByTestId('status').textContent).toBe('loading')

    // Once /api/me answers 200, user is populated and status flips.
    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('authenticated')
    })
    expect(screen.getByTestId('username').textContent).toBe('alice')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/me',
      expect.objectContaining({ credentials: 'include' }),
    )
  })

  it('enters unauthenticated state on 401 from /api/me', async () => {
    const fetchMock = mockFetch()
    fetchMock.mockResolvedValueOnce(jsonResponse(401, { detail: 'unauthenticated' }))

    renderProvider()

    // 401 on mount means "no valid session cookie" — the normal first-load
    // state for a logged-out user. It must NOT trigger a refresh (that would
    // double the request count on every page load) and MUST leave user null.
    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('unauthenticated')
    })
    expect(screen.getByTestId('username').textContent).toBe('')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('login() posts credentials and transitions to authenticated on success', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch()
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401)) // initial /api/me probe
      .mockResolvedValueOnce(jsonResponse(200, { username: 'alice' })) // /api/auth/login

    renderProvider()
    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('unauthenticated')
    })

    await user.click(screen.getByRole('button', { name: 'do-login' }))

    // Login must send JSON body matching the backend's LoginRequest schema
    // (username/password/totp_code). A body mismatch would produce a 422 at
    // runtime that is invisible without this assertion.
    const loginCall = fetchMock.mock.calls[1]
    expect(loginCall[0]).toBe('/api/auth/login')
    const loginInit = loginCall[1] as RequestInit
    expect(loginInit.method).toBe('POST')
    expect(loginInit.credentials).toBe('include')
    expect(JSON.parse(loginInit.body as string)).toEqual({
      username: 'alice',
      password: 'pw',
      totp_code: '123456',
    })

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('authenticated')
    })
    expect(screen.getByTestId('username').textContent).toBe('alice')
  })

  it('login() throws LoginError on 401 and stays unauthenticated', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch()
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401))
      .mockResolvedValueOnce(jsonResponse(401, { detail: 'invalid credentials' }))

    renderProvider()
    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('unauthenticated')
    })

    await user.click(screen.getByRole('button', { name: 'do-login' }))

    // LoginError is the public signal the Login form uses to render an
    // "invalid credentials" message. Asserting the class name pins the
    // exported contract; a generic Error subclass would still render an
    // alert but would break callers that narrow on `instanceof LoginError`.
    await waitFor(() => {
      expect(screen.getByTestId('error-name').textContent).toBe(LoginError.name)
    })
    expect(screen.getByTestId('status').textContent).toBe('unauthenticated')
  })

  it('logout() posts to /api/auth/logout and transitions to unauthenticated', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch()
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { id: 1, username: 'alice' })) // probe
      .mockResolvedValueOnce(jsonResponse(204)) // logout

    renderProvider()
    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('authenticated')
    })

    await user.click(screen.getByRole('button', { name: 'do-logout' }))

    // The POST must actually reach /api/auth/logout — without that call, the
    // server's refresh family is never revoked and a leaked cookie outlives
    // the UI "logout" for up to 7 days.
    await waitFor(() => {
      expect(fetchMock.mock.calls[1][0]).toBe('/api/auth/logout')
    })
    expect((fetchMock.mock.calls[1][1] as RequestInit).method).toBe('POST')

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('unauthenticated')
    })
    expect(screen.getByTestId('username').textContent).toBe('')
  })

  it('logout() still clears local state when the network call fails', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch()
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { id: 1, username: 'alice' }))
      .mockRejectedValueOnce(new Error('network down'))

    renderProvider()
    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('authenticated')
    })

    // Network errors on logout are a UX hazard: if we did not swallow them,
    // a flaky connection would trap the user in "authenticated" with no way
    // to log out locally. The local state must clear regardless.
    await user.click(screen.getByRole('button', { name: 'do-logout' }))
    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('unauthenticated')
    })
  })
})
