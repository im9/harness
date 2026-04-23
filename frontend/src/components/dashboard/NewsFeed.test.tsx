import { render, screen } from '@testing-library/react'
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
