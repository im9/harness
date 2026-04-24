import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import AiChatFloat from './AiChatFloat'

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
    // operator turn even though they share the same text body.
    const replies = await within(dialog).findAllByText(/Echo:/i)
    expect(replies.length).toBeGreaterThanOrEqual(1)
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
    await within(dialog).findByText(/Echo:/i)
    await user.type(composer, 'followup')
    await waitFor(() => expect(send).not.toBeDisabled())
  })
})
