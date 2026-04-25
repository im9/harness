// Display timezone formatting for chart axis labels and exact-time
// rows in the NewsFeed (ADR 004 (i.3)). Originally pinned to JST as a
// constant; ADR 009 Phase A makes the zone operator-configurable.
// `formatTimeOfDay` now takes the zone explicitly — callers that live
// inside the React tree obtain the operator's preference via
// `useDisplayTimezone()` (lib/settings-context). The default constant
// is the fallback for code paths that run before the settings context
// is available (early bootstrap, tests).

export const DEFAULT_DISPLAY_TIMEZONE = 'Asia/Tokyo'

const formatterCache = new Map<string, Intl.DateTimeFormat>()

function timeOfDayFormatter(timezone: string): Intl.DateTimeFormat {
  // Per-zone cache so chart panning (formats every tick on every
  // pan frame) does not allocate a fresh DateTimeFormat per call.
  // The cache is unbounded but the key space is tiny (handful of
  // operator-selected zones across an entire session).
  let cached = formatterCache.get(timezone)
  if (cached === undefined) {
    cached = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      // hourCycle:'h23' pins the hour to the 00–23 range. Without
      // it some Node Intl builds render midnight as "24" instead
      // of "00", which both reads weird and breaks the chart axis
      // tick contract.
      hourCycle: 'h23',
    })
    formatterCache.set(timezone, cached)
  }
  return cached
}

export function formatTimeOfDay(unixSec: number, timezone: string): string {
  return timeOfDayFormatter(timezone).format(new Date(unixSec * 1000))
}
