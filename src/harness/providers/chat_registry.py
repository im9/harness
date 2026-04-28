"""String-keyed registry for ChatProvider implementations (ADR 008).

Mirrors the MarketDataProvider / NewsProvider registries: factories
register under string keys, the operator's provider config (DB-backed
via ADR 009 Settings UI) selects one at runtime. Phase 1 only registers
`echo`; real-vendor adapters and the future `local` mode (ADR 008
Future extensions) register the same way.
"""

from collections.abc import Callable
from typing import Any

from .chat import ChatProvider
from .chat_echo import EchoChatProvider

ChatProviderFactory = Callable[..., ChatProvider]


class ChatProviderRegistry:
    def __init__(self) -> None:
        self._factories: dict[str, ChatProviderFactory] = {}

    def register(self, key: str, factory: ChatProviderFactory) -> None:
        if key in self._factories:
            raise ValueError(f"chat mode {key!r} already registered")
        self._factories[key] = factory

    def create(self, key: str, **kwargs: Any) -> ChatProvider:
        if key not in self._factories:
            raise KeyError(f"unknown chat mode {key!r}")
        return self._factories[key](**kwargs)


def default_chat_registry() -> ChatProviderRegistry:
    reg = ChatProviderRegistry()
    reg.register("echo", EchoChatProvider)
    return reg
