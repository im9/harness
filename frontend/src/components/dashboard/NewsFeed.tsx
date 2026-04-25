import { useEffect, useRef, useState } from 'react'
import type { ImpactTier, NewsItem } from '@/lib/dashboard-types'
import { formatTimeOfDay } from '@/lib/display-timezone'
import { useTranslation } from '@/lib/i18n'
import { useDisplayTimezone } from '@/lib/settings-context'
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

// Right-column NewsFeed widget (ADR 004 §NewsFeed). Master–detail
// paging inside the widget: the default list view shows impact tag +
// exact JST time + relative time + title per row; clicking a row
// with detail swaps the widget body to a detail view of that item
// (back button + meta + full title + source + body + URL). The
// widget never opens a modal or a new tab — the detail view stays
// within the widget's footprint so the operator can bounce between
// chart-reading and headline-detail without losing their place.
//
// Rows without any of `source` / `body` / `url` stay as static
// read-only cells; promoting them to buttons would invite clicks
// that open a near-empty detail page.

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
  const timezone = useDisplayTimezone()
  const { t } = useTranslation()

  const [detailId, setDetailId] = useState<string | null>(null)
  // Detail view is derived from the current items — if the stored id
  // no longer matches (stream dropped the headline, provider retraction),
  // `detailItem` is null and the widget falls back to the list. No
  // sync effect needed; keeping detailId in state is harmless because
  // the render always consults the live items array. If the same id
  // reappears in a later payload the detail view returns, which is
  // the right behavior (the operator's selection is remembered).
  const detailItem = detailId
    ? (items.find((i) => i.id === detailId) ?? null)
    : null

  return (
    <aside
      aria-label={t('news.aria')}
      className="border-border bg-card/40 flex min-h-0 flex-1 flex-col rounded-lg border"
    >
      <h2 className="text-muted-foreground px-3 pt-3 pb-2 text-xs font-medium tracking-wide uppercase">
        {t('news.title')}
      </h2>
      {detailItem ? (
        <NewsDetailView
          item={detailItem}
          now={now}
          timezone={timezone}
          onBack={() => setDetailId(null)}
        />
      ) : (
        <NewsListView
          items={items}
          now={now}
          timezone={timezone}
          onOpen={setDetailId}
        />
      )}
    </aside>
  )
}

function NewsListView({
  items,
  now,
  timezone,
  onOpen,
}: {
  items: NewsItem[]
  now: number
  timezone: string
  onOpen: (id: string) => void
}) {
  const { t } = useTranslation()
  return (
    <ul className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-1 pb-1">
      {items.map((item) => (
        <li key={item.id}>
          <NewsRow item={item} now={now} timezone={timezone} onOpen={onOpen} />
        </li>
      ))}
      {items.length === 0 && (
        <li className="text-muted-foreground px-2 py-3 text-xs">
          {t('news.empty')}
        </li>
      )}
    </ul>
  )
}

function NewsRow({
  item,
  now,
  timezone,
  onOpen,
}: {
  item: NewsItem
  now: number
  timezone: string
  onOpen: (id: string) => void
}) {
  const hasDetail = Boolean(item.source || item.body || item.url)
  const exactTime = formatTimeOfDay(
    Math.floor(Date.parse(item.at) / 1000),
    timezone,
  )
  const relative = formatRelativeTime(item.at, now)

  const body = (
    <>
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
        <span className="text-foreground tabular-nums">{exactTime}</span>
        <span className="text-muted-foreground" aria-hidden>
          ·
        </span>
        <span className="text-muted-foreground tabular-nums">{relative}</span>
      </div>
      <p className="text-foreground text-sm leading-snug">{item.title}</p>
    </>
  )

  if (!hasDetail) {
    return <div className="flex flex-col gap-1 rounded px-2 py-2">{body}</div>
  }

  return (
    <button
      type="button"
      onClick={() => onOpen(item.id)}
      className={cn(
        'flex w-full cursor-pointer flex-col gap-1 rounded px-2 py-2 text-left',
        'hover:bg-muted/40 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2',
      )}
    >
      {body}
    </button>
  )
}

function NewsDetailView({
  item,
  now,
  timezone,
  onBack,
}: {
  item: NewsItem
  now: number
  timezone: string
  onBack: () => void
}) {
  const { t } = useTranslation()
  const exactTime = formatTimeOfDay(
    Math.floor(Date.parse(item.at) / 1000),
    timezone,
  )
  const relative = formatRelativeTime(item.at, now)
  const backRef = useRef<HTMLButtonElement>(null)

  // Focus the back button on enter so keyboard users land on the
  // obvious exit (Enter / Space = list). Without this, focus stays
  // on the row button that no longer exists, leaving the caret in
  // limbo.
  useEffect(() => {
    backRef.current?.focus()
  }, [])

  // Escape = back. Keyboard parity for the conventional dismiss
  // gesture; without it, keyboard-only operators would have to tab
  // to the back button every time.
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        onBack()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onBack])

  return (
    <section
      aria-label={t('news.detail.aria')}
      className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-3"
    >
      <button
        ref={backRef}
        type="button"
        onClick={onBack}
        className={cn(
          'text-muted-foreground hover:text-foreground flex items-center gap-1 self-start rounded px-1 py-1 text-xs',
          'focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2',
        )}
      >
        <span aria-hidden>←</span> {t('news.detail.back')}
      </button>
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
        <span className="text-foreground tabular-nums">{exactTime}</span>
        <span className="text-muted-foreground" aria-hidden>
          ·
        </span>
        <span className="text-muted-foreground tabular-nums">{relative}</span>
      </div>
      <h3 className="text-foreground text-base leading-snug font-medium">
        {item.title}
      </h3>
      {item.source && (
        <p className="text-foreground/80 text-[11px] font-medium tracking-wide uppercase">
          {item.source}
        </p>
      )}
      {item.body && (
        <p className="text-foreground/90 text-sm leading-relaxed">
          {item.body}
        </p>
      )}
      {item.url && (
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-sky-600 hover:underline dark:text-sky-400"
        >
          {t('news.detail.readFull')} <span aria-hidden>→</span>
        </a>
      )}
    </section>
  )
}
