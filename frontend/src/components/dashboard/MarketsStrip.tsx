import type { MarketIndex } from '@/lib/dashboard-types'

interface MarketsStripProps {
  markets: MarketIndex[]
}

// Per-instrument decimal heuristic so FX (0.001 ticks) keeps three
// decimals while an index in the tens-of-thousands range rounds clean.
// Threshold picks `< 1000` → 2 decimals, bigger → 0 decimals; special-
// case sub-integer values (FX rates near 0) get 3 decimals.
function formatPrice(value: number): string {
  let decimals: number
  if (value >= 1000) decimals = 0
  else if (value >= 10) decimals = 2
  else decimals = 3
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function formatPctChange(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

// Top-strip Markets overview (ADR 004). Read-only row of global
// benchmark cash indices — no state, no setup, no swap. A card is
// four lines: ticker · display name · last · pctChange, color-coded
// by the sign of pctChange so the operator's glance reads direction
// first and precision second.
export default function MarketsStrip({ markets }: MarketsStripProps) {
  return (
    <section
      aria-label="Markets overview"
      className="border-border bg-card/40 flex flex-wrap items-stretch gap-4 rounded-md border px-4 py-3"
    >
      {markets.map((index) => {
        const positive = index.pctChange >= 0
        const tone = positive
          ? 'text-emerald-600 dark:text-emerald-400'
          : 'text-rose-600 dark:text-rose-400'
        return (
          <div
            key={index.ticker}
            className="flex min-w-[140px] flex-col gap-0.5"
          >
            <div className="flex items-baseline gap-2">
              <span className="text-foreground text-sm font-semibold tracking-tight">
                {index.ticker}
              </span>
              <span className="text-muted-foreground truncate text-xs">
                {index.displayName}
              </span>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-foreground text-base font-medium tabular-nums">
                {formatPrice(index.lastPrice)}
              </span>
              <span className={`text-sm font-medium tabular-nums ${tone}`}>
                {formatPctChange(index.pctChange)}
              </span>
            </div>
          </div>
        )
      })}
    </section>
  )
}
