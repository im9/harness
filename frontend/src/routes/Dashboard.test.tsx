import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { dashboardDefault } from '@/lib/mocks/dashboard'
import Dashboard from './Dashboard'

describe('Dashboard route', () => {
  it('renders one banner per tracked instrument in the default mock', () => {
    render(<Dashboard />)
    // StateBanner uses role=status — one per instrument row. This asserts
    // the page wires the mock payload's `rows` array into the layout.
    const banners = screen.getAllByRole('status')
    expect(banners).toHaveLength(dashboardDefault.rows.length)
  })

  it('exposes the session status strip as a labeled landmark', () => {
    render(<Dashboard />)
    // The strip is the always-visible top frame; labeling it as a region
    // lets screen-reader users jump to it directly and keeps the header
    // context available from anywhere on the page.
    expect(
      screen.getByRole('region', { name: /session status/i }),
    ).toBeInTheDocument()
  })

  it('renders the rule gauge once per instrument row', () => {
    render(<Dashboard />)
    // ADR 004 layout: the rule gauge sits at the bottom of each
    // instrument row so the cap state is readable without scrolling
    // back to a global header — hence N progressbars for N rows.
    expect(screen.getAllByRole('progressbar')).toHaveLength(
      dashboardDefault.rows.length,
    )
  })

  it('shows each instrument display name', () => {
    render(<Dashboard />)
    for (const row of dashboardDefault.rows) {
      expect(screen.getByText(row.instrument.displayName)).toBeInTheDocument()
    }
  })
})
