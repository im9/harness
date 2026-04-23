import '@testing-library/jest-dom'
import { vi } from 'vitest'

// jsdom does not implement ResizeObserver. Several UI primitives (and
// the PriceChart wrapper) rely on it; a no-op polyfill is enough for
// tests since we do not rely on actual resize behavior.
class ResizeObserverPolyfill {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
if (typeof globalThis.ResizeObserver === 'undefined') {
  ;(globalThis as unknown as { ResizeObserver: typeof ResizeObserverPolyfill }).ResizeObserver =
    ResizeObserverPolyfill
}

// Global no-op mock for lightweight-charts. The library renders to a
// canvas and does not exercise in jsdom (it reaches for matchMedia and
// PriceAxis widths that don't exist in the headless DOM). Any component
// that mounts a PriceChart can render in tests without blowing up.
// Test files that need to assert on library calls redeclare vi.mock
// locally with their own spies.
vi.mock('lightweight-charts', () => {
  const makePriceLine = () => ({ applyOptions: vi.fn() })
  const makeSeries = () => ({
    setData: vi.fn(),
    createPriceLine: vi.fn(() => makePriceLine()),
    removePriceLine: vi.fn(),
    // Null in jsdom — the setup-range overlay tolerates null pixel
    // coordinates by collapsing its height, just like the macro band
    // does for null time coordinates.
    priceToCoordinate: vi.fn(() => null),
  })
  const makeMarkersPlugin = () => ({
    setMarkers: vi.fn(),
    detach: vi.fn(),
  })
  const makeChart = () => ({
    addSeries: vi.fn(() => makeSeries()),
    removeSeries: vi.fn(),
    timeScale: vi.fn(() => ({
      fitContent: vi.fn(),
      // Always null in jsdom — no real canvas, so there is no pixel to
      // coordinate with. The macro-band overlay tolerates null and stays
      // collapsed; its mere presence in the DOM is what tests assert on.
      timeToCoordinate: vi.fn(() => null),
      subscribeVisibleTimeRangeChange: vi.fn(),
      unsubscribeVisibleTimeRangeChange: vi.fn(),
    })),
    applyOptions: vi.fn(),
    remove: vi.fn(),
  })
  return {
    createChart: vi.fn(() => makeChart()),
    createSeriesMarkers: vi.fn(() => makeMarkersPlugin()),
    CandlestickSeries: { __tag: 'Candlestick' },
    LineSeries: { __tag: 'Line' },
  }
})
