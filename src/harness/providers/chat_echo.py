"""Deterministic echo ChatProvider mock (ADR 008).

Returns `Echo: {prompt}` as a stream of token chunks so the wire
shape rehearses what the real LLM provider will use (ADR 006 AI
chat widget). The mock is timing-free on the backend — the frontend
mock client (`chat-client.ts`) is what carries the simulated TTFT and
per-token cadence for UI affordance work; the backend can return
chunks as fast as the consumer drains them.

Determinism: same `(prompt, id_seed, clock)` produces the same
chunks. `id_seed` and `clock` are dependency-injected so tests can
assert chunk contents without depending on `time.time()` or counters
that drift between runs.
"""

import re
import time
from collections.abc import AsyncIterator, Callable

from .chat import ChatContext, ChatStreamChunk

_TOKEN_PATTERN = re.compile(r"\S+\s*")


def _tokenize(text: str) -> list[str]:
    # Each token = non-space run + trailing whitespace, so concatenating
    # deltas reconstructs the original text verbatim. Empty input
    # collapses to a single empty token; the consumer still sees a
    # terminator chunk so the "pending" affordance clears.
    matches = _TOKEN_PATTERN.findall(text)
    return matches if matches else [text]


class EchoChatProvider:
    def __init__(
        self,
        *,
        clock: Callable[[], int] | None = None,
        id_factory: Callable[[], str] | None = None,
    ) -> None:
        self._clock = clock or (lambda: int(time.time()))
        self._counter = 0
        self._id_factory = id_factory or self._next_id

    def _next_id(self) -> str:
        self._counter += 1
        return f"assistant-{self._counter}"

    async def stream(self, prompt: str, context: ChatContext) -> AsyncIterator[ChatStreamChunk]:
        # Echo ignores the snapshot body. Real providers prompt-cache
        # it server-side (ADR 006). The argument stays in the signature
        # so the protocol contract reaches every call site.
        del context
        chunk_id = self._id_factory()
        reply = f"Echo: {prompt}"
        tokens = _tokenize(reply)
        for i, tok in enumerate(tokens):
            yield ChatStreamChunk(
                id=chunk_id,
                delta=tok,
                done=i == len(tokens) - 1,
                at=self._clock(),
            )
