import { describe, expect, it } from 'vitest'
import {
  streamChatReply,
  type ChatContext,
  type ChatStreamChunk,
} from './chat-client'

// Empty snapshot for tests that don't care about what context the
// provider receives — the echo mock ignores the context body, so an
// empty shape exercises the same code paths as a populated one.
const EMPTY_CONTEXT: ChatContext = {
  primary: null,
  watchlist: [],
  markets: [],
  trend: null,
  news: [],
}

async function collect(
  iter: AsyncIterable<ChatStreamChunk>,
): Promise<ChatStreamChunk[]> {
  const out: ChatStreamChunk[] = []
  for await (const chunk of iter) out.push(chunk)
  return out
}

describe('streamChatReply (echo mode)', () => {
  it('streams the echoed reply across multiple chunks that assemble to the full text', async () => {
    // ADR 004 (i.2): the provider boundary streams; a single-chunk
    // emission would defeat the increment's purpose. Multi-word input
    // is what makes the chunk count > 1 observable — the assembled
    // text must round-trip the operator's prompt under the "Echo: "
    // prefix the mock vends.
    const chunks = await collect(
      streamChatReply('is USDJPY bid-side pressure easing?', EMPTY_CONTEXT),
    )
    expect(chunks.length).toBeGreaterThanOrEqual(2)
    const assembled = chunks.map((c) => c.delta).join('')
    expect(assembled).toBe('Echo: is USDJPY bid-side pressure easing?')
  })

  it('shares one id across every chunk of a single reply', async () => {
    // The transcript collapses all chunks of one reply into a single
    // assistant bubble keyed by id — divergent ids would render the
    // stream as several short bubbles instead of one growing one.
    const chunks = await collect(streamChatReply('one two three', EMPTY_CONTEXT))
    const ids = new Set(chunks.map((c) => c.id))
    expect(ids.size).toBe(1)
  })

  it('emits distinct ids across separate replies so transcript keys never collide', async () => {
    const a = await collect(streamChatReply('one', EMPTY_CONTEXT))
    const b = await collect(streamChatReply('two', EMPTY_CONTEXT))
    expect(a[0].id).not.toBe(b[0].id)
  })

  it('marks the final chunk with done=true and only the final chunk', async () => {
    const chunks = await collect(streamChatReply('hi there', EMPTY_CONTEXT))
    const dones = chunks.map((c) => c.done)
    // Last chunk is the terminator; no earlier chunk claims to be
    // done. Consumers rely on this to drop the "pending" indicator at
    // exactly the right frame.
    expect(dones[dones.length - 1]).toBe(true)
    expect(dones.slice(0, -1).every((d) => !d)).toBe(true)
  })

  it('stamps each chunk with a unix-second timestamp on the same time base as Bar.time', async () => {
    // The (i.3) cross-link matches AI references against chart markers
    // without a per-surface translation table; both surfaces use unix
    // seconds (Bar.time, SparklinePoint.time). The bracket asserts the
    // timestamp came from a wall-clock read during the call rather
    // than a stale module-load value.
    const before = Math.floor(Date.now() / 1000)
    const chunks = await collect(streamChatReply('ping', EMPTY_CONTEXT))
    const after = Math.floor(Date.now() / 1000)
    for (const chunk of chunks) {
      expect(chunk.at).toBeGreaterThanOrEqual(before)
      expect(chunk.at).toBeLessThanOrEqual(after)
    }
  })

  it('accepts a populated ChatContext snapshot per turn', async () => {
    // ADR 004 §AI chat: per-turn auto-inject of primary / watchlist /
    // markets / trend / news. The mock echoes the prompt and ignores
    // the context body — but the type contract is the load-bearing
    // surface for the eventual real provider, so a populated snapshot
    // must travel through the call without coercion.
    const ctx: ChatContext = {
      primary: null,
      watchlist: [],
      markets: [
        { ticker: 'N225', displayName: 'Nikkei 225', lastPrice: 38500, pctChange: 0.42 },
      ],
      trend: 'up',
      news: [],
    }
    const chunks = await collect(streamChatReply('status?', ctx))
    expect(chunks.map((c) => c.delta).join('')).toContain('status?')
  })
})
