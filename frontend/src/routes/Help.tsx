import { useEffect, useId, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchHelpEntries, type HelpEntry } from '@/lib/help-client'
import { useTranslation } from '@/lib/i18n'
import { cn } from '@/lib/utils'

// Help list (ADR 010 Phase 1 — `/help` route).
//
// Browses the operator's curated help corpus. Bilingual: titles and
// aliases displayed in the active language picked from
// `useTranslation()`. Filtering is in-memory over the full list
// fetched once on mount (Phase 1 Decision Q5); server-side `?tag=`
// and `?q=` exist on the API for future paging but the page does
// not use them at this corpus size.

export default function Help() {
  const { t, language, tTag } = useTranslation()
  const [entries, setEntries] = useState<HelpEntry[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const searchId = useId()

  useEffect(() => {
    let cancelled = false
    fetchHelpEntries()
      .then((data) => {
        if (cancelled) return
        setEntries(data)
        setLoadError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setLoadError(err instanceof Error ? err.message : String(err))
        setEntries([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const titleOf = (entry: HelpEntry): string =>
    language === 'ja' ? entry.titleJa : entry.titleEn

  const aliasesOf = (entry: HelpEntry): string[] =>
    (language === 'ja' ? entry.aliasesJa : entry.aliasesEn) ?? []

  const allTags = useMemo(() => {
    if (!entries) return []
    const seen = new Set<string>()
    for (const entry of entries) {
      for (const tag of entry.tags) seen.add(tag)
    }
    return Array.from(seen).sort()
  }, [entries])

  const visibleEntries = useMemo(() => {
    if (!entries) return []
    const needle = query.trim().toLowerCase()
    return entries.filter((entry) => {
      const titleMatch =
        needle === '' ||
        titleOf(entry).toLowerCase().includes(needle) ||
        aliasesOf(entry).some((a) => a.toLowerCase().includes(needle))
      const tagMatch = activeTag === null || entry.tags.includes(activeTag)
      return titleMatch && tagMatch
    })
    // titleOf / aliasesOf close over `language`; the language change
    // is captured by including `language` in the dependency list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, query, activeTag, language])

  const corpusEmpty = entries !== null && entries.length === 0

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <header>
        <h1 className="text-lg font-semibold">{t('help.title')}</h1>
        <p className="text-muted-foreground text-sm">{t('help.subtitle')}</p>
      </header>

      <div className="flex flex-col gap-2">
        <label htmlFor={searchId} className="sr-only">
          {t('help.search.aria')}
        </label>
        <input
          id={searchId}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={t('help.search.aria')}
          placeholder={t('help.search.placeholder')}
          className="border-border bg-background focus-visible:ring-ring w-full max-w-md rounded border px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2"
        />
        {allTags.length > 0 && (
          <div
            className="flex flex-wrap gap-1.5"
            aria-label={t('help.tag.filterAria')}
          >
            {allTags.map((tag) => {
              const active = activeTag === tag
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() =>
                    setActiveTag((prev) => (prev === tag ? null : tag))
                  }
                  aria-pressed={active}
                  className={cn(
                    'rounded-full border px-2 py-0.5 text-xs cursor-pointer',
                    'focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2',
                    active
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'border-border text-muted-foreground hover:bg-muted',
                  )}
                >
                  {tTag(tag)}
                </button>
              )
            })}
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        {loadError && (
          <p className="px-1 py-2 text-xs text-rose-600 dark:text-rose-400">
            {loadError}
          </p>
        )}
        {corpusEmpty ? (
          <p className="text-muted-foreground py-2 text-xs whitespace-pre-line">
            {t('help.empty.noEntries')}
          </p>
        ) : visibleEntries.length === 0 ? (
          <p className="text-muted-foreground py-2 text-xs">
            {t('help.empty.noMatches')}
          </p>
        ) : (
          <ul className="divide-border divide-y border-y">
            {visibleEntries.map((entry) => (
              <li key={entry.slug}>
                <Link
                  to={`/help/${entry.slug}`}
                  className="hover:bg-muted focus-visible:bg-muted focus-visible:ring-ring block px-1 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2"
                >
                  <span className="block font-medium">{titleOf(entry)}</span>
                  {entry.tags.length > 0 && (
                    <span className="text-muted-foreground mt-0.5 block text-xs">
                      {entry.tags.map((tag) => tTag(tag)).join(' · ')}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
