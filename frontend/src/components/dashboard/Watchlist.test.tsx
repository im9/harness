import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { WatchlistItem } from '@/lib/dashboard-types'
import Watchlist from './Watchlist'

function makeItem(overrides: Partial<WatchlistItem> = {}): WatchlistItem {
  const base: WatchlistItem = {
    instrument: {
      symbol: 'TPXM',
      displayName: 'TOPIX Mini',
      venue: 'OSE',
      tickSize: 0.25,
      tickValue: 250,
      quoteCurrency: 'JPY',
    },
    state: 'HOLD',
    lastPrice: 2_812.5,
    lastPriceAt: '2026-04-24T01:00:00Z',
    pctChange: 0.28,
    sparkline: [
      { time: 1_000_000, value: 2_810 },
      { time: 1_000_010, value: 2_812 },
      { time: 1_000_020, value: 2_812.5 },
    ],
  }
  return { ...base, ...overrides }
}

describe('Watchlist', () => {
  it('exposes the widget as a labeled complementary landmark', () => {
    render(<Watchlist items={[makeItem()]} onSwap={() => {}} />)
    // `<aside>` with aria-label surfaces as role=complementary. The
    // Dashboard route test asserts the same landmark; keeping the
    // label stable keeps both tests aligned.
    expect(
      screen.getByRole('complementary', { name: /watchlist/i }),
    ).toBeInTheDocument()
  })

  it('renders one button per tracked instrument', () => {
    // Buttons (not links or divs) because the action — swapping
    // primary — is a client-side state change, not a navigation.
    // role=button lets keyboard users tab through rows naturally.
    const items = [
      makeItem({ instrument: { ...makeItem().instrument, symbol: 'TPXM' } }),
      makeItem({
        instrument: { ...makeItem().instrument, symbol: 'USDJPY' },
      }),
      makeItem({ instrument: { ...makeItem().instrument, symbol: 'ES' } }),
    ]
    render(<Watchlist items={items} onSwap={() => {}} />)
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(3)
  })

  it('shows the ticker, display name, pctChange, and last price', () => {
    render(<Watchlist items={[makeItem()]} onSwap={() => {}} />)
    expect(screen.getByText('TPXM')).toBeInTheDocument()
    expect(screen.getByText('TOPIX Mini')).toBeInTheDocument()
    // pctChange prefixed with + for positive values; asserting on the
    // formatted string catches regressions where a flat value renders
    // as "0" instead of "+0.00%".
    expect(screen.getByText('+0.28%')).toBeInTheDocument()
    // Last price formatted with locale separator at the 4-digit scale.
    expect(screen.getByText('2,812.50')).toBeInTheDocument()
  })

  it('invokes onSwap with the row symbol when clicked', async () => {
    // The single contract between Watchlist and its parent: click →
    // symbol. Everything else (re-subscription, payload re-projection,
    // primary-chart rebuild) is the parent's / backend's job.
    const onSwap = vi.fn()
    const user = userEvent.setup()
    render(
      <Watchlist
        items={[
          makeItem({
            instrument: { ...makeItem().instrument, symbol: 'USDJPY' },
          }),
        ]}
        onSwap={onSwap}
      />,
    )
    await user.click(screen.getByRole('button', { name: /USDJPY/ }))
    expect(onSwap).toHaveBeenCalledTimes(1)
    expect(onSwap).toHaveBeenCalledWith('USDJPY')
  })

  it('encodes the state on the row for CSS / test access', () => {
    // data-state is the stable contract between Watchlist and styling
    // (or future transitions); asserting on it keeps the test robust
    // against visual tweaks to the dot color.
    const { container } = render(
      <Watchlist
        items={[makeItem({ state: 'ENTER' })]}
        onSwap={() => {}}
      />,
    )
    expect(container.querySelector('[data-state="enter"]')).not.toBeNull()
  })

  it('renders an empty-state message when no items are tracked', () => {
    render(<Watchlist items={[]} onSwap={() => {}} />)
    expect(screen.getByText(/no secondary instruments tracked/i)).toBeInTheDocument()
  })
})
