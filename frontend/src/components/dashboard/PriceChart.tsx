import {
  CandlestickSeries,
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
import { useEffect, useRef } from 'react'
import type {
  IndicatorKind,
  InstrumentRowState,
  Timeframe,
} from '@/lib/dashboard-types'
import TimeframeSelector from './TimeframeSelector'

interface PriceChartProps {
  row: InstrumentRowState
  timeframe: Timeframe
  onTimeframeChange: (next: Timeframe) => void
  height?: number
}

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
function indicatorLineStyle(kind: IndicatorKind): number {
  return kind === 'vwap' ? LINE_STYLE_DASHED : LINE_STYLE_SOLID
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

export default function PriceChart({
  row,
  timeframe,
  onTimeframeChange,
  height = 240,
}: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candlesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const indicatorsRef = useRef<Map<string, ISeriesApi<'Line'>>>(new Map())
  const priceLinesRef = useRef<IPriceLine[]>([])
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null)
  const macroBandRef = useRef<HTMLDivElement>(null)
  // Captured seconds-since-epoch window, re-set on every row payload
  // so the visible-range subscriber (which fires on pan / zoom without
  // a fresh snapshot) repositions against the current macro event.
  const macroWindowRef = useRef<{ start: number; end: number } | null>(null)
  // Tracks the timestamp of `bars[0]` from the last render we fit. It
  // changes whenever the series is replaced with one covering a
  // different time range (i.e. timeframe switch), but stays constant
  // across simple append updates. We use it as the trigger for an
  // auto-fit: fit once on mount, re-fit when timeframe changes, and
  // leave the user's zoom alone when only a new bar was appended.
  const lastFirstBarTimeRef = useRef<number | null>(null)
  const hasBars = row.bars.length > 0

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
      height,
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
    chartRef.current = chart
    candlesRef.current = candles
    lastFirstBarTimeRef.current = null

    const observer = new ResizeObserver(() => {
      chart.applyOptions({ width: container.clientWidth })
      positionMacroBand(chart, macroBandRef.current, macroWindowRef.current)
    })
    observer.observe(container)

    // Follow pan / zoom so the macro band doesn't drift off its window
    // between SSE snapshots.
    const onVisibleRangeChange = () => {
      positionMacroBand(chart, macroBandRef.current, macroWindowRef.current)
    }
    chart.timeScale().subscribeVisibleTimeRangeChange(onVisibleRangeChange)

    return () => {
      observer.disconnect()
      chart.timeScale().unsubscribeVisibleTimeRangeChange(onVisibleRangeChange)
      chart.remove()
      chartRef.current = null
      candlesRef.current = null
      indicators.clear()
      priceLines.length = 0
      markersRef.current = null
    }
  }, [height, hasBars])

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
    if (lastFirstBarTimeRef.current !== firstBarTime) {
      chart.timeScale().fitContent()
      lastFirstBarTimeRef.current = firstBarTime
    }

    macroWindowRef.current = row.macro
      ? {
          start: Math.floor(Date.parse(row.macro.startsAt) / 1000),
          end: Math.floor(Date.parse(row.macro.endsAt) / 1000),
        }
      : null
    positionMacroBand(chart, macroBandRef.current, macroWindowRef.current)
  }, [row])

  if (!hasBars) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex justify-end">
          <TimeframeSelector value={timeframe} onChange={onTimeframeChange} />
        </div>
        <div
          role="status"
          aria-label={`${row.instrument.displayName} price chart`}
          className="border-border bg-muted/10 text-muted-foreground flex items-center justify-center rounded-md border border-dashed text-xs"
          style={{ height }}
        >
          No price data
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <TimeframeSelector value={timeframe} onChange={onTimeframeChange} />
      </div>
      <div className="border-border bg-card/40 relative overflow-hidden rounded-md border">
        <div
          ref={containerRef}
          aria-label={`${row.instrument.displayName} price chart`}
          role="img"
          style={{ height }}
        />
        {row.macro && (
          <div
            ref={macroBandRef}
            aria-label={`macro event window · ${row.macro.eventName}`}
            className="pointer-events-none absolute inset-y-0 border-x border-amber-500/40 bg-amber-500/10"
            style={{ left: 0, width: 0 }}
          />
        )}
      </div>
    </div>
  )
}
