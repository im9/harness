import { useCallback, useState } from 'react'
import PriceChart from '@/components/dashboard/PriceChart'
import RuleGauge from '@/components/dashboard/RuleGauge'
import StateBanner from '@/components/dashboard/StateBanner'
import StatusStrip from '@/components/dashboard/StatusStrip'
import { Skeleton } from '@/components/ui/skeleton'
import type { Timeframe } from '@/lib/dashboard-types'
import { useDashboard } from '@/lib/use-dashboard'

const DEFAULT_TIMEFRAME: Timeframe = '10s'

export default function Dashboard() {
  // Per-row timeframe selection, keyed by instrument symbol. Lifted to
  // the route so the hook can re-subscribe with the full map whenever
  // one row changes — matching the real SSE behavior where the stream
  // URL encodes every symbol's aggregation choice.
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

  return (
    <div className="flex flex-col gap-6">
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
      <div className="flex flex-col gap-8">
        {data.rows.map((row) => {
          const tf = timeframes[row.instrument.symbol] ?? DEFAULT_TIMEFRAME
          return (
            <section
              key={row.instrument.symbol}
              aria-label={`${row.instrument.displayName} row`}
              className="flex flex-col gap-3"
            >
              <StateBanner row={row} />
              <PriceChart
                row={row}
                timeframe={tf}
                onTimeframeChange={(next) =>
                  handleTimeframeChange(row.instrument.symbol, next)
                }
              />
              <RuleGauge rule={data.rule} />
            </section>
          )
        })}
      </div>
    </div>
  )
}
