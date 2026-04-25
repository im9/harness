import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import { flushSync } from 'react-dom'
import { useTranslation } from '@/lib/i18n'
import {
  makeUserTurn,
  streamChatReply,
  type ChatContext,
  type ChatTurn,
} from '@/lib/chat-client'
import { cn } from '@/lib/utils'

// Floating AI chat entry point + slide-in panel (ADR 004 §AI chat).
// The panel is non-modal: the dashboard stays fully readable
// underneath so the operator can keep watching the chart while
// composing a question about it. Closing returns the dashboard to its
// uninterrupted view. Mobile collapses the panel to full screen.
//
// Phase 1 streams text in / text out against the `echo` mock
// ChatProvider (i.2). Each turn auto-injects the current dashboard
// snapshot (primary / watchlist / markets / rule / news) per
// ADR 004 §AI chat — the chart-marker cross-link arrives in (i.3).

interface AiChatFloatProps {
  // Live snapshot from the dashboard. Read on every submit (via a
  // ref) so the model sees whatever the dashboard is showing in that
  // frame, not the value at panel-open time.
  context?: ChatContext | null
}

const EMPTY_CONTEXT: ChatContext = {
  primary: null,
  watchlist: [],
  markets: [],
  rule: null,
  news: [],
}

export default function AiChatFloat({ context = null }: AiChatFloatProps = {}) {
  const [open, setOpen] = useState(false)
  const [turns, setTurns] = useState<ChatTurn[]>([])
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState(false)
  const { t } = useTranslation()

  const panelId = useId()
  const titleId = useId()
  const fabRef = useRef<HTMLButtonElement | null>(null)
  const composerRef = useRef<HTMLTextAreaElement | null>(null)
  const transcriptRef = useRef<HTMLDivElement | null>(null)

  // Live ref to the latest context so submit reads the current
  // snapshot without re-creating the callback on every dashboard tick
  // (the parent may re-render at SSE cadence, which is too often to
  // burn down the submit handler).
  const contextRef = useRef<ChatContext | null>(context)
  useEffect(() => {
    contextRef.current = context
  }, [context])

  const close = useCallback(() => {
    setOpen(false)
  }, [])

  // Return focus to the FAB after the panel collapses. The FAB is
  // `hidden` while the panel is open and a display:none node cannot
  // receive focus, so the transfer has to wait until React commits
  // the state change and the FAB is visible again.
  const prevOpenRef = useRef(open)
  useEffect(() => {
    const wasOpen = prevOpenRef.current
    prevOpenRef.current = open
    if (wasOpen && !open) {
      fabRef.current?.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function handleKey(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [open, close])

  useEffect(() => {
    if (open) {
      // Focus the composer on open so the operator can type
      // immediately without a second click.
      composerRef.current?.focus()
    }
  }, [open])

  useEffect(() => {
    // Auto-scroll the transcript to the newest turn. A chat surface
    // that doesn't pin to the bottom on append forces the operator to
    // hunt for the reply every turn.
    const node = transcriptRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [turns, pending])

  const submit = useCallback(
    async (event?: FormEvent) => {
      event?.preventDefault()
      const text = draft.trim()
      if (!text || pending) return
      const userTurn = makeUserTurn(text)
      flushSync(() => {
        setTurns((prev) => [...prev, userTurn])
        setDraft('')
        setPending(true)
      })
      // Belt-and-suspenders clear. `setDraft('')` inside flushSync is
      // enough in jsdom and in every React-controlled path, but in the
      // real browser an in-progress IME composition or a browser
      // autofill layer can hold onto the pre-submit DOM value past the
      // commit. Imperatively writing '' to the underlying node clears
      // those cases without fighting the controlled contract — on the
      // next render React re-confirms value=''.
      if (composerRef.current) {
        composerRef.current.value = ''
      }
      const ctx = contextRef.current ?? EMPTY_CONTEXT
      try {
        // Each chunk grows the same assistant bubble (id captured from
        // the first chunk). The terminator chunk's `done` flag is what
        // ends the stream, but the for-await loop also ends naturally
        // when the generator returns — both paths land in the finally.
        let assistantId: string | null = null
        for await (const chunk of streamChatReply(text, ctx)) {
          if (assistantId === null) {
            assistantId = chunk.id
            const initialTurn: ChatTurn = {
              id: chunk.id,
              role: 'assistant',
              text: chunk.delta,
              at: chunk.at,
            }
            setTurns((prev) => [...prev, initialTurn])
          } else {
            const id = assistantId
            const delta = chunk.delta
            const at = chunk.at
            setTurns((prev) =>
              prev.map((t) =>
                t.id === id ? { ...t, text: t.text + delta, at } : t,
              ),
            )
          }
        }
      } finally {
        setPending(false)
      }
    },
    [draft, pending],
  )

  const handleComposerKey = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      // Enter submits; Shift+Enter inserts a newline. The
      // `isComposing` guard is critical for IME input (Japanese,
      // Chinese, Korean, …): the Enter that commits a composition
      // must NOT fire submit, or the operator sees their un-committed
      // text "stuck" in the composer because the submit ran before
      // the composition resolved into the React-controlled value.
      if (
        event.key === 'Enter' &&
        !event.shiftKey &&
        !event.nativeEvent.isComposing
      ) {
        event.preventDefault()
        void submit()
      }
    },
    [submit],
  )

  return (
    // Single container that morphs between a 48×48 circle (FAB state)
    // and a card panel. The container's background, text color, and
    // border are invariant across states — only width/height/
    // border-radius animate, so there is no color interpolation and
    // the two states read as one surface deforming (matching the
    // CodePen reference). The FAB icon and the panel content are
    // exchanged via the HTML `hidden` attribute (display:none +
    // a11y-tree removal) rather than opacity, so nothing bleeds
    // through the transition — at any given moment the user sees
    // either an icon-only circle, a growing/shrinking card with an
    // icon centered (during close), or the full panel.
    <div
      className={cn(
        'bg-card text-card-foreground border-border fixed right-6 bottom-6 z-40 overflow-hidden border shadow-lg',
        'transition-[width,height,border-radius] duration-200 ease-out',
        // border-radius uses finite pixel values on both ends so CSS
        // can linearly interpolate without clamping. `rounded-full`
        // (9999px) would stay as "max round" — i.e. pill-shaped — for
        // almost the entire morph and only snap to a normal card
        // radius at the very last frame, which reads as an abrupt
        // shape change. 24px equals half the FAB side (48px) so the
        // closed state is still a clean circle.
        open
          ? 'h-[min(640px,calc(100dvh-6rem))] w-[min(420px,calc(100vw-3rem))] rounded-lg'
          : 'h-12 w-12 rounded-[24px]',
      )}
    >
      <button
        ref={fabRef}
        type="button"
        hidden={open}
        aria-label={t('chat.open.aria')}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(true)}
        className={cn(
          'text-primary hover:bg-muted absolute inset-0 flex cursor-pointer items-center justify-center',
          'focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2',
        )}
      >
        <ChatIcon />
      </button>
      <section
        id={panelId}
        role="dialog"
        aria-modal="false"
        aria-labelledby={titleId}
        hidden={!open}
        className="absolute inset-0 flex flex-col"
      >
        <header className="border-border flex items-center justify-between border-b px-4 py-3">
          <h2 id={titleId} className="text-sm font-semibold tracking-wide">
            {t('chat.title')}
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label={t('chat.close.aria')}
            className="text-muted-foreground hover:text-foreground focus-visible:ring-ring cursor-pointer rounded p-1 focus-visible:outline-none focus-visible:ring-2"
          >
            <MinimizeIcon />
          </button>
        </header>
        <div
          ref={transcriptRef}
          role="log"
          aria-label={t('chat.transcript.aria')}
          aria-live="polite"
          className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3"
        >
          {turns.length === 0 && !pending && (
            <p className="text-muted-foreground text-xs">{t('chat.empty')}</p>
          )}
          {turns.map((turn) => (
            <TurnBubble key={turn.id} turn={turn} />
          ))}
          {pending && turns[turns.length - 1]?.role !== 'assistant' && (
            // The "thinking" indicator only shows while we're waiting
            // for the first chunk of the reply. Once a chunk lands the
            // assistant bubble becomes the latest turn and the growing
            // text itself communicates "responding" — a parallel "…"
            // would read as a duplicate cue.
            <p
              className="text-muted-foreground text-xs italic"
              data-testid="pending-indicator"
            >
              …
            </p>
          )}
        </div>
        <form
          onSubmit={submit}
          className="border-border flex items-end gap-2 border-t px-3 py-3"
        >
          <label htmlFor={`${panelId}-composer`} className="sr-only">
            {t('chat.message.label')}
          </label>
          <textarea
            id={`${panelId}-composer`}
            ref={composerRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={handleComposerKey}
            rows={2}
            placeholder={t('chat.message.placeholder')}
            aria-label={t('chat.message.label')}
            className="border-border bg-background focus-visible:ring-ring flex-1 resize-none rounded border px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2"
          />
          <button
            type="submit"
            disabled={pending || draft.trim().length === 0}
            aria-label={t('chat.send.aria')}
            className={cn(
              'bg-primary text-primary-foreground cursor-pointer rounded px-3 py-1.5 text-sm font-medium',
              'hover:bg-primary/90 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-2',
              'disabled:cursor-not-allowed disabled:opacity-50',
            )}
          >
            {t('chat.send')}
          </button>
        </form>
      </section>
    </div>
  )
}

function TurnBubble({ turn }: { turn: ChatTurn }) {
  const isUser = turn.role === 'user'
  return (
    <div
      data-role={turn.role}
      className={cn(
        'flex flex-col gap-0.5',
        isUser ? 'items-end' : 'items-start',
      )}
    >
      <div
        className={cn(
          'max-w-[85%] rounded-lg px-3 py-2 text-sm leading-snug whitespace-pre-wrap',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-foreground',
        )}
      >
        {turn.text}
      </div>
    </div>
  )
}

function ChatIcon() {
  // Simple inline SVG keeps the surface area small — the project
  // already vends `lucide-react` but this component is small enough
  // not to warrant dragging an icon import through the bundle.
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  )
}

function MinimizeIcon() {
  // Single horizontal stroke. Visual shorthand for "minimize" /
  // "collapse" that reads more softly than the × of a permanent
  // dismiss — fitting for a panel the operator will likely reopen
  // many times in a session.
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 12h14" />
    </svg>
  )
}
