"""Contract tests for the `echo` ChatProvider mock (ADR 008).

The echo mode is deterministic by design — the same prompt produces
the same stream — because the AI chat widget's UI tests depend on a
predictable reply shape. Frontend timing is the chat-client's
concern; the backend mock is timing-free.
"""

from harness.providers.chat_echo import EchoChatProvider


async def _collect(stream):
    out = []
    async for c in stream:
        out.append(c)
    return out


async def test_echo_replies_with_prefixed_prompt():
    p = EchoChatProvider(clock=lambda: 1735689600, id_factory=lambda: "fixed-id")
    chunks = await _collect(p.stream("hello world", context={}))
    assembled = "".join(c.delta for c in chunks)
    # `Echo: ` prefix is the contract — it lets the frontend's chat
    # surface render mock replies recognizably without faking model
    # output. Concatenating deltas reconstructs the full reply
    # verbatim (per-token chunks include trailing whitespace).
    assert assembled == "Echo: hello world"


async def test_echo_marks_only_last_chunk_done():
    p = EchoChatProvider(clock=lambda: 0, id_factory=lambda: "fixed-id")
    chunks = await _collect(p.stream("hi", context={}))
    # `done=True` exactly on the terminator so consumers drop the
    # "pending" indicator on a single deterministic frame. Two-or-more
    # `done` flags would double-fire; zero would leave the indicator
    # stuck.
    assert sum(1 for c in chunks if c.done) == 1
    assert chunks[-1].done is True


async def test_echo_chunk_id_stable_across_one_reply():
    p = EchoChatProvider(clock=lambda: 0, id_factory=lambda: "fixed-id")
    chunks = await _collect(p.stream("hello world how are you", context={}))
    # Stable id per reply lets the chat surface collapse chunks into a
    # single growing assistant bubble keyed by id (ADR 006). At least
    # two chunks needed to assert "stable across more than one".
    assert len(chunks) > 1
    assert len({c.id for c in chunks}) == 1


async def test_echo_chunk_ids_differ_across_replies():
    p = EchoChatProvider(clock=lambda: 0)
    first = await _collect(p.stream("a", context={}))
    second = await _collect(p.stream("b", context={}))
    # Distinct ids across replies so transcript bubbles don't collide
    # — without this the surface would merge two unrelated answers.
    assert first[0].id != second[0].id


async def test_echo_carries_clock_value_on_each_chunk():
    times = iter([100, 101, 102, 103, 104])
    p = EchoChatProvider(clock=lambda: next(times), id_factory=lambda: "fixed-id")
    chunks = await _collect(p.stream("hi", context={}))
    # `at` is read from the injected clock per chunk — this is the
    # contract that lets transcript timestamps reflect actual emit
    # time, not request time. Test pins the clock so we assert per-
    # chunk reads, not a single snapshot at start.
    assert all(isinstance(c.at, int) for c in chunks)
    assert chunks[0].at < chunks[-1].at


async def test_echo_ignores_context_body():
    p = EchoChatProvider(clock=lambda: 0, id_factory=lambda: "fixed-id")
    # Pass-through of the snapshot is the real provider's job (ADR 006
    # — prompt-cached server-side). The mock must produce the same
    # reply regardless of context contents.
    a = await _collect(p.stream("ping", context={}))
    b = await _collect(
        EchoChatProvider(clock=lambda: 0, id_factory=lambda: "fixed-id").stream(
            "ping", context={"primary": {"symbol": "AAPL"}}
        )
    )
    assert [c.delta for c in a] == [c.delta for c in b]


async def test_empty_prompt_still_yields_a_done_chunk():
    p = EchoChatProvider(clock=lambda: 0, id_factory=lambda: "fixed-id")
    chunks = await _collect(p.stream("", context={}))
    # Even on an empty prompt the consumer must see a terminator —
    # otherwise the "pending" indicator stays stuck on submit-of-empty.
    # The reply collapses to "Echo: " and emits as one chunk.
    assert len(chunks) >= 1
    assert chunks[-1].done is True
