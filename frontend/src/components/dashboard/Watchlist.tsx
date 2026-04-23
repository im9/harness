import type { WatchlistItem } from '@/lib/dashboard-types'

export interface WatchlistProps {
  items: WatchlistItem[]
}

// Right-column context widget (ADR 004 Dashboard layout). Phase 1 step
// (c) places the landmark; the mini-row rendering — state badge, last
// price, sparkline — lands in step (d). Keeping the stub
// content-minimal avoids locking in visual choices that belong to the
// widget iteration.
export default function Watchlist({ items }: WatchlistProps) {
  return (
    // flex-1 min-h-0 lets the widget share the right column's remaining
    // height with NewsFeed (ADR 004 layout — two stripes, each claims
    // a portion of the vertical space). The mini-row content added in
    // step (d) will put an `overflow-y-auto` on the inner list so a
    // long watchlist scrolls inside the widget instead of stretching
    // the column.
    <aside
      aria-label="Watchlist"
      className="border-border bg-card/40 flex min-h-0 flex-1 flex-col rounded-lg border p-3 text-sm text-zinc-600 dark:text-zinc-400"
    >
      <h2 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">
        Watchlist
      </h2>
      <p className="text-xs">
        {items.length} instrument{items.length === 1 ? '' : 's'} tracked
      </p>
    </aside>
  )
}
