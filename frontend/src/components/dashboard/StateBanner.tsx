import type { InstrumentRowState, TrendState } from '@/lib/dashboard-types'
import { useTranslation } from '@/lib/i18n'
import { cn } from '@/lib/utils'

// Outer banner tone — kept subtle. The badge on the right carries the
// trend signal; the container is a soft accent, not a billboard.
// `range` stays neutral so the operator's eye is drawn to directional
// states.
const BANNER_TONE: Record<TrendState, string> = {
  up: 'border-emerald-500/30 bg-emerald-500/[0.04]',
  down: 'border-rose-500/30 bg-rose-500/[0.04]',
  range: 'border-border bg-card/40',
}

// Badge pill — saturated so it reads at a glance. Color carries the
// trend direction; the uppercase label is a redundant encoding for
// operators with atypical color vision.
const BADGE_TONE: Record<TrendState, string> = {
  up: 'border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  down: 'border-rose-500/50 bg-rose-500/15 text-rose-700 dark:text-rose-300',
  range: 'border-zinc-400/40 bg-zinc-500/10 text-zinc-700 dark:text-zinc-300',
}

const DOT_TONE: Record<TrendState, string> = {
  up: 'bg-emerald-500',
  down: 'bg-rose-500',
  range: 'bg-zinc-400',
}

// Uppercase code labels per ADR 009 — wire-format strings stay
// verbatim and the visible label is the same token uppercased,
// matching how the prior recommendation states were displayed.
const STATE_LABEL: Record<TrendState, string> = {
  up: 'UP',
  down: 'DOWN',
  range: 'RANGE',
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
  const { t } = useTranslation()
  return (
    <div
      role="status"
      data-state={state}
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
            {t('state.target')}{' '}
            <span className="text-emerald-600 tabular-nums dark:text-emerald-400">
              {setup.target.price.toLocaleString()}
            </span>
            {' · '}
            {setup.target.label}
          </span>
          <span>
            {t('state.retreat')}{' '}
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
