// Relative time label for a timestamp. Phase 1 surfaces — NewsFeed
// being the first — render short-window durations (within the last
// hour or two); the buckets below are tuned for what a trader
// actually reads at a glance:
//   < 60 s              → "now"
//   60 s – 59 min       → "Xm ago"
//   ≥ 60 min, whole hr  → "Xh ago"
//   ≥ 60 min, remainder → "Xh Ym ago"   (preserves minute precision
//                                         so "1h 59m ago" isn't hidden
//                                         behind a bare "1h ago")
//
// Future timestamps — produced by clock skew between the operator's
// machine and the event source — clamp to "now" so the display never
// shows "-3m ago".
export function formatRelativeTime(atIso: string, nowMs: number): string {
  const atMs = Date.parse(atIso)
  const diffSec = Math.max(0, Math.round((nowMs - atMs) / 1000))
  if (diffSec < 60) return 'now'
  const diffMin = Math.round(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const hrs = Math.floor(diffMin / 60)
  const rem = diffMin % 60
  return rem ? `${hrs}h ${rem}m ago` : `${hrs}h ago`
}
