import { describe, expect, it } from 'vitest'
import { DISPLAY_TIMEZONE, formatTimeOfDay } from './display-timezone'

describe('display-timezone', () => {
  it('pins the operator reading frame to Asia/Tokyo', () => {
    // ADR 004 (i.3) shipping note: harness' primary market is JP
    // equities/futures, so chart axis labels read in JST regardless
    // of where the operator is logged in from. A future Localization
    // Settings panel will make this configurable; pinning the
    // constant here is the seam.
    expect(DISPLAY_TIMEZONE).toBe('Asia/Tokyo')
  })

  it('formats unix seconds as HH:MM in JST', () => {
    // 2026-01-01 00:00:00 UTC = 2026-01-01 09:00 JST. UTC midpoint
    // chosen so the JST shift of +9h pushes the wall clock cleanly
    // into the morning — the test fails loudly if the formatter
    // forgets the timezone option and falls back to the runner's TZ.
    const unixSec = Math.floor(Date.UTC(2026, 0, 1, 0, 0, 0) / 1000)
    expect(formatTimeOfDay(unixSec)).toBe('09:00')
  })

  it('zero-pads single-digit hours', () => {
    // 2026-01-01 19:00 UTC = 2026-01-02 04:00 JST. Without
    // hourCycle:'h23' some Node Intl builds render midnight as "24"
    // instead of "00", which both reads weird and breaks the axis
    // tick contract.
    const unixSec = Math.floor(Date.UTC(2026, 0, 1, 19, 0, 0) / 1000)
    expect(formatTimeOfDay(unixSec)).toBe('04:00')
  })
})
