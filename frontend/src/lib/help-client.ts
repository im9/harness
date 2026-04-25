// Client boundary for the help-entries API (ADR 010 Phase 1).
//
// The list page fetches the full corpus once via `GET /api/help` and
// filters in-memory in the active language (Phase 1 Decision Q5).
// The detail page fetches a single entry by slug via
// `GET /api/help/{slug}`. Server-side `?tag=` and `?q=` parameters
// exist for future paging and are deliberately not surfaced here yet
// — exposing them would invite the list page to over-fetch on every
// keystroke when the corpus is small enough to filter locally.
//
// Bilingual fields per Phase 1 Decision Q1: title / body / aliases
// have separate `_en` and `_ja` shapes; the consumer picks the pair
// matching `useTranslation()`'s active language.

export interface HelpEntry {
  slug: string
  titleEn: string
  titleJa: string
  tags: string[]
  bodyEn: string
  bodyJa: string
  aliasesEn?: string[] | null
  aliasesJa?: string[] | null
}

export async function fetchHelpEntries(): Promise<HelpEntry[]> {
  // `credentials: 'include'` mirrors the cookie auth the rest of the
  // API uses (ADR 001 token strategy).
  const response = await fetch('/api/help', { credentials: 'include' })
  if (!response.ok) {
    throw new Error(`Help fetch failed: HTTP ${response.status}`)
  }
  return (await response.json()) as HelpEntry[]
}

export async function fetchHelpEntry(slug: string): Promise<HelpEntry | null> {
  // 404 is a valid result for the detail page (the operator may follow
  // a stale cross-link or type a bad URL); collapse it to `null` so
  // the route component renders a "not found" state without an error
  // boundary trip.
  const response = await fetch(`/api/help/${encodeURIComponent(slug)}`, {
    credentials: 'include',
  })
  if (response.status === 404) return null
  if (!response.ok) {
    throw new Error(`Help fetch failed: HTTP ${response.status}`)
  }
  return (await response.json()) as HelpEntry
}
