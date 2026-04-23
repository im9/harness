import type { InstrumentRowState, RecommendationState } from '@/lib/dashboard-types'
import { cn } from '@/lib/utils'

// Outer banner tone — kept subtle. The badge on the right carries the
// state signal; the container is a soft accent, not a billboard.
// RETREAT gets a slightly louder treatment because it's the "close
// now" state the operator must notice even mid-conversation.
const BANNER_TONE: Record<RecommendationState, string> = {
  ENTER: 'border-emerald-500/30 bg-emerald-500/[0.04]',
  HOLD: 'border-border bg-card/40',
  EXIT: 'border-sky-500/30 bg-sky-500/[0.04]',
  RETREAT: 'border-rose-500/50 bg-rose-500/10',
}

// Badge pill — saturated so it reads at a glance. Color carries the
// state meaning; the label text is a redundant encoding for operators
// with atypical color vision.
const BADGE_TONE: Record<RecommendationState, string> = {
  ENTER: 'border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  HOLD: 'border-zinc-400/40 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300',
  EXIT: 'border-sky-500/50 bg-sky-500/15 text-sky-700 dark:text-sky-300',
  RETREAT:
    'border-rose-500/60 bg-rose-500/20 text-rose-700 dark:text-rose-200',
}

const DOT_TONE: Record<RecommendationState, string> = {
  ENTER: 'bg-emerald-500',
  HOLD: 'bg-zinc-400',
  EXIT: 'bg-sky-500',
  RETREAT: 'bg-rose-500',
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

// Three-tier banner (ADR 004 §State banner hierarchy):
//   1. Hero line   — instrument display name (largest text on the
//                    page) + right-aligned state badge.
//   2. Sub-line    — ticker · venue, muted.
//   3. Meta strip  — setup name · side · target · retreat, smaller
//                    and visually de-emphasized.
// The hero line is the single source of truth for "what am I looking
// at" now that the watchlist no longer shows the active primary;
// everything else in the banner is subordinate to that glance.
export default function StateBanner({ row }: StateBannerProps) {
  const { instrument, state, setup } = row
  return (
    <div
      role="status"
      data-state={state.toLowerCase()}
      className={cn(
        'flex flex-col gap-1 rounded-md border px-5 py-3',
        BANNER_TONE[state],
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-foreground text-3xl font-semibold leading-none tracking-tight">
          {instrument.displayName}
        </h1>
        <span
          className={cn(
            'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider',
            BADGE_TONE[state],
          )}
        >
          <span className={cn('h-2 w-2 rounded-full', DOT_TONE[state])} />
          {STATE_LABEL[state]}
        </span>
      </div>

      <div className="text-muted-foreground text-xs tabular-nums">
        {instrument.symbol} · {instrument.venue}
      </div>

      {setup && (
        <div className="border-border/40 text-muted-foreground mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-2 text-xs">
          <span className="text-foreground font-medium">{setup.setupName}</span>
          <span className="uppercase">{setup.side}</span>
          <span>
            target{' '}
            <span className="text-emerald-600 tabular-nums dark:text-emerald-400">
              {setup.target.price.toLocaleString()}
            </span>
            {' · '}
            {setup.target.label}
          </span>
          <span>
            retreat{' '}
            <span className="text-rose-600 tabular-nums dark:text-rose-400">
              {setup.retreat.price.toLocaleString()}
            </span>
            {' · '}
            {setup.retreat.label}
          </span>
        </div>
      )}
    </div>
  )
}
