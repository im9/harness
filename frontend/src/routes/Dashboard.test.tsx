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

  it('renders one state banner for the primary instrument', () => {
    useDashboardMock.mockReturnValue({
      data: dashboardDefault,
      loading: false,
      error: null,
    })
    render(<Dashboard />)
    // ADR 004 Phase 1 centers on a single primary instrument. The route
    // wires `data.primary` into a single StateBanner; role=status is the
    // banner's accessible affordance.
    const banners = screen.getAllByRole('status')
    expect(banners).toHaveLength(1)
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

  it('renders the rule gauge once for the primary panel', () => {
    useDashboardMock.mockReturnValue({
      data: dashboardDefault,
      loading: false,
      error: null,
    })
    render(<Dashboard />)
    // ADR 004 layout: the rule gauge sits at the bottom of the primary
    // panel so the cap state is readable without scrolling back to a
    // global header. Exactly one gauge since Phase 1 has one primary.
    expect(screen.getAllByRole('progressbar')).toHaveLength(1)
  })

  it("shows the primary instrument's display name", () => {
    useDashboardMock.mockReturnValue({
      data: dashboardDefault,
      loading: false,
      error: null,
    })
    render(<Dashboard />)
    expect(
      screen.getByText(dashboardDefault.primary.instrument.displayName),
    ).toBeInTheDocument()
  })

  it('renders the primary panel and right-column widgets as landmarks', () => {
    useDashboardMock.mockReturnValue({
      data: dashboardDefault,
      loading: false,
      error: null,
    })
    render(<Dashboard />)
    // ADR 004 Dashboard layout: a left primary panel plus a right
    // widget column (Watchlist above NewsFeed). Asserting on accessible
    // landmark names keeps the test stable across the visual reshape
    // and lets screen readers navigate the two surfaces.
    expect(
      screen.getByRole('region', { name: /primary instrument/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('complementary', { name: /watchlist/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('complementary', { name: /news/i }),
    ).toBeInTheDocument()
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
