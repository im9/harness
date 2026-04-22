import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '../auth'
import AppShell from './AppShell'

type FetchMock = ReturnType<typeof vi.fn<typeof fetch>>

function mockFetch(): FetchMock {
  const fn = vi.fn() as FetchMock
  vi.stubGlobal('fetch', fn)
  return fn
}

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function renderShell() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <AuthProvider>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<div data-testid="outlet-content">child</div>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  )
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AppShell', () => {
  it('renders outlet content inside the main landmark', async () => {
    mockFetch().mockResolvedValueOnce(jsonResponse(200, { username: 'alice' }))

    renderShell()

    const content = await screen.findByTestId('outlet-content')
    // The shell owns the single <main> landmark so downstream routes can focus
    // on content without re-declaring a landmark (and triggering duplicate-main
    // a11y warnings).
    expect(screen.getByRole('main')).toContainElement(content)
  })

  it('exposes a primary navigation landmark in the header', async () => {
    mockFetch().mockResolvedValueOnce(jsonResponse(200, { username: 'alice' }))

    renderShell()

    await screen.findByTestId('outlet-content')
    // Test targets the accessible landmark name rather than a class name so it
    // survives the ADR 004 cockpit redesign that will fill this nav with real
    // links.
    expect(screen.getByRole('navigation', { name: /primary/i })).toBeInTheDocument()
  })

  it('surfaces the signed-in user and a sign-out control once auth resolves', async () => {
    mockFetch().mockResolvedValueOnce(jsonResponse(200, { username: 'alice' }))

    renderShell()

    // "Signed in as <username>" is the header's accessible description of the
    // session-state indicator. Matching on aria-label rather than visible text
    // means later UX changes (avatar image, dropdown) do not break the test.
    expect(await screen.findByLabelText(/signed in as alice/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
  })
})
