import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
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

  it('keeps rows as static elements when no onSelect is wired', () => {
    // Phase-1 default: callers that don't subscribe to the cross-link
    // should not see operator-clickable rows. A button with no behavior
    // would invite confused clicks ("nothing happened?") — staying as a
    // <div> is the honest signal.
    render(<NewsFeed items={makeItems()} nowMs={NOW_MS} />)
    const region = screen.getByRole('complementary', { name: /news/i })
    expect(region.querySelectorAll('button')).toHaveLength(0)
  })

  it('renders headline rows as buttons when onSelect is wired and surfaces the item on click', async () => {
    // ADR 004 (i.3) news → chart cross-link. The row is a single
    // button (tag · time · title) so the entire visible cell is the
    // hit target — clicking anywhere within hands the item back to
    // the parent for resolving against the chart.
    const onSelect = vi.fn()
    const items = makeItems()
    const user = userEvent.setup()
    render(<NewsFeed items={items} nowMs={NOW_MS} onSelect={onSelect} />)
    const targetRow = screen.getByRole('button', {
      name: /BOJ governor hints at cautious tightening/i,
    })
    await user.click(targetRow)
    expect(onSelect).toHaveBeenCalledTimes(1)
    expect(onSelect).toHaveBeenCalledWith(items[0])
  })

  it('exposes each clickable row with an accessible "Locate on the chart" name', async () => {
    // The aria-label tells screen-reader users what the click does
    // (locates the headline on the chart). Without this, the button's
    // accessible name would just be the headline title — which doesn't
    // hint that the row is a chart-anchor trigger.
    const onSelect = vi.fn()
    render(<NewsFeed items={makeItems()} nowMs={NOW_MS} onSelect={onSelect} />)
    expect(
      screen.getByRole('button', {
        name: /Locate "BOJ governor hints at cautious tightening" on the chart/i,
      }),
    ).toBeInTheDocument()
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
