import {
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts'
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import type {
  IndicatorKind,
  InstrumentRowState,
  SetupRange,
  Timeframe,
} from '@/lib/dashboard-types'
import { DISPLAY_TIMEZONE, formatTimeOfDay } from '@/lib/display-timezone'
import TimeframeSelector from './TimeframeSelector'

interface PriceChartProps {
  row: InstrumentRowState
  timeframe: Timeframe
  onTimeframeChange: (next: Timeframe) => void
}

// Imperative handle exposed to ancestors that need to highlight a
// specific time on the chart (ADR 004 (i.3) chart-marker cross-link:
// AiChatFloat clicks an HH:MM in an assistant reply, Dashboard
// resolves it to a unix-second via display-timezone, and routes it
// here). The pulse is a transient DOM overlay positioned via the
// chart's time→pixel mapping — lightweight-charts markers are static
// and cannot animate, so a halo + CSS keyframe is the natural mechanism.
export interface PriceChartHandle {
  pulseMarkerAt: (unixSec: number) => void
}

// Halo cleanup window. Matches the keyframe duration in index.css.
const PULSE_DURATION_MS = 1200

// Pre-built Intl formatters for non-Time tick types. Re-using the
// instances avoids per-tick allocation churn during chart panning.
// All zones pin to DISPLAY_TIMEZONE so axis labels read in JST
// regardless of the operator's browser TZ (ADR 004 (i.3)).
const YEAR_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: DISPLAY_TIMEZONE,
  year: 'numeric',
})
const MONTH_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: DISPLAY_TIMEZONE,
  month: 'short',
  year: 'numeric',
})
const DAY_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: DISPLAY_TIMEZONE,
  month: 'short',
  day: '2-digit',
})
const TIME_WITH_SECONDS_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: DISPLAY_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

function formatTickMarkInDisplayTz(timeSec: number, tickType: number): string {
  const date = new Date(timeSec * 1000)
  switch (tickType) {
    case 0:
      return YEAR_FORMATTER.format(date)
    case 1:
      return MONTH_FORMATTER.format(date)
    case 2:
      return DAY_FORMATTER.format(date)
    case 4:
      return TIME_WITH_SECONDS_FORMATTER.format(date)
    case 3:
    default:
      return formatTimeOfDay(timeSec)
  }
}

// Fallback pixel height used only when the chart's container has no
// measurable height yet (first paint, or an ancestor that has not
// established a height claim). The container-driven path below
// overwrites this as soon as the ResizeObserver fires.
const FALLBACK_CHART_HEIGHT = 320

// Palette chosen to match the dashboard state banner: emerald for the
// long / target direction, rose for short / retreat. Grid is kept at
// very low opacity so the candles carry the visual weight.
const COLOR_UP = '#10b981'
const COLOR_DOWN = '#ef4444'
const COLOR_GRID = 'rgba(107, 114, 128, 0.12)'
const COLOR_TEXT = '#9ca3af'

// Indicator palette. Names match the payload's `IndicatorLine.name`;
// unknown names fall back to a neutral slate so a new indicator can
// ship from the backend without the chart losing the line entirely.
const INDICATOR_COLOR: Record<string, string> = {
  EMA20: '#0ea5e9', // sky
  EMA50: '#8b5cf6', // violet
  VWAP: '#f59e0b', // amber
}
const INDICATOR_FALLBACK_COLOR = '#94a3b8'

// lightweight-charts LineStyle enum: Solid = 0, Dashed = 2. VWAP is
// drawn dashed per ADR 004 dashboard spec; EMAs and other trend lines
// stay solid. Using the numeric literal keeps parity with the raw
// lineStyle values already in use for price lines.
const LINE_STYLE_SOLID = 0
const LINE_STYLE_DASHED = 2

// Volume histogram colors are muted variants of the candle palette so
// the pane reads as confirmation rather than competing with the price
// pane for attention. Alpha is ~60% of the candle's.
const VOLUME_UP_COLOR = 'rgba(16, 185, 129, 0.55)' // emerald-500 @ 55%
const VOLUME_DOWN_COLOR = 'rgba(239, 68, 68, 0.55)' // red-500 @ 55%
// Volume pane stays a fixed strip at the bottom so the price pane
// absorbs any additional vertical space when the hero-chart container
// grows (ADR 004 — price stays dominant). Re-pinned on resize because
// lightweight-charts otherwise rebalances toward 50/50.
const VOLUME_PANE_HEIGHT = 96
function indicatorLineStyle(kind: IndicatorKind): number {
  return kind === 'vwap' ? LINE_STYLE_DASHED : LINE_STYLE_SOLID
}

