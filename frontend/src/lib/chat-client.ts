// ChatProvider boundary (ADR 004 §Provider abstractions).
//
// Phase 1 ships the `echo` mock mode only — a deterministic stub that
// replies with the operator's own text so the UI can be exercised
// without a live model. The reply is delivered as a stream of chunks
// to rehearse the SSE shape the real provider will use; consumers
// concatenate chunks (keyed by stable id) into a single growing
// assistant bubble.
//
// Auto-injected context (ADR 004 §AI chat) travels with every turn:
// the operator's prompt is paired with a snapshot of the dashboard's
// current primary / watchlist / markets / rule / news. The mock
// ignores the body, but the type contract is the load-bearing surface
// for the real provider (which prompt-caches the snapshot server-side).

import type {
  InstrumentRowState,
  MarketIndex,
  NewsItem,
  RuleOverlayState,
  WatchlistItem,
} from './dashboard-types'

export type ChatRole = 'user' | 'assistant'

export interface ChatTurn {
  id: string
  role: ChatRole
  text: string
  // UTC seconds since epoch. Same time base as `Bar.time` so the
  // cross-link increment (i.3) can match AI references to chart
  // markers without a per-surface translation table.
  at: number
}

// Per-turn snapshot of the dashboard state that travels alongside the
// operator's prompt. Mirrors a structural subset of `DashboardPayload`
// (with the `primary` / `rule` slots nullable for the loading frame).
// Defined here rather than re-exported from `dashboard-types.ts` so
// the chat surface can evolve independently — e.g. add a
// "selected-marker" slice for (i.3) without touching the dashboard
// payload contract.
export interface ChatContext {
  primary: InstrumentRowState | null
  watchlist: WatchlistItem[]
  markets: MarketIndex[]
  rule: RuleOverlayState | null
  news: NewsItem[]
}

export interface ChatStreamChunk {
  // Stable across every chunk of one reply; consumers collapse chunks
  // into a single bubble keyed by id. Distinct across separate replies
  // so transcript keys never collide.
  id: string
  delta: string
  // True only on the terminator chunk. Consumers drop the "pending"
  // indicator on this frame.
  done: boolean
  at: number
}

// First-chunk latency for the mock. Real LLM providers have a
// noticeable time-to-first-token (model warm-up + initial inference)
// distinct from the per-token rate. Rehearsing that gap here keeps
// the "thinking" UI affordance honest — without it the indicator
// flickers for a single frame and the surface reads as if the submit
// was lost. ~350ms is the lower edge of perceptible delay; long
// enough for the indicator to register as a deliberate state.
const FIRST_CHUNK_DELAY_MS = 350

// Per-token cadence after the first chunk. ~40ms ≈ 25 tokens/sec,
// in the band real provider streams tend to deliver and slow enough
// that an attentive operator can read the reply land word-by-word.
const STREAM_CHUNK_DELAY_MS = 40

let counter = 0

function nextId(role: ChatRole): string {
  counter += 1
  return `${role}-${counter}-${Date.now().toString(36)}`
}

// Token regex: each match is a non-space run plus its trailing
// whitespace, which lets the consumer concatenate deltas verbatim
// (no surface-side join). A single-token reply still emits one chunk.
function tokenize(text: string): string[] {
  return text.match(/\S+\s*/g) ?? [text]
}

export async function* streamChatReply(
  text: string,
  // Mock-mode echo ignores the snapshot body — the real provider
  // (ADR 004 §AI chat) prompt-caches it server-side. Kept as a
  // required positional so the type contract reaches the call site.
  context: ChatContext,
): AsyncGenerator<ChatStreamChunk, void, void> {
  void context
  const id = nextId('assistant')
  const reply = `Echo: ${text}`
  const tokens = tokenize(reply)
  for (let i = 0; i < tokens.length; i++) {
    const delay = i === 0 ? FIRST_CHUNK_DELAY_MS : STREAM_CHUNK_DELAY_MS
    await new Promise((resolve) => setTimeout(resolve, delay))
    yield {
      id,
      delta: tokens[i],
      done: i === tokens.length - 1,
      at: Math.floor(Date.now() / 1000),
    }
  }
}

export function makeUserTurn(text: string): ChatTurn {
  return {
    id: nextId('user'),
    role: 'user',
    text,
    at: Math.floor(Date.now() / 1000),
  }
}
