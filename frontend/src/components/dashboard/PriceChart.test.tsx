import { render, screen } from '@testing-library/react'
import { createRef } from 'react'
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
  timeToCoordinate,
} = vi.hoisted(() => ({
  setData: vi.fn(),
  createPriceLine: vi.fn(),
  createSeriesMarkers: vi.fn(),
  removeChart: vi.fn(),
  addSeries: vi.fn(),
  // Hoisted so the (i.3) pulse tests can `mockReturnValueOnce(123)`
  // and assert the imperative handle resolved its argument through
  // the chart's time→pixel mapping. Default returns null to match the
  // jsdom "no canvas, no pixel" behavior.
  timeToCoordinate: vi.fn<(time: unknown) => number | null>(() => null),
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
        priceToCoordinate: vi.fn(() => null),
      }
    },
    removeSeries: vi.fn(),
    timeScale: () => ({
      fitContent: vi.fn(),
      timeToCoordinate,
      subscribeVisibleTimeRangeChange: vi.fn(),
      unsubscribeVisibleTimeRangeChange: vi.fn(),
    }),
    panes: () => [{ setHeight: vi.fn() }, { setHeight: vi.fn() }],
    applyOptions: vi.fn(),
    remove: removeChart,
  })),
  createSeriesMarkers: (...args: unknown[]) => {
    createSeriesMarkers(...args)
    return { setMarkers: vi.fn(), detach: vi.fn() }
  },
  CandlestickSeries: { __tag: 'Candlestick' },
  HistogramSeries: { __tag: 'Histogram' },
  LineSeries: { __tag: 'Line' },
}))

import PriceChart, { type PriceChartHandle } from './PriceChart'

