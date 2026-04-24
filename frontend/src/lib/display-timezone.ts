// Display timezone for chart axis labels (ADR 004 (i.3)). Pinned to
// JST since harness' primary market is JP equities/futures — chart
// labels must read in market time regardless of where the operator
// is logged in from. A future Localization Settings panel will
// replace this constant with a DB-backed value (planned in a
// successor ADR — Settings implementation patterns warrant their
// own ADR rather than inline expansion of ADR 004's panel list),
// at which point this module's surface stays the same and the
// constant becomes the seam where the setting plugs in.

export const DISPLAY_TIMEZONE = 'Asia/Tokyo'

const TIME_OF_DAY_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: DISPLAY_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  // hourCycle:'h23' pins the hour to the 00–23 range. Without it
  // some Node Intl builds render midnight as "24" instead of "00",
  // which both reads weird and breaks the chart axis tick contract.
  hourCycle: 'h23',
})

export function formatTimeOfDay(unixSec: number): string {
  return TIME_OF_DAY_FORMATTER.format(new Date(unixSec * 1000))
}
