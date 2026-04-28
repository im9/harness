# ADR 006: AI Chat Widget

## Status: Implemented

## Context

ADR 004 declared the AI chat as a floating panel anchored to the
dashboard's bottom-right, invoked on demand, not a route of its own.
This ADR covers the widget's UX + structural guarantees: the FAB
morph, the streaming turn loop, per-turn context auto-injection, and
the "chat stays chat" non-goal that kept the surface honest against
two misguided cross-link attempts.

Phase 1 ships against the mock `ChatProvider` (ADR 008) in `echo`
mode. The real `local` LLM mode is out of scope here — it lands
when ADR 008's provider registry grows a concrete adapter.

## Decision

### Behavioral contract

- Never pushes proactively — responds only to operator-submitted
  messages.
- Cannot mutate rule state (structural, not prompt-driven: rule
  state is computed upstream of the chat request and has no writable
  channel back).
- Session-only; no persistence.
- Auto-injected per turn (prompt-cached server-side by a real
  provider): current price / VWAP / setup state for the active
  primary, current recommendation and reason, watchlist snapshot
  (ticker + state + last price + pctChange per tracked instrument,
  active primary excluded to avoid duplication), markets snapshot
  (global benchmark indices with last + pctChange), rule state (used
  / cap), recent news headlines.
- Text in, text out. No tool use in Phase 1.

### Chat stays chat (non-goal)

No side effects on other panels — no parsing of reply text to drive
UI actions (e.g. the originally proposed "click an HH:MM in a
reply, pulse a chart marker" was retracted; ad-hoc text-scraping is
the brittle pattern that conventional LLM UIs avoid). Cross-anchor
interactions belong on structured info surfaces (news rows already
carry `at`, alerts will carry their trigger time, etc.). The chat
panel rejoins the cross-link story in Phase 2 when real LLM tool-use
/ structured citations arrive.

### UI: FAB morph

A 48 × 48 floating action button anchored to the dashboard's
bottom-right corner. Click morphs the FAB into a bottom-right-
anchored chat card (~420 × 640 px) by interpolating width / height /
border-radius only — the surface reads as one element deforming
rather than a separate panel flying in. The dashboard stays fully
visible around the card (non-modal, no dim overlay) so the operator
can keep reading the chart while composing a question about it;
close reverses the morph back to the FAB. Narrow viewports clamp
the card to the available space (`width: min(420px, 100vw - 3rem)`,
`height: min(640px, 100dvh - 6rem)`) while keeping the same
morph-from-FAB behavior.

Mobile: the card expands to full screen on narrow viewports, with
the same morph anchor.

### Streaming + provider boundary

`chat-client.ts` is the ChatProvider boundary. `streamChatReply(text,
context): AsyncGenerator<ChatStreamChunk>` yields word-level chunks
so the surface rehearses the SSE shape the real provider will use.
Two timing constants separate the latencies a real LLM exposes:
`FIRST_CHUNK_DELAY_MS` (~350 ms) rehearses the time-to-first-token
gap (model warm-up + initial inference), while
`STREAM_CHUNK_DELAY_MS` (~40 ms ≈ 25 tok/s) is the per-token cadence
after the first chunk lands. Without that split the entire reply
finishes in one frame and the "thinking" UI affordance is invisible.

Each chunk carries a stable `id` (one per reply, distinct across
replies) plus a `done` terminator flag and a unix-second `at` stamp;
consumers collapse chunks into a single growing bubble keyed by id.

The pending indicator is gated on
`pending && turns.at(-1)?.role !== 'assistant'` so it only surfaces
while waiting for the first chunk — once a chunk lands the growing
bubble itself is the streaming cue, and a parallel "…" would read
as a duplicate signal.

A new `ChatContext` type at the chat boundary
(`primary | watchlist | markets | rule | news`, with `primary` /
`rule` nullable for the loading frame) is projected from the
dashboard payload and threaded through `<AiChatFloat context={…} />`;
the panel reads it via a ref at submit time so each turn ships the
latest snapshot rather than the value at panel-open. The mock
echoes the prompt and ignores the snapshot body — the type contract
is the load-bearing surface for the real provider, which prompt-
caches the snapshot server-side.

## Implementation

