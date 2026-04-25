import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { fetchHelpEntry, type HelpEntry } from '@/lib/help-client'
import { useTranslation } from '@/lib/i18n'

// Help entry detail (ADR 010 Phase 1 — `/help/:slug` route).
//
// Renders a single entry's localized title and markdown body.
// Direct-link target for Phase 2 cross-links (state banner setup
// name, chart indicator label) — those land as `<Link>`s without
// extra coordination once they exist.

type State =
  | { kind: 'loading' }
  | { kind: 'ok'; entry: HelpEntry }
  | { kind: 'notFound' }
  | { kind: 'error'; message: string }

export default function HelpDetail() {
  const { slug } = useParams<{ slug: string }>()
  // `key={slug}` forces a remount when navigating between detail
  // pages, which gives the inner component a fresh `useState` initial
  // value of `loading` instead of needing a synchronous setState
  // inside an effect (which the react-hooks lint rule rejects).
  return <HelpDetailContent key={slug ?? ''} slug={slug} />
}

function HelpDetailContent({ slug }: { slug: string | undefined }) {
  const { t, language, tTag } = useTranslation()
  const [state, setState] = useState<State>(() =>
    slug ? { kind: 'loading' } : { kind: 'notFound' },
  )

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    fetchHelpEntry(slug)
      .then((entry) => {
        if (cancelled) return
        setState(entry === null ? { kind: 'notFound' } : { kind: 'ok', entry })
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setState({
          kind: 'error',
          message: err instanceof Error ? err.message : String(err),
        })
      })
    return () => {
      cancelled = true
    }
  }, [slug])

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div>
        <Link
          to="/help"
          className="text-muted-foreground hover:text-foreground focus-visible:ring-ring inline-flex items-center gap-1 rounded text-sm focus-visible:outline-none focus-visible:ring-2"
        >
          ← {t('help.detail.back')}
        </Link>
      </div>

      {state.kind === 'loading' && (
        <p className="text-muted-foreground text-sm">
          {t('help.detail.loading')}
        </p>
      )}
      {state.kind === 'notFound' && (
        <p className="text-muted-foreground text-sm">
          {t('help.detail.notFound')}
        </p>
      )}
      {state.kind === 'error' && (
        <p className="text-sm text-rose-600 dark:text-rose-400">
          {t('help.detail.error', { message: state.message })}
        </p>
      )}
      {state.kind === 'ok' && (
        <article
          aria-label={t('help.detail.aria')}
          className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto"
        >
          <header className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold">
              {language === 'ja' ? state.entry.titleJa : state.entry.titleEn}
            </h1>
            {state.entry.tags.length > 0 && (
              <div
                className="flex flex-wrap gap-1.5"
                aria-label={t('help.entry.tags')}
              >
                {state.entry.tags.map((tag) => (
                  <span
                    key={tag}
                    className="border-border text-muted-foreground rounded-full border px-2 py-0.5 text-xs"
                  >
                    {tTag(tag)}
                  </span>
                ))}
              </div>
            )}
          </header>
          <div className="markdown-body text-sm leading-relaxed">
            {/* react-markdown ships with safe defaults: raw HTML inside
                the markdown body is escaped, not rendered as markup, so
                a paste-bug or accidental <script> in an entry body
                cannot execute. The HelpDetail.test.tsx XSS case pins
                this. */}
            <ReactMarkdown>
              {language === 'ja' ? state.entry.bodyJa : state.entry.bodyEn}
            </ReactMarkdown>
          </div>
        </article>
      )}
    </div>
  )
}
