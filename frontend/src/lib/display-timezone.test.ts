import { describe, expect, it } from 'vitest'
import { DEFAULT_DISPLAY_TIMEZONE, formatTimeOfDay } from './display-timezone'

describe('display-timezone', () => {
  it('exposes Asia/Tokyo as the default reading frame', () => {
    // ADR 004 (i.3) shipping note: harness' primary market is JP
    // equities/futures, so chart axis labels read in JST when no
    // operator preference has been loaded yet (first run, settings
    // fetch in-flight, settings fetch failure). ADR 009's Localization
    // panel makes this configurable; the default stays JST.
    expect(DEFAULT_DISPLAY_TIMEZONE).toBe('Asia/Tokyo')
  })

  it('formats unix seconds as HH:MM in the supplied timezone (JST)', () => {
    // 2026-01-01 00:00:00 UTC = 2026-01-01 09:00 JST. UTC midpoint
    // chosen so the +9h JST shift pushes the wall clock cleanly into
    // the morning — the test fails loudly if the formatter forgets
    // the timezone option and falls back to the runner's TZ.
    const unixSec = Math.floor(Date.UTC(2026, 0, 1, 0, 0, 0) / 1000)
    expect(formatTimeOfDay(unixSec, 'Asia/Tokyo')).toBe('09:00')
  })

  it('zero-pads single-digit hours via h23 hour cycle', () => {
    // 2026-01-01 19:00 UTC = 2026-01-02 04:00 JST. Without
    // hourCycle:'h23' some Node Intl builds render midnight as "24"
    // instead of "00", which both reads weird and breaks the chart
    // axis tick contract.
    const unixSec = Math.floor(Date.UTC(2026, 0, 1, 19, 0, 0) / 1000)
    expect(formatTimeOfDay(unixSec, 'Asia/Tokyo')).toBe('04:00')
  })

  it('honours a non-default timezone (UTC)', () => {
    // 2026-01-01 00:00:00 UTC = 00:00 UTC. Same input as the JST
    // case proves the formatter is reading the supplied zone, not
    // hardcoding Asia/Tokyo as it used to before ADR 009 Phase A.
    const unixSec = Math.floor(Date.UTC(2026, 0, 1, 0, 0, 0) / 1000)
    expect(formatTimeOfDay(unixSec, 'UTC')).toBe('00:00')
  })

  it('honours a non-default timezone (America/New_York)', () => {
    // 2026-01-01 12:00:00 UTC = 2026-01-01 07:00 EST (UTC-5 in
    // January, no DST). Cross-zone case to prove the per-zone
    // formatter cache returns distinct formatters for distinct zones.
    const unixSec = Math.floor(Date.UTC(2026, 0, 1, 12, 0, 0) / 1000)
    expect(formatTimeOfDay(unixSec, 'America/New_York')).toBe('07:00')
  })
})
