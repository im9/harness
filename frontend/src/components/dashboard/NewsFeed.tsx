import type { NewsItem } from '@/lib/dashboard-types'

export interface NewsFeedProps {
  items: NewsItem[]
}

// Right-column context widget (ADR 004 Dashboard layout). Phase 1 step
// (c) places the landmark; headline list rendering — impact tag, time,
// title — lands in step (e).
export default function NewsFeed({ items }: NewsFeedProps) {
  return (
    // See Watchlist for the flex-1 min-h-0 rationale: NewsFeed shares
    // the right column's height with it (ADR 004 layout). Inner scroll
    // for a long headline list will land in step (e).
    <aside
      aria-label="News"
      className="border-border bg-card/40 flex min-h-0 flex-1 flex-col rounded-lg border p-3 text-sm text-zinc-600 dark:text-zinc-400"
    >
      <h2 className="text-muted-foreground mb-2 text-xs font-medium uppercase tracking-wide">
        News
      </h2>
      <p className="text-xs">
        {items.length} headline{items.length === 1 ? '' : 's'} pending
      </p>
    </aside>
  )
}
