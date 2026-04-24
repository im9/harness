import { describe, expect, it } from 'vitest'
import { sendChatMessage } from './chat-client'

describe('sendChatMessage (echo mode)', () => {
  it('resolves with an assistant turn that echoes the user text', async () => {
    // Echo mode is ADR 004's deterministic ChatProvider stub: the reply
    // contains the user's text verbatim so tests can assert without
    // depending on a real model. A later increment swaps in a streaming
    // local provider.
    const reply = await sendChatMessage('is USDJPY bid-side pressure easing?')
    expect(reply.role).toBe('assistant')
    expect(reply.text).toContain('is USDJPY bid-side pressure easing?')
  })

  it('emits distinct ids so message-list keys never collide', async () => {
    const a = await sendChatMessage('one')
    const b = await sendChatMessage('two')
    expect(a.id).not.toBe(b.id)
  })

  it('stamps each turn with a numeric unix-second timestamp', async () => {
    // The rest of the system uses unix seconds (Bar.time, WatchlistItem
    // sparkline points). Chat turns follow the same convention so the
    // (i.3) cross-link can match AI references to chart markers without
    // a per-surface translation table.
    const before = Math.floor(Date.now() / 1000)
    const reply = await sendChatMessage('ping')
    const after = Math.floor(Date.now() / 1000)
    expect(reply.at).toBeGreaterThanOrEqual(before)
    expect(reply.at).toBeLessThanOrEqual(after)
  })
})