- [x] (i.1) Panel shell + echo-mode turn loop. `chat-client.ts`
      vends a mock ChatProvider in `echo` mode (deterministic
      `Echo: …` replies, monotonic ids, unix-second timestamps)
      ahead of the streaming provider. `AiChatFloat` is a single
      container anchored bottom-right that morphs between a 48 × 48
      circle (FAB state) and a ~420 × 640 card (panel state) by
      interpolating width / height / border-radius only — bg, text,
      and border colors are invariant so there is no mid-tone bleed
      through the transition. FAB icon and panel content exchange
      via the HTML `hidden` attribute (display:none + a11y-tree
      removal) rather than opacity, so at every frame the user sees
      exactly one of the two surfaces. Enter-to-send skips on
      `event.nativeEvent.isComposing` so IME commits (CJK input)
      never fire a stale submit; `flushSync` plus an imperative
      composer clear harden the draft reset. Close control is a `-`
      minimize glyph (not ×) since the surface is session-ephemeral
      and will be reopened many times. Closed border-radius uses an
      explicit 24 px (half the 48 px side) so the morph interpolates
      linearly to the open state's 8 px without clamping to a pill
      shape mid-transition.
- [x] (i.2) Streaming + auto-injected context. `chat-client.ts`
      replaces the single-shot `sendChatMessage` with
      `streamChatReply(text, context): AsyncGenerator<ChatStreamChunk>`,
      which yields word-level chunks so the surface rehearses the SSE
      shape the real provider will use. Two timing constants
      separate the latencies a real LLM exposes:
      `FIRST_CHUNK_DELAY_MS` (~350 ms) rehearses the
      time-to-first-token gap (model warm-up + initial inference),
      while `STREAM_CHUNK_DELAY_MS` (~40 ms ≈ 25 tok/s) is the
      per-token cadence after the first chunk lands. Without that
      split the entire reply finishes in one frame and the "thinking"
      UI affordance is invisible. Each chunk carries a stable `id`
      (one per reply, distinct across replies) plus a `done`
      terminator flag and a unix-second `at` stamp; consumers
      collapse chunks into a single growing bubble keyed by id.
      A new `ChatContext` type at the chat boundary
      (`primary | watchlist | markets | rule | news`, with
      `primary` / `rule` nullable for the loading frame) is projected
      from the dashboard payload and threaded through
      `<AiChatFloat context={…} />`; the panel reads it via a ref at
      submit time so each turn ships the latest snapshot rather than
      the value at panel-open. The pending indicator is gated on
      `pending && turns.at(-1)?.role !== 'assistant'` so it only
      surfaces while waiting for the first chunk — once a chunk
      lands the growing bubble itself is the streaming cue, and a
      parallel "…" would read as a duplicate signal. The mock
      echoes the prompt and ignores the snapshot body — the type
      contract is the load-bearing surface for the real provider,
      which prompt-caches the snapshot server-side.

## Considerations

**AI guardrail is structural.** Rule state is computed upstream of
the chat request; the AI's output channel is text back to the
operator and has no path to mutate rule state. System-prompt framing
is secondary defense.

**Compliance framing.** harness is a private, single-user tool served
over an authenticated tunnel (ADR 001). It is not marketed, not
offered to third parties. Output phrasing favors descriptive ("setup
triggered, conditions are X, Y, Z") over prescriptive ("you should
buy") as cheap insurance on top of the private-access model. This
applies to the AI chat reply surface as well — system-prompt
framing should steer the model toward descriptive phrasing.

## Revisions

**2026-04-25 — Trend pivot (ADR 007 revision).** The auto-injected
`ChatContext.rule` field is replaced by `ChatContext.trend`
(`up` / `down` / `range`); the panel UX, FAB morph, streaming
turn loop, and "chat stays chat" non-goal are unaffected. The
wire-format transition lands alongside ADR 007's implementation
slice. The "AI guardrail is structural" consideration carries
over with the renamed field — trend state is computed upstream
and the chat has no writable channel back into engine state.

## Future extensions

- **AI chat as a trigger surface** (Phase 2) — structured tool-use /
  citations that let the model pulse a chart marker, surface a
  rule-state explanation, or cite news items programmatically. Only
  worth building when a real LLM mode (not the echo mock) is wired,
  and with a designed UX that goes beyond ephemeral flashes.
  Originally specced as "regex-parse HH:MM in replies → pulse chart
  marker" (ADR 004 i.3) and retracted — text scraping is the wrong
  shape for this interaction.
- **AI tool use** (Phase 2) — backtest-on-demand, similar-day search,
  event-impact history. Extends the chat surface into the analytical
  workflow without turning it into a UI mutator.

## Related ADRs

- [ADR 004](004-mvp-scope.md) — Phase 1 MVP scope (this ADR realizes
  the AI chat surface declared there).
- [ADR 005](005-dashboard-layout.md) — Dashboard layout (the chat
  widget anchors to the dashboard's bottom-right).
- [ADR 008](../008-backend-providers.md) — ChatProvider protocol +
  `echo` / `local` modes. This ADR consumes the `echo` mock; the
  `local` mode is tracked there.
