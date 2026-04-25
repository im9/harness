import type { RecommendationState, WatchlistItem } from '@/lib/dashboard-types'
import { useTranslation } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import Sparkline from './Sparkline'

export interface WatchlistProps {
  items: WatchlistItem[]
  // Click handler for a row. The Dashboard route wires this to
  // `setPrimarySymbol(symbol)` so the backend re-projects the payload
  // with the clicked instrument as the heavy primary (ADR 004 §Swap
  // mechanics).
  onSwap: (symbol: string) => void
}

const DOT_TONE: Record<RecommendationState, string> = {
  ENTER: 'bg-emerald-500',
  HOLD: 'bg-zinc-400',
  EXIT: 'bg-sky-500',
  RETREAT: 'bg-rose-500',
}

function formatPctChange(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

function tickSizeDecimals(tickSize: number): number {
  // Derive decimals from the tick-size itself: 5 → 0, 0.25 → 2,
  // 0.001 → 3. Matches the same heuristic `mocks/dashboard.ts`
  // uses when rounding generated bars so the two representations
  // agree — a TPXM row reading "2,812.25" must line up with the
  // chart's candle closes.
  const str = tickSize.toString()
  const dot = str.indexOf('.')
  if (dot === -1) return 0
  return str.length - dot - 1
}

function formatPrice(value: number, tickSize: number): string {
  const decimals = tickSizeDecimals(tickSize)
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

// Right-column Watchlist widget (ADR 004 §Watchlist widget). One
// mini-row per tracked instrument that is *not* currently the
// primary; clicking a row swaps it into primary focus. Everything on
// the row is optimized for the agreement-check glance the widget
// exists for: state dot, pctChange sign + color, sparkline shape,
// last price. No per-row chart, no timeframe switcher, no
// interactions beyond click-to-swap.
export default function Watchlist({ items, onSwap }: WatchlistProps) {
  const { t } = useTranslation()
  return (
    <aside
      aria-label={t('watchlist.aria')}
      className="border-border bg-card/40 flex min-h-0 flex-1 flex-col rounded-lg border"
    >
      <h2 className="text-muted-foreground px-3 pt-3 pb-2 text-xs font-medium tracking-wide uppercase">
        {t('watchlist.title')}
      </h2>
      <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-1 pb-1">
        {items.map((item) => {
          const positive = item.pctChange >= 0
          const pctTone = positive
            ? 'text-emerald-600 dark:text-emerald-400'
            : 'text-rose-600 dark:text-rose-400'
          return (
            <li key={item.instrument.symbol}>
              <button
                type="button"
                onClick={() => onSwap(item.instrument.symbol)}
                data-state={item.state.toLowerCase()}
                aria-label={t('watchlist.swap.aria', {
                  symbol: item.instrument.symbol,
                  name: item.instrument.displayName,
                })}
                className="hover:bg-accent focus-visible:ring-ring grid w-full grid-cols-[auto_minmax(0,1fr)_auto_auto_auto] items-center gap-3 rounded px-2 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2"
              >
                <span
                  className={cn('h-2 w-2 rounded-full', DOT_TONE[item.state])}
                  aria-hidden
                />
                <span className="flex min-w-0 flex-col leading-tight">
                  <span className="text-foreground truncate text-sm font-semibold">
                    {item.instrument.symbol}
                  </span>
                  <span className="text-muted-foreground truncate text-[11px]">
                    {item.instrument.displayName}
                  </span>
                </span>
                <span
                  className={cn(
                    'text-xs font-medium tabular-nums',
                    pctTone,
                  )}
                >
                  {formatPctChange(item.pctChange)}
                </span>
                <Sparkline
                  points={item.sparkline}
                  positive={positive}
                  width={56}
                  height={20}
                />
                <span className="text-foreground text-sm font-medium tabular-nums">
                  {formatPrice(item.lastPrice, item.instrument.tickSize)}
                </span>
              </button>
            </li>
          )
        })}
        {items.length === 0 && (
          <li className="text-muted-foreground px-2 py-3 text-xs">
            {t('watchlist.empty')}
          </li>
        )}
      </ul>
    </aside>
  )
}