// Positions the setup-range band overlay between two price levels on
// the chart's vertical axis, and (optionally) its midline child at a
// third level. Null `range` or null pixel coordinates collapse the
// band to zero height; the midline is hidden via display:none so its
// 1px top border doesn't linger at the container's top edge.
function positionSetupRangeBand(
  candles: ISeriesApi<'Candlestick'>,
  band: HTMLDivElement | null,
  midline: HTMLDivElement | null,
  range: SetupRange | null,
): void {
  if (!band) return
  const collapse = () => {
    band.style.top = '0px'
    band.style.height = '0px'
    if (midline) midline.style.display = 'none'
  }
  if (!range) {
    collapse()
    return
  }
  const yUpper = candles.priceToCoordinate(range.upper.price)
  const yLower = candles.priceToCoordinate(range.lower.price)
  if (yUpper == null || yLower == null) {
    collapse()
    return
  }
  const top = Math.min(yUpper, yLower)
  const height = Math.max(1, Math.abs(yLower - yUpper))
  band.style.top = `${top}px`
  band.style.height = `${height}px`
  if (midline) {
    if (range.midline) {
      const yMid = candles.priceToCoordinate(range.midline.price)
      if (yMid == null) {
        midline.style.display = 'none'
      } else {
        midline.style.top = `${yMid}px`
        midline.style.display = 'block'
      }
    } else {
      midline.style.display = 'none'
    }
  }
}

// Positions the macro-event overlay div between two timestamps on the
// chart's horizontal axis. Null `window` (no active event) collapses
// the band to width 0; null pixel coordinates (the window is off
// screen or the chart has no pixel for them yet) do the same. The
// element stays mounted in both cases so React owns its lifecycle and
// the overlay can re-appear on the next render without a remount.
function positionMacroBand(
  chart: IChartApi,
  band: HTMLDivElement | null,
  window: { start: number; end: number } | null,
): void {
  if (!band) return
  if (!window) {
    band.style.left = '0px'
    band.style.width = '0px'
    return
  }
  const scale = chart.timeScale()
  const xStart = scale.timeToCoordinate(window.start as UTCTimestamp)
  const xEnd = scale.timeToCoordinate(window.end as UTCTimestamp)
  if (xStart == null || xEnd == null) {
    band.style.left = '0px'
    band.style.width = '0px'
    return
  }
  const left = Math.min(xStart, xEnd)
  const width = Math.max(1, Math.abs(xEnd - xStart))
  band.style.left = `${left}px`
  band.style.width = `${width}px`
}

