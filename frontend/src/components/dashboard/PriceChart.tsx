import {
  CandlestickSeries,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type UTCTimestamp,
} from 'lightweight-charts'
import { useEffect, useRef } from 'react'
import type { InstrumentRowState } from '@/lib/dashboard-types'

interface PriceChartProps {
  row: InstrumentRowState
  height?: number
}

// Palette chosen to match the dashboard state banner: emerald for the
// long / target direction, rose for short / retreat. Grid is kept at
// very low opacity so the candles carry the visual weight.
const COLOR_UP = '#10b981'
const COLOR_DOWN = '#ef4444'
const COLOR_GRID = 'rgba(107, 114, 128, 0.12)'
const COLOR_TEXT = '#9ca3af'

export default function PriceChart({ row, height = 240 }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const hasBars = row.bars.length > 0

  useEffect(() => {
    if (!hasBars || !containerRef.current) return

    const container = containerRef.current
    const chart: IChartApi = createChart(container, {
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

    const series = chart.addSeries(CandlestickSeries, {
      upColor: COLOR_UP,
      downColor: COLOR_DOWN,
      wickUpColor: COLOR_UP,
      wickDownColor: COLOR_DOWN,
      borderVisible: false,
    })

    series.setData(
      row.bars.map((b) => ({
        time: b.time as UTCTimestamp,
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      })),
    )

    if (row.setup) {
      series.createPriceLine({
        price: row.setup.target.price,
        color: COLOR_UP,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: `target · ${row.setup.target.label}`,
      })
      series.createPriceLine({
        price: row.setup.retreat.price,
        color: COLOR_DOWN,
        lineWidth: 1,
        lineStyle: 2,
        axisLabelVisible: true,
        title: `retreat · ${row.setup.retreat.label}`,
      })
    }

    if (row.state === 'ENTER' && row.setup) {
      const lastBar = row.bars[row.bars.length - 1]
      const long = row.setup.side === 'long'
      createSeriesMarkers(series, [
        {
          time: lastBar.time as UTCTimestamp,
          position: long ? 'belowBar' : 'aboveBar',
          color: long ? COLOR_UP : COLOR_DOWN,
          shape: long ? 'arrowUp' : 'arrowDown',
          text: row.setup.setupName,
        },
      ])
    }

    chart.timeScale().fitContent()

    const observer = new ResizeObserver(() => {
      chart.applyOptions({ width: container.clientWidth })
    })
    observer.observe(container)

    return () => {
      observer.disconnect()
      chart.remove()
    }
  }, [row, height, hasBars])

  if (!hasBars) {
    return (
      <div
        role="status"
        aria-label={`${row.instrument.displayName} price chart`}
        className="border-border bg-muted/10 text-muted-foreground flex items-center justify-center rounded-md border border-dashed text-xs"
        style={{ height }}
      >
        No price data
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      aria-label={`${row.instrument.displayName} price chart`}
      role="img"
      className="border-border bg-card/40 overflow-hidden rounded-md border"
      style={{ height }}
    />
  )
}
