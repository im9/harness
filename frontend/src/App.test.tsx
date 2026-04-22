import { MemoryRouter } from 'react-router-dom'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>

function mockFetch(): FetchMock {
  const fn = vi.fn() as FetchMock
  vi.stubGlobal('fetch', fn)
  return fn
}

function jsonResponse(status: number, body: unknown = {}): Response {
  // The fetch Response spec forbids a body on 204/205/304; passing one
  // throws in whatwg-fetch. Respect that rather than forcing callers to
  // remember which codes are body-less.
  const hasBody = status !== 204 && status !== 205 && status !== 304
  return new Response(hasBody ? JSON.stringify(body) : null, {
    status,
    headers: hasBody ? { 'Content-Type': 'application/json' } : {},
  })
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('App routing', () => {
  it('shows a session-check skeleton while /api/me is still in flight', () => {
    const fetchMock = mockFetch()
    // Pending-forever promise keeps status === "loading" so the skeleton
    // branch is the terminal state for this assertion. The real probe
    // resolves quickly; this simulates the first paint before it does.
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}))

    renderAt('/')

    // role="status" is the accessible landmark the loading indicator exposes
    // so screen readers announce "Checking session" instead of staring at a
    // silent pulse. Matching on the accessible name, not markup, survives
    // visual redesigns of the skeleton block.
    expect(
      screen.getByRole('status', { name: /checking session/i }),
    ).toBeInTheDocument()
  })

  it('unmatched paths render a NotFound view inside the shell', async () => {
    const fetchMock = mockFetch()
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { username: 'alice' }))

    renderAt('/does-not-exist')

    // The 404 view lives under the AppShell so operators keep the primary
    // navigation to bounce back. Asserting on both the heading and the
    // shell's nav landmark pins that relationship.
    expect(
      await screen.findByRole('heading', { name: /page not found/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('navigation', { name: /primary/i }),
    ).toBeInTheDocument()
  })

  it('when the session probe returns 401, the root route redirects to the login form', async () => {
    const fetchMock = mockFetch()
    fetchMock.mockResolvedValueOnce(jsonResponse(401))

    renderAt('/')

    // Spec: an unauthenticated visit to the protected root must end up on
    // the login form. The form is identified by its aria-label so the
    // assertion survives cosmetic markup changes.
    expect(await screen.findByRole('form', { name: /sign in/i })).toBeInTheDocument()
  })

  it('when the session probe returns 200, the root route renders the dashboard', async () => {
    const fetchMock = mockFetch()
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { id: 1, username: 'alice' }))

    renderAt('/')

    // Dashboard distinguishes itself from Login by showing "Signed in as
    // <username>" — both pages share the <h1>harness</h1>, so matching on
    // h1 alone would be ambiguous.
    expect(await screen.findByText(/signed in as/i)).toBeInTheDocument()
    expect(screen.getByText('alice')).toBeInTheDocument()
  })

  it('submitting the login form moves the user to the dashboard', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch()
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401)) // initial probe
      .mockResolvedValueOnce(jsonResponse(200, { username: 'alice' })) // /api/auth/login

    renderAt('/login')

    await user.type(await screen.findByLabelText(/username/i), 'alice')
    await user.type(screen.getByLabelText(/password/i), 'pw')
    await user.type(screen.getByLabelText(/authenticator code/i), '123456')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    // End-to-end contract: a successful login transitions the router to the
    // dashboard. This catches regressions where either the form doesn't
    // submit, login doesn't update AuthContext, or the redirect is missing.
    await waitFor(() => {
      expect(screen.getByText(/signed in as/i)).toBeInTheDocument()
    })
  })

  it('invalid credentials keep the user on the login form and show an error', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch()
    fetchMock
      .mockResolvedValueOnce(jsonResponse(401)) // initial probe
      .mockResolvedValueOnce(jsonResponse(401, { detail: 'invalid credentials' })) // login

    renderAt('/login')

    await user.type(await screen.findByLabelText(/username/i), 'alice')
    await user.type(screen.getByLabelText(/password/i), 'wrong')
    await user.type(screen.getByLabelText(/authenticator code/i), '000000')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    // role="alert" is the accessible contract for the error message — it's
    // what screen readers announce on failure. Matching on text alone would
    // pass even if the alert was replaced with a silent <span>.
    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid credentials/i)
    // Form still visible (no redirect).
    expect(screen.getByRole('form', { name: /sign in/i })).toBeInTheDocument()
  })

  it('clicking sign out from the dashboard returns the user to the login form', async () => {
    const user = userEvent.setup()
    const fetchMock = mockFetch()
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { id: 1, username: 'alice' })) // probe
      .mockResolvedValueOnce(jsonResponse(204)) // logout

    renderAt('/')
    await screen.findByText(/signed in as/i)

    await user.click(screen.getByRole('button', { name: /sign out/i }))

    // After logout, the dashboard is gone and the login form is mounted.
    // Checking both sides avoids a false pass where logout tears down state
    // but the router forgets to navigate away.
    expect(await screen.findByRole('form', { name: /sign in/i })).toBeInTheDocument()
    expect(screen.queryByText(/signed in as/i)).not.toBeInTheDocument()
  })
})
