import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InstrumentRowState } from '@/lib/dashboard-types'

// lightweight-charts renders to canvas and does not exercise in jsdom.
// Mock it here with shared spies so we can assert that PriceChart calls
// the library with the right shape. The global no-op mock in
// test-setup.ts would otherwise hand back fresh anonymous spies each
// render, which the assertions below cannot reach into.
const {
  setData,
  createPriceLine,
  createSeriesMarkers,
  removeChart,
  addSeries,
} = vi.hoisted(() => ({
  setData: vi.fn(),
  createPriceLine: vi.fn(),
  createSeriesMarkers: vi.fn(),
  removeChart: vi.fn(),
  addSeries: vi.fn(),
}))

vi.mock('lightweight-charts', () => ({
  createChart: vi.fn(() => ({
    addSeries: (...args: unknown[]) => {
      addSeries(...args)
      return {
        setData,
        createPriceLine: (...pargs: unknown[]) => {
          createPriceLine(...pargs)
          return { applyOptions: vi.fn() }
        },
        removePriceLine: vi.fn(),
      }
    },
    removeSeries: vi.fn(),
    timeScale: () => ({ fitContent: vi.fn() }),
    applyOptions: vi.fn(),
    remove: removeChart,
  })),
  createSeriesMarkers: (...args: unknown[]) => {
    createSeriesMarkers(...args)
    return { setMarkers: vi.fn(), detach: vi.fn() }
  },
  CandlestickSeries: { __tag: 'Candlestick' },
  LineSeries: { __tag: 'Line' },
}))

import PriceChart from './PriceChart'

function row(overrides: Partial<InstrumentRowState> = {}): InstrumentRowState {
  const base: InstrumentRowState = {
    instrument: {
      symbol: 'FUT-A',
      displayName: 'Mock Future A',
      tickSize: 0.25,
      tickValue: 5,
      quoteCurrency: 'USD',
    },
    state: 'HOLD',
    setup: {
      setupName: 'Opening range break',
      side: 'long',
      target: { price: 17620.5, label: '+2R' },
      retreat: { price: 17548.75, label: 'stop' },
      rMultiple: 0,
    },
    lastPrice: 17582.25,
    lastPriceAt: '2026-04-23T09:45:00Z',
    macro: null,
    bars: [
      { time: 1_777_000_000, open: 17_580, high: 17_585, low: 17_579, close: 17_583 },
      { time: 1_777_000_060, open: 17_583, high: 17_590, low: 17_582, close: 17_589 },
      { time: 1_777_000_120, open: 17_589, high: 17_592, low: 17_580, close: 17_582.25 },
    ],
    indicators: [],
  }
  return { ...base, ...overrides }
}

beforeEach(() => {
  setData.mockClear()
  createPriceLine.mockClear()
  createSeriesMarkers.mockClear()
  removeChart.mockClear()
  addSeries.mockClear()
})

afterEach(() => {
  setData.mockClear()
  createPriceLine.mockClear()
  createSeriesMarkers.mockClear()
  removeChart.mockClear()
  addSeries.mockClear()
})

describe('PriceChart', () => {
  it('renders a chart container labeled by the instrument display name', () => {
    render(<PriceChart timeframe="10s" onTimeframeChange={() => {}} row={row()} />)
    // Accessible name lets screen readers distinguish which instrument's
    // chart they are focused on when the page has multiple rows stacked.
    expect(
      screen.getByLabelText(/mock future a price chart/i),
    ).toBeInTheDocument()
  })

  it('feeds the mock bars into a candlestick series', () => {
    render(<PriceChart timeframe="10s" onTimeframeChange={() => {}} row={row()} />)
    expect(addSeries).toHaveBeenCalled()
    expect(setData).toHaveBeenCalledTimes(1)
    // The component re-shapes our Bar type into the lightweight-charts
    // CandlestickData shape (adds `time` as a UTCTimestamp). Asserting
    // on the length pins the pipe without coupling to property order.
    const data = setData.mock.calls[0][0] as unknown[]
    expect(data).toHaveLength(3)
  })

  it('draws target and retreat price lines when a setup is active', () => {
    render(<PriceChart timeframe="10s" onTimeframeChange={() => {}} row={row()} />)
    // One call per level. The specific color / line-style are visual
    // choices covered by the component body, not the test.
    expect(createPriceLine).toHaveBeenCalledTimes(2)
    const prices = createPriceLine.mock.calls.map(
      (call) => (call[0] as { price: number }).price,
    )
    expect(prices).toContain(17620.5)
    expect(prices).toContain(17548.75)
  })

  it('does not draw price lines when no setup is active', () => {
    render(<PriceChart timeframe="10s" onTimeframeChange={() => {}} row={row({ setup: null })} />)
    expect(createPriceLine).not.toHaveBeenCalled()
  })

  it('places a trigger marker on the last bar when state is ENTER', () => {
    render(<PriceChart timeframe="10s" onTimeframeChange={() => {}} row={row({ state: 'ENTER' })} />)
    // The marker cross-references the state banner — ENTER announcements
    // and a visible chart arrow must land together to pass a glance test.
    expect(createSeriesMarkers).toHaveBeenCalledTimes(1)
  })

  it('skips markers when the state does not warrant one', () => {
    render(<PriceChart timeframe="10s" onTimeframeChange={() => {}} row={row({ state: 'HOLD' })} />)
    expect(createSeriesMarkers).not.toHaveBeenCalled()
  })

  it('tears the chart down on unmount', () => {
    const { unmount } = render(<PriceChart timeframe="10s" onTimeframeChange={() => {}} row={row()} />)
    unmount()
    expect(removeChart).toHaveBeenCalledTimes(1)
  })

  it('renders an empty-state message when no bars are available', () => {
    render(<PriceChart timeframe="10s" onTimeframeChange={() => {}} row={row({ bars: [] })} />)
    // Lightweight-charts happily accepts an empty series but an empty
    // chart is a silent regression signal — the placeholder surfaces it.
    expect(screen.getByText(/no price data/i)).toBeInTheDocument()
  })

  it('adds one line series per payload indicator alongside the candles', () => {
    const fixture = row({
      indicators: [
        {
          name: 'EMA20',
          kind: 'ema',
          points: [
            { time: 1_777_000_000, value: 17_580 },
            { time: 1_777_000_060, value: 17_583 },
          ],
        },
        {
          name: 'EMA50',
          kind: 'ema',
          points: [
            { time: 1_777_000_000, value: 17_585 },
            { time: 1_777_000_060, value: 17_586 },
          ],
        },
      ],
    })
    render(<PriceChart timeframe="10s" onTimeframeChange={() => {}} row={fixture} />)
    // Candles + N indicators → 1 + N addSeries calls. Inspecting the
    // first argument's __tag lets us verify the second series is a
    // LineSeries (indicator) rather than another CandlestickSeries —
    // the shape of the payload-to-chart mapping.
    expect(addSeries).toHaveBeenCalledTimes(3)
    const tags = addSeries.mock.calls.map(
      (call) => (call[0] as { __tag: string }).__tag,
    )
    expect(tags).toEqual(['Candlestick', 'Line', 'Line'])
  })
})
