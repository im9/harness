import { useCallback, useMemo, useState } from 'react'
import AiChatFloat from '@/components/dashboard/AiChatFloat'
import MarketsStrip from '@/components/dashboard/MarketsStrip'
import NewsFeed from '@/components/dashboard/NewsFeed'
import PrimaryInstrumentPanel from '@/components/dashboard/PrimaryInstrumentPanel'
import Watchlist from '@/components/dashboard/Watchlist'
import { Skeleton } from '@/components/ui/skeleton'
import type { ChatContext } from '@/lib/chat-client'
import type { Timeframe } from '@/lib/dashboard-types'
import { useDashboard } from '@/lib/use-dashboard'

const DEFAULT_TIMEFRAME: Timeframe = '10s'

export default function Dashboard() {
  // Per-symbol timeframe selection. The map is preserved across swaps
  // so each instrument remembers its last-chosen cadence (ADR 004 §Swap
  // mechanics). Undefined entries fall back to DEFAULT_TIMEFRAME on the
  // backend.
  const [timeframes, setTimeframes] = useState<Record<string, Timeframe>>({})
  // `primarySymbol` is undefined on initial load — the backend picks
  // its configured default. A watchlist row click sets it to the
  // clicked instrument; the displaced primary moves back into the
  // watchlist via the backend's re-projection (ADR 004 §Swap is a
  // view-level action).
  const [primarySymbol, setPrimarySymbol] = useState<string | undefined>(
    undefined,
  )
  const { data, loading, error } = useDashboard({ timeframes, primarySymbol })

  const handleTimeframeChange = useCallback(
    (symbol: string, next: Timeframe) => {
      setTimeframes((prev) => ({ ...prev, [symbol]: next }))
    },
    [],
  )

  const handleSwapPrimary = useCallback((symbol: string) => {
    setPrimarySymbol(symbol)
  }, [])

  // Per-turn snapshot for the AI chat (ADR 004 §AI chat: auto-injected
  // primary / watchlist / markets / rule / news). Memoized on the
  // payload identity so the chat panel only sees a fresh reference
  // when the dashboard data actually changes — submit reads it via a
  // ref, but re-projecting on every render would still churn React
  // diffing inside the panel for no reason.
  const chatContext = useMemo<ChatContext | null>(() => {
    if (!data) return null
    return {
      primary: data.primary,
      watchlist: data.watchlist,
      markets: data.markets,
      rule: data.rule,
      news: data.news,
    }
  }, [data])

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

  // Active primary: the symbol the backend actually returned in the
  // payload, not the request-side state. They usually match, but on
  // the very first render before the hook resolves the request,
  // `primarySymbol` (state) is undefined while `data.primary.instrument.symbol`
  // is the backend default — using the payload-side value keeps
  // timeframe lookups correct in both cases.
  const activeSymbol = data.primary.instrument.symbol
  const tf = timeframes[activeSymbol] ?? DEFAULT_TIMEFRAME

  return (
    // ADR 004 Dashboard topology: a fixed-height canvas, not a
    // scrolling page. StatusStrip is a thin strip on top; below it the
    // primary panel and the right-column widgets split the remaining
    // viewport ~70/30. `min-h-0` on every flex parent is what lets the
    // chart inside PriceChart actually claim the available height
    // (without it, the default min-content behavior collapses the
    // container to the chart's intrinsic size).
    <div className="flex h-full min-h-0 flex-col gap-4">
      <MarketsStrip markets={data.markets} />
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
          onTimeframeChange={(next) => handleTimeframeChange(activeSymbol, next)}
        />
        {/* Right column splits the remaining height between Watchlist
            and NewsFeed (ADR 004 layout — each widget is a flex-1
            stripe inside the column). Overflow inside each widget is
            the widget's own concern (d)(e), not the column's. */}
        <div className="flex min-h-0 flex-col gap-4">
          <Watchlist items={data.watchlist} onSwap={handleSwapPrimary} />
          <NewsFeed items={data.news} />
        </div>
      </div>
      <AiChatFloat context={chatContext} />
    </div>
  )
}
