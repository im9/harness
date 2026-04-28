"""ChatProvider protocol and value types (ADR 008).

The protocol is a single async-streaming entry point: `stream(prompt,
context)` yields chunks. Phase 1 ships an `echo` mock that returns
`Echo: {prompt}` deterministically; the real-vendor adapter (LLM
endpoint) lives outside the public tree.

The chunk shape mirrors the frontend's `ChatStreamChunk` (ADR 006 AI
chat widget) so the wire format round-trips structurally — `id`,
`delta`, `done`, and `at` are the load-bearing fields the chat surface
collapses into a single growing assistant bubble keyed by `id`.

`ChatContext` is the per-turn dashboard snapshot the operator's prompt
travels with (ADR 006 — `primary` / `watchlist` / `markets` / `trend`
/ `news`). The protocol receives it as an opaque mapping; echo ignores
it; real providers will prompt-cache the snapshot server-side.
"""

from collections.abc import AsyncIterator, Mapping
from dataclasses import dataclass
from typing import Any, Protocol

ChatContext = Mapping[str, Any]


@dataclass(frozen=True)
class ChatStreamChunk:
    id: str
    delta: str
    done: bool
    at: int


class ChatProvider(Protocol):
    def stream(self, prompt: str, context: ChatContext) -> AsyncIterator[ChatStreamChunk]: ...