const PriceChart = forwardRef<PriceChartHandle, PriceChartProps>(
  function PriceChart({ row, timeframe, onTimeframeChange }, ref) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candlesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const indicatorsRef = useRef<Map<string, ISeriesApi<'Line'>>>(new Map())
  const priceLinesRef = useRef<IPriceLine[]>([])
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null)
  const haloRef = useRef<HTMLDivElement>(null)
  const haloTimerRef = useRef<number | null>(null)
  const macroBandRef = useRef<HTMLDivElement>(null)
  // Captured seconds-since-epoch window, re-set on every row payload
  // so the visible-range subscriber (which fires on pan / zoom without
  // a fresh snapshot) repositions against the current macro event.
  const macroWindowRef = useRef<{ start: number; end: number } | null>(null)
  const setupRangeBandRef = useRef<HTMLDivElement>(null)
  const setupRangeMidlineRef = useRef<HTMLDivElement>(null)
  // Setup range held in a ref for the same reason as macroWindowRef:
  // the time-range subscription closure needs the latest payload
  // without re-binding on every render.
  const setupRangeRef = useRef<SetupRange | null>(null)
  // Tracks the timestamp of `bars[0]` from the last render we fit. It
  // changes whenever the series is replaced with one covering a
  // different time range (i.e. timeframe switch), but stays constant
  // across simple append updates. We use it as the trigger for an
  // auto-fit: fit once on mount, re-fit when timeframe changes, and
  // leave the user's zoom alone when only a new bar was appended.
  const lastFirstBarTimeRef = useRef<number | null>(null)
  // Tracks the symbol we last fit for. Swapping to a different
  // instrument (ADR 004 swap mechanics) might happen to land on the
  // same first-bar time (both series seeded against the same wall
  // clock) yet cover a wildly different price range — without this
  // guard the chart keeps the previous instrument's zoom and renders
  // a squished or out-of-frame candle run.
  const lastSymbolRef = useRef<string | null>(null)
  const hasBars = row.bars.length > 0

  useImperativeHandle(
    ref,
    () => ({
      pulseMarkerAt(unixSec: number): void {
        const chart = chartRef.current
        const halo = haloRef.current
        if (!chart || !halo) return
        const x = chart
          .timeScale()
          .timeToCoordinate(unixSec as UTCTimestamp)
        // Out-of-visible-range / not-yet-loaded times return null;
        // silence is the right signal for "no marker to find here"
        // (a flash at left:0 would point to a nonsense location).
        if (x == null) return
        halo.style.left = `${x}px`
        // Restart the keyframe by toggling the trigger attribute
        // around a forced reflow; CSS animations otherwise refuse
        // to re-fire when the same trigger value is re-applied.
        halo.dataset.active = 'false'
        void halo.offsetWidth
        halo.dataset.active = 'true'
        if (haloTimerRef.current != null) {
          clearTimeout(haloTimerRef.current)
        }
        haloTimerRef.current = window.setTimeout(() => {
          halo.dataset.active = 'false'
          haloTimerRef.current = null
        }, PULSE_DURATION_MS)
      },
    }),
    [],
  )

  useEffect(() => {
    // Clear the pulse timeout on unmount so a delayed dataset write
    // never lands on a detached node.
    return () => {
      if (haloTimerRef.current != null) {
        clearTimeout(haloTimerRef.current)
        haloTimerRef.current = null
      }
    }
  }, [])

  // Create the chart once per mount (re-creation only if `height` or
  // `hasBars` changes). Streaming payload updates do not rebuild the
  // chart — they flow through the separate effect below. This split
  // avoids the 1/sec flicker that a single combined effect would cause
  // when the SSE stream delivers new snapshots.
  useEffect(() => {
    if (!hasBars || !containerRef.current) return
    const container = containerRef.current
    // Snapshot refs at effect-setup so the cleanup closure doesn't
    // reach through `ref.current` (react-hooks/exhaustive-deps warning
    // — the ref could have been reassigned between setup and cleanup).
    const indicators = indicatorsRef.current
    const priceLines = priceLinesRef.current
    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight || FALLBACK_CHART_HEIGHT,
      layout: {
        background: { color: 'transparent' },
        textColor: COLOR_TEXT,
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: COLOR_GRID },
      },
      rightPriceScale: { borderVisible: false },
      timeScale: {
        borderVisible: false,
        timeVisible: true,
        secondsVisible: false,
        // Render axis tick labels in JST so chart times agree with
        // chat HH:MM references (which resolve via display-timezone).
        // tickMarkType values from lightweight-charts are 0=Year,
        // 1=Month, 2=DayOfMonth, 3=Time, 4=TimeWithSeconds.
        tickMarkFormatter: (time: Time, tickType: number) =>
          formatTickMarkInDisplayTz(time as number, tickType),
      },
      // Crosshair tooltip's time field also reads in JST so the
      // hover label matches the axis ticks at the same x-coordinate.
      localization: {
        timeFormatter: (time: Time) => formatTimeOfDay(time as number),
      },
      crosshair: { mode: 1 },
    })
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: COLOR_UP,
      downColor: COLOR_DOWN,
      wickUpColor: COLOR_UP,
      wickDownColor: COLOR_DOWN,
      borderVisible: false,
    })
    // Volume goes in a dedicated sub-pane (paneIndex 1). A separate
    // priceScaleId keeps the histogram's axis independent from the
    // candle price axis; `priceFormat: volume` tells lightweight-charts
    // to drop cents and render thousands compactly.
    const volume = chart.addSeries(
      HistogramSeries,
      {
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
        priceLineVisible: false,
        lastValueVisible: false,
      },
      1,
    )
    // Pin the pane height so the price pane keeps the majority of the
    // container; without this, lightweight-charts splits panes ~50/50
    // and candles compress too much.
    chart.panes()[1]?.setHeight(VOLUME_PANE_HEIGHT)
    chartRef.current = chart
    candlesRef.current = candles
    volumeRef.current = volume
    lastFirstBarTimeRef.current = null
    lastSymbolRef.current = null

    const observer = new ResizeObserver(() => {
      // Container-driven sizing. The chart fills whatever height the
      // flex parent hands down (ADR 004 hero-chart contract) — width
      // and height are both re-applied so a viewport resize, a
      // timeframe-row reflow, or a sidebar-grow all reach the chart.
      chart.applyOptions({
        width: container.clientWidth,
        height: container.clientHeight || FALLBACK_CHART_HEIGHT,
      })
      // Re-pin the volume pane height after a resize so the split
      // between price and volume doesn't drift back toward 50/50.
      chart.panes()[1]?.setHeight(VOLUME_PANE_HEIGHT)
      positionMacroBand(chart, macroBandRef.current, macroWindowRef.current)
      positionSetupRangeBand(
        candles,
        setupRangeBandRef.current,
        setupRangeMidlineRef.current,
        setupRangeRef.current,
      )
    })
    observer.observe(container)

    // Follow pan / zoom so the overlays don't drift off their anchors
    // between SSE snapshots. Time-range changes also tend to co-occur
    // with auto-rescales of the price axis, which is when the setup
    // range needs repositioning too.
    const onVisibleRangeChange = () => {
      positionMacroBand(chart, macroBandRef.current, macroWindowRef.current)
      positionSetupRangeBand(
        candles,
        setupRangeBandRef.current,
        setupRangeMidlineRef.current,
        setupRangeRef.current,
      )
    }
    chart.timeScale().subscribeVisibleTimeRangeChange(onVisibleRangeChange)

    return () => {
      observer.disconnect()
      chart.timeScale().unsubscribeVisibleTimeRangeChange(onVisibleRangeChange)
      chart.remove()
      chartRef.current = null
      candlesRef.current = null
      volumeRef.current = null
      indicators.clear()
      priceLines.length = 0
      markersRef.current = null
    }
  }, [hasBars])

  // Apply the payload to the live chart. Runs on mount (right after
  // the chart is created) and on every row change delivered by the
  // SSE stream. Each piece — bars, indicators, price lines, markers —
  // is upserted in place rather than re-built, so the chart keeps its
  // user-visible state (scroll position, crosshair) across updates.
  useEffect(() => {
    const chart = chartRef.current
    const candles = candlesRef.current
    if (!chart || !candles) return

    candles.setData(
      row.bars.map((b) => ({
        time: b.time as UTCTimestamp,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      })),
    )

    // Per-bar volume with candle-direction coloring. Muted alpha keeps
    // the histogram as a confirmation read rather than a competing
    // signal against the price pane.
    volumeRef.current?.setData(
      row.bars.map((b) => ({
        time: b.time as UTCTimestamp,
        value: b.volume,
        color: b.close >= b.open ? VOLUME_UP_COLOR : VOLUME_DOWN_COLOR,
      })),
    )

    // Indicators: upsert by name so an existing EMA20 series updates
    // in place instead of being torn down and re-added every tick.
    const seen = new Set<string>()
    for (const indicator of row.indicators) {
      seen.add(indicator.name)
      let series = indicatorsRef.current.get(indicator.name)
      if (!series) {
        series = chart.addSeries(LineSeries, {
          color: INDICATOR_COLOR[indicator.name] ?? INDICATOR_FALLBACK_COLOR,
          lineWidth: 2,
          lineStyle: indicatorLineStyle(indicator.kind),
          priceLineVisible: false,
          lastValueVisible: false,
          title: indicator.name,
        })
        indicatorsRef.current.set(indicator.name, series)
      }
      series.setData(
        indicator.points.map((p) => ({
          time: p.time as UTCTimestamp,
          value: p.value,
        })),
      )
    }
    for (const [name, series] of indicatorsRef.current) {
      if (!seen.has(name)) {
        chart.removeSeries(series)
        indicatorsRef.current.delete(name)
      }
    }

    // Price lines: cheap to recreate; there are at most two per row,
    // and the library has no upsert API for them.
    for (const priceLine of priceLinesRef.current) {
      candles.removePriceLine(priceLine)
    }
    priceLinesRef.current = []
    if (row.setup) {
      priceLinesRef.current.push(
        candles.createPriceLine({
          price: row.setup.target.price,
          color: COLOR_UP,
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: `target · ${row.setup.target.label}`,
        }),
      )
      priceLinesRef.current.push(
        candles.createPriceLine({
          price: row.setup.retreat.price,
          color: COLOR_DOWN,
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: `retreat · ${row.setup.retreat.label}`,
        }),
      )
    }

    // Trigger marker on the latest bar when state is ENTER. Reuse the
    // marker plugin across updates so repeated ENTER snapshots don't
    // stack plugins on the same series.
    if (row.state === 'ENTER' && row.setup) {
      const lastBar = row.bars[row.bars.length - 1]
      const long = row.setup.side === 'long'
      const marker = {
        time: lastBar.time as UTCTimestamp,
        position: (long ? 'belowBar' : 'aboveBar') as 'belowBar' | 'aboveBar',
        color: long ? COLOR_UP : COLOR_DOWN,
        shape: (long ? 'arrowUp' : 'arrowDown') as 'arrowUp' | 'arrowDown',
        text: row.setup.setupName,
      }
      if (markersRef.current) {
        markersRef.current.setMarkers([marker])
      } else {
        markersRef.current = createSeriesMarkers(candles, [marker])
      }
    } else {
      markersRef.current?.setMarkers([])
    }

    const firstBarTime = row.bars[0]?.time ?? 0
    const symbol = row.instrument.symbol
    if (
      lastFirstBarTimeRef.current !== firstBarTime ||
      lastSymbolRef.current !== symbol
    ) {
      chart.timeScale().fitContent()
      lastFirstBarTimeRef.current = firstBarTime
      lastSymbolRef.current = symbol
    }

    macroWindowRef.current = row.macro
      ? {
          start: Math.floor(Date.parse(row.macro.startsAt) / 1000),
          end: Math.floor(Date.parse(row.macro.endsAt) / 1000),
        }
      : null
    positionMacroBand(chart, macroBandRef.current, macroWindowRef.current)

    setupRangeRef.current = row.setup?.setupRange ?? null
    positionSetupRangeBand(
      candles,
      setupRangeBandRef.current,
      setupRangeMidlineRef.current,
      setupRangeRef.current,
    )
  }, [row])

  if (!hasBars) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-2">
        <div className="flex justify-end">
          <TimeframeSelector value={timeframe} onChange={onTimeframeChange} />
        </div>
        <div
          role="status"
          aria-label={`${row.instrument.displayName} price chart`}
          className="border-border bg-muted/10 text-muted-foreground flex min-h-0 flex-1 items-center justify-center rounded-md border border-dashed text-xs"
        >
          No price data
        </div>
      </div>
    )
  }

  return (
    // h-full + min-h-0 so the chart wrapper absorbs the vertical space
    // the PrimaryInstrumentPanel hands down. The inner chart container
    // sits inside a flex-1 frame so lightweight-charts can read its
    // height via container.clientHeight and grow to fit.
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div className="flex justify-end">
        <TimeframeSelector value={timeframe} onChange={onTimeframeChange} />
      </div>
      <div className="border-border bg-card/40 relative min-h-0 flex-1 overflow-hidden rounded-md border">
        <div
          ref={containerRef}
          aria-label={`${row.instrument.displayName} price chart`}
          role="img"
          className="h-full w-full"
        />
        {row.setup?.setupRange && row.setup && (
          <>
            <div
              ref={setupRangeBandRef}
              aria-label={`setup range · ${row.setup.setupName}`}
              className="pointer-events-none absolute inset-x-0 border-y border-indigo-400/40 bg-indigo-400/10"
              style={{ top: 0, height: 0 }}
            />
            {row.setup.setupRange.midline && (
              <div
                ref={setupRangeMidlineRef}
                aria-label={`setup range midline · ${row.setup.setupRange.midline.label}`}
                className="pointer-events-none absolute inset-x-0 border-t border-dashed border-indigo-400/70"
                style={{ top: 0, height: 0 }}
              />
            )}
          </>
        )}
        {row.macro && (
          <div
            ref={macroBandRef}
            aria-label={`macro event window · ${row.macro.eventName}`}
            className="pointer-events-none absolute inset-y-0 border-x border-amber-500/40 bg-amber-500/10"
            style={{ left: 0, width: 0 }}
          />
        )}
        {/* Halo overlay for the (i.3) chart-marker cross-link.
            Positioned absolutely; the imperative pulseMarkerAt
            handle sets `left` to the chart's pixel coordinate for
            the requested time and toggles data-active to fire the
            CSS keyframe. The element stays mounted in both states
            so a click that arrives mid-pulse can re-trigger by
            resetting the attribute (no remount cost). */}
        <div
          ref={haloRef}
          data-testid="chart-marker-halo"
          className="chart-marker-halo pointer-events-none absolute"
          style={{ left: 0, top: '50%' }}
          aria-hidden
        />
      </div>
    </div>
  )
})

export default PriceChart
