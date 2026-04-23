import { useCallback, useState } from 'react'
import NewsFeed from '@/components/dashboard/NewsFeed'
import PrimaryInstrumentPanel from '@/components/dashboard/PrimaryInstrumentPanel'
import StatusStrip from '@/components/dashboard/StatusStrip'
import Watchlist from '@/components/dashboard/Watchlist'
import { Skeleton } from '@/components/ui/skeleton'
import type { Timeframe } from '@/lib/dashboard-types'
import { useDashboard } from '@/lib/use-dashboard'

const DEFAULT_TIMEFRAME: Timeframe = '10s'

export default function Dashboard() {
  // Per-symbol timeframe selection. Phase 1 has a single primary, but
  // the map shape is kept so the mock backend's multi-tf advance path
  // stays exercised and the eventual SSE URL pattern (symbol → tf)
  // requires no reshape.
  const [timeframes, setTimeframes] = useState<Record<string, Timeframe>>({})
  const { data, loading, error } = useDashboard(timeframes)

  const handleTimeframeChange = useCallback(
    (symbol: string, next: Timeframe) => {
      setTimeframes((prev) => ({ ...prev, [symbol]: next }))
    },
    [],
  )

  if (loading) {
    return (
      <div
        role="status"
        aria-label="Loading dashboard"
        className="flex flex-col gap-6"
      >
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    )
  }

  if (!data) {
    return (
      <div role="alert" className="text-rose-600 dark:text-rose-400 text-sm">
        Failed to load dashboard: {error?.message ?? 'unknown error'}
      </div>
    )
  }

  const primarySymbol = data.primary.instrument.symbol
  const tf = timeframes[primarySymbol] ?? DEFAULT_TIMEFRAME

  return (
    // ADR 004 Dashboard topology: a fixed-height canvas, not a
    // scrolling page. StatusStrip is a thin strip on top; below it the
    // primary panel and the right-column widgets split the remaining
    // viewport ~70/30. `min-h-0` on every flex parent is what lets the
    // chart inside PriceChart actually claim the available height
    // (without it, the default min-content behavior collapses the
    // container to the chart's intrinsic size).
    <div className="flex h-full min-h-0 flex-col gap-4">
      <StatusStrip
        sessionPhase={data.sessionPhase}
        intradayPnl={data.intradayPnl}
        nextMacroEvent={data.nextMacroEvent}
      />
      {error && (
        <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
          Stream error: {error.message} — showing last known snapshot
        </p>
      )}
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,7fr)_minmax(0,3fr)]">
        <PrimaryInstrumentPanel
          row={data.primary}
          rule={data.rule}
          timeframe={tf}
          onTimeframeChange={(next) => handleTimeframeChange(primarySymbol, next)}
        />
        {/* Right column splits the remaining height between Watchlist
            and NewsFeed (ADR 004 layout — each widget is a flex-1
            stripe inside the column). Overflow inside each widget is
            the widget's own concern (d)(e), not the column's. */}
        <div className="flex min-h-0 flex-col gap-4">
          <Watchlist items={data.watchlist} />
          <NewsFeed items={data.news} />
        </div>
      </div>
    </div>
  )
}
