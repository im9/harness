import type { InstrumentRowState, RecommendationState } from '@/lib/dashboard-types'
import { cn } from '@/lib/utils'

const STATE_TONE: Record<RecommendationState, string> = {
  ENTER: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
  HOLD: 'border-border bg-muted/40 text-muted-foreground',
  EXIT: 'border-sky-500/40 bg-sky-500/10 text-sky-600 dark:text-sky-300',
  RETREAT: 'border-rose-500/50 bg-rose-500/15 text-rose-600 dark:text-rose-300',
}

const STATE_LABEL: Record<RecommendationState, string> = {
  ENTER: 'ENTER',
  HOLD: 'HOLD',
  EXIT: 'EXIT',
  RETREAT: 'RETREAT',
}

interface StateBannerProps {
  row: InstrumentRowState
}

export default function StateBanner({ row }: StateBannerProps) {
  const { instrument, state, setup } = row
  return (
    <div
      role="status"
      data-state={state.toLowerCase()}
      className={cn(
        'flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border px-4 py-3 text-sm',
        STATE_TONE[state],
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold tracking-widest uppercase">
          {STATE_LABEL[state]}
        </span>
        <span className="text-foreground font-medium">{instrument.displayName}</span>
        <span className="text-muted-foreground text-xs tabular-nums">
          {instrument.symbol}
        </span>
      </div>
      {setup && (
        <div className="flex items-center gap-3 text-xs">
          <span className="text-foreground font-medium">{setup.setupName}</span>
          <span className="text-muted-foreground uppercase">{setup.side}</span>
          <span className="text-emerald-600 tabular-nums dark:text-emerald-300">
            target {setup.target.price.toLocaleString()} · {setup.target.label}
          </span>
          <span className="text-rose-600 tabular-nums dark:text-rose-300">
            retreat {setup.retreat.price.toLocaleString()} · {setup.retreat.label}
          </span>
        </div>
      )}
    </div>
  )
}
