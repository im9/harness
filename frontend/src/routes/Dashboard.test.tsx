import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { dashboardDefault } from '@/lib/mocks/dashboard'
import type { UseDashboardState } from '@/lib/use-dashboard'

// Stub the data-flow hook so the route test stays focused on layout
// behavior instead of the SSE / REST plumbing, which has its own
// dedicated tests in `use-dashboard.test.tsx`.
const { useDashboardMock } = vi.hoisted(() => ({
  useDashboardMock: vi.fn<() => UseDashboardState>(),
}))

vi.mock('@/lib/use-dashboard', () => ({
  useDashboard: useDashboardMock,
}))

import Dashboard from './Dashboard'

describe('Dashboard route', () => {
  it('renders a loading region before the initial payload arrives', () => {
    useDashboardMock.mockReturnValue({ data: null, loading: true, error: null })
    render(<Dashboard />)
    // The loading state is announced via role=status so screen readers
    // describe "Loading dashboard" rather than staring at a silent
    // skeleton pulse. Matching on the accessible name keeps the test
    // stable across visual redesigns of the placeholder.
    expect(
      screen.getByRole('status', { name: /loading dashboard/i }),
    ).toBeInTheDocument()
  })

  it('renders one banner per tracked instrument once data is loaded', () => {
    useDashboardMock.mockReturnValue({
      data: dashboardDefault,
      loading: false,
      error: null,
    })
    render(<Dashboard />)
    // StateBanner uses role=status — one per instrument row. This
    // asserts the route wires the payload's `rows` array into the
    // layout.
    const banners = screen.getAllByRole('status')
    // The dashboard itself doesn't add a role=status wrapper once data
    // is present, so the only status regions are from the state banners.
    expect(banners).toHaveLength(dashboardDefault.rows.length)
  })

  it('exposes the session status strip as a labeled landmark', () => {
    useDashboardMock.mockReturnValue({
      data: dashboardDefault,
      loading: false,
      error: null,
    })
    render(<Dashboard />)
    expect(
      screen.getByRole('region', { name: /session status/i }),
    ).toBeInTheDocument()
  })

  it('renders the rule gauge once per instrument row', () => {
    useDashboardMock.mockReturnValue({
      data: dashboardDefault,
      loading: false,
      error: null,
    })
    render(<Dashboard />)
    // ADR 004 layout: the rule gauge sits at the bottom of each
    // instrument row so the cap state is readable without scrolling
    // back to a global header — hence N progressbars for N rows.
    expect(screen.getAllByRole('progressbar')).toHaveLength(
      dashboardDefault.rows.length,
    )
  })

  it('shows each instrument display name', () => {
    useDashboardMock.mockReturnValue({
      data: dashboardDefault,
      loading: false,
      error: null,
    })
    render(<Dashboard />)
    for (const row of dashboardDefault.rows) {
      expect(screen.getByText(row.instrument.displayName)).toBeInTheDocument()
    }
  })

  it('shows an alert and keeps the snapshot when a stream error arrives', () => {
    useDashboardMock.mockReturnValue({
      data: dashboardDefault,
      loading: false,
      error: new Error('stream blip'),
    })
    render(<Dashboard />)
    // Transient stream errors should not blank the UI — the operator
    // needs to keep seeing the last known engine state and a small
    // badge explaining why it may be stale.
    expect(screen.getByRole('alert')).toHaveTextContent(/stream blip/i)
    expect(screen.getByRole('region', { name: /session status/i })).toBeInTheDocument()
  })

  it('renders an error-only view when the initial fetch fails with no data', () => {
    useDashboardMock.mockReturnValue({
      data: null,
      loading: false,
      error: new Error('unreachable'),
    })
    render(<Dashboard />)
    expect(screen.getByRole('alert')).toHaveTextContent(/unreachable/i)
  })
})
