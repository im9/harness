// ChatProvider boundary (ADR 004 §Provider abstractions).
//
// Phase 1 ships the `echo` mock mode only — a deterministic stub that
// replies with the operator's own text so the UI can be exercised
// without a live model. A later increment swaps this for a streaming
// provider (`local` self-hosted LLM) over SSE; the `sendChatMessage`
// signature will sprout a streaming variant at that point. Keeping
// the types here (rather than in `dashboard-types.ts`) so the chat
// surface can evolve independently of the dashboard payload contract.

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

// A small delay keeps the UI honest: the operator briefly sees a
// pending state before the echo resolves, rehearsing the visual
// rhythm a real model will produce. Short enough not to annoy; long
// enough to flush the "send disabled while pending" path.
const ECHO_LATENCY_MS = 30

let counter = 0

function nextId(role: ChatRole): string {
  counter += 1
  return `${role}-${counter}-${Date.now().toString(36)}`
}

export async function sendChatMessage(text: string): Promise<ChatTurn> {
  await new Promise((resolve) => setTimeout(resolve, ECHO_LATENCY_MS))
  return {
    id: nextId('assistant'),
    role: 'assistant',
    text: `Echo: ${text}`,
    at: Math.floor(Date.now() / 1000),
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
