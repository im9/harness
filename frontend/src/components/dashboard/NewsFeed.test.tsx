import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import type { NewsItem } from '@/lib/dashboard-types'
import { formatRelativeTime } from '@/lib/time-format'
import NewsFeed from './NewsFeed'

// Fixed "now" used in component tests so relative time assertions are
// deterministic regardless of when the test actually runs.
const NOW_MS = Date.parse('2026-04-24T04:00:00Z')

function at(minutesAgo: number): string {
  return new Date(NOW_MS - minutesAgo * 60_000).toISOString()
}

function makeItems(): NewsItem[] {
  return [
    {
      id: 'a',
      title: 'BOJ governor hints at cautious tightening',
      impactTier: 'high',
      at: at(2),
    },
    {
      id: 'b',
      title: 'US crude stockpiles fall sharply',
      impactTier: 'medium',
      at: at(14),
    },
    {
      id: 'c',
      title: 'European equities open mixed',
      impactTier: 'low',
      at: at(35),
    },
    {
      id: 'd',
      title: 'US 10Y yields edge lower',
      impactTier: 'medium',
      at: at(72),
    },
  ]
}

describe('NewsFeed', () => {
  it('exposes the widget as a labeled complementary landmark', () => {
    render(<NewsFeed items={makeItems()} nowMs={NOW_MS} />)
    expect(
      screen.getByRole('complementary', { name: /news/i }),
    ).toBeInTheDocument()
  })

  it('renders one row per headline with the title text', () => {
    render(<NewsFeed items={makeItems()} nowMs={NOW_MS} />)
    for (const item of makeItems()) {
      expect(screen.getByText(item.title)).toBeInTheDocument()
    }
  })

  it('tags each impact tier with the matching data-impact attribute', () => {
    // data-impact is the stable contract between the component and
    // any styling / tests that care about the tone. Matching on the
    // attribute lets the visual language (rose / amber / muted) evolve
    // without rewriting the test.
    const { container } = render(
      <NewsFeed items={makeItems()} nowMs={NOW_MS} />,
    )
    expect(container.querySelectorAll('[data-impact="high"]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-impact="medium"]')).toHaveLength(2)
    expect(container.querySelectorAll('[data-impact="low"]')).toHaveLength(1)
  })

  it('shows relative minute-scale times for recent headlines', () => {
    render(<NewsFeed items={makeItems()} nowMs={NOW_MS} />)
    expect(screen.getByText('2m ago')).toBeInTheDocument()
    expect(screen.getByText('14m ago')).toBeInTheDocument()
    expect(screen.getByText('35m ago')).toBeInTheDocument()
  })

  it('shows hour + minute format for headlines older than one hour', () => {
    // A "1h 12m ago" label preserves the minute granularity that a
    // bare "1h ago" would throw away — important when a trader is
    // deciding whether a headline is stale enough to ignore.
    render(<NewsFeed items={makeItems()} nowMs={NOW_MS} />)
    expect(screen.getByText('1h 12m ago')).toBeInTheDocument()
  })

  it('renders an empty-state message when no headlines are pending', () => {
    render(<NewsFeed items={[]} nowMs={NOW_MS} />)
    expect(screen.getByText(/no headlines/i)).toBeInTheDocument()
  })

  it('shows the exact JST time alongside the relative time on each row', () => {
    // ADR 004 §NewsFeed: operator needs the precise market time (not
    // just "2m ago") to line a headline up with what they saw on the
    // chart. 2026-04-24T03:58:00Z = 2026-04-24 12:58 JST (UTC+9 with
    // no DST), the "2m ago" item at NOW_MS − 2 min.
    render(<NewsFeed items={makeItems()} nowMs={NOW_MS} />)
    expect(screen.getByText('12:58')).toBeInTheDocument()
  })

  it('renders rows as static elements when no item carries source/body/url', () => {
    // Phase-1 rule (ADR 004 §NewsFeed): a row without detail fields
    // stays read-only — turning it into a clickable button would
    // invite clicks that open a near-empty detail page. makeItems()
    // ships bare rows (no detail) so the whole widget should be
    // button-free by default.
    render(<NewsFeed items={makeItems()} nowMs={NOW_MS} />)
    const region = screen.getByRole('complementary', { name: /news/i })
    expect(region.querySelectorAll('button')).toHaveLength(0)
  })

  it('opens a detail view when a detail-bearing row is clicked, showing source / body / URL', async () => {
    // Master-detail paging inside the widget (ADR 004 §NewsFeed):
    // the right column is too narrow for comfortable inline expand,
    // so clicking a row swaps the widget body to a full-height
    // detail view. Operator never leaves the dashboard's visual
    // rhythm (no modal, no new tab) but gets breathing room to read.
    const detailed: NewsItem[] = [
      {
        id: 'det-1',
        title: 'BOJ governor hints at cautious tightening',
        impactTier: 'high',
        at: at(2),
        source: 'Wire (mock)',
        body: 'Governor Ueda signaled openness to further tightening if wage growth persists into the autumn.',
        url: 'https://example.test/article/boj-tightening',
      },
    ]
    const user = userEvent.setup()
    render(<NewsFeed items={detailed} nowMs={NOW_MS} />)
    await user.click(
      screen.getByRole('button', {
        name: /BOJ governor hints at cautious tightening/i,
      }),
    )
    // The detail view exposes all three detail fields plus a back
    // button; the latter is the only way out (other than Escape).
    expect(
      screen.getByRole('button', { name: /back to news/i }),
    ).toBeInTheDocument()
    expect(screen.getByText('Wire (mock)')).toBeInTheDocument()
    expect(screen.getByText(/Governor Ueda signaled/i)).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /read full article/i })
    expect(link).toHaveAttribute(
      'href',
      'https://example.test/article/boj-tightening',
    )
    // External links open in a new tab with the safe rel combo so a
    // malicious referrer can't manipulate the opener window.
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it('returns to the list when the Back button is clicked', async () => {
    const detailed: NewsItem[] = [
      {
        id: 'det-1',
        title: 'BOJ governor hints at cautious tightening',
        impactTier: 'high',
        at: at(2),
        source: 'Wire (mock)',
        body: 'Governor Ueda signaled openness to further tightening.',
      },
      // Second item to make "list view restored" assertable by looking
      // for a title that only exists on the list side.
      {
        id: 'det-2',
        title: 'US crude stockpiles fall sharply',
        impactTier: 'medium',
        at: at(10),
      },
    ]
    const user = userEvent.setup()
    render(<NewsFeed items={detailed} nowMs={NOW_MS} />)
    await user.click(
      screen.getByRole('button', {
        name: /BOJ governor hints at cautious tightening/i,
      }),
    )
    // While in detail, the other list item's title is not rendered
    // (the widget shows only the current detail view).
    expect(
      screen.queryByText(/US crude stockpiles fall sharply/i),
    ).toBeNull()
    await user.click(screen.getByRole('button', { name: /back to news/i }))
    // List is back: both titles are present again and the back button
    // is gone.
    expect(
      screen.getByText(/US crude stockpiles fall sharply/i),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: /back to news/i }),
    ).toBeNull()
  })

  it('returns to the list when the operator presses Escape in the detail view', async () => {
    // Keyboard parity: Escape is the conventional dismiss for any
    // transient overlay / panel state, and without it a keyboard-only
    // operator would have to tab to the back button every time.
    const detailed: NewsItem[] = [
      {
        id: 'det-1',
        title: 'BOJ governor hints at cautious tightening',
        impactTier: 'high',
        at: at(2),
        source: 'Wire (mock)',
      },
    ]
    const user = userEvent.setup()
    render(<NewsFeed items={detailed} nowMs={NOW_MS} />)
    await user.click(
      screen.getByRole('button', {
        name: /BOJ governor hints at cautious tightening/i,
      }),
    )
    expect(
      screen.getByRole('button', { name: /back to news/i }),
    ).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(
      screen.queryByRole('button', { name: /back to news/i }),
    ).toBeNull()
  })

  it('auto-returns to the list when the currently-viewed item leaves the feed', () => {
    // Streaming updates may drop a headline (replaced by newer items,
    // or provider retraction). Continuing to show a detail view whose
    // underlying item no longer exists is stale UI — the widget
    // falls back to the list rather than stranding the operator.
    const detailed: NewsItem[] = [
      {
        id: 'det-1',
        title: 'BOJ governor hints at cautious tightening',
        impactTier: 'high',
        at: at(2),
        source: 'Wire (mock)',
      },
    ]
    const { rerender } = render(
      <NewsFeed items={detailed} nowMs={NOW_MS} />,
    )
    // Open the detail view.
    screen
      .getByRole('button', {
        name: /BOJ governor hints at cautious tightening/i,
      })
      .click()
    // Item vanishes from the next payload.
    rerender(<NewsFeed items={[]} nowMs={NOW_MS} />)
    expect(
      screen.queryByRole('button', { name: /back to news/i }),
    ).toBeNull()
    expect(screen.getByText(/no headlines/i)).toBeInTheDocument()
  })

  it('renders the detail view even when only one of source/body/url is present', async () => {
    // Graceful degradation: a partial provider payload (source only,
    // say) still opens a sensible detail page — the missing fields
    // are simply absent, not "missing: <field>" noise.
    const partial: NewsItem[] = [
      {
        id: 'det-3',
        title: 'Europe manufacturing PMI ticks up',
        impactTier: 'low',
        at: at(20),
        source: 'S&P Global (mock)',
      },
    ]
    const user = userEvent.setup()
    render(<NewsFeed items={partial} nowMs={NOW_MS} />)
    await user.click(
      screen.getByRole('button', {
        name: /Europe manufacturing PMI ticks up/i,
      }),
    )
    expect(screen.getByText('S&P Global (mock)')).toBeInTheDocument()
    // Body / URL absent → no Read link, no orphaned empty body.
    expect(
      screen.queryByRole('link', { name: /read full article/i }),
    ).toBeNull()
  })

  it('focuses the Back button when the detail view opens so keyboard users land on the exit', async () => {
    // Focus management: entering the detail view without moving focus
    // leaves the keyboard caret on the dead row button (which no
    // longer exists after re-render), so the next Tab / Enter is
    // unpredictable. Landing focus on Back gives the keyboard-only
    // operator an obvious next move (Enter / Space = back to list).
    const detailed: NewsItem[] = [
      {
        id: 'det-1',
        title: 'BOJ governor hints at cautious tightening',
        impactTier: 'high',
        at: at(2),
        source: 'Wire (mock)',
      },
    ]
    const user = userEvent.setup()
    render(<NewsFeed items={detailed} nowMs={NOW_MS} />)
    await user.click(
      screen.getByRole('button', {
        name: /BOJ governor hints at cautious tightening/i,
      }),
    )
    expect(screen.getByRole('button', { name: /back to news/i })).toHaveFocus()
  })
})

