import { useEffect, useState } from 'react'
import type { ImpactTier, NewsItem } from '@/lib/dashboard-types'
import { formatRelativeTime } from '@/lib/time-format'
import { cn } from '@/lib/utils'

export interface NewsFeedProps {
  items: NewsItem[]
  // Injectable "now" for deterministic tests. Omitted in production
  // renders, which capture Date.now() at render time.
  nowMs?: number
}

const IMPACT_TONE: Record<ImpactTier, string> = {
  high: 'border-rose-500/50 bg-rose-500/15 text-rose-700 dark:text-rose-200',
  medium:
    'border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-200',
  low: 'border-zinc-400/40 bg-zinc-500/10 text-zinc-600 dark:text-zinc-400',
}

const IMPACT_LABEL: Record<ImpactTier, string> = {
  high: 'HIGH',
  medium: 'MED',
  low: 'LOW',
}

// Right-column NewsFeed widget (ADR 004 §Dashboard layout). Read-only
// in Phase 1 — filter, source badges, sentiment, click-through detail
// are Future extensions. Each row lays out: impact tag (pill),
// relative time, and the headline title on a second line so longer
// titles can wrap without pushing the tag and time off-screen.
// Relative-time tick cadence. Labels under an hour have minute
// granularity, so anything faster than one-per-minute is wasted work
// and anything slower risks the 59-sec → 1m transition lingering.
const RELATIVE_TIME_TICK_MS = 30_000

export default function NewsFeed({ items, nowMs }: NewsFeedProps) {
  // Date.now() is a side effect in React 19's purity model, so the
  // wall-clock "now" lives in state with a lazy initializer (allowed
  // at mount) and a setInterval ticker (allowed inside useEffect).
  // `nowMs`, when provided, short-circuits the ticker so tests stay
  // deterministic and the initializer path is never observed in
  // production renders with an injected time.
  const [tickedNow, setTickedNow] = useState<number>(() => Date.now())
  useEffect(() => {
    if (nowMs !== undefined) return
    const id = setInterval(
      () => setTickedNow(Date.now()),
      RELATIVE_TIME_TICK_MS,
    )
    return () => clearInterval(id)
  }, [nowMs])
  const now = nowMs ?? tickedNow
  return (
    <aside
      aria-label="News"
      className="border-border bg-card/40 flex min-h-0 flex-1 flex-col rounded-lg border"
    >
      <h2 className="text-muted-foreground px-3 pt-3 pb-2 text-xs font-medium tracking-wide uppercase">
        News
      </h2>
      <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-1 pb-1">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex flex-col gap-1 rounded px-2 py-2"
          >
            <div className="flex items-center gap-2 text-[11px]">
              <span
                className={cn(
                  'inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-semibold tracking-wider uppercase',
                  IMPACT_TONE[item.impactTier],
                )}
                data-impact={item.impactTier}
              >
                {IMPACT_LABEL[item.impactTier]}
              </span>
              <span className="text-muted-foreground tabular-nums">
                {formatRelativeTime(item.at, now)}
              </span>
            </div>
            <p className="text-foreground text-sm leading-snug">
              {item.title}
            </p>
          </li>
        ))}
        {items.length === 0 && (
          <li className="text-muted-foreground px-2 py-3 text-xs">
            No headlines
          </li>
        )}
      </ul>
    </aside>
  )
}
