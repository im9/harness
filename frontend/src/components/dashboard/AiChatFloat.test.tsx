import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import * as chatClient from '@/lib/chat-client'
import type { ChatContext } from '@/lib/chat-client'
import AiChatFloat from './AiChatFloat'

const EMPTY_CONTEXT: ChatContext = {
  primary: null,
  watchlist: [],
  markets: [],
  trend: null,
  news: [],
}

describe('AiChatFloat', () => {
  it('renders a labeled FAB that opens the chat panel on click', async () => {
    // ADR 004 §AI chat: the entry point is a floating action button
    // anchored bottom-right. A labeled button is the accessible
    // affordance that a screen-reader user needs to discover the chat.
    const user = userEvent.setup()
    render(<AiChatFloat />)
    const fab = screen.getByRole('button', { name: /open ai chat/i })
    expect(fab).toBeInTheDocument()
    expect(fab).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('dialog', { name: /ai chat/i })).toBeNull()

    await user.click(fab)

    expect(fab).toHaveAttribute('aria-expanded', 'true')
    expect(
      screen.getByRole('dialog', { name: /ai chat/i }),
    ).toBeInTheDocument()
  })

  it('hides the FAB while the panel is open so it never overlaps the composer', async () => {
    // Regression guard: when the panel sits in the bottom-right, a
    // FAB at the same anchor covers the send button. The panel's
    // header close button replaces the FAB's entry-point role while
    // the surface is expanded, so hiding the FAB is the clean
    // resolution (still mounted in the DOM for focus-return on
    // close, but out of the accessibility tree and the visual
    // layer).
    const user = userEvent.setup()
    render(<AiChatFloat />)
    await user.click(screen.getByRole('button', { name: /open ai chat/i }))
    expect(
      screen.queryByRole('button', { name: /open ai chat/i }),
    ).toBeNull()
  })

  it('restores the FAB after the panel is closed', async () => {
    const user = userEvent.setup()
    render(<AiChatFloat />)
    await user.click(screen.getByRole('button', { name: /open ai chat/i }))
    await user.keyboard('{Escape}')
    expect(
      screen.getByRole('button', { name: /open ai chat/i }),
    ).toBeInTheDocument()
  })

  it('is non-modal so the dashboard stays readable under the panel', async () => {
    // ADR 004 §AI chat: "The dashboard stays fully visible under the
    // panel (no dim overlay)". A modal dialog would fight that design;
    // aria-modal=false announces the non-trapping behavior to AT and is
    // the structural contract for the "read the chart while composing a
    // question about it" affordance.
    const user = userEvent.setup()
    render(<AiChatFloat />)
    await user.click(screen.getByRole('button', { name: /open ai chat/i }))
    expect(
      screen.getByRole('dialog', { name: /ai chat/i }),
    ).toHaveAttribute('aria-modal', 'false')
  })

  it('closes on the panel close button and returns focus management to the FAB', async () => {
    const user = userEvent.setup()
    render(<AiChatFloat />)
    const fab = screen.getByRole('button', { name: /open ai chat/i })
    await user.click(fab)
    const dialog = screen.getByRole('dialog', { name: /ai chat/i })
    await user.click(within(dialog).getByRole('button', { name: /close/i }))
    expect(screen.queryByRole('dialog', { name: /ai chat/i })).toBeNull()
    expect(fab).toHaveAttribute('aria-expanded', 'false')
  })

  it('closes when the user presses Escape', async () => {
    // Escape-to-close is a baseline keyboard contract for any
    // dismissable overlay — without it, keyboard-only operators are
    // stranded in the panel.
    const user = userEvent.setup()
    render(<AiChatFloat />)
    await user.click(screen.getByRole('button', { name: /open ai chat/i }))
    expect(
      screen.getByRole('dialog', { name: /ai chat/i }),
    ).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: /ai chat/i })).toBeNull()
  })

  it('appends the operator turn and the assistant reply on submit', async () => {
    const user = userEvent.setup()
    render(<AiChatFloat />)
    await user.click(screen.getByRole('button', { name: /open ai chat/i }))
    const dialog = screen.getByRole('dialog', { name: /ai chat/i })
    const composer = within(dialog).getByRole('textbox', { name: /message/i })
    await user.type(composer, 'what is the NKM setup status?')
    await user.click(within(dialog).getByRole('button', { name: /send/i }))

    // User turn lands immediately — the operator needs to see their
    // own message in the transcript before the reply arrives so the
    // submission feels acknowledged.
    expect(
      await within(dialog).findByText(/what is the NKM setup status\?/i),
    ).toBeInTheDocument()
    // Echo mode includes the user text in its reply. The "Echo:"
    // prefix lets the test distinguish the assistant turn from the
    // operator turn even though they share the same text body. With
    // streaming the bubble grows as chunks arrive — `findByText` waits
    // until enough has accumulated to match.
    const replies = await within(dialog).findAllByText(/Echo:/i)
    expect(replies.length).toBeGreaterThanOrEqual(1)
  })

  it('grows the assistant bubble in place as chunks arrive (single bubble, not many)', async () => {
    // Streaming contract (ADR 004 (i.2)): chunks of one reply must
    // collapse into a single growing bubble — divergent ids would
    // surface as several separate short bubbles, which reads as
    // duplicate replies. We assert by counting assistant bubbles on
    // the rendered transcript after the stream finishes.
    const user = userEvent.setup()
    render(<AiChatFloat />)
    await user.click(screen.getByRole('button', { name: /open ai chat/i }))
    const dialog = screen.getByRole('dialog', { name: /ai chat/i })
    const composer = within(dialog).getByRole('textbox', { name: /message/i })
    await user.type(composer, 'tell me about three things')
    await user.click(within(dialog).getByRole('button', { name: /send/i }))
    // Wait for the final word of the echo to appear so we know the
    // stream has fully completed before we count bubbles.
    await within(dialog).findByText(/Echo: tell me about three things/i)
    const log = within(dialog).getByRole('log', { name: /transcript/i })
    expect(log.querySelectorAll('[data-role="assistant"]')).toHaveLength(1)
  })

  it('passes the current dashboard context to the provider on submit', async () => {
    // ADR 004 §AI chat: per-turn auto-inject of primary / watchlist /
    // markets / trend / news. The component reads its `context` prop at
    // submit time so the snapshot reflects whatever the dashboard is
    // showing in that frame, not the value at panel-open time.
    const spy = vi.spyOn(chatClient, 'streamChatReply')
    const ctx: ChatContext = {
      ...EMPTY_CONTEXT,
      markets: [
        {
          ticker: 'USDJPY',
          displayName: 'USD/JPY',
          lastPrice: 152.3,
          pctChange: -0.18,
        },
      ],
    }
    const user = userEvent.setup()
    render(<AiChatFloat context={ctx} />)
    await user.click(screen.getByRole('button', { name: /open ai chat/i }))
    const dialog = screen.getByRole('dialog', { name: /ai chat/i })
    const composer = within(dialog).getByRole('textbox', { name: /message/i })
    await user.type(composer, 'hi')
    await user.click(within(dialog).getByRole('button', { name: /send/i }))
    await waitFor(() => expect(spy).toHaveBeenCalled())
    expect(spy).toHaveBeenCalledWith('hi', ctx)
    spy.mockRestore()
  })

  it('ships the latest context snapshot at submit time, not the value at panel-open time', async () => {
    // The dashboard payload changes on every SSE tick. If the
    // component captured `context` at panel-open or first-render, the
    // model would answer against stale primary / trend / news state.
    // Using a ref keeps the submit-time read live without churning
    // the submit callback identity on every parent render.
    const spy = vi.spyOn(chatClient, 'streamChatReply')
    const ctxA: ChatContext = { ...EMPTY_CONTEXT }
    const ctxB: ChatContext = {
      ...EMPTY_CONTEXT,
      news: [
        {
          id: 'n-1',
          title: 'BOJ holds rates',
          impactTier: 'high',
          at: '2026-04-24T05:00:00Z',
        },
      ],
    }
    const user = userEvent.setup()
    const { rerender } = render(<AiChatFloat context={ctxA} />)
    await user.click(screen.getByRole('button', { name: /open ai chat/i }))
    rerender(<AiChatFloat context={ctxB} />)
    const dialog = screen.getByRole('dialog', { name: /ai chat/i })
    const composer = within(dialog).getByRole('textbox', { name: /message/i })
    await user.type(composer, 'recap')
    await user.click(within(dialog).getByRole('button', { name: /send/i }))
    await waitFor(() => expect(spy).toHaveBeenCalled())
    expect(spy).toHaveBeenLastCalledWith('recap', ctxB)
    spy.mockRestore()
  })

  it('clears the composer after a successful submit', async () => {
    const user = userEvent.setup()
    render(<AiChatFloat />)
    await user.click(screen.getByRole('button', { name: /open ai chat/i }))
    const dialog = screen.getByRole('dialog', { name: /ai chat/i })
    const composer = within(dialog).getByRole('textbox', {
      name: /message/i,
    }) as HTMLTextAreaElement
    await user.type(composer, 'first message')
    await user.click(within(dialog).getByRole('button', { name: /send/i }))
    await waitFor(() => expect(composer.value).toBe(''))
  })

  it('ignores empty and whitespace-only submissions', async () => {
    // An accidental Enter or a stray space shouldn't pollute the
    // transcript with blank turns or waste a provider call.
    const user = userEvent.setup()
    render(<AiChatFloat />)
    await user.click(screen.getByRole('button', { name: /open ai chat/i }))
    const dialog = screen.getByRole('dialog', { name: /ai chat/i })
    const composer = within(dialog).getByRole('textbox', { name: /message/i })
    await user.type(composer, '   ')
    await user.click(within(dialog).getByRole('button', { name: /send/i }))
    // List is empty (only the empty-state placeholder copy is allowed).
    const log = within(dialog).getByRole('log', { name: /transcript/i })
    expect(within(log).queryByText(/Echo:/i)).toBeNull()
  })

  it('does not submit on an IME composition Enter', async () => {
    // Regression guard: when an IME (Japanese / Chinese / Korean) is
    // composing, the Enter that commits the composition fires a
    // keydown with `isComposing=true`. Firing submit on that Enter
    // causes the operator's un-committed draft to appear "stuck" in
    // the textarea because the submit ran before the composition
    // resolved into the controlled value. The guard must skip submit
    // in that case so Enter only advances the composition.
    const user = userEvent.setup()
    render(<AiChatFloat />)
    await user.click(screen.getByRole('button', { name: /open ai chat/i }))
    const dialog = screen.getByRole('dialog', { name: /ai chat/i })
    const composer = within(dialog).getByRole('textbox', {
      name: /message/i,
    }) as HTMLTextAreaElement
    await user.type(composer, 'こんにち')
    fireEvent.keyDown(composer, {
      key: 'Enter',
      isComposing: true,
    })
    // No user bubble appeared → submit was not invoked. The draft
    // also stays put so the IME can keep composing.
    const log = within(dialog).getByRole('log', { name: /transcript/i })
    expect(within(log).queryByText(/Echo:/i)).toBeNull()
    expect(composer.value).toBe('こんにち')
  })

  it('shows the pending indicator while awaiting the first reply chunk', async () => {
    // Without a visible "thinking" state between submit and the first
    // streamed chunk, a slow provider feels like the submit was lost.
    // The indicator surfaces immediately on submit and stays up until
    // the first chunk arrives — verified here by asserting on the
    // synchronous frame right after the click, before any await for
    // streamed text.
    const user = userEvent.setup()
    render(<AiChatFloat />)
    await user.click(screen.getByRole('button', { name: /open ai chat/i }))
    const dialog = screen.getByRole('dialog', { name: /ai chat/i })
    const composer = within(dialog).getByRole('textbox', { name: /message/i })
    await user.type(composer, 'wait for me')
    await user.click(within(dialog).getByRole('button', { name: /send/i }))
    expect(within(dialog).getByTestId('pending-indicator')).toBeInTheDocument()
    // No assistant bubble yet — the indicator and the absence of the
    // bubble are the two halves of the "still waiting" signal.
    const log = within(dialog).getByRole('log', { name: /transcript/i })
    expect(log.querySelector('[data-role="assistant"]')).toBeNull()
  })

  it('hides the pending indicator once the first chunk lands and the growing bubble takes over', async () => {
    // Streaming contract (ADR 004 (i.2)): once the first chunk arrives,
    // the growing bubble itself communicates "responding". A persistent
    // "…" alongside the bubble would read as a redundant signal and
    // muddy the moment the model started talking.
    const user = userEvent.setup()
    render(<AiChatFloat />)
    await user.click(screen.getByRole('button', { name: /open ai chat/i }))
    const dialog = screen.getByRole('dialog', { name: /ai chat/i })
    const composer = within(dialog).getByRole('textbox', { name: /message/i })
    await user.type(composer, 'streaming')
    await user.click(within(dialog).getByRole('button', { name: /send/i }))
    // Wait for the first chunk to surface — the "Echo:" prefix is the
    // first token the mock emits, so its presence is the earliest
    // proof a chunk has been received and rendered.
    await within(dialog).findByText(/Echo/i)
    expect(within(dialog).queryByTestId('pending-indicator')).toBeNull()
  })

  it('disables the send button while a reply is pending', async () => {
    // Locking the send control while a turn is in-flight prevents
    // accidental double-submits (clicking twice on a slow network).
    // After resolution the composer is empty, which is its own
    // (separate) reason to keep the button inactive; typing a new
    // message is the unambiguous way to observe the pending-state
    // guard actually released.
    const user = userEvent.setup()
    render(<AiChatFloat />)
    await user.click(screen.getByRole('button', { name: /open ai chat/i }))
    const dialog = screen.getByRole('dialog', { name: /ai chat/i })
    const composer = within(dialog).getByRole('textbox', { name: /message/i })
    const send = within(dialog).getByRole('button', { name: /send/i })
    await user.type(composer, 'hello')
    await user.click(send)
    expect(send).toBeDisabled()
    await within(dialog).findByText(/Echo: hello/i)
    await user.type(composer, 'followup')
    await waitFor(() => expect(send).not.toBeDisabled())
  })
})