describe('formatRelativeTime', () => {
  // Derivation: the thresholds are chosen so that "now" covers the
  // sub-minute band (< 60 s), minute granularity covers the first
  // hour (< 60 min), and hour+minute covers everything else. Tests
  // exercise each band plus the boundaries.

  it('returns "now" for timestamps within the last minute', () => {
    expect(formatRelativeTime(new Date(NOW_MS - 10_000).toISOString(), NOW_MS)).toBe('now')
    expect(formatRelativeTime(new Date(NOW_MS - 59_000).toISOString(), NOW_MS)).toBe('now')
  })

  it('returns "Xm ago" for the 1 – 59 minute band', () => {
    expect(formatRelativeTime(new Date(NOW_MS - 60_000).toISOString(), NOW_MS)).toBe('1m ago')
    expect(formatRelativeTime(new Date(NOW_MS - 30 * 60_000).toISOString(), NOW_MS)).toBe('30m ago')
  })

  it('returns "Xh ago" when the hour is whole', () => {
    expect(formatRelativeTime(new Date(NOW_MS - 2 * 60 * 60_000).toISOString(), NOW_MS)).toBe('2h ago')
  })

  it('returns "Xh Ym ago" when there is a minute remainder', () => {
    expect(formatRelativeTime(new Date(NOW_MS - (72 * 60_000)).toISOString(), NOW_MS)).toBe('1h 12m ago')
  })

  it('clamps negative diffs (future timestamps) to "now"', () => {
    // A server / client clock skew could produce an `at` slightly in
    // the future; rendering "-3m ago" would be confusing. The
    // Math.max(0, ...) guard keeps the display sane.
    expect(formatRelativeTime(new Date(NOW_MS + 5_000).toISOString(), NOW_MS)).toBe('now')
  })
})