function row(overrides: Partial<InstrumentRowState> = {}): InstrumentRowState {
  const base: InstrumentRowState = {
    instrument: {
      symbol: 'FUT-A',
      displayName: 'Mock Future A',
      venue: 'MOCK',
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
      setupRange: null,
    },
    lastPrice: 17582.25,
    lastPriceAt: '2026-04-23T09:45:00Z',
    macro: null,
    bars: [
      { time: 1_777_000_000, open: 17_580, high: 17_585, low: 17_579, close: 17_583, volume: 420 },
      { time: 1_777_000_060, open: 17_583, high: 17_590, low: 17_582, close: 17_589, volume: 680 },
      { time: 1_777_000_120, open: 17_589, high: 17_592, low: 17_580, close: 17_582.25, volume: 510 },
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
  timeToCoordinate.mockReset()
  timeToCoordinate.mockReturnValue(null)
})

afterEach(() => {
  setData.mockClear()
  createPriceLine.mockClear()
  createSeriesMarkers.mockClear()
  removeChart.mockClear()
  addSeries.mockClear()
  timeToCoordinate.mockReset()
  timeToCoordinate.mockReturnValue(null)
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
    // Two setData calls on mount with the default fixture: one for the
    // candlestick series, one for the volume histogram in the second
    // pane (indicators are absent in the default row()).
    expect(setData).toHaveBeenCalledTimes(2)
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

  it('renders VWAP as a dashed line while other indicators stay solid', () => {
    const fixture = row({
      indicators: [
        {
          name: 'VWAP',
          kind: 'vwap',
          points: [
            { time: 1_777_000_000, value: 17_581 },
            { time: 1_777_000_060, value: 17_584 },
          ],
        },
        {
          name: 'EMA20',
          kind: 'ema',
          points: [
            { time: 1_777_000_000, value: 17_580 },
            { time: 1_777_000_060, value: 17_583 },
          ],
        },
      ],
    })
    render(<PriceChart timeframe="10s" onTimeframeChange={() => {}} row={fixture} />)
    // lightweight-charts LineStyle enum: Solid = 0, Dashed = 2.
    // ADR 004 dashboard spec calls the VWAP line out as dashed to set
    // it apart from the solid-drawn EMAs.
    const options = new Map<string, { lineStyle?: number }>()
    for (const call of addSeries.mock.calls) {
      const opts = call[1] as { title?: string; lineStyle?: number } | undefined
      if (opts?.title) options.set(opts.title, opts)
    }
    expect(options.get('VWAP')?.lineStyle).toBe(2)
    expect(options.get('EMA20')?.lineStyle ?? 0).toBe(0)
  })

  it('renders a setup range band when the setup defines upper and lower bounds', () => {
    const fixture = row({
      setup: {
        setupName: 'Opening range break',
        side: 'long',
        target: { price: 17_620.5, label: '+2R' },
        retreat: { price: 17_548.75, label: 'stop' },
        rMultiple: 0,
        setupRange: {
          upper: { price: 17_595, label: 'ORH' },
          lower: { price: 17_560, label: 'ORL' },
        },
      },
    })
    render(<PriceChart timeframe="10s" onTimeframeChange={() => {}} row={fixture} />)
    // Shaded band visualizes the setup's bounded region (ADR 004
    // dashboard spec). Accessibility-visible label carries the setup
    // name so the region's context is announced.
    expect(
      screen.getByLabelText(/setup range · opening range break/i),
    ).toBeInTheDocument()
  })

  it('renders a setup range midline when one is provided', () => {
    const fixture = row({
      setup: {
        setupName: 'Opening range break',
        side: 'long',
        target: { price: 17_620.5, label: '+2R' },
        retreat: { price: 17_548.75, label: 'stop' },
        rMultiple: 0,
        setupRange: {
          upper: { price: 17_595, label: 'ORH' },
          lower: { price: 17_560, label: 'ORL' },
          midline: { price: 17_577.5, label: 'OR mid' },
        },
      },
    })
    render(<PriceChart timeframe="10s" onTimeframeChange={() => {}} row={fixture} />)
    expect(screen.getByLabelText(/setup range midline/i)).toBeInTheDocument()
  })

  it('omits the setup range band when the setup has no range', () => {
    render(<PriceChart timeframe="10s" onTimeframeChange={() => {}} row={row()} />)
    expect(screen.queryByLabelText(/setup range ·/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/setup range midline/i)).not.toBeInTheDocument()
  })

  it('renders a macro event band when the row is in an event window', () => {
    const fixture = row({
      macro: {
        eventName: 'Macro release A',
        impactTier: 'high',
        phase: 'event',
        startsAt: '2026-04-23T09:45:00Z',
        endsAt: '2026-04-23T09:50:00Z',
      },
    })
    render(<PriceChart timeframe="10s" onTimeframeChange={() => {}} row={fixture} />)
    // Vertical band surfaces the active macro-event window (ADR 004
    // dashboard spec). Presence is the accessibility-visible anchor;
    // exact pixel placement depends on the real timeScale and is
    // covered in manual browser verification, not jsdom.
    expect(screen.getByLabelText(/macro event window/i)).toBeInTheDocument()
  })

  it('omits the macro band when macro is null', () => {
    render(<PriceChart timeframe="10s" onTimeframeChange={() => {}} row={row({ macro: null })} />)
    expect(screen.queryByLabelText(/macro event window/i)).not.toBeInTheDocument()
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
    // Candles + volume histogram + N indicators → 2 + N addSeries calls.
    // Inspecting the first argument's __tag verifies the payload-to-chart
    // mapping: candlestick and histogram are created up front in the
    // mount effect, then line series are appended per indicator in the
    // data-update effect.
    expect(addSeries).toHaveBeenCalledTimes(4)
    const tags = addSeries.mock.calls.map(
      (call) => (call[0] as { __tag: string }).__tag,
    )
    expect(tags).toEqual(['Candlestick', 'Histogram', 'Line', 'Line'])
  })

  it('adds a histogram series in a second pane for volume', () => {
    render(<PriceChart timeframe="10s" onTimeframeChange={() => {}} row={row()} />)
    // lightweight-charts v5 addSeries signature is (type, options,
    // paneIndex). paneIndex 1 puts the histogram in a dedicated
    // sub-pane below the price pane per ADR 004 dashboard spec.
    const histogramCall = addSeries.mock.calls.find(
      (call) => (call[0] as { __tag: string }).__tag === 'Histogram',
    )
    expect(histogramCall).toBeDefined()
    expect(histogramCall?.[2]).toBe(1)
  })

  it('feeds volume values into the histogram series', () => {
    const fixture = row({
      bars: [
        { time: 1_777_000_000, open: 100, high: 101, low: 99, close: 100.5, volume: 500 },
        { time: 1_777_000_060, open: 100.5, high: 102, low: 100, close: 101.5, volume: 750 },
      ],
    })
    render(<PriceChart timeframe="10s" onTimeframeChange={() => {}} row={fixture} />)
    // Pin the volume setData call by looking at the `value` field, which
    // is histogram-shaped (not OHLC). Confirms the volume pipe copies
    // payload volumes through rather than recomputing or omitting them.
    const volumeCall = setData.mock.calls.find((call) => {
      const first = (call[0] as { value?: number }[])[0]
      return first?.value === 500
    })
    expect(volumeCall).toBeDefined()
    expect((volumeCall?.[0] as unknown[]).length).toBe(2)
  })

  it('exposes a pulseMarkerAt imperative handle that positions a halo at the chart x-coordinate', () => {
    // ADR 004 (i.3) chart-marker cross-link: AiChatFloat clicks an
    // HH:MM time reference in an assistant reply, which routes (via
    // Dashboard's ref) into this imperative handle. The chart asks
    // its time scale for the pixel coordinate of that unix-second
    // and positions a halo overlay there. lightweight-charts markers
    // are static and cannot animate, so the halo is a separate DOM
    // element with a CSS animation triggered via a class toggle.
    timeToCoordinate.mockReturnValue(123)
    const ref = createRef<PriceChartHandle>()
    const { container } = render(
      <PriceChart
        ref={ref}
        timeframe="10s"
        onTimeframeChange={() => {}}
        row={row()}
      />,
    )
    expect(ref.current).not.toBeNull()
    ref.current!.pulseMarkerAt(1_777_000_000)
    expect(timeToCoordinate).toHaveBeenLastCalledWith(1_777_000_000)
    const halo = container.querySelector(
      '[data-testid="chart-marker-halo"]',
    ) as HTMLElement | null
    expect(halo).not.toBeNull()
    expect(halo!.style.left).toBe('123px')
    // The "active" data attribute is the test-visible signal that
    // the pulse animation was triggered; the visual itself (CSS
    // keyframe) lives in the global stylesheet and is exercised in
    // browser verification, not jsdom.
    expect(halo!.dataset.active).toBe('true')
  })

  it('is a silent no-op when the requested time has no pixel coordinate', () => {
    // Out-of-visible-range times (the operator panned past, or the
    // bar series has not reached that timestamp yet) yield a null
    // coordinate from lightweight-charts. The handle must not throw
    // and must not flash the halo at left:0 — silence is the right
    // signal for "no marker to find here".
    timeToCoordinate.mockReturnValue(null)
    const ref = createRef<PriceChartHandle>()
    const { container } = render(
      <PriceChart
        ref={ref}
        timeframe="10s"
        onTimeframeChange={() => {}}
        row={row()}
      />,
    )
    ref.current!.pulseMarkerAt(1_777_000_000)
    const halo = container.querySelector(
      '[data-testid="chart-marker-halo"]',
    ) as HTMLElement | null
    expect(halo).not.toBeNull()
    expect(halo!.dataset.active).not.toBe('true')
  })
})
